# Runbook

## Starting for the day

1. Plug the board into the laptop (USB), or switch on the Bluetooth board.
2. `npm run server` (or double-click `scripts/start.bat`). Note the address it prints.
3. On a phone or tablet open that address in the browser, or open the installed app and enter it.

The system screen (menu > System, Super Admin) shows the server, the board and a checklist.

## Network

Laptop, phones and board all on one Wi-Fi, or the laptop's hotspot (Windows: Settings > Network > Mobile hotspot). The server listens on port 8080 (`PORT` changes it). Windows may ask about the firewall the first time: allow **Private** networks. To open it by hand (PowerShell as administrator):

```powershell
New-NetFirewallRule -DisplayName "XeroBurst server" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
```

The traffic is plain HTTP on your own network and nothing is sent outside it. Browsers only allow Bluetooth and the camera on secure pages, so those features need the installed app.

## Accounts

- First Super Admin: `npm run setup` on the laptop (there is deliberately no sign-up anywhere).
- Everything else is created in the app: coaches by Admin or Super Admin, players by coaches. A new staff account gets a temporary password and must change it at first sign-in. A new player gets a Player ID and a PIN shown once, with Copy and Print.
- Forgotten password: an Admin/Super Admin resets it in the app (Coaches or Admins screen, Players screen for PINs). For a Super Admin: `npm run reset-password -- --login <id>`.

## Backup and restore

- Backup: Super Admin > System > Create backup, or `npm run backup`. Files go to `apps/server/data/backups/`.
- Restore: stop the server, copy the backup file over `apps/server/data/nboard.db` (also delete `nboard.db-wal` and `nboard.db-shm` if present), start the server. The server refuses a database made by a newer version.
- To move to another laptop: copy the whole `apps/server/data` folder (it includes `jwt.secret`; without it everyone just signs in again).

## Using a real board

USB: plug in and run `npm run server`. The board is found by vendor id; if not, set `BOARD_PORT` (PowerShell: `$env:BOARD_PORT="COM5"; npm run server`). The `serialport` package is optional; if it did not install, the server says so and `npm run server:sim` still works.

Bluetooth: needs the installed app (development build, see below). In Settings choose Bluetooth or leave Auto.

## Building installable apps

Phones and tablets, Android:
```powershell
cd apps\mobile
npx eas login
npx eas build --profile phone-apk --platform android     # prints a download link for the APK
```
Copy the APK to the device with a pendrive or `adb install nboard.apk`, and allow installs from unknown sources.

iOS: `npx eas build --profile development --platform ios` needs an Apple developer account (TestFlight or ad-hoc for installs).

Local builds without EAS need Android Studio (Android) or Xcode on a Mac (iOS): `npx expo run:android` / `npx expo run:ios`.

## Android TV

```powershell
npm run tv:enable      # swaps in react-native-tvos and installs
npm run tv:android     # builds and runs on an Android TV emulator or device
npm run tv:disable     # back to the normal build
```
For an APK: `npx eas build --profile tv-apk --platform android` from `apps/mobile` after `tv:enable`.

The TV layout is read-only for staff screens (no forms on a remote control) and uses an on-screen keyboard for sign-in. A Player ID can be typed as digits only ("7" for NB-0007). Preview it in any browser with `?tv=1`.

## If something is wrong

| Symptom | What to check |
|---|---|
| App cannot connect | Same Wi-Fi; firewall; open `http://<address>:8080/status` on the phone. |
| "Cannot reach the server" mid-round | The round is saved on the device and uploads later, without duplicates. |
| "The board is in use" | One round at a time. Wait, or use Demo Mode. |
| Board not found over USB | Other program using the port? Try `BOARD_PORT`. Use `npm run server:sim` to test the rest. |
| Signed out suddenly | Idle timeout (System > Settings), a password reset, or the account was deactivated. |
| Locked out after 5 tries | Wait 5 minutes, or have an Admin reset the credentials. |
