# Use Node.js base image
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 4000

# Set environment
ENV NODE_ENV=production

# Start the server
CMD ["npm", "start"]
