/**
 * Implementation of the Events stream for LiveKit
 */
const BaseStream = require('./base');
const moment = require('moment');

class EventsStream extends BaseStream {
  constructor(config, streamConfig = {}, state = {}) {
    super(config, streamConfig, state);
    this.streamName = 'events';
    this.cursorField = 'timestamp';
  }

  /**
   * Get the source defined primary key for this stream
   * @returns {Array} The primary key fields as a nested array
   */
  getSourceDefinedPrimaryKey() {
    return [['event_id']];
  }

  /**
   * Get the default cursor field for this stream
   * @returns {Array} The default cursor field
   */
  getDefaultCursorField() {
    return [this.cursorField];
  }

  /**
   * Map event severity from LiveKit API format
   * @param {String} level - LiveKit event level
   * @returns {String} Mapped severity
   */
  mapSeverity(level) {
    const severityMap = {
      'debug': 'info',
      'info': 'info',
      'notice': 'info',
      'warning': 'warning',
      'warn': 'warning',
      'error': 'error',
      'alert': 'critical',
      'critical': 'critical',
      'emergency': 'critical'
    };
    
    return severityMap[level.toLowerCase()] || 'info';
  }

  /**
   * Read records from the events stream
   */
  async read() {
    const client = this.createClient();
    let state = this.state || {};
    
    try {
      this.emitLog('INFO', `Starting sync for events stream`);
      
      // Determine start date
      let startDate = this.config.start_date;
      if (state[this.cursorField]) {
        // If we have a state, use it as the start date
        const stateTimestamp = state[this.cursorField];
        startDate = moment(stateTimestamp).format('YYYY-MM-DD');
      }
      
      const endDate = moment().format('YYYY-MM-DD');
      this.emitLog('INFO', `Fetching events from ${startDate} to ${endDate}`);
      
      // Set up query parameters
      const params = {
        from: startDate,
        to: endDate,
        limit: 100
      };
      
      // Fetch events data in pages
      let hasMorePages = true;
      let offset = 0;
      let latestTimestamp = state[this.cursorField] || 0;
      
      while (hasMorePages) {
        // Add pagination
        params.offset = offset;
        
        // Make API request
        const response = await client.get('/events', { params });
        const events = response.data.items || [];
        
        if (events.length === 0) {
          hasMorePages = false;
          continue;
        }
        
        this.emitLog('INFO', `Processing ${events.length} events`);
        
        // Process and emit each record
        for (const event of events) {
          // Convert event timestamp to ms since epoch
          const eventTime = new Date(event.timestamp);
          const timestamp = eventTime.getTime();
          
          // Skip events older than our state
          if (timestamp <= latestTimestamp && latestTimestamp > 0) {
            continue;
          }
          
          // Transform the event record to match our schema
          const record = {
            event_id: event.id,
            room_id: event.room_id || null,
            participant_id: event.participant_id || null,
            timestamp: timestamp,
            event_time: event.timestamp,
            event_type: event.type,
            severity: this.mapSeverity(event.level || 'info'),
            message: event.message || '',
            metadata: event.metadata || {},
            source: event.source || 'livekit',
            ip_address: event.ip_address || null,
            region: event.region || null
          };
          
          // Update latest timestamp for state
          if (timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
          }
          
          // Emit the record
          this.emitRecord(record);
        }
        
        // Update pagination
        offset += events.length;
        
        // Check if there are more pages
        hasMorePages = events.length === params.limit;
      }
      
      // Update and emit state
      if (latestTimestamp > 0) {
        state = { [this.cursorField]: latestTimestamp };
        this.emitState(state);
      }
      
      this.emitLog('INFO', `Completed sync for events stream`);
      return state;
      
    } catch (error) {
      this.emitLog('ERROR', `Error syncing events: ${error.message}`);
      throw error;
    }
  }
}

module.exports = EventsStream;
