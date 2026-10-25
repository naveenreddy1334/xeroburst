import type { ConfigContext, ExpoConfig } from 'expo/config';

// One codebase, three kinds of build:
//   phone / tablet (Android + iOS): the default
//   Android TV: run `npm run tv:enable` once, which sets EXPO_TV=1 for prebuild (see scripts/tv.mjs)
//   web: `npm run web` (also useful as a quick preview on any device with a browser)
const TV = process.env.EXPO_TV === '1';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'XeroBurst',
  slug: 'nboard',
  scheme: 'nboard',
  version: '1.0.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#010100',
  icon: './assets/icon.png',
  ios: {
    bundleIdentifier: 'com.nboard.app',
    supportsTablet: true, // one universal build for iPhone and iPad, all orientations
    requireFullScreen: false, // allows iPad split view
    infoPlist: {
      NSBluetoothAlwaysUsageDescription: 'XeroBurst uses Bluetooth to connect to your XeroBurst training board.',
      NSBluetoothPeripheralUsageDescription: 'XeroBurst uses Bluetooth to connect to your XeroBurst training board.',
      NSCameraUsageDescription: 'XeroBurst uses the camera to scan the QR code that connects the app to your laptop server.',
      NSLocalNetworkUsageDescription: 'XeroBurst connects to the server running on your laptop in the same Wi-Fi network.',
      NSBonjourServices: ['_http._tcp'],
      // The laptop server is plain http on the local network.
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: {
    package: 'com.nboard.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-foreground.png',
      monochromeImage: './assets/adaptive-monochrome.png',
      backgroundColor: '#010100',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.ACCESS_FINE_LOCATION', // needed for Bluetooth scans on Android 11 and below
      'android.permission.CAMERA',
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, backgroundColor: '#010100' }],
    'expo-secure-store',
    'expo-font',
    ['expo-image-picker', { photosPermission: 'XeroBurst lets you pick a profile photo. It stays on this device.' }],
    ['expo-camera', { cameraPermission: 'XeroBurst uses the camera to scan the QR code that connects the app to your laptop server.', recordAudioAndroid: false }],
    [
      'expo-build-properties',
      {
        android: { usesCleartextTraffic: true }, // the laptop server speaks http on the local network
        ios: {},
      },
    ],
    [
      'react-native-ble-plx',
      {
        isBackgroundEnabled: false,
        modes: ['central'],
        bluetoothAlwaysPermission: 'XeroBurst uses Bluetooth to connect to your XeroBurst training board.',
      },
    ],
    ...(TV ? ([['@react-native-tvos/config-tv', { androidTVBanner: './assets/tv-banner.png', showVerboseWarnings: false }] as [string, any]]) : []),
  ],
  experiments: { typedRoutes: false, reactCompiler: false },
  extra: { tv: TV, eas: { projectId: '425e4fd9-9e31-44e5-a201-c6a52eca5e3d' } },
});
