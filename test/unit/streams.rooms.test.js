/**
 * Unit tests for the Rooms stream
 */
const RoomsStream = require('../../src/streams/rooms');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('RoomsStream', () => {
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
    stream = new RoomsStream(mockConfig);
    
    // Mock the console.log to capture emitted records
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should initialize with the correct stream name and cursor field', () => {
      expect(stream.streamName).toBe('rooms');
      expect(stream.cursorField).toBe('timestamp');
    });
  });

  describe('getSourceDefinedPrimaryKey', () => {
    it('should return the correct primary key', () => {
      expect(stream.getSourceDefinedPrimaryKey()).toEqual([['room_id', 'timestamp']]);
    });
  });

  describe('getDefaultCursorField', () => {
    it('should return the correct cursor field', () => {
      expect(stream.getDefaultCursorField()).toEqual(['timestamp']);
    });
  });

  describe('read', () => {
    it('should fetch and process rooms data', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock rooms response with two pages
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms') {
          return Promise.resolve({
            data: {
              items: [
                {
                  sid: 'room-1',
                  name: 'Test Room 1',
                  created_at: '2025-01-15T10:00:00Z',
                  num_participants: 5,
                  duration: 3600,
                  active: true,
                  metadata: { purpose: 'meeting' }
                },
                {
                  sid: 'room-2',
                  name: 'Test Room 2',
                  created_at: '2025-01-15T11:00:00Z',
                  num_participants: 3,
                  duration: 1800,
                  active: true,
                  metadata: { purpose: 'webinar' }
                }
              ]
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock the second page with no more results
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms') {
          return Promise.resolve({
            data: {
              items: []
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
      const firstCallParams = mockClient.get.mock.calls[0][1];
      expect(firstCallParams).toHaveProperty('params');
      expect(firstCallParams.params).toHaveProperty('from', '2025-01-01');
      expect(firstCallParams.params).toHaveProperty('limit', 100);
      
      // Check the pagination parameters for the second call
      const secondCallParams = mockClient.get.mock.calls[1][1];
      expect(secondCallParams).toHaveProperty('params');
      expect(secondCallParams.params).toHaveProperty('offset', 2);
      
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
      expect(recordEmissions.length).toBe(2);
      
      // Verify the content of records
      const roomsRecords = recordEmissions.map(r => r.record.data);
      
      // Check the first room record
      expect(roomsRecords[0]).toHaveProperty('room_id', 'room-1');
      expect(roomsRecords[0]).toHaveProperty('name', 'Test Room 1');
      expect(roomsRecords[0]).toHaveProperty('participant_count', 5);
      expect(roomsRecords[0]).toHaveProperty('active', true);
      expect(roomsRecords[0]).toHaveProperty('metadata').toEqual({ purpose: 'meeting' });
      
      // Check the second room record
      expect(roomsRecords[1]).toHaveProperty('room_id', 'room-2');
      expect(roomsRecords[1]).toHaveProperty('name', 'Test Room 2');
      expect(roomsRecords[1]).toHaveProperty('participant_count', 3);
      expect(roomsRecords[1]).toHaveProperty('active', true);
      expect(roomsRecords[1]).toHaveProperty('metadata').toEqual({ purpose: 'webinar' });
      
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
      expect(stateEmissions[0].state.data).toHaveProperty('rooms');
      expect(stateEmissions[0].state.data.rooms).toHaveProperty('timestamp');
    });

    it('should handle empty rooms list', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock empty rooms response
      mockClient.get.mockResolvedValue({
        data: {
          items: []
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
  });
});
