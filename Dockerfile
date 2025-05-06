FROM node:16-slim

WORKDIR /airbyte/source-livekit

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user for running the connector
RUN groupadd --gid 1000 airbyte \
    && useradd --uid 1000 --gid airbyte --shell /bin/bash airbyte

# Switch to non-root user
USER airbyte

# Set environment variables
ENV AIRBYTE_ENTRYPOINT="node src/index.js"

# Set entrypoint
ENTRYPOINT ["/bin/bash", "-c", "${AIRBYTE_ENTRYPOINT}"]

# Default command
CMD ["spec"]
