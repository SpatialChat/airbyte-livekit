/**
 * Implementation of the Participants stream for LiveKit
 */
const BaseStream = require('./base');
const moment = require('moment');

class ParticipantsStream extends BaseStream {
  constructor(config, streamConfig = {}, state = {}) {
    super(config, streamConfig, state);
    this.streamName = 'participants';
    this.cursorField = 'timestamp';
  }

  /**
   * Get the source defined primary key for this stream
   * @returns {Array} The primary key fields as a nested array
   */
  getSourceDefinedPrimaryKey() {
    return [['participant_id', 'room_id', 'timestamp']];
  }

  /**
   * Get the default cursor field for this stream
   * @returns {Array} The default cursor field
   */
  getDefaultCursorField() {
    return [this.cursorField];
  }

  /**
   * Read records from the participants stream
   */
  async read() {
    const client = this.createClient();
    let state = this.state || {};
    
    try {
      this.emitLog('INFO', `Starting sync for participants stream`);
      
      // Determine start date
      let startDate = this.config.start_date;
      if (state[this.cursorField]) {
        // If we have a state, use it as the start date
        startDate = moment(state[this.cursorField]).format('YYYY-MM-DD');
      }
      
      this.emitLog('INFO', `Fetching participants since ${startDate}`);
      
      // First, fetch all rooms in the time period
      const roomsResponse = await client.get('/rooms', {
        params: {
          from: startDate,
          to: moment().format('YYYY-MM-DD'),
          limit: 100
        }
      });
      
      const rooms = roomsResponse.data.items || [];
      this.emitLog('INFO', `Found ${rooms.length} rooms to process for participants`);
      
      let latestTimestamp = state[this.cursorField] || 0;
      
      // For each room, fetch participants
      for (const room of rooms) {
        const roomId = room.sid;
        this.emitLog('INFO', `Fetching participants for room ${roomId}`);
        
        // Set up query parameters for participants
        const params = {
          limit: 100
        };
        
        // Fetch participants data in pages
        let hasMorePages = true;
        let offset = 0;
        
        while (hasMorePages) {
          // Add pagination
          params.offset = offset;
          
          // Make API request to get participants
          const response = await client.get(`/rooms/${roomId}/participants`, { params });
          const participants = response.data.items || [];
          
          if (participants.length === 0) {
            hasMorePages = false;
            continue;
          }
          
          this.emitLog('INFO', `Processing ${participants.length} participants for room ${roomId}`);
          
          // Process and emit each record
          for (const participant of participants) {
            // Calculate duration if left_at is available
            let duration = null;
            if (participant.joined_at && participant.left_at) {
              const joinTime = new Date(participant.joined_at).getTime();
              const leftTime = new Date(participant.left_at).getTime();
              duration = Math.floor((leftTime - joinTime) / 1000); // duration in seconds
            }
            
            // Determine state based on left_at
            let state = 'joined';
            if (participant.left_at) {
              state = participant.error ? 'disconnected' : 'left';
            }
            
            // Transform the record to match our schema
            const record = {
              participant_id: participant.sid,
              room_id: roomId,
              timestamp: new Date(participant.joined_at).getTime(),
              identity: participant.identity,
              name: participant.name || participant.identity,
              joined_at: participant.joined_at,
              left_at: participant.left_at || null,
              duration: duration,
              state: state,
              is_publisher: Boolean(participant.publisher),
              is_subscriber: Boolean(participant.subscriber),
              metadata: participant.metadata || {},
              user_agent: participant.user_agent || '',
              ip_address: participant.ip_address || '',
              region: participant.region || ''
            };
            
            // Update latest timestamp for state
            if (record.timestamp > latestTimestamp) {
              latestTimestamp = record.timestamp;
            }
            
            // Emit the record
            this.emitRecord(record);
          }
          
          // Update pagination
          offset += participants.length;
          
          // Check if there are more pages
          hasMorePages = participants.length === params.limit;
        }
      }
      
      // Update and emit state
      if (latestTimestamp > 0) {
        state = { [this.cursorField]: latestTimestamp };
        this.emitState(state);
      }
      
      this.emitLog('INFO', `Completed sync for participants stream`);
      return state;
      
    } catch (error) {
      this.emitLog('ERROR', `Error syncing participants: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ParticipantsStream;
