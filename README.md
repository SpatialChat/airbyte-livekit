# Airbyte LiveKit Source Connector

This connector allows you to extract data from LiveKit's real-time communication platform using the Airbyte data integration platform.

## Features

- Extract room usage data and metrics
- Collect participant information and events
- Track quality metrics for communication sessions
- Gather system events and error logs
- Monitor billing and usage information

## Prerequisites

- Node.js 14+
- Docker (for deployment)
- LiveKit API credentials
- Airbyte instance (self-hosted or cloud)

## Supported Data Streams

| Stream Name | Description | Incremental Sync |
|-------------|-------------|------------------|
| rooms | Room creation, duration, and participant counts | ✅ |
| participants | Participant join/leave events and metrics | ✅ |
| quality_metrics | Connection quality, latency, packet loss | ✅ |
| events | System events, errors, configuration changes | ✅ |
| usage | API and resource consumption metrics | ✅ |

## Configuration

### Source Configuration

| Field | Description | Required | Default |
|-------|-------------|----------|---------|
| api_key | LiveKit API key | Yes | - |
| api_secret | LiveKit API secret | Yes | - |
| project_id | LiveKit project ID | No | - |
| endpoint_url | API endpoint URL | Yes | https://api.livekit.io |
| data_center | LiveKit data center | No | - |
| start_date | Historical data start date (YYYY-MM-DD) | Yes | - |
| streams | Array of stream names to synchronize | No | All streams |

### Self-hosted Instances

For self-hosted LiveKit instances, set the `endpoint_url` to your instance's API endpoint.

## Setup Guide

### Local Development

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your LiveKit credentials
4. Run tests:
   ```bash
   npm test
   ```

### Building the Connector

```bash
docker build -t source-livekit:dev .
```

### Deploying with Airbyte

See the main [deployment documentation](../docs/deployment.md) for instructions on deploying this connector with Airbyte.

## Testing the Connection

Once configured in Airbyte, you can test the connection by:

1. Adding a new source connection using the LiveKit connector
2. Entering your LiveKit credentials
3. Clicking "Test Connection"
4. If successful, you'll see a list of available streams

## Troubleshooting

### Common Issues

- **Authentication failures**: Verify your API key and secret are correct
- **Connection timeouts**: Check that your endpoint URL is reachable
- **Rate limiting**: Reduce sync frequency or batch size
- **Missing data**: Ensure the requested streams exist and contain data

### Getting Help

If you encounter issues:

1. Check the Airbyte logs for error messages
2. Refer to the [LiveKit API documentation](https://docs.livekit.io/server/getting-started/)
3. Open an issue in the GitHub repository with detailed information

## Development

### Project Structure

```
/
├── Dockerfile              # Container definition
├── package.json            # Dependencies and scripts
├── src/
│   ├── index.js            # Main entry point
│   ├── config.js           # Configuration schema and validation
│   ├── streams/            # Stream implementations
│   │   ├── base.js         # Base stream class
│   │   ├── rooms.js        # Rooms stream implementation
│   │   ├── participants.js # Participants stream implementation
│   │   └── ...
│   └── utils/              # Utility functions
├── test/
│   ├── unit/               # Unit tests
│   └── integration/        # Integration tests
└── resources/
    ├── spec.json           # Connector specification
    └── schemas/            # JSON schemas for each stream
```

### Adding a New Stream

1. Create a new schema in `resources/schemas/`
2. Create a new stream implementation in `src/streams/`
3. Add the stream to the stream registry in `src/index.js`
4. Write tests for the new stream
5. Update documentation

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](../LICENSE) file for details.

## Contributing

We welcome contributions! Please see our [contribution guidelines](../docs/CONTRIBUTING.md) for details on how to get involved.
