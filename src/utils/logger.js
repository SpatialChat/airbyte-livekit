/**
 * Logger utility for the LiveKit connector
 */
const winston = require('winston');

/**
 * Create a logger instance
 * @param {string} level - Log level (default: 'info')
 * @returns {Object} Winston logger instance
 */
function createLogger(level = 'info') {
  return winston.createLogger({
    level: level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'source-livekit' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

}

// Create and export default logger instance
const defaultLogger = createLogger();

module.exports = defaultLogger;
module.exports.createLogger = createLogger;
