# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine

# Install a simple HTTP server to serve static files
RUN npm install -g http-server

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 5173

# Set environment
ENV NODE_ENV=production

# Start server
CMD ["http-server", "dist", "-p", "5173", "--cors"]
