/**
 * Integration tests for the Events stream
 * 
 * Note: These tests require valid LiveKit credentials and will make actual API calls.
 * To run these tests, you need to set the following environment variables:
 * - LIVEKIT_API_KEY: Your LiveKit API key
 * - LIVEKIT_API_SECRET: Your LiveKit API secret
 * - LIVEKIT_ENDPOINT_URL: Your LiveKit API endpoint URL
 */
const EventsStream = require('../../src/streams/events');

// Skip these tests if environment variables are not set
const SKIP_INTEGRATION_TESTS = !process.env.LIVEKIT_API_KEY || 
                               !process.env.LIVEKIT_API_SECRET || 
                               !process.env.LIVEKIT_ENDPOINT_URL;

describe('EventsStream Integration Tests', () => {
  let stream;
  const config = {
    api_key: process.env.LIVEKIT_API_KEY,
    api_secret: process.env.LIVEKIT_API_SECRET,
    endpoint_url: process.env.LIVEKIT_ENDPOINT_URL,
    start_date: '2025-01-01'
  };
  
  beforeEach(() => {
    // Create a new stream instance for each test
    stream = new EventsStream(config);
    
    // Mock console.log to capture emitted records
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  // Skip all tests if environment variables are not set
  if (SKIP_INTEGRATION_TESTS) {
    it.skip('Integration tests skipped due to missing environment variables', () => {});
    return;
  }
  
  describe('testConnection', () => {
    it('should successfully connect to the LiveKit API', async () => {
      const result = await stream.testConnection();
      expect(result).toBe(true);
    });
  });
  
  describe('read', () => {
    it('should fetch and process events data from LiveKit API', async () => {
      // Set a timeout for this test to allow for API delays
      jest.setTimeout(30000);
      
      // Execute the read method
      const state = await stream.read();
      
      // We can't make strict assertions about the API response, since it depends
      // on the actual data in the LiveKit instance, but we can verify the structure
      expect(state).toBeDefined();
      
      // Get all the console.log calls
      const calls = console.log.mock.calls;
      
      // Find all emitted records
      const records = calls
        .map(call => {
          try {
            return JSON.parse(call[0]);
          } catch (e) {
            return null;
          }
        })
        .filter(item => item && item.type === 'RECORD');
      
      // Event records may be empty if there are no events in the date range
      // But if there are events, check their structure
      if (records.length > 0) {
        // Check that records have the expected structure
        for (const record of records) {
          expect(record.record).toHaveProperty('stream', 'events');
          expect(record.record).toHaveProperty('data');
          expect(record.record.data).toHaveProperty('event_id');
          expect(record.record.data).toHaveProperty('timestamp');
          expect(record.record.data).toHaveProperty('event_type');
          expect(record.record.data).toHaveProperty('severity');
          expect(record.record.data).toHaveProperty('message');
          
          // Check that severity is valid
          expect(['info', 'warning', 'error', 'critical']).toContain(record.record.data.severity);
        }
        
        // Check if state was emitted
        const stateEmissions = calls
          .map(call => {
            try {
              return JSON.parse(call[0]);
            } catch (e) {
              return null;
            }
          })
          .filter(item => item && item.type === 'STATE');
        
        // Verify that the state was emitted at least once
        expect(stateEmissions.length).toBeGreaterThan(0);
        expect(stateEmissions[0].state.data).toHaveProperty('events');
        expect(stateEmissions[0].state.data.events).toHaveProperty('timestamp');
      }
    });
  });
});
