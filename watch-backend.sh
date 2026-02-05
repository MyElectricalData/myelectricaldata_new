#!/bin/bash

# Script pour forcer le reload du backend quand des fichiers Python changent

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
echo "🔄 Watching for changes in apps/api/src/**/*.py (recursive)"
echo "Press Ctrl+C to stop"

# Debounce: évite les redémarrages multiples pour des changements rapides
DEBOUNCE_SECONDS=2
LAST_RESTART=0

restart_backend() {
    CURRENT_TIME=$(date +%s)
    if [ $((CURRENT_TIME - LAST_RESTART)) -ge $DEBOUNCE_SECONDS ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📝 Change detected, restarting backend..."
        $CONTAINER_RT compose restart backend
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backend restarted"
        LAST_RESTART=$CURRENT_TIME
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏳ Debouncing, skipping restart"
    fi
}

# Utilise fswatch sur macOS pour détecter les changements (récursif)
if command -v fswatch &> /dev/null; then
    echo "✅ Using fswatch for file monitoring (recursive)"
    # -r: récursif, -e: exclure, --include: inclure seulement .py
    fswatch -r -o --include '\.py$' --exclude '.*' apps/api/src | while read num ; do
        restart_backend
    done
else
    echo "⚠️  fswatch not found, using polling mode (less efficient)"
    echo "💡 Install fswatch with: brew install fswatch"
    # Alternative: utilise find avec polling (récursif)
    while true; do
        CURRENT_HASH=$(find apps/api/src -name "*.py" -type f -exec md5 {} \; 2>/dev/null | md5)
        if [ "$LAST_HASH" != "$CURRENT_HASH" ]; then
            if [ -n "$LAST_HASH" ]; then
                restart_backend
            fi
            LAST_HASH=$CURRENT_HASH
        fi
        sleep 2
    done
fi