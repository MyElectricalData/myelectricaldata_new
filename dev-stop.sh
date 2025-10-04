#!/bin/bash

# Stop development mode
echo "🛑 Stopping development mode..."
docker compose -f docker-compose.dev.yml down
echo "✅ Development mode stopped"
