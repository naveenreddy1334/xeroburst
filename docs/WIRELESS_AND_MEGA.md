# Play on the real board from the tablet, wirelessly (Arduino Mega + laptop)

```
 Tablet / phone  --Wi-Fi-->  Laptop (server)  --USB-->  Arduino Mega  -->  10 LEDs / relays + 10 buttons
   (XeroBurst app)          (npm run server)           (xeroburst_mega.ino)
```

The Mega does not need Bluetooth or Wi-Fi. The laptop is the bridge: it speaks Wi-Fi to the tablet and USB to the Mega. Your laptop's Bluetooth is not used for the Mega (a Mega has no Bluetooth; the Bluetooth route in the app is for the ESP32 board that comes later).

## 1. Put the firmware on the Mega (Arduino IDE)

1. Open `firmware/xeroburst_mega/xeroburst_mega.ino` in the Arduino IDE 2.x.
2. Tools > Board > Arduino AVR Boards > **Arduino Mega or Mega 2560**. Tools > Port > your Mega (COMx).
3. Edit the block marked `EDIT THESE TO MATCH YOUR WIRING`:
   - `LED_PIN[]`: the pin that drives LED/relay 1 to 10.
   - `BTN_PIN[]`: the pin of button 1 to 10 (the other leg of each button goes to GND).
   - `LED_ACTIVE_LOW`: `1` for a relay board that switches on with LOW (most do), `0` if the LED lights with HIGH.
4. Upload. On power-up the LEDs chase 1 to 10 once: that is your wiring check. If the chase runs but is out of order, fix `LED_PIN[]`.
5. Optional check: Serial Monitor at **115200**, line ending "Newline", send `{"t":"hello"}`. You should get `{"t":"hello","fw":"1.1","btn":10}`. **Close the Serial Monitor afterwards**; only one program can hold the port and the server needs it.

Games, levels and timings are the same as the app's Demo Mode (`packages/shared/src/sim.ts`), so a round on the board and a Demo round behave the same.

## 2. Start the server on the laptop

One time (Node 22 or newer): in the project folder run `npm install`, then `npm run setup` (creates the first Super Admin).

Every day: plug in the Mega, then `npm run server` (Windows: double-click `scripts/start.bat`). It prints the address, for example `http://192.168.137.1:8080`, and finds the Mega by itself. If it does not, set the port by hand (PowerShell): `$env:BOARD_PORT="COM5"; npm run server`.

## 3. Wi-Fi between laptop and tablet

- **Laptop hotspot (works anywhere):** Windows Settings > Network & internet > Mobile hotspot > On. Join that network from the tablet. The laptop is usually `192.168.137.1`.
- **Or** put laptop and tablet on the same router.
- First run, Windows asks about the firewall: allow **Private** networks. Or run once as administrator:
  `New-NetFirewallRule -DisplayName "XeroBurst server" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private`

## 4. Connect the app

1. Open the app. On the Connect screen type the laptop address (`192.168.137.1:8080`) or scan the QR from the server's System screen.
2. Sign in.
3. **Settings > Board link > Laptop.** (Auto also works, but it tries Bluetooth first and that wastes a few seconds when you only have a Mega.)
4. Super Admin > System shows a checklist: server up, board connected, firmware 1.1, 10 buttons. All green means ready.
5. Modules > nBoard > pick a game > Ready > Start. The LEDs on the board light up, you press the real buttons, and the result appears on the tablet.

## If something does not work

| Problem | Fix |
|---|---|
| System says "board not connected" | Close the Arduino Serial Monitor, replug the Mega, restart the server. Try `BOARD_PORT=COMx`. |
| `serialport` package missing message | `npm install` again on the laptop. Until then `npm run server:sim` still works with a simulated board. |
| LEDs always on, off while a target should show | `LED_ACTIVE_LOW` is the wrong way round. Flip it. |
| One button never registers | Check its pin in `BTN_PIN[]` and that the other leg goes to GND. |
| Tablet cannot open the address | Same Wi-Fi? Firewall rule above? Use the IP the server printed, with `:8080`. |
| "Board busy" | Another device holds the board. Finish or close that session. |
| Round stops at once | The app lost the laptop for 30 s (heartbeat). Stay in Wi-Fi range. |

## Honest status

The firmware logic was run on a PC against a simulated player (all four games, easy and hard levels, slow players, full rounds) and every line it prints was accepted by the server's own parser. It has **not** been run on a real Mega with your relays and buttons yet, so expect to adjust pins and the polarity flags on first power-up.
