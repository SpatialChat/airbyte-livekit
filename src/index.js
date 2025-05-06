#!/usr/bin/env node

/**
 * Source Connector for LiveKit
 * 
 * This connector allows extracting data from LiveKit's real-time communication platform
 * following the Airbyte specification protocol.
 */

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');

// Import stream implementations
const RoomsStream = require('./streams/rooms');
const ParticipantsStream = require('./streams/participants');
const QualityMetricsStream = require('./streams/quality_metrics');
const EventsStream = require('./streams/events');
const UsageStream = require('./streams/usage');

// Available streams in this connector
const AVAILABLE_STREAMS = {
  rooms: RoomsStream,
  participants: ParticipantsStream,
  quality_metrics: QualityMetricsStream,
  events: EventsStream,
  usage: UsageStream,
};

/**
 * Outputs the connector specification
 */
async function spec() {
  const specPath = path.join(__dirname, '../resources/spec.json');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  console.log(JSON.stringify(spec));
}

/**
 * Validates the provided configuration
 * @param {Object} configJson - The configuration to check
 */
async function check(configJson) {
  try {
    // Merge with defaults and validate config schema
    const mergedConfig = config.mergeWithDefaults(configJson);
    config.validateConfig(mergedConfig);
    
    // Try a simple API call to verify credentials and connectivity
    const roomsStream = new RoomsStream(mergedConfig);
    await roomsStream.testConnection();
    
    console.log(JSON.stringify({ status: 'SUCCEEDED' }));
  } catch (error) {
    logger.error('Connection check failed:', error);
    console.log(JSON.stringify({
      status: 'FAILED',
      message: error.message || 'Connection check failed'
    }));
  }
}

/**
 * Discovers the available streams and their schemas
 * @param {Object} configJson - The configuration
 */
async function discover(configJson) {
  // Merge with defaults
  const mergedConfig = config.mergeWithDefaults(configJson);
  
  const catalog = {
    streams: []
  };

  // For each stream, add its schema to the catalog
  for (const [streamName, StreamClass] of Object.entries(AVAILABLE_STREAMS)) {
    const stream = new StreamClass(mergedConfig);
    const schema = stream.getJsonSchema();
    
    catalog.streams.push({
      name: streamName,
      json_schema: schema,
      supported_sync_modes: stream.getSupportedSyncModes(),
      source_defined_cursor: stream.getSourceDefinedCursor(),
      default_cursor_field: stream.getDefaultCursorField(),
      source_defined_primary_key: stream.getSourceDefinedPrimaryKey(),
    });
  }

  console.log(JSON.stringify(catalog));
}

/**
 * Reads data from the configured streams
 * @param {Object} configJson - The configuration
 * @param {Object} catalogJson - The configured catalog
 * @param {Object} stateJson - The state from previous runs
 */
async function read(configJson, catalogJson, stateJson = {}) {
  try {
    // Merge with defaults and validate the config
    const mergedConfig = config.mergeWithDefaults(configJson);
    config.validateConfig(mergedConfig);
    
    // Get the selected streams from the catalog
    const selectedStreams = catalogJson.streams.filter(
      stream => stream.sync_mode !== 'null'
    );
    
    // Process each selected stream
    for (const streamConfig of selectedStreams) {
      const streamName = streamConfig.stream.name;
      
      if (!AVAILABLE_STREAMS[streamName]) {
        logger.warn(`Stream "${streamName}" is not available in this connector`);
        continue;
      }
      
      // Initialize the stream with config and state
      const StreamClass = AVAILABLE_STREAMS[streamName];
      const stream = new StreamClass(
        mergedConfig,
        streamConfig,
        stateJson[streamName]
      );
      
      // Read records from the stream
      await stream.read();
    }
    
  } catch (error) {
    logger.error('Error during read operation:', error);
    process.exit(1);
  }
}

// Set up the CLI command structure
const program = new Command();

program
  .name('source-livekit')
  .description('LiveKit source connector')
  .version('0.1.0');

program
  .command('spec')
  .description('Outputs the connector specification')
  .action(spec);

program
  .command('check')
  .description('Checks the connection configuration')
  .action(() => {
    const configJson = JSON.parse(process.argv[3]);
    check(configJson);
  });

program
  .command('discover')
  .description('Discovers the available streams')
  .action(() => {
    const configJson = JSON.parse(process.argv[3]);
    discover(configJson);
  });

program
  .command('read')
  .description('Reads data from the source')
  .action(() => {
    const configJson = JSON.parse(process.argv[3]);
    const catalogJson = JSON.parse(process.argv[4]);
    const stateJson = process.argv[5] ? JSON.parse(process.argv[5]) : {};
    read(configJson, catalogJson, stateJson);
  });

program.parse(process.argv);
