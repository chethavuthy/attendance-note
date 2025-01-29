# Use Node.js LTS version as base image
# To deploy:
# 1. Build: docker build -t attendance-bot .
# 2. Tag: docker tag attendance-bot <registry-url>/attendance-bot:latest
# 3. Push: docker push <registry-url>/attendance-bot:latest
# 4. On server: docker pull <registry-url>/attendance-bot:latest
FROM --platform=linux/amd64 node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN yarn install --production

# Copy app source
COPY . .

# Create data directory and set permissions
RUN mkdir -p /usr/src/app/data && \
    chown -R node:node /usr/src/app/data

# Set environment variables
ENV NODE_ENV=production

# Switch to non-root user
USER node

# Create volume for persistent data
VOLUME ["/usr/src/app/data"]

# Expose port if needed (for future web interface)
EXPOSE 3000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e 'try { require("fs").accessSync("/usr/src/app/data"); process.exit(0); } catch(e) { process.exit(1); }'

# Start the bot with proper error handling
CMD ["yarn", "start"]