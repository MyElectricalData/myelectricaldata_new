#!/bin/bash

# Quick script to rebuild frontend

# Container runtime detection (docker ou nerdctl)
if docker info >/dev/null 2>&1; then
    CONTAINER_RT="docker"
elif nerdctl info >/dev/null 2>&1; then
    CONTAINER_RT="nerdctl"
else
    echo "❌ Aucun runtime conteneur disponible (docker ou nerdctl)"
    exit 1
fi

echo "📦 Rebuilding frontend..."
$CONTAINER_RT compose build --no-cache frontend && $CONTAINER_RT compose up -d frontend

if [ $? -eq 0 ]; then
    echo "✅ Frontend rebuilt successfully!"
else
    echo "❌ Frontend rebuild failed!"
    exit 1
fi
