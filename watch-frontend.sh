#!/bin/bash

# Script to watch frontend files and rebuild on changes

echo "🔍 Watching frontend files for changes..."
echo "Press Ctrl+C to stop"
echo ""

# Function to rebuild frontend
rebuild_frontend() {
    echo "📦 Changes detected! Rebuilding frontend..."
    docker compose build --no-cache frontend && docker compose up -d --force-recreate frontend
    if [ $? -eq 0 ]; then
        echo "✅ Frontend rebuilt successfully at $(date '+%H:%M:%S')"
    else
        echo "❌ Frontend rebuild failed at $(date '+%H:%M:%S')"
    fi
    echo ""
}

# Watch for changes in the frontend directory
fswatch -o apps/web/src | while read change
do
    rebuild_frontend
done
