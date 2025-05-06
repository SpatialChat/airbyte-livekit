/**
 * Unit tests for the Participants stream
 */
const ParticipantsStream = require('../../src/streams/participants');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('ParticipantsStream', () => {
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
    stream = new ParticipantsStream(mockConfig);
    
    // Mock the console.log to capture emitted records
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should initialize with the correct stream name and cursor field', () => {
      expect(stream.streamName).toBe('participants');
      expect(stream.cursorField).toBe('timestamp');
    });
  });

  describe('getSourceDefinedPrimaryKey', () => {
    it('should return the correct primary key', () => {
      expect(stream.getSourceDefinedPrimaryKey()).toEqual([['participant_id', 'room_id', 'timestamp']]);
    });
  });

  describe('getDefaultCursorField', () => {
    it('should return the correct cursor field', () => {
      expect(stream.getDefaultCursorField()).toEqual(['timestamp']);
    });
  });

  describe('read', () => {
    it('should fetch and process participants data', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock responses
      mockClient.get.mockImplementation((path, options) => {
        if (path === '/rooms') {
          return Promise.resolve({
            data: {
              items: [
                { sid: 'room-1', name: 'Test Room 1' },
                { sid: 'room-2', name: 'Test Room 2' }
              ]
            }
          });
        } else if (path === '/rooms/room-1/participants') {
          return Promise.resolve({
            data: {
              items: [
                {
                  sid: 'participant-1',
                  identity: 'user1',
                  name: 'User One',
                  joined_at: '2025-01-15T10:00:00Z',
                  left_at: '2025-01-15T10:30:00Z',
                  publisher: true,
                  subscriber: true,
                  metadata: { role: 'presenter' },
                  user_agent: 'Chrome',
                  ip_address: '192.168.1.1',
                  region: 'us-west'
                }
              ]
            }
          });
        } else if (path === '/rooms/room-2/participants') {
          return Promise.resolve({
            data: {
              items: [
                {
                  sid: 'participant-2',
                  identity: 'user2',
                  name: 'User Two',
                  joined_at: '2025-01-15T11:00:00Z',
                  left_at: null,
                  publisher: false,
                  subscriber: true,
                  metadata: { role: 'attendee' },
                  user_agent: 'Firefox',
                  ip_address: '192.168.1.2',
                  region: 'us-east'
                }
              ]
            }
          });
        }
        return Promise.resolve({ data: { items: [] } });
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
      
      // Check that the room and participant endpoints were called
      expect(mockClient.get).toHaveBeenCalledWith('/rooms', expect.any(Object));
      expect(mockClient.get).toHaveBeenCalledWith('/rooms/room-1/participants', expect.any(Object));
      expect(mockClient.get).toHaveBeenCalledWith('/rooms/room-2/participants', expect.any(Object));
      
      // Check that console.log was called to emit records
      // We expect 2 calls to console.log for emitting records (1 for each participant)
      // and 1 call for emitting the state
      expect(console.log).toHaveBeenCalledTimes(3);
      
      // Check that state was properly updated
      const lastCall = console.log.mock.calls[2][0];
      const parsedState = JSON.parse(lastCall);
      expect(parsedState.type).toBe('STATE');
      expect(parsedState.state.data).toHaveProperty('participants');
      expect(parsedState.state.data.participants).toHaveProperty('timestamp');
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
