/**
 * Unit tests for the Events stream
 */
const EventsStream = require('../../src/streams/events');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('EventsStream', () => {
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
    stream = new EventsStream(mockConfig);
    
    // Mock the console.log to capture emitted records
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should initialize with the correct stream name and cursor field', () => {
      expect(stream.streamName).toBe('events');
      expect(stream.cursorField).toBe('timestamp');
    });
  });

  describe('getSourceDefinedPrimaryKey', () => {
    it('should return the correct primary key', () => {
      expect(stream.getSourceDefinedPrimaryKey()).toEqual([['event_id']]);
    });
  });

  describe('getDefaultCursorField', () => {
    it('should return the correct cursor field', () => {
      expect(stream.getDefaultCursorField()).toEqual(['timestamp']);
    });
  });

  describe('mapSeverity', () => {
    it('should map severity levels correctly', () => {
      expect(stream.mapSeverity('debug')).toBe('info');
      expect(stream.mapSeverity('info')).toBe('info');
      expect(stream.mapSeverity('notice')).toBe('info');
      expect(stream.mapSeverity('warning')).toBe('warning');
      expect(stream.mapSeverity('warn')).toBe('warning');
      expect(stream.mapSeverity('error')).toBe('error');
      expect(stream.mapSeverity('alert')).toBe('critical');
      expect(stream.mapSeverity('critical')).toBe('critical');
      expect(stream.mapSeverity('emergency')).toBe('critical');
      expect(stream.mapSeverity('unknown')).toBe('info'); // Default
    });
  });

  describe('read', () => {
    it('should fetch and process events data', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock events response with two pages
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/events') {
          return Promise.resolve({
            data: {
              items: [
                {
                  id: 'event-1',
                  room_id: 'room-1',
                  participant_id: 'participant-1',
                  timestamp: '2025-01-15T10:00:00Z',
                  type: 'participant_joined',
                  level: 'info',
                  message: 'Participant joined room',
                  metadata: { browser: 'Chrome' },
                  source: 'livekit',
                  ip_address: '192.168.1.1',
                  region: 'us-west'
                },
                {
                  id: 'event-2',
                  room_id: 'room-1',
                  participant_id: 'participant-2',
                  timestamp: '2025-01-15T10:05:00Z',
                  type: 'participant_joined',
                  level: 'info',
                  message: 'Participant joined room',
                  metadata: { browser: 'Firefox' },
                  source: 'livekit',
                  ip_address: '192.168.1.2',
                  region: 'us-east'
                }
              ]
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock the second page with one more event
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/events') {
          return Promise.resolve({
            data: {
              items: [
                {
                  id: 'event-3',
                  room_id: 'room-1',
                  participant_id: 'participant-1',
                  timestamp: '2025-01-15T10:30:00Z',
                  type: 'participant_left',
                  level: 'info',
                  message: 'Participant left room',
                  metadata: { duration: 1800 },
                  source: 'livekit',
                  ip_address: '192.168.1.1',
                  region: 'us-west'
                }
              ]
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock the third page with no more events
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/events') {
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
      
      // Check that paging was handled correctly
      const secondCallParams = mockClient.get.mock.calls[1][1];
      expect(secondCallParams.params).toHaveProperty('offset', 2);
      
      const thirdCallParams = mockClient.get.mock.calls[2][1];
      expect(thirdCallParams.params).toHaveProperty('offset', 3);
      
      // Check mockClient.get was called 3 times (2 pages with events, 1 empty page)
      expect(mockClient.get).toHaveBeenCalledTimes(3);
      
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
      expect(recordEmissions.length).toBe(3);
      
      // Verify the content of records
      const eventsRecords = recordEmissions.map(r => r.record.data);
      
      // Check the first event record
      expect(eventsRecords[0]).toHaveProperty('event_id', 'event-1');
      expect(eventsRecords[0]).toHaveProperty('room_id', 'room-1');
      expect(eventsRecords[0]).toHaveProperty('participant_id', 'participant-1');
      expect(eventsRecords[0]).toHaveProperty('event_type', 'participant_joined');
      expect(eventsRecords[0]).toHaveProperty('severity', 'info');
      expect(eventsRecords[0]).toHaveProperty('message', 'Participant joined room');
      expect(eventsRecords[0]).toHaveProperty('metadata').toEqual({ browser: 'Chrome' });
      expect(eventsRecords[0]).toHaveProperty('source', 'livekit');
      expect(eventsRecords[0]).toHaveProperty('region', 'us-west');
      
      // Check the last event record (participant left)
      const leftEvent = eventsRecords.find(r => r.event_type === 'participant_left');
      expect(leftEvent).toBeDefined();
      expect(leftEvent).toHaveProperty('metadata').toEqual({ duration: 1800 });
      
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
      expect(stateEmissions[0].state.data).toHaveProperty('events');
      expect(stateEmissions[0].state.data.events).toHaveProperty('timestamp');
    });

    it('should handle empty events list', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock empty events response
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
