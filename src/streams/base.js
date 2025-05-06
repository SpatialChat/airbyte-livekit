/**
 * Base stream implementation for all LiveKit streams
 */
const fs = require('fs');
const path = require('path');
const { AccessToken } = require('livekit-server-sdk');
const axios = require('axios');
const logger = require('../utils/logger');

class BaseStream {
  /**
   * @param {Object} config - The connector configuration
   * @param {Object} streamConfig - Stream-specific configuration
   * @param {Object} state - State from previous sync runs
   */
  constructor(config, streamConfig = {}, state = {}) {
    this.config = config;
    this.streamConfig = streamConfig;
    this.state = state || {};
    this.streamName = this.constructor.name.replace('Stream', '').toLowerCase();
    this.logger = logger;
  }

  /**
   * Get the JSON schema for this stream
   * @returns {Object} The JSON schema
   */
  getJsonSchema() {
    const schemaPath = path.join(__dirname, `../../resources/schemas/${this.streamName}.json`);
    
    try {
      if (fs.existsSync(schemaPath)) {
        return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      }
    } catch (error) {
      this.logger.error(`Error reading schema for ${this.streamName}:`, error);
    }
    
    // Default schema if none is found
    return {
      type: 'object',
      properties: {}
    };
  }

  /**
   * Get the supported sync modes for this stream
   * @returns {Array} The supported sync modes
   */
  getSupportedSyncModes() {
    return ['full_refresh', 'incremental'];
  }

  /**
   * Whether the cursor field is defined by the source
   * @returns {Boolean} True if the cursor field is defined by the source
   */
  getSourceDefinedCursor() {
    return true;
  }

  /**
   * Get the default cursor field for this stream
   * @returns {Array} The default cursor field
   */
  getDefaultCursorField() {
    return ['timestamp'];
  }

  /**
   * Get the primary key for this stream
   * @returns {Array} The primary key fields as a nested array
   */
  getSourceDefinedPrimaryKey() {
    return [['id']];
  }

  /**
   * Create an authenticated LiveKit API client
   * @returns {Object} The API client
   */
  createClient() {
    const { api_key, api_secret, endpoint_url } = this.config;
    
    // Create access token for authentication
    const token = new AccessToken(api_key, api_secret, {
      identity: 'airbyte-connector',
    });
    
    // Create HTTP client with authentication
    const client = axios.create({
      baseURL: endpoint_url,
      headers: {
        'Authorization': `Bearer ${token.toJwt()}`,
        'Content-Type': 'application/json'
      }
    });
    
    return client;
  }

  /**
   * Test the connection to the LiveKit API
   * @returns {Promise<Boolean>} True if connection is successful
   */
  async testConnection() {
    const client = this.createClient();
    
    try {
      // Make a simple API request to verify connectivity
      await client.get('/info');
      return true;
    } catch (error) {
      this.logger.error('Connection test failed:', error);
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Read and emit records from this stream
   * @returns {Promise<Object>} The updated state
   */
  async read() {
    throw new Error('read() is not implemented');
  }

  /**
   * Emit a record following the Airbyte protocol
   * @param {Object} record - The record to emit
   */
  emitRecord(record) {
    console.log(JSON.stringify({
      type: 'RECORD',
      record: {
        stream: this.streamName,
        data: record,
        emitted_at: Date.now()
      }
    }));
  }

  /**
   * Emit updated state
   * @param {Object} state - The updated state
   */
  emitState(state) {
    console.log(JSON.stringify({
      type: 'STATE',
      state: {
        data: {
          [this.streamName]: state
        }
      }
    }));
  }

  /**
   * Emit a log message
   * @param {String} level - The log level
   * @param {String} message - The message to log
   */
  emitLog(level, message) {
    console.log(JSON.stringify({
      type: 'LOG',
      log: {
        level,
        message
      }
    }));
  }
}

module.exports = BaseStream;
