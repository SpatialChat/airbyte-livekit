/**
 * Implementation of the Rooms stream for LiveKit
 */
const BaseStream = require('./base');
const moment = require('moment');

class RoomsStream extends BaseStream {
  constructor(config, streamConfig = {}, state = {}) {
    super(config, streamConfig, state);
    this.streamName = 'rooms';
    this.cursorField = 'timestamp';
  }

  /**
   * Get the source defined primary key for this stream
   * @returns {Array} The primary key fields as a nested array
   */
  getSourceDefinedPrimaryKey() {
    return [['room_id', 'timestamp']];
  }

  /**
   * Get the default cursor field for this stream
   * @returns {Array} The default cursor field
   */
  getDefaultCursorField() {
    return [this.cursorField];
  }

  /**
   * Read records from the rooms stream
   */
  async read() {
    const client = this.createClient();
    let state = this.state || {};
    
    try {
      this.emitLog('INFO', `Starting sync for rooms stream`);
      
      // Determine start date
      let startDate = this.config.start_date;
      if (state[this.cursorField]) {
        // If we have a state, use it as the start date
        startDate = moment(state[this.cursorField]).format('YYYY-MM-DD');
      }
      
      this.emitLog('INFO', `Fetching rooms since ${startDate}`);
      
      // Set up query parameters
      const params = {
        from: startDate,
        to: moment().format('YYYY-MM-DD'),
        limit: 100
      };
      
      // Fetch rooms data in pages
      let hasMorePages = true;
      let offset = 0;
      let latestTimestamp = state[this.cursorField] || 0;
      
      while (hasMorePages) {
        this.emitLog('INFO', `Fetching rooms page with offset ${offset}`);
        
        // Add pagination
        params.offset = offset;
        
        // Make API request
        const response = await client.get('/rooms', { params });
        const rooms = response.data.items || [];
        
        if (rooms.length === 0) {
          hasMorePages = false;
          continue;
        }
        
        // Process and emit each record
        for (const room of rooms) {
          // Transform the record to match our schema
          const record = {
            room_id: room.sid,
            name: room.name,
            timestamp: new Date(room.created_at).getTime(),
            participant_count: room.num_participants,
            created_at: room.created_at,
            duration: room.duration,
            active: room.active,
            metadata: room.metadata || {}
          };
          
          // Update latest timestamp for state
          if (record.timestamp > latestTimestamp) {
            latestTimestamp = record.timestamp;
          }
          
          // Emit the record
          this.emitRecord(record);
        }
        
        // Update pagination
        offset += rooms.length;
        
        // Check if there are more pages
        hasMorePages = rooms.length === params.limit;
      }
      
      // Update and emit state
      if (latestTimestamp > 0) {
        state = { [this.cursorField]: latestTimestamp };
        this.emitState(state);
      }
      
      this.emitLog('INFO', `Completed sync for rooms stream`);
      return state;
      
    } catch (error) {
      this.emitLog('ERROR', `Error syncing rooms: ${error.message}`);
      throw error;
    }
  }
}

module.exports = RoomsStream;
