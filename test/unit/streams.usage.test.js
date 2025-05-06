/**
 * Unit tests for the Usage stream
 */
const UsageStream = require('../../src/streams/usage');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('UsageStream', () => {
  let stream;
  const mockConfig = {
    api_key: 'test_api_key',
    api_secret: 'test_api_secret',
    endpoint_url: 'https://api.livekit.example.com',
    start_date: '2025-01-01'
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create a new stream instance for each test
    stream = new UsageStream(mockConfig);
    
    // Mock the console.log to capture emitted records
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should initialize with the correct stream name and cursor field', () => {
      expect(stream.streamName).toBe('usage');
      expect(stream.cursorField).toBe('timestamp');
    });
  });

  describe('getSourceDefinedPrimaryKey', () => {
    it('should return the correct primary key', () => {
      expect(stream.getSourceDefinedPrimaryKey()).toEqual([['usage_id']]);
    });
  });

  describe('getDefaultCursorField', () => {
    it('should return the correct cursor field', () => {
      expect(stream.getDefaultCursorField()).toEqual(['timestamp']);
    });
  });

  describe('generateUsageId', () => {
    it('should generate a deterministic ID based on inputs', () => {
      const id1 = stream.generateUsageId('2025-01-15', 'participant_minutes', 'us-west');
      const id2 = stream.generateUsageId('2025-01-15', 'participant_minutes', 'us-west');
      const id3 = stream.generateUsageId('2025-01-15', 'recording_minutes', 'us-west');
      
      expect(id1).toBe(id2); // Same inputs should produce same ID
      expect(id1).not.toBe(id3); // Different inputs should produce different IDs
      expect(id1.length).toBe(32); // ID should be 32 characters long
    });
  });

  describe('read', () => {
    it('should fetch and process usage data', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock usage response
      mockClient.get.mockImplementation((path, options) => {
        if (path === '/usage') {
          return Promise.resolve({
            data: {
              daily: [
                {
                  date: '2025-01-15',
                  participant_minutes: 120,
                  recording_minutes: 60,
                  egress_bandwidth: 2.5,
                  ingress_bandwidth: 1.2,
                  room_count: 5,
                  participant_count: 20,
                  regions: {
                    'us-west': {
                      participant_minutes: 80,
                      recording_minutes: 40,
                      egress_bandwidth: 1.5,
                      ingress_bandwidth: 0.8,
                      room_count: 3,
                      participant_count: 12
                    },
                    'eu-central': {
                      participant_minutes: 40,
                      recording_minutes: 20,
                      egress_bandwidth: 1.0,
                      ingress_bandwidth: 0.4,
                      room_count: 2,
                      participant_count: 8
                    }
                  }
                },
                {
                  date: '2025-01-16',
                  participant_minutes: 150,
                  recording_minutes: 75,
                  egress_bandwidth: 3.0,
                  ingress_bandwidth: 1.5,
                  room_count: 6,
                  participant_count: 25,
                  regions: {
                    'us-west': {
                      participant_minutes: 90,
                      recording_minutes: 45,
                      egress_bandwidth: 1.8,
                      ingress_bandwidth: 0.9,
                      room_count: 4,
                      participant_count: 15
                    },
                    'eu-central': {
                      participant_minutes: 60,
                      recording_minutes: 30,
                      egress_bandwidth: 1.2,
                      ingress_bandwidth: 0.6,
                      room_count: 2,
                      participant_count: 10
                    }
                  }
                }
              ]
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Execute the read method
      await stream.read();
      
      // Check that axios.create was called with the right params
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.livekit.example.com',
        headers: expect.objectContaining({
          'Authorization': expect.stringMatching(/^Bearer /),
          'Content-Type': 'application/json'
        })
      });
      
      // Check that the API endpoint was called with the right params
      const callParams = mockClient.get.mock.calls[0][1];
      expect(callParams).toHaveProperty('params');
      expect(callParams.params).toHaveProperty('from', '2025-01-01');
      
      // Count record emissions
      const emitCalls = console.log.mock.calls;
      const recordEmissions = emitCalls
        .map(call => {
          try {
            return JSON.parse(call[0]);
          } catch (e) {
            return null;
          }
        })
        .filter(item => item && item.type === 'RECORD');
      
      // Verify we have the expected number of record emissions
      // 2 days x 4 resource types x (2 regions + global) = 24 records
      expect(recordEmissions.length).toBe(24);
      
      // Verify the content of records
      const usageRecords = recordEmissions.map(r => r.record.data);
      
      // Check a global record
      const globalParticipantMinutes = usageRecords.find(r => 
        r.resource_type === 'participant_minutes' && 
        r.region === 'global' &&
        r.date === '2025-01-15'
      );
      expect(globalParticipantMinutes).toBeDefined();
      expect(globalParticipantMinutes).toHaveProperty('usage_id');
      expect(globalParticipantMinutes).toHaveProperty('quantity', 120);
      expect(globalParticipantMinutes).toHaveProperty('room_count', 5);
      expect(globalParticipantMinutes).toHaveProperty('participant_count', 20);
      
      // Check a regional record
      const usWestRecordingMinutes = usageRecords.find(r => 
        r.resource_type === 'recording_minutes' && 
        r.region === 'us-west' &&
        r.date === '2025-01-16'
      );
      expect(usWestRecordingMinutes).toBeDefined();
      expect(usWestRecordingMinutes).toHaveProperty('quantity', 45);
      expect(usWestRecordingMinutes).toHaveProperty('unit', 'minutes');
      expect(usWestRecordingMinutes).toHaveProperty('room_count', 4);
      
      // Check bandwidth records
      const euCentralEgressBandwidth = usageRecords.find(r => 
        r.resource_type === 'egress_bandwidth' && 
        r.region === 'eu-central' &&
        r.date === '2025-01-15'
      );
      expect(euCentralEgressBandwidth).toBeDefined();
      expect(euCentralEgressBandwidth).toHaveProperty('quantity', 1.0);
      expect(euCentralEgressBandwidth).toHaveProperty('unit', 'GB');
      
      // Check that state was emitted
      const stateEmissions = emitCalls
        .map(call => {
          try {
            return JSON.parse(call[0]);
          } catch (e) {
            return null;
          }
        })
        .filter(item => item && item.type === 'STATE');
      
      expect(stateEmissions.length).toBe(1);
      expect(stateEmissions[0].state.data).toHaveProperty('usage');
      expect(stateEmissions[0].state.data.usage).toHaveProperty('timestamp');
    });

    it('should handle empty usage data', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock empty usage response
      mockClient.get.mockResolvedValue({
        data: {
          daily: []
        }
      });
      
      // Execute the read method
      const result = await stream.read();
      
      // Verify that no records were emitted
      const emitCalls = console.log.mock.calls;
      const recordEmissions = emitCalls
        .map(call => {
          try {
            return JSON.parse(call[0]);
          } catch (e) {
            return null;
          }
        })
        .filter(item => item && item.type === 'RECORD');
      
      expect(recordEmissions.length).toBe(0);
      
      // Verify that state isn't updated
      expect(result).toEqual({});
    });

    it('should handle errors gracefully', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock error response
      mockClient.get.mockRejectedValue(new Error('API Error'));
      
      // Mock the logger to prevent error logs in test output
      stream.logger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
      };
      
      // Execute the read method and expect it to throw
      await expect(stream.read()).rejects.toThrow('API Error');
      
      // Check that error was logged
      expect(stream.logger.error).toHaveBeenCalled();
    });

    it('should respect state and skip older records', async () => {
      // Set initial state with a timestamp
      const initialState = {
        timestamp: new Date('2025-01-16').getTime() // Skip records from 2025-01-15
      };
      
      // Create stream with state
      stream = new UsageStream(mockConfig, {}, initialState);
      
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock usage response with records from two days
      mockClient.get.mockResolvedValue({
        data: {
          daily: [
            {
              date: '2025-01-15', // This should be skipped due to state
              participant_minutes: 120,
              recording_minutes: 60,
              egress_bandwidth: 2.5,
              ingress_bandwidth: 1.2,
              room_count: 5,
              participant_count: 20
            },
            {
              date: '2025-01-16', // This should be processed
              participant_minutes: 150,
              recording_minutes: 75,
              egress_bandwidth: 3.0,
              ingress_bandwidth: 1.5,
              room_count: 6,
              participant_count: 25
            }
          ]
        }
      });
      
      // Execute the read method
      await stream.read();
      
      // Count record emissions
      const emitCalls = console.log.mock.calls;
      const recordEmissions = emitCalls
        .map(call => {
          try {
            return JSON.parse(call[0]);
          } catch (e) {
            return null;
          }
        })
        .filter(item => item && item.type === 'RECORD');
      
      // Verify we have only records from 2025-01-16
      // 1 day x 4 resource types x 1 global = 4 records
      expect(recordEmissions.length).toBe(4);
      
      // Verify all records are from 2025-01-16
      const recordDates = recordEmissions.map(r => r.record.data.date);
      expect(recordDates.every(date => date === '2025-01-16')).toBe(true);
    });
  });
});
