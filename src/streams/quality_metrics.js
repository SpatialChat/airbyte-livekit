/**
 * Implementation of the Quality Metrics stream for LiveKit
 */
const BaseStream = require('./base');
const moment = require('moment');
const crypto = require('crypto');

class QualityMetricsStream extends BaseStream {
  constructor(config, streamConfig = {}, state = {}) {
    super(config, streamConfig, state);
    this.streamName = 'quality_metrics';
    this.cursorField = 'timestamp';
  }

  /**
   * Get the source defined primary key for this stream
   * @returns {Array} The primary key fields as a nested array
   */
  getSourceDefinedPrimaryKey() {
    return [['metric_id']];
  }

  /**
   * Get the default cursor field for this stream
   * @returns {Array} The default cursor field
   */
  getDefaultCursorField() {
    return [this.cursorField];
  }

  /**
   * Generate a unique metric ID
   * @param {String} roomId - Room ID
   * @param {String} participantId - Participant ID
   * @param {Number} timestamp - Timestamp
   * @param {String} trackType - Track type
   * @returns {String} The unique metric ID
   */
  generateMetricId(roomId, participantId, timestamp, trackType) {
    const hash = crypto.createHash('sha256');
    hash.update(`${roomId}:${participantId}:${timestamp}:${trackType}`);
    return hash.digest('hex').substring(0, 32);
  }

  /**
   * Map connection quality value to a string
   * @param {Number} quality - Quality value (0-100)
   * @returns {String} Quality string
   */
  mapConnectionQuality(quality) {
    if (quality === undefined || quality === null) return 'unknown';
    if (quality >= 80) return 'excellent';
    if (quality >= 50) return 'good';
    return 'poor';
  }

  /**
   * Read records from the quality metrics stream
   */
  async read() {
    const client = this.createClient();
    let state = this.state || {};
    
    try {
      this.emitLog('INFO', `Starting sync for quality metrics stream`);
      
      // Determine start date
      let startDate = this.config.start_date;
      if (state[this.cursorField]) {
        // If we have a state, use it as the start date
        startDate = moment(state[this.cursorField]).format('YYYY-MM-DD');
      }
      
      this.emitLog('INFO', `Fetching quality metrics since ${startDate}`);
      
      // First, fetch all active rooms
      const roomsResponse = await client.get('/rooms', {
        params: {
          from: startDate,
          to: moment().format('YYYY-MM-DD'),
          limit: 100,
          active: true // Only get active rooms for quality metrics
        }
      });
      
      const rooms = roomsResponse.data.items || [];
      this.emitLog('INFO', `Found ${rooms.length} active rooms to process for quality metrics`);
      
      let latestTimestamp = state[this.cursorField] || 0;
      
      // For each active room, fetch quality metrics
      for (const room of rooms) {
        const roomId = room.sid;
        this.emitLog('INFO', `Fetching quality metrics for room ${roomId}`);
        
        // Fetch participants in the room
        const participantsResponse = await client.get(`/rooms/${roomId}/participants`);
        const participants = participantsResponse.data.items || [];
        
        for (const participant of participants) {
          const participantId = participant.sid;
          
          // Fetch quality metrics for this participant
          try {
            const metricsResponse = await client.get(`/rooms/${roomId}/participants/${participantId}/metrics`);
            const metrics = metricsResponse.data || {};
            
            // Current timestamp for all metrics from this call
            const now = new Date();
            const timestamp = now.getTime();
            const collectedAt = now.toISOString();
            
            // Process audio track metrics
            if (metrics.audio) {
              const audioMetric = {
                metric_id: this.generateMetricId(roomId, participantId, timestamp, 'audio'),
                room_id: roomId,
                participant_id: participantId,
                timestamp: timestamp,
                collected_at: collectedAt,
                latency: metrics.audio.latency || 0,
                packet_loss: metrics.audio.packet_loss || 0,
                jitter: metrics.audio.jitter || 0,
                bitrate: metrics.audio.bitrate || 0,
                audio_level: metrics.audio.level || 0,
                video_frame_rate: null,
                video_resolution_width: null,
                video_resolution_height: null,
                track_type: 'audio',
                connection_quality: this.mapConnectionQuality(metrics.audio.quality)
              };
              
              // Update latest timestamp for state
              if (timestamp > latestTimestamp) {
                latestTimestamp = timestamp;
              }
              
              // Emit the record
              this.emitRecord(audioMetric);
            }
            
            // Process video track metrics
            if (metrics.video) {
              const videoMetric = {
                metric_id: this.generateMetricId(roomId, participantId, timestamp, 'video'),
                room_id: roomId,
                participant_id: participantId,
                timestamp: timestamp,
                collected_at: collectedAt,
                latency: metrics.video.latency || 0,
                packet_loss: metrics.video.packet_loss || 0,
                jitter: metrics.video.jitter || 0,
                bitrate: metrics.video.bitrate || 0,
                audio_level: null,
                video_frame_rate: metrics.video.frame_rate || 0,
                video_resolution_width: metrics.video.resolution?.width || 0,
                video_resolution_height: metrics.video.resolution?.height || 0,
                track_type: 'video',
                connection_quality: this.mapConnectionQuality(metrics.video.quality)
              };
              
              // Emit the record
              this.emitRecord(videoMetric);
            }
            
            // Process screen share track metrics if available
            if (metrics.screen_share) {
              const screenShareMetric = {
                metric_id: this.generateMetricId(roomId, participantId, timestamp, 'screen_share'),
                room_id: roomId,
                participant_id: participantId,
                timestamp: timestamp,
                collected_at: collectedAt,
                latency: metrics.screen_share.latency || 0,
                packet_loss: metrics.screen_share.packet_loss || 0,
                jitter: metrics.screen_share.jitter || 0,
                bitrate: metrics.screen_share.bitrate || 0,
                audio_level: null,
                video_frame_rate: metrics.screen_share.frame_rate || 0,
                video_resolution_width: metrics.screen_share.resolution?.width || 0,
                video_resolution_height: metrics.screen_share.resolution?.height || 0,
                track_type: 'screen_share',
                connection_quality: this.mapConnectionQuality(metrics.screen_share.quality)
              };
              
              // Emit the record
              this.emitRecord(screenShareMetric);
            }
            
          } catch (error) {
            // Log error but continue with other participants
            this.emitLog('WARN', `Error fetching metrics for participant ${participantId} in room ${roomId}: ${error.message}`);
            continue;
          }
        }
      }
      
      // Update and emit state
      if (latestTimestamp > 0) {
        state = { [this.cursorField]: latestTimestamp };
        this.emitState(state);
      }
      
      this.emitLog('INFO', `Completed sync for quality metrics stream`);
      return state;
      
    } catch (error) {
      this.emitLog('ERROR', `Error syncing quality metrics: ${error.message}`);
      throw error;
    }
  }
}

module.exports = QualityMetricsStream;
