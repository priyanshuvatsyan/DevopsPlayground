# Use the official lightweight Node.js image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy dependency definitions first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install production dependencies cleanly
# (Make sure you ran 'npm install' locally first so package-lock.json exists)
RUN npm ci --only=production

# Copy the rest of the backend application code
COPY . .

# Expose the API port (change this if your Express server uses a different port)
EXPOSE 4000

# Set environment to production
ENV NODE_ENV=production

# Start the Node.js Express server
CMD ["npm", "start"]