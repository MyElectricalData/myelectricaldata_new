# =============================================================================
# Stage 1: Dependencies (cached separately from code)
# =============================================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy ONLY package files first (better cache)
COPY package*.json ./

# Install dependencies (cached if package-lock.json unchanged)
RUN npm ci

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copy source code (changes frequently)
COPY . .

# Build the application
# Note: VITE_* variables will be injected at runtime via env.js
RUN npm run build

# =============================================================================
# Stage 3: Production image
# =============================================================================
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy entrypoint script for runtime env injection
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 80

# Use entrypoint to generate env.js at startup
ENTRYPOINT ["/entrypoint.sh"]
