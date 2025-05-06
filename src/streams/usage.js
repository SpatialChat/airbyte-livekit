/**
 * Implementation of the Usage stream for LiveKit
 */
const BaseStream = require('./base');
const moment = require('moment');
const crypto = require('crypto');

class UsageStream extends BaseStream {
  constructor(config, streamConfig = {}, state = {}) {
    super(config, streamConfig, state);
    this.streamName = 'usage';
    this.cursorField = 'timestamp';
  }

  /**
   * Get the source defined primary key for this stream
   * @returns {Array} The primary key fields as a nested array
   */
  getSourceDefinedPrimaryKey() {
    return [['usage_id']];
  }

  /**
   * Get the default cursor field for this stream
   * @returns {Array} The default cursor field
   */
  getDefaultCursorField() {
    return [this.cursorField];
  }

  /**
   * Generate a unique usage ID
   * @param {String} date - Date string
   * @param {String} resourceType - Resource type
   * @param {String} region - Region (optional)
   * @returns {String} The unique usage ID
   */
  generateUsageId(date, resourceType, region = 'global') {
    const hash = crypto.createHash('sha256');
    hash.update(`${date}:${resourceType}:${region}`);
    return hash.digest('hex').substring(0, 32);
  }

  /**
   * Read records from the usage stream
   */
  async read() {
    const client = this.createClient();
    let state = this.state || {};
    
    try {
      this.emitLog('INFO', `Starting sync for usage stream`);
      
      // Determine start date
      let startDate = this.config.start_date;
      if (state[this.cursorField]) {
        // If we have a state, use it as the start date
        startDate = moment(state[this.cursorField]).format('YYYY-MM-DD');
      }
      
      const endDate = moment().format('YYYY-MM-DD');
      this.emitLog('INFO', `Fetching usage data from ${startDate} to ${endDate}`);
      
      // Set up query parameters
      const params = {
        from: startDate,
        to: endDate
      };
      
      // Make API request
      const response = await client.get('/usage', { params });
      const usageData = response.data || {};
      
      let latestTimestamp = state[this.cursorField] || 0;
      
      // Process daily usage
      const dailyUsage = usageData.daily || [];
      for (const dayUsage of dailyUsage) {
        const date = dayUsage.date;
        const dateObj = moment(date, 'YYYY-MM-DD');
        const timestamp = dateObj.valueOf(); // Convert to milliseconds
        
        // Skip records older than our state
        if (timestamp <= latestTimestamp && latestTimestamp > 0) {
          continue;
        }
        
        // Create usage records by resource type
        const resourceTypes = [
          { type: 'participant_minutes', value: dayUsage.participant_minutes || 0, unit: 'minutes' },
          { type: 'recording_minutes', value: dayUsage.recording_minutes || 0, unit: 'minutes' },
          { type: 'egress_bandwidth', value: dayUsage.egress_bandwidth || 0, unit: 'GB' },
          { type: 'ingress_bandwidth', value: dayUsage.ingress_bandwidth || 0, unit: 'GB' }
        ];
        
        // Process usage by region if available
        const regions = dayUsage.regions || {};
        for (const region in regions) {
          const regionData = regions[region];
          
          for (const resource of resourceTypes) {
            // Only emit if we have data for this resource in this region
            if (regionData[resource.type] && regionData[resource.type] > 0) {
              const record = {
                usage_id: this.generateUsageId(date, resource.type, region),
                timestamp,
                date,
                resource_type: resource.type,
                unit: resource.unit,
                quantity: regionData[resource.type],
                room_count: regionData.room_count || 0,
                participant_count: regionData.participant_count || 0,
                participant_minutes: regionData.participant_minutes || 0,
                recording_minutes: regionData.recording_minutes || 0,
                egress_bandwidth: regionData.egress_bandwidth || 0,
                ingress_bandwidth: regionData.ingress_bandwidth || 0,
                region
              };
              
              // Emit the record
              this.emitRecord(record);
            }
          }
        }
        
        // Also emit global usage records
        for (const resource of resourceTypes) {
          const record = {
            usage_id: this.generateUsageId(date, resource.type),
            timestamp,
            date,
            resource_type: resource.type,
            unit: resource.unit,
            quantity: dayUsage[resource.type] || 0,
            room_count: dayUsage.room_count || 0,
            participant_count: dayUsage.participant_count || 0,
            participant_minutes: dayUsage.participant_minutes || 0,
            recording_minutes: dayUsage.recording_minutes || 0,
            egress_bandwidth: dayUsage.egress_bandwidth || 0,
            ingress_bandwidth: dayUsage.ingress_bandwidth || 0,
            region: 'global'
          };
          
          // Emit the record
          this.emitRecord(record);
        }
        
        // Update latest timestamp for state
        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
        }
      }
      
      // Update and emit state
      if (latestTimestamp > 0) {
        state = { [this.cursorField]: latestTimestamp };
        this.emitState(state);
      }
      
      this.emitLog('INFO', `Completed sync for usage stream`);
      return state;
      
    } catch (error) {
      this.emitLog('ERROR', `Error syncing usage: ${error.message}`);
      throw error;
    }
  }
}

module.exports = UsageStream;
