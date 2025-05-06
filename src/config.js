/**
 * Configuration handling for the LiveKit connector
 */
const logger = require('./utils/logger');

// Required configuration fields
const REQUIRED_CONFIG_FIELDS = [
  'api_key',
  'api_secret',
  'endpoint_url',
  'start_date'
];

/**
 * Validates the provided configuration
 * @param {Object} config - The configuration to validate
 * @throws {Error} If the configuration is invalid
 */
function validateConfig(config) {
  if (!config) {
    throw new Error('Config is required');
  }

  // Check required fields
  for (const field of REQUIRED_CONFIG_FIELDS) {
    if (!config[field]) {
      throw new Error(`Required configuration field "${field}" is missing`);
    }
  }

  // Validate date format
  try {
    if (config.start_date) {
      const date = new Date(config.start_date);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
    }
  } catch (error) {
    throw new Error(`Invalid start_date: ${error.message}`);
  }

  // Validate endpoint URL
  try {
    new URL(config.endpoint_url);
  } catch (error) {
    throw new Error(`Invalid endpoint_url: ${error.message}`);
  }

  // Log successful validation
  logger.debug('Configuration validated successfully');
  return true;
}

/**
 * Returns the default configuration for the connector
 * @returns {Object} The default configuration
 */
function getDefaultConfig() {
  return {
    endpoint_url: 'https://api.livekit.io',
    streams: ['rooms', 'participants', 'quality_metrics', 'events', 'usage']
  };
}

/**
 * Merges provided configuration with defaults
 * @param {Object} config - The provided configuration
 * @returns {Object} The merged configuration
 */
function mergeWithDefaults(config) {
  const defaults = getDefaultConfig();
  return {
    ...defaults,
    ...config
  };
}

module.exports = {
  validateConfig,
  getDefaultConfig,
  mergeWithDefaults
};
