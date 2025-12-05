#!/bin/bash
# Script d'arrêt Conductor pour MyElectricalData
# Arrête les services frontend et backend

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Charger la configuration des ports si elle existe
if [ -f ".conductor-ports" ]; then
    source .conductor-ports
    log_info "Configuration chargée: $COMPOSE_PROJECT_NAME"
else
    # Fallback: déterminer le nom du projet à partir de la branche
    BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "dev")
    BRANCH_SLUG=$(echo "$BRANCH_NAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
    export COMPOSE_PROJECT_NAME="med-${BRANCH_SLUG}"
fi

log_info "Arrêt des services pour: $COMPOSE_PROJECT_NAME"

# Arrêter les conteneurs
docker compose down

# Nettoyer les fichiers temporaires
rm -f .conductor-ports
rm -f docker-compose.override.yml

log_success "Services arrêtés avec succès!"
