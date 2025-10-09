#!/bin/bash

# Script pour forcer le reload du backend quand des fichiers Python changent

# Fichier PID pour tracker le processus
PID_FILE="./tmp/watch-backend.pid"
LOCK_FILE="./tmp/watch-backend.lock"

# Fonction pour nettoyer à la sortie
cleanup() {
    echo "🛑 Stopping watch-backend..."
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
        echo "⚠️  Watch-backend is already running with PID $OLD_PID"
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

echo "🔄 Watch-backend started with PID $$"
echo "🔄 Watching for changes in apps/api/src/*.py"
echo "Press Ctrl+C to stop"

# Utilise fswatch sur macOS pour détecter les changements
if command -v fswatch &> /dev/null; then
    echo "✅ Using fswatch for file monitoring"
    fswatch -o apps/api/src/*.py | while read num ; do
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📝 Change detected, restarting backend..."
        docker compose restart backend
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backend restarted"
    done
else
    echo "⚠️  fswatch not found, using polling mode (less efficient)"
    echo "💡 Install fswatch with: brew install fswatch"
    # Alternative: utilise find avec polling
    while true; do
        CURRENT_HASH=$(find apps/api/src -name "*.py" -type f -exec md5 {} \; | md5)
        if [ "$LAST_HASH" != "$CURRENT_HASH" ]; then
            if [ ! -z "$LAST_HASH" ]; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📝 Change detected, restarting backend..."
                docker compose restart backend
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backend restarted"
            fi
            LAST_HASH=$CURRENT_HASH
        fi
        sleep 2
    done
fi