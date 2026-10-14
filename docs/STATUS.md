# Status: what is built, what was checked, what was not

Read this before relying on the build. It separates things that were **run and checked** from things that are **written but never run on the real target**.

## How it was checked

- **Server:** 280 automated tests (`npm test`): sign-in and lockout, token rotation and reuse, per-request deactivation, the full role x endpoint permission matrix, Coach scope, rank rules, game access and level caps, a round from start to result (hits stored, summary recomputed, double upload safe), programs, analytics (day/week/month, Asia/Kolkata, streaks), the board relay with a simulated board (tickets, lock, heartbeat, cfg filtering).
- **Types:** `npm run typecheck` is clean for shared, server and app.
- **App in a browser:** the web export was served by the real server and driven with a headless Chromium at phone (390x844), tablet (1024x768 and 1180x820) and TV (1920x1080 with `?tv=1`) sizes. Checked: connect auto-detect, sign-in (including the TV on-screen keyboard and digit-only Player ID), player home, games hub, how-to, ready, all four games in Demo Mode, a round over the laptop bridge against the simulated board, result screens, a round finished while the server was unreachable (saved on the device, uploaded later, no duplicate after reload), creating a player (credentials card, profile), coach, admin and super-admin screens.

## Not verified

Please treat these as untested until you run them:

- **Real devices.** No iPhone, iPad, Android phone/tablet or Android TV was available. Expo Go and installed builds were not run. Haptics, sound output, the QR camera scanner, keep-awake, safe-area insets on notched phones and the native Print sheet are written but unseen.
- **Bluetooth.** `react-native-ble-plx` code (`apps/mobile/src/transport/ble.native.ts`) and the permission flows are written against the documented protocol but never ran with an ESP32 or any BLE device.
- **USB serial.** `SerialLink` (`apps/server/src/board/hub.ts`) was never run with a real Arduino Mega. Everything above it (relay, lock, tickets) is tested with the simulator.
- **Android TV / Apple TV native builds.** The TV switch (`npm run tv:enable`) and focus handling are written; the TV layout was only seen in a browser. D-pad focus order on a real remote is unverified.
- **Installers.** EAS and local builds, APK install by pendrive/ADB, iOS signing (AC-26, AC-27).
- **Screen readers.** Labels and roles are set, but TalkBack and VoiceOver were not used.
- **A clean laptop.** AC-28 (run from the packaged folder on a clean laptop) was tested on Linux with Node 22 only. Windows is the target; `better-sqlite3` and `serialport` normally ship prebuilt binaries for Node 22 on Windows, but that was not run.

## Acceptance criteria

| AC | Status |
|---|---|
| 01 Login shows only login fields | Done and seen. ID, PIN/password, Sign in, plus a small "Change server" link (needed to reach a server). No sign-up, no "play now". |
| 02 No public registration | Done. No such screen or endpoint exists; accounts are created only by staff (and the first Super Admin by `npm run setup`). |
| 03 Coach creates a player; ID and PIN shown once and work | Tested (server) and seen (browser). |
| 04 Coach cannot create Coaches without the grant | Tested. |
| 05 Coach reaches every player (changed from "own players only" in the final update) | Tested on every route; a Player still gets 403 on other players. |
| 06 Admin powers; cannot modify a Super Admin | Tested (rank rules). |
| 07 Super Admin; last one cannot be removed | No API path creates, edits or deactivates a Super Admin, so it cannot be removed. Tested. |
| 08 One app, four roles, menu by permission | Seen in browser for player, coach, super admin. |
| 09 Player cards: Play / Locked / Completed | Seen. Locked cards stay visible and open the how-to (read only); Start is not offered. |
| 10 Starting a locked game returns 403 GAME_LOCKED | Tested. Reading a locked game is allowed. |
| 11 Per-player game access | Tested; screen written and seen. |
| 12 Manual stage advance unlocks games | Tested; screen written. |
| 13 Target met -> Completed, still playable | Tested (server). |
| 14 How-to before every game, replayable | Seen. |
| 15 Four games end to end with result screens | Seen in Demo Mode and over the bridge. |
| 16 Results for player and coach; day/week/month | Tested (server); screens seen. |
| 17 Bridge (Mega) and Bluetooth (ESP32) without code changes | **Not verified on hardware.** The same controller runs over bridge, mock and BLE transports; only the bridge and mock were run. |
| 18 Auto mode and forced mode | Logic written; only the non-Bluetooth legs ran. |
| 19 Second device gets BOARD_BUSY | Tested (server); busy screen written. |
| 20 Interrupted rounds saved or discarded, never a PB | Tested (server); screen written. |
| 21 Offline result uploads later without duplicates | Tested (server idempotency) and seen in the browser. |
| 22 Lockout after 5 failures; reset unlocks | Tested. |
| 23 Deactivation ends access at once | Tested. |
| 24 Permission matrix suite | Passes. |
| 25 NCourt and others: open for staff, "Coming soon" for players | Final update: Super Admin, Admin and Coach can open and run nBase, nCourt and nPad (they run on the shared 10-button games and rounds are stored with the module). Players keep the "Coming soon" cards. What these modules should actually contain is not defined yet. |
| 26 Runs on Android phone/tablet, iPhone, iPad, Android TV | **Not verified on devices.** Browser at all four form factors only. |
| 27 APK by pendrive and ADB; iOS route | Not verified. |
| 28 Packaged folder on a clean laptop; backup restorable | Server run and backup tested on Linux; restore is a file copy (runbook); Windows not tested. |

## Where this differs from the spec's suggested stack

- npm workspaces instead of pnpm; plain SQL migrations on `better-sqlite3` instead of Drizzle.
- Charts are drawn with `react-native-svg` (no Victory/Skia), motion uses React Native's `Animated` (Reanimated is installed but not used), no Lottie.
- Offline rounds wait in an AsyncStorage outbox.
- Web builds keep the refresh token in `localStorage` (there is no secure store in a browser). Phones use Keychain/Keystore.
- The Content Security Policy header is off so the Expo web bundle runs; the server is meant for a trusted private network.
- The staff screens poll `/board/status` instead of holding a status socket.
- TV is an opt-in package swap (`tv:enable`) rather than always on, because the TV fork of React Native replaces the standard one.
- Expo SDK 57 / React Native 0.86 / React 19.2.

## Known rough edges

- Staff screens are read-only on TV by design.
- Print uses the browser print dialog on web and `expo-print` on devices.
- Demo data is public test data; delete the database before real use.

## Final updates (this release)

- **Coach scope:** a Coach reaches all players; nothing else about permissions changed. System administration is still Super Admin / Admin only.
- **Modules:** nBase, nCourt and nPad open for staff. They share the four games; a round records its module (new column `sessions.module_key`, default `nboard`).
- **Mandatory fields:** server (zod, shared) and app forms. New columns `users.email`, `users.phone`, `users.age` (nullable, so existing rows are untouched). Migration 3 was run against a copy of an existing database: version 2 to 3, all players and rounds intact.
- **Look:** the nBoard Pro palette (orange, mint, amber, red on near-black), new XeroBurst mark, mono labels, bar-style active nav, numbered module cards. The launcher icon and splash images in `apps/mobile/assets` were not redrawn and still show the old mark.
- **Not verified:** real hardware, Windows, Bluetooth, phones and TV. Browser checks only.

## Artifact-exact UI pass (latest)
- Every screen follows the approved artifact layout: Home (Analytics), Modules/nBoard, Players, Results, Leaderboard, Coaches, Admins, Programs, Settings, Audit, System, Login, Connect, Forgot.
- The earlier dashboard moved to the Overview route. The Assess banner records a round for a chosen player.
- New API: `GET /results/overview`, `POST /auth/forgot` (public, rate-limited; a player's request sets "PIN reset requested", cleared by reset-credentials). Staff forgot-password has no email flow: they are told to ask an admin.
- Deactivating a user or player stores an optional reason (`inactive_reason`). Migrations 5 and 6 add it and `pin_reset_requested`.
- Photos are device-local only (expo-image-picker, new dependency and photo permission). Run `npm install` once after unzipping.
- Known differences from the artifact: Connect has no "Back to sign in" link (sign-in needs a server first); extra Edit/Revoke/Time zone/Board/Doctor cards kept from the real app; results x-axis shows dates.

## Hubs, stopped rounds, memory rework, speed (latest)
- **Hubs:** table `hubs`, `users.hub_id`, table `attendance` (migration 7). Super Admin and Admin create hubs (permission `MANAGE_HUBS`). Each coach and player belongs to one hub. A coach with a hub sees only that hub's players and leaderboard; a coach with no hub (old accounts) still sees everyone until a Super Admin assigns them; "Add everyone without a hub to this hub" does that in one tap.
- **Hub pages:** Hubs list (counts), compare table, and per-hub page: players active/inactive, coach and player attendance, rounds and accuracy, per-day attendance bars, and where attendance came from.
- **Attendance:** recorded automatically (source `auto`) on sign-in and when a player finishes a round, once per person per local day. The `source` column is ready for `nfc` and `biometric` check-ins later.
- **Stopped rounds:** pressing Stop keeps what was played (status `interrupted`, flagged "Stopped") and it counts in Results, Analytics, player performance and hub figures. Personal bests, streaks, targets and the leaderboard still use completed rounds only. A stop with no hits is discarded.
- **Players change their PIN at first sign-in** (new players and PIN resets set `must_change_password`).
- **Player history table** under Players (date and time, game, level, accuracy, average reaction, hits, misses, status).
- **Memory game:** level N shows N lights, the same order as the level before plus one new light, at constant speed. The app sends a seed (`sd`) in `cfg`; a new seed for every run. A level not repeated in full ends the run. **Firmware 1.1: re-upload `firmware/xeroburst_mega/xeroburst_mega.ino` to the Mega.**
- **Assess** was removed from every screen (server support stays). **AI coach**: a placeholder card on the Insights tab; the offline insights are unchanged.
- **Speed on phones:** no animated background lights, no blurred shadows or per-card SVG on native, charts appear drawn instead of animating at 60 frames a second.
- **Light theme** rebuilt with stronger contrast; chart band removed; rings in one row; big buttons use the same left-to-right gradient as small ones.
- Not verified on a phone: lag was reduced by removing the known costly parts and checked in the browser only. iOS has never been built.
