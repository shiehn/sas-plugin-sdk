/**
 * Plugin SDK Version
 *
 * Semver version of the plugin SDK contract.
 * Plugins declare minSdkVersion in their manifest.
 * Registry checks semver.gte(PLUGIN_SDK_VERSION, manifest.minHostVersion)
 * during activation and marks incompatible plugins accordingly.
 */
export const PLUGIN_SDK_VERSION = '2.3.0';
