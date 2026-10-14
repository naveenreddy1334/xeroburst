// Expo configures npm workspaces automatically (it watches the repo root and resolves the shared
// package from source). This file only exists so the setup is visible and easy to extend.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow the .wav sounds to be bundled.
config.resolver.assetExts.push('wav');

module.exports = config;
