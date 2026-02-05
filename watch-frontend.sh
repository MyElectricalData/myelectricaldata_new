#!/bin/bash

# Script pour forcer le reload du frontend quand des fichiers changent

# Container runtime detection (docker ou nerdctl)
if docker info >/dev/null 2>&1; then
    CONTAINER_RT="docker"
elif nerdctl info >/dev/null 2>&1; then
    CONTAINER_RT="nerdctl"
else
    echo "❌ Aucun runtime conteneur disponible (docker ou nerdctl)"
    exit 1
fi

# Fichier PID pour tracker le processus
PID_FILE="./tmp/watch-frontend.pid"
LOCK_FILE="./tmp/watch-frontend.lock"

# Fonction pour nettoyer à la sortie
cleanup() {
    echo "🛑 Stopping watch-frontend..."
    rm -f "$PID_FILE" "$LOCK_FILE"
    exit 0
}

# Attraper les signaux pour nettoyer proprement
trap cleanup EXIT INT TERM

# Créer le dossier tmp si nécessaire
mkdir -p ./tmp

# Vérifier si le script est déjà en cours d'exécution
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "⚠️  Watch-frontend is already running with PID $OLD_PID"
        echo "Use 'kill $OLD_PID' to stop it or 'make stop-watch'"
        exit 1
    else
        echo "🧹 Cleaning stale PID file"
        rm -f "$PID_FILE" "$LOCK_FILE"
    fi
fi

# Vérifier le lock file
if [ -f "$LOCK_FILE" ]; then
    echo "⚠️  Another instance is starting up (lock file exists)"
    exit 1
fi

# Créer le lock file
touch "$LOCK_FILE"

# Sauvegarder le PID
echo $$ > "$PID_FILE"

# Supprimer le lock file maintenant que le PID est sauvé
rm -f "$LOCK_FILE"

echo "🔄 Watch-frontend started with PID $$"
echo "🔄 Watching for changes in apps/web/src/**"
echo "Press Ctrl+C to stop"

# Function to rebuild frontend
rebuild_frontend() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📝 Change detected, rebuilding frontend..."
    $CONTAINER_RT compose build --no-cache frontend && $CONTAINER_RT compose up -d frontend
    if [ $? -eq 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Frontend rebuilt successfully"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Frontend rebuild failed"
    fi
}

# Utilise fswatch sur macOS pour détecter les changements
if command -v fswatch &> /dev/null; then
    echo "✅ Using fswatch for file monitoring"
    fswatch -o apps/web/src | while read num ; do
        rebuild_frontend
    done
else
    echo "⚠️  fswatch not found, using polling mode (less efficient)"
    echo "💡 Install fswatch with: brew install fswatch"
    # Alternative: utilise find avec polling
    while true; do
        CURRENT_HASH=$(find apps/web/src -type f -exec md5 {} \; | md5)
        if [ "$LAST_HASH" != "$CURRENT_HASH" ]; then
            if [ ! -z "$LAST_HASH" ]; then
                rebuild_frontend
            fi
            LAST_HASH=$CURRENT_HASH
        fi
        sleep 2
    done
fi
