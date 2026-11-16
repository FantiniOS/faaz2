const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/**
 * Metro configuration com suporte universal a Web, PWA, iOS e Android
 * Integrado ao NativeWind v4 (Tailwind CSS)
 */
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
