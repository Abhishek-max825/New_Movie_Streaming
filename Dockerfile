# New Dockerfile: Node + Python + FFmpeg
FROM node:20-alpine AS base

# Install dependencies needed for both build and runtime
RUN apk add --no-cache libc6-compat python3 py3-pip ffmpeg
WORKDIR /app

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy package files (root and frontend)
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package-lock.json* ./frontend/

# Install dependencies
RUN npm ci
RUN cd frontend && npm ci

# Builder stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules

# Copy source code
COPY . .

# Build Next.js application
RUN cd frontend && npm run build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install Python dependencies for the proxy
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt --break-system-packages

# Copy built application and required source files
# We need src/ because the API routes reference it at runtime (e.g. for spawning python processes)
COPY --from=builder /app/src ./src

# Copy Frontend Build Artifacts
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/package.json ./frontend/package.json
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules

# Expose ports
EXPOSE 3000
# Expose range for proxy ports (8000-8005)
EXPOSE 8000-8005

# Start the application
WORKDIR /app/frontend
CMD ["npm", "start"]
