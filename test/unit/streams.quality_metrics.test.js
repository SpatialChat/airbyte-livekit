/**
 * Unit tests for the Quality Metrics stream
 */
const QualityMetricsStream = require('../../src/streams/quality_metrics');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('QualityMetricsStream', () => {
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
    stream = new QualityMetricsStream(mockConfig);
    
    // Mock the console.log to capture emitted records
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should initialize with the correct stream name and cursor field', () => {
      expect(stream.streamName).toBe('quality_metrics');
      expect(stream.cursorField).toBe('timestamp');
    });
  });

  describe('getSourceDefinedPrimaryKey', () => {
    it('should return the correct primary key', () => {
      expect(stream.getSourceDefinedPrimaryKey()).toEqual([['metric_id']]);
    });
  });

  describe('getDefaultCursorField', () => {
    it('should return the correct cursor field', () => {
      expect(stream.getDefaultCursorField()).toEqual(['timestamp']);
    });
  });

  describe('generateMetricId', () => {
    it('should generate a deterministic ID based on inputs', () => {
      const id1 = stream.generateMetricId('room1', 'participant1', 1620000000000, 'audio');
      const id2 = stream.generateMetricId('room1', 'participant1', 1620000000000, 'audio');
      const id3 = stream.generateMetricId('room1', 'participant1', 1620000000000, 'video');
      
      expect(id1).toBe(id2); // Same inputs should produce same ID
      expect(id1).not.toBe(id3); // Different inputs should produce different IDs
      expect(id1.length).toBe(32); // ID should be 32 characters long
    });
  });

  describe('mapConnectionQuality', () => {
    it('should correctly map quality values to strings', () => {
      expect(stream.mapConnectionQuality(90)).toBe('excellent');
      expect(stream.mapConnectionQuality(70)).toBe('good');
      expect(stream.mapConnectionQuality(30)).toBe('poor');
      expect(stream.mapConnectionQuality(null)).toBe('unknown');
      expect(stream.mapConnectionQuality(undefined)).toBe('unknown');
    });
  });

  describe('read', () => {
    it('should fetch and process quality metrics data', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock active rooms response
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms') {
          return Promise.resolve({
            data: {
              items: [
                { sid: 'room-1', name: 'Test Room 1' }
              ]
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock participants response
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms/room-1/participants') {
          return Promise.resolve({
            data: {
              items: [
                { sid: 'participant-1', identity: 'user1', name: 'User One' },
                { sid: 'participant-2', identity: 'user2', name: 'User Two' }
              ]
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock metrics response for first participant
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms/room-1/participants/participant-1/metrics') {
          return Promise.resolve({
            data: {
              audio: {
                latency: 50,
                packet_loss: 0.1,
                jitter: 15,
                bitrate: 48000,
                level: 0.75,
                quality: 90
              },
              video: {
                latency: 80,
                packet_loss: 0.2,
                jitter: 20,
                bitrate: 1500000,
                frame_rate: 30,
                resolution: {
                  width: 1280,
                  height: 720
                },
                quality: 85
              }
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock metrics response for second participant
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms/room-1/participants/participant-2/metrics') {
          return Promise.resolve({
            data: {
              audio: {
                latency: 60,
                packet_loss: 0.5,
                jitter: 25,
                bitrate: 32000,
                level: 0.5,
                quality: 70
              },
              video: {
                latency: 100,
                packet_loss: 1.0,
                jitter: 30,
                bitrate: 800000,
                frame_rate: 24,
                resolution: {
                  width: 640,
                  height: 480
                },
                quality: 60
              },
              screen_share: {
                latency: 90,
                packet_loss: 0.3,
                jitter: 15,
                bitrate: 2000000,
                frame_rate: 15,
                resolution: {
                  width: 1920,
                  height: 1080
                },
                quality: 80
              }
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
      
      // Check that the API endpoints were called with the right paths
      expect(mockClient.get).toHaveBeenCalledWith('/rooms', expect.any(Object));
      expect(mockClient.get).toHaveBeenCalledWith('/rooms/room-1/participants', expect.any(Object));
      expect(mockClient.get).toHaveBeenCalledWith('/rooms/room-1/participants/participant-1/metrics', expect.any(Object));
      expect(mockClient.get).toHaveBeenCalledWith('/rooms/room-1/participants/participant-2/metrics', expect.any(Object));
      
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
      
      // Verify we have the expected number of record emissions (2 participants with audio + video = 4 metrics, plus 1 screen share = 5)
      expect(recordEmissions.length).toBe(5);
      
      // Verify the content of records
      const metricsRecords = recordEmissions.map(r => r.record.data);
      
      // Check the first participant's audio metric
      const audioMetric = metricsRecords.find(r => r.participant_id === 'participant-1' && r.track_type === 'audio');
      expect(audioMetric).toBeDefined();
      expect(audioMetric).toHaveProperty('metric_id');
      expect(audioMetric).toHaveProperty('room_id', 'room-1');
      expect(audioMetric).toHaveProperty('latency', 50);
      expect(audioMetric).toHaveProperty('packet_loss', 0.1);
      expect(audioMetric).toHaveProperty('audio_level', 0.75);
      expect(audioMetric).toHaveProperty('connection_quality', 'excellent');
      
      // Check the first participant's video metric
      const videoMetric = metricsRecords.find(r => r.participant_id === 'participant-1' && r.track_type === 'video');
      expect(videoMetric).toBeDefined();
      expect(videoMetric).toHaveProperty('video_frame_rate', 30);
      expect(videoMetric).toHaveProperty('video_resolution_width', 1280);
      expect(videoMetric).toHaveProperty('video_resolution_height', 720);
      
      // Check the second participant's screen share metric
      const screenShareMetric = metricsRecords.find(r => r.track_type === 'screen_share');
      expect(screenShareMetric).toBeDefined();
      expect(screenShareMetric).toHaveProperty('participant_id', 'participant-2');
      expect(screenShareMetric).toHaveProperty('video_frame_rate', 15);
      expect(screenShareMetric).toHaveProperty('video_resolution_width', 1920);
      expect(screenShareMetric).toHaveProperty('video_resolution_height', 1080);
      expect(screenShareMetric).toHaveProperty('connection_quality', 'excellent');
      
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
      expect(stateEmissions[0].state.data).toHaveProperty('quality_metrics');
      expect(stateEmissions[0].state.data.quality_metrics).toHaveProperty('timestamp');
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

    it('should handle participant metrics errors gracefully', async () => {
      // Mock axios create return value
      const mockClient = {
        get: jest.fn()
      };
      axios.create.mockReturnValue(mockClient);
      
      // Mock rooms response
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms') {
          return Promise.resolve({
            data: {
              items: [
                { sid: 'room-1', name: 'Test Room 1' }
              ]
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock participants response
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms/room-1/participants') {
          return Promise.resolve({
            data: {
              items: [
                { sid: 'participant-1', identity: 'user1', name: 'User One' }
              ]
            }
          });
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock metrics response with error
      mockClient.get.mockImplementationOnce((path, options) => {
        if (path === '/rooms/room-1/participants/participant-1/metrics') {
          return Promise.reject(new Error('Metrics not available'));
        }
        return Promise.reject(new Error('Unexpected URL'));
      });
      
      // Mock the logger to prevent error logs in test output
      stream.logger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
      };
      
      // Execute the read method
      await stream.read();
      
      // Check that warning was logged but process continued
      expect(stream.logger.warn).toHaveBeenCalled();
      expect(stream.logger.error).not.toHaveBeenCalled();
      
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
    });

    it('should handle general errors gracefully', async () => {
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
