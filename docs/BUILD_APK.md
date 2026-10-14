# Build the Android APK and give it to a friend

## What you need once
- A free Expo account (expo.dev). A Windows or Mac laptop with Node 22+.
- In the project folder: `npm install`.

## Build (cloud, no Android Studio needed)
```powershell
cd apps\mobile
npx eas login
npx eas build:configure          # first time only, accept the defaults
npx eas build --profile phone-apk --platform android
```
It queues, builds for about 10 to 20 minutes and prints a download link. Download `*.apk`.

For an Android TV APK run `npm run tv:enable` first and use `--profile tv-apk`, then `npm run tv:disable`.

## Install on a phone or tablet
1. Send the APK (WhatsApp, Drive, USB, or `adb install file.apk`).
2. On the device open it. Android asks to allow installs from this source: allow it.
3. Open **XeroBurst**.

## Important: what your friend can and cannot do
The app is a client. It signs in to the laptop server, so it only works while the server is reachable:
- Friend **next to you**, on your hotspot or Wi-Fi: full app, including the real board.
- Friend **somewhere else**: the app opens but cannot sign in, because there is no server on their network. To let people use it remotely the server would have to be hosted online (not built yet). Tell me if you want that.
- Demo Mode (a practice board on screen) is a setting inside the app, so it is only reachable after sign-in.

## iPhone
`npx eas build --profile development --platform ios` needs an Apple developer account (paid). TestFlight or AltStore are the install routes.

## Not tested
No APK was built or installed on a device from this workspace (no Android SDK or Expo login here). The app itself runs in a browser and the typecheck and 387 automated tests pass.
