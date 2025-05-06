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
  logger.debug('Validating configuration');
  
  // Ensure configuration is provided and is an object
  if (!config) {
    throw new Error('Configuration is required. Please provide a valid JSON configuration object.');
  }
  if (typeof config !== 'object') {
    throw new Error('Configuration must be a valid JSON object with key-value pairs.');
  }

  // Check required fields with detailed error messages
  for (const field of REQUIRED_CONFIG_FIELDS) {
    if (!config[field]) {
      let errorMessage = `Required configuration field "${field}" is missing`;
      
      // Add specific guidance based on the missing field
      switch (field) {
        case 'api_key':
          errorMessage += '. Please provide your LiveKit API key which can be found in your LiveKit dashboard under API Keys.';
          break;
        case 'api_secret':
          errorMessage += '. Please provide your LiveKit API secret which can be found in your LiveKit dashboard under API Keys.';
          break;
        case 'endpoint_url':
          errorMessage += '. Please provide the URL of your LiveKit API endpoint (e.g., https://api.livekit.io for LiveKit Cloud).';
          break;
        case 'start_date':
          errorMessage += '. Please provide a valid start date in ISO format (YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ).';
          break;
        default:
          errorMessage += '.';
      }
      
      throw new Error(errorMessage);
    }
  }

  // Validate date format with detailed error message
  try {
    if (config.start_date) {
      const date = new Date(config.start_date);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format. Please use ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ).');
      }
      
      // Check if date is in the future
      if (date > new Date()) {
        logger.warn('Start date is in the future. This may result in no data being replicated until that date is reached.');
      }
    }
  } catch (error) {
    throw new Error(`Invalid start_date: ${error.message} Please provide a valid date in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ).`);
  }

  // Validate endpoint URL with detailed error message
  try {
    new URL(config.endpoint_url);
  } catch (error) {
    throw new Error(`Invalid endpoint_url: The URL '${config.endpoint_url}' is not valid. Please provide a complete URL including protocol (e.g., https://api.livekit.io).`);
  }
  
  // Validate URL protocol (must be https or http)
  const urlProtocol = new URL(config.endpoint_url).protocol;
  if (urlProtocol !== 'https:' && urlProtocol !== 'http:') {
    throw new Error(`Invalid endpoint_url protocol: ${urlProtocol}. URL must use http or https protocol.`);
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
