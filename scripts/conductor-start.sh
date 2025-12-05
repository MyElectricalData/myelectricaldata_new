#!/bin/bash
# Script de démarrage Conductor pour MyElectricalData
# Démarre les services frontend et backend avec des ports dynamiques

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Fonction pour trouver un port libre
find_free_port() {
    local start_port=$1
    local port=$start_port
    while lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; do
        port=$((port + 1))
        if [ $port -gt $((start_port + 100)) ]; then
            log_error "Impossible de trouver un port libre à partir de $start_port"
            exit 1
        fi
    done
    echo $port
}

# Charger la configuration locale si elle existe
if [ -f ".env.local" ]; then
    log_info "Chargement de .env.local..."
    export $(grep -v '^#' .env.local | xargs)
fi

# Définir le nom du projet unique pour cette branche
BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "dev")
BRANCH_SLUG=$(echo "$BRANCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
export COMPOSE_PROJECT_NAME="med-${BRANCH_SLUG}"

log_info "Branche: $BRANCH_NAME"
log_info "Projet Docker: $COMPOSE_PROJECT_NAME"

# Déterminer les ports à utiliser
if [ -z "$FRONTEND_PORT" ]; then
    FRONTEND_PORT=$(find_free_port 8000)
fi
if [ -z "$BACKEND_PORT" ]; then
    BACKEND_PORT=$(find_free_port 8081)
fi

export FRONTEND_PORT
export BACKEND_PORT

log_info "Port Frontend: $FRONTEND_PORT"
log_info "Port Backend: $BACKEND_PORT"

# Vérifier la configuration Redis/PostgreSQL (services externes)
# Remplacer localhost par host.docker.internal pour l'accès depuis les conteneurs
REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///./data/myelectricaldata.db}"

# Convertir les URLs pour Docker (localhost -> host.docker.internal)
REDIS_URL_DOCKER=$(echo "$REDIS_URL" | sed 's/localhost/host.docker.internal/g')
DATABASE_URL_DOCKER=$(echo "$DATABASE_URL" | sed 's/localhost/host.docker.internal/g')

log_info "Redis (host): $REDIS_URL"
log_info "Redis (docker): $REDIS_URL_DOCKER"
log_info "Database (host): $(echo $DATABASE_URL | sed 's/:.*@/:***@/')"
log_info "Database (docker): $(echo $DATABASE_URL_DOCKER | sed 's/:.*@/:***@/')"

# Créer le fichier .env.api à partir du template si nécessaire
if [ ! -f ".env.api" ]; then
    if [ -f "apps/api/.env.example" ]; then
        log_info "Création de .env.api à partir du template..."
        cp apps/api/.env.example .env.api
    fi
fi

# Mettre à jour les URLs dans .env.api (utiliser les URLs Docker)
if [ -f ".env.api" ]; then
    # Mettre à jour REDIS_URL (version Docker)
    if grep -q "^REDIS_URL=" .env.api; then
        sed -i.bak "s|^REDIS_URL=.*|REDIS_URL=$REDIS_URL_DOCKER|" .env.api
    else
        echo "REDIS_URL=$REDIS_URL_DOCKER" >> .env.api
    fi

    # Mettre à jour DATABASE_URL (version Docker)
    if grep -q "^DATABASE_URL=" .env.api; then
        sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=$DATABASE_URL_DOCKER|" .env.api
    else
        echo "DATABASE_URL=$DATABASE_URL_DOCKER" >> .env.api
    fi

    # Mettre à jour FRONTEND_URL et BACKEND_URL pour le dev
    sed -i.bak "s|^FRONTEND_URL=.*|FRONTEND_URL=http://localhost:$FRONTEND_PORT|" .env.api
    sed -i.bak "s|^BACKEND_URL=.*|BACKEND_URL=http://localhost:$BACKEND_PORT|" .env.api

    rm -f .env.api.bak
fi

# Créer le fichier .env pour le frontend
cat > apps/web/.env <<EOF
VITE_API_BASE_URL=http://localhost:$BACKEND_PORT
VITE_APP_NAME=MyElectricalData
EOF

# Générer le docker-compose.override.yml avec les ports dynamiques
# et sans dépendances vers redis/postgres (services externes)
cat > docker-compose.override.yml <<EOF
# Fichier généré automatiquement par conductor-start.sh
# Ne pas éditer manuellement - les modifications seront écrasées
# Mode Conductor: utilise Redis/PostgreSQL externes

services:
  backend:
    depends_on: []
    ports:
      - "${BACKEND_PORT}:8000"
    environment:
      - REDIS_URL=${REDIS_URL_DOCKER}
      - DATABASE_URL=${DATABASE_URL_DOCKER}
      - FRONTEND_URL=http://localhost:${FRONTEND_PORT}
      - BACKEND_URL=http://localhost:${BACKEND_PORT}

  frontend:
    ports:
      - "${FRONTEND_PORT}:5173"
    environment:
      - VITE_API_BASE_URL=http://localhost:${BACKEND_PORT}
EOF

# Sauvegarder les ports utilisés pour le script stop
cat > .conductor-ports <<EOF
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_NAME
EOF

log_info "Démarrage des services..."

# Utiliser docker-compose.conductor.yml (sans redis, postgres, pgadmin, docs)
# + docker-compose.override.yml pour les ports dynamiques
docker compose -f docker-compose.conductor.yml -f docker-compose.override.yml up -d --build

# Attendre que les services soient prêts
log_info "Attente du démarrage des services..."

# Attendre le backend
MAX_WAIT=60
WAIT=0
while [ $WAIT -lt $MAX_WAIT ]; do
    if curl -s "http://localhost:$BACKEND_PORT/ping" >/dev/null 2>&1; then
        break
    fi
    sleep 1
    WAIT=$((WAIT + 1))
done

if [ $WAIT -ge $MAX_WAIT ]; then
    log_warn "Le backend n'a pas démarré dans les temps (timeout: ${MAX_WAIT}s)"
else
    log_success "Backend prêt!"
fi

# Attendre le frontend
WAIT=0
while [ $WAIT -lt $MAX_WAIT ]; do
    if curl -s "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
        break
    fi
    sleep 1
    WAIT=$((WAIT + 1))
done

if [ $WAIT -ge $MAX_WAIT ]; then
    log_warn "Le frontend n'a pas démarré dans les temps (timeout: ${MAX_WAIT}s)"
else
    log_success "Frontend prêt!"
fi

echo ""
log_success "======================================"
log_success "Services démarrés avec succès!"
log_success "======================================"
echo ""
echo -e "  ${GREEN}Frontend:${NC}  http://localhost:$FRONTEND_PORT"
echo -e "  ${GREEN}Backend:${NC}   http://localhost:$BACKEND_PORT"
echo -e "  ${GREEN}API Docs:${NC}  http://localhost:$BACKEND_PORT/docs"
echo ""
