# XeroBurst

Role-based reaction-training platform: one app (phones, tablets, Android TV, any browser) plus a small server that runs on the coach's laptop. Built from the *XeroBurst Full Specification* (a copy is in `docs/`).

```
apps/server     Laptop server: Node + Fastify + SQLite. Roles, permissions, results, board relay.
apps/mobile     The app: React Native + Expo (iOS, Android, tablet, TV, web).
packages/shared Rules both sides import: roles, games, scoring, board protocol, API types.
docs/           Runbook, API, board protocol, spec, and STATUS.md (what is and is not verified).
```

---

## 1. First run (Windows, VS Code)

You need **Node.js 22 or newer** (https://nodejs.org, the LTS installer). Check with `node -v`.

Open the `nboard` folder in VS Code (File > Open Folder), then open a terminal (Terminal > New Terminal, PowerShell is fine) and run:

```powershell
npm install            # once, a few minutes
npm run setup          # once: asks for the organisation, time zone and your Super Admin login
npm run demo-data      # optional: 6 sample players with three weeks of history
npm run server:sim     # starts the server with a built-in practice board
```

The server prints its address, for example `http://192.168.1.20:8080`, and a QR code.

**Open that address in any browser** (the laptop, a phone, an iPad, a TV browser). The app is served by the server itself, finds the server on its own, and shows the sign-in screen. This is the quickest way to try everything on every device.

If Windows asks whether to let Node.js through the firewall, choose **Private networks**. Other devices need that to reach the laptop.

### Demo accounts (only if you ran `npm run demo-data`)

| Role | ID | Password / PIN |
|---|---|---|
| Super Admin | `super.demo` | `Demo-super-2026` |
| Admin | `admin.demo` | `Demo-admin-2026` |
| Coach | `coach.ravi`, `coach.sneha` | `Demo-coach-2026` |
| Player | `NB-0001` ... `NB-0006` | `482915`, `739104`, `205861`, `916273`, `584027`, `361948` |

These are public test accounts. Delete the database (`apps/server/data`) before real use, or run `npm run demo-data -- --reset` to start clean. A Player ID can be typed as `1`, `NB1` or `NB-0001`.

---

## 2. What to run, and when

| I want to... | Command (from the `nboard` folder) |
|---|---|
| Start the server with a practice board (no hardware) | `npm run server:sim` |
| Start the server with a real board on USB | `npm run server` |
| Run the app in Expo (phones with Expo Go, live reload) | `npm run app`, then press `w` for web, or scan the QR in Expo Go |
| Rebuild the web app the server serves | `npm run web:build` |
| Run all tests | `npm test` |
| Check types everywhere | `npm run typecheck` |
| Copy the database safely | `npm run backup` |
| Reset a forgotten password | `npm run reset-password -- --login coach.ravi` |

In VS Code you can also use **Terminal > Run Task** and pick `XeroBurst: server + app`.

`scripts/start.bat` (double-click) does the whole start-up in two windows.

### Using the web build without Expo

`npm run web:build` exports the app to `apps/mobile/dist`; the server serves it automatically on the same port. A copy of the last build is already in `apps/server/web`, so step 1 works even before you build anything.

---

## 3. Devices

| Device | How |
|---|---|
| Any computer, phone, tablet, smart-TV browser | Open `http://<laptop address>:8080`. No install. Bluetooth is not available in a browser, so use the laptop bridge or Demo Mode there. |
| Android and iPhone/iPad, quick try | `npm run app`, install **Expo Go**, scan the QR. On the Connect screen type the laptop address (or scan the server's QR). |
| Android phone/tablet with Bluetooth | Needs a development build (Bluetooth does not run in Expo Go): `npx expo run:android` inside `apps/mobile` (Android Studio and a USB cable), or `npx eas build --profile phone-apk --platform android`. |
| iPhone/iPad with Bluetooth | `npx eas build --profile development --platform ios` (needs an Apple developer account), or `npx expo run:ios` on a Mac. |
| Android TV | `npm run tv:enable`, then `npm run tv:android` with an Android TV emulator or device (see `docs/runbook.md`). `npm run tv:disable` returns to the normal build. |

Phone, laptop and board must be on the same Wi-Fi, or the laptop's hotspot. Nothing goes to the internet.

The screen adapts to the device on its own: bottom bar on phones, side rail on tablets and TV, large focus rings and an on-screen keyboard for the TV remote. To preview the TV layout in a browser, open the address with `?tv=1` (`?tv=0` turns it off).

---

## 4. The board

Three ways to reach it, chosen in Settings (Auto tries Bluetooth, then the laptop):

1. **Bluetooth** (ESP32 board): the phone talks to the board directly.
2. **Laptop bridge** (Arduino Mega on USB): the laptop relays between the app and the board.
3. **Demo Mode**: a practice board on screen. Tap the buttons yourself, or switch on *Demo bot* in Settings to watch a round play itself.

`npm run server:sim` gives the bridge a simulated board with a bot, which is handy for trying the full path without hardware. The wire format is in `docs/protocol.md`.

---

## 5. Who can do what

Super Admin (complete control, including games and every player; created only by `npm run setup`), Coach, Player, plus a legacy Admin tier for existing accounts. Coaches reach every player (search, view, create, edit, reports and history) and can open every module; players see only their own data. Required fields (name, age, weight for players; name, email, phone, age for coaches) are validated on the server and in every form; an Admin can grant a Coach "create coaches". Every game is visible to every role; locked games can be read about but not started. After each round, and in reports and player profiles, a **Performance Insights & Improvement Plan** gives two to four rule-based suggestions from the recorded figures (no AI service, no network). Every rule is enforced on the server (the app only hides what you cannot use), and every sensitive action is written to a read-only audit log. The full matrix is in `docs/API.md` and is tested in `apps/server/test`.

---

## 6. Troubleshooting

- **The app cannot reach the server.** Same Wi-Fi? Is the server window still running? Try `http://<address>:8080/status` in the phone's browser. If that fails, it is the Windows firewall: allow Node.js on Private networks.
- **Port 8080 is in use.** Another copy is running. Close it, or `$env:PORT=8081; npm run server`.
- **"No board found" on Bluetooth.** Bluetooth needs a development build, not Expo Go or a browser. Use the laptop bridge or Demo Mode meanwhile.
- **The board says busy.** Only one round can use the board at a time. Wait for the other player, or use Demo Mode.
- **Expo Go says the project is incompatible.** Use the browser address instead, or a development build.
- **Forgot the Super Admin password.** `npm run reset-password -- --login <id>` on the laptop.

More in `docs/runbook.md`. What was tested and what was not is in `docs/STATUS.md`.
