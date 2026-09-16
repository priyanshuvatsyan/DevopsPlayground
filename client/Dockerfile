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

#  Install 'serve' instead of 'http-server'
RUN npm install -g serve

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 5173

# Set environment
ENV NODE_ENV=production

# ---> CHANGED: Use 'serve -s' (Single Page Application mode) to route 404s to index.html
CMD ["serve", "-s", "dist", "-l", "5173", "--cors"]