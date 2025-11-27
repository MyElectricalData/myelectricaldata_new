#!/bin/bash

# Script pour démarrer l'environnement de développement avec couleurs préservées

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Dossiers et fichiers
LOG_DIR="./tmp"
LOG_FILE="$LOG_DIR/watch-backend.log"
WATCH_PID_FILE="$LOG_DIR/watch-backend.pid"
WATCH_SCRIPT="./watch-backend.sh"

echo -e "${GREEN}🚀 Starting development environment...${NC}"

# Créer le dossier de logs
mkdir -p "$LOG_DIR"

# Arrêter un watcher existant
if [ -f "$WATCH_PID_FILE" ]; then
    echo -e "${YELLOW}⚠️  Stopping existing watcher...${NC}"
    kill $(cat "$WATCH_PID_FILE") 2>/dev/null || true
    rm -f "$WATCH_PID_FILE"
fi

# Démarrer le watcher si le script existe
if [ -f "$WATCH_SCRIPT" ]; then
    echo -e "${GREEN}🔄 Starting backend file watcher...${NC}"
    nohup "$WATCH_SCRIPT" > "$LOG_FILE" 2>&1 & echo $! > "$WATCH_PID_FILE"
    echo -e "${GREEN}✅ Watcher PID: $(cat $WATCH_PID_FILE)${NC}"
    echo -e "${GREEN}📝 Logs: $LOG_FILE${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: $WATCH_SCRIPT not found, skipping hot reload${NC}"
fi

# Démarrer le serveur de documentation
DOCS_PID_FILE="$LOG_DIR/docs.pid"
DOCS_LOG_FILE="$LOG_DIR/docs.log"

if [ -f "$DOCS_PID_FILE" ]; then
    echo -e "${YELLOW}⚠️  Stopping existing docs server...${NC}"
    kill $(cat "$DOCS_PID_FILE") 2>/dev/null || true
    rm -f "$DOCS_PID_FILE"
fi

if [ -d "apps/docs" ] && [ -f "apps/docs/package.json" ]; then
    echo -e "${GREEN}📚 Starting documentation server...${NC}"
    cd apps/docs
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}📦 Installing docs dependencies...${NC}"
        npm install > /dev/null 2>&1
    fi
    nohup npm start -- --port 8002 > "../../$DOCS_LOG_FILE" 2>&1 & echo $! > "../../$DOCS_PID_FILE"
    cd ../..
    echo -e "${GREEN}✅ Docs server PID: $(cat $DOCS_PID_FILE)${NC}"
    echo -e "${GREEN}📖 Documentation: http://localhost:8002${NC}"
else
    echo -e "${YELLOW}⚠️  Warning: apps/docs not found, skipping documentation${NC}"
fi

echo -e "${GREEN}🐳 Starting Docker services with colors...${NC}"

# Forcer TTY et les couleurs
export COMPOSE_DOCKER_CLI_BUILD=1
export DOCKER_BUILDKIT=1
export FORCE_COLOR=1
export DOCKER_CLI_HINTS=false
export COMPOSE_ANSI=always

# Lancer docker compose avec TTY forcé
exec docker compose up
