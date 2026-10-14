# Board protocol

One text protocol, three carriers. Every message is one line of JSON ending in `\n`.

| Carrier | Board | Path |
|---|---|---|
| Bluetooth LE | ESP32 | phone <-> board |
| USB serial, 115200 baud | Arduino Mega | board <-> laptop server <-> WebSocket `/api/v1/board?ticket=...` <-> app |
| Demo Mode | none | the same rules run inside the app (`packages/shared/src/sim.ts`) |

The app code is identical for all three; only the transport differs (`apps/mobile/src/transport`).

## Bluetooth LE (Nordic UART style)

- Device name starts with `XeroBurst`.
- Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- Write (app to board) `6e400002-...`, Notify (board to app) `6e400003-...`
- Request MTU 185; split lines across notifications if needed. The app reassembles lines (`LineBuffer`).

## App to board

| Message | Meaning |
|---|---|
| `{"t":"hello"}` | Identify yourself. |
| `{"t":"cfg","g":"quick","lv":3}` | Choose game (`quick`, `memory`, `hunt`, `endure`) and level 1..10. Board answers `ack`. |
| `{"t":"go"}` | Start the round. Board answers `ack`. |
| `{"t":"stop"}` | End the round now. Board answers `ack`. |

(`{"t":"hb"}` goes app to server only, to keep the board lock alive. It is never forwarded.)

## Board to app

| Message | Meaning |
|---|---|
| `{"t":"hello","fw":"1.1","btn":10}` | Firmware version and number of buttons. The app needs firmware 1.1 or newer. |
| `{"t":"ack","of":"cfg"}` | Also `go`, `stop`. |
| `{"t":"tgt","n":7,"ms":1240}` | Button `n` lit, `ms` since the round started. |
| `{"t":"hit","n":7,"ok":1,"rt":312}` | A press: button, correct (1/0), reaction time in ms measured on the board's clock. |
| `{"t":"miss","n":7}` | The target timed out. |
| `{"t":"end","score":24}` | Round finished. |
| `{"t":"err","code":4}` | Error (below). |

### Extensions used by the app (optional fields)

The four games need a little more than the base messages. All are optional, so a minimal board still works for Quick Reaction; the hardware team can agree or change these.

- `tgt`: `k` kind (`go` press it, `show` Memory demo flash, `nohit` do nothing), `f` LEDs lit in the field (Target Hunt), `d` decoy LEDs, `w` response window in ms.
- `ph`: `{"t":"ph","p":"watch"|"repeat","len":4,"ms":...}` Memory Sequence phase markers.
- `hit`: `tb` target button, `ms` since start, `d` 1 if it was a decoy or NO HIT press, `len` and `st` sequence length and step (Memory).
- `miss`: `ms`, `len`, `st`.
- `end`: `ms` round length.

### Error codes

1 no game selected, 2 unknown game, 3 level not supported, 4 round already running, 5 sensor fault. From the laptop server: 100 not connected to a board, 101 command not allowed for this session, 102 board busy.

## What the server trusts

The app uploads the list of events (`hits`) when a round ends. The server **recomputes** the summary from them and ignores any summary the device claims. A round is stored under a device-generated id, so uploading twice is harmless. Only `completed` rounds count for personal bests, streaks, analytics and targets.

## Laptop bridge details

- The app asks for a one-use ticket (valid 60 s) with `POST /sessions`, then opens the WebSocket with it.
- One board, one lock. A second session while the board is held gets `BOARD_BUSY` (409) naming who holds it.
- The app sends a heartbeat every few seconds. If it stops (30 s), the lock is released and the round is marked interrupted.
- The server only forwards `cfg` for the game and level the player is allowed.
- `npm run server:sim` replaces the USB board with a simulator and a bot.
- The USB board is found by vendor id (Arduino 2341, CH340 1a86, FTDI 0403) or set `BOARD_PORT=COM5`.
