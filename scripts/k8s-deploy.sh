#!/bin/bash
set -e

# =============================================================================
# MyElectricalData - Kubernetes Dev Deployment Script
# Deploys the application to a namespace based on the current git branch
# Uses rancher-desktop context with dev mode (local volume mounts)
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KUBE_CONTEXT="${KUBE_CONTEXT:-rancher-desktop}"
HELM_CHART_PATH="helm/myelectricaldata"
RELEASE_PREFIX="med"
INGRESS_DOMAIN="myelectricaldata.ingress.local"

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Monorepo root (parent of .conductor/dalat)
MONOREPO_ROOT="$(cd "${PROJECT_ROOT}/../.." && pwd)"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get sanitized branch name for namespace
get_namespace() {
    local branch_name
    branch_name=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "default")
    # Sanitize: lowercase, replace invalid chars with dash, truncate to 63 chars
    echo "$branch_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//' | cut -c1-63
}

# Show usage
usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS] [COMMAND]

Commands:
    deploy      Deploy the application (default)
    delete      Delete the deployment and namespace
    status      Show deployment status
    logs        Show logs for a component (backend|frontend)

Options:
    -n, --namespace NAME    Override namespace (default: branch name)
    -c, --context NAME      Kubernetes context (default: rancher-desktop)
    --prod                  Production mode (use built images, no volume mounts)
    -h, --help              Show this help message

Examples:
    $0                      # Deploy in dev mode to branch-based namespace
    $0 deploy               # Same as above
    $0 -n my-test deploy    # Deploy to 'my-test' namespace
    $0 delete               # Delete deployment from current branch namespace
    $0 logs backend         # Show backend logs
    $0 status               # Show deployment status

EOF
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi

    # Check helm
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed"
        exit 1
    fi

    # Check context exists
    if ! kubectl config get-contexts "$KUBE_CONTEXT" &> /dev/null; then
        log_error "Kubernetes context '$KUBE_CONTEXT' not found"
        log_info "Available contexts:"
        kubectl config get-contexts -o name
        exit 1
    fi

    log_success "Prerequisites OK"
}

# Ensure namespace exists
ensure_namespace() {
    local namespace=$1
    log_info "Ensuring namespace '$namespace' exists..."

    if ! kubectl --context "$KUBE_CONTEXT" get namespace "$namespace" &> /dev/null; then
        log_info "Creating namespace '$namespace'..."
        kubectl --context "$KUBE_CONTEXT" create namespace "$namespace"
        # Add labels for easy identification
        kubectl --context "$KUBE_CONTEXT" label namespace "$namespace" \
            app.kubernetes.io/managed-by=myelectricaldata-dev \
            myelectricaldata.dev/branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')" \
            --overwrite
    fi

    log_success "Namespace '$namespace' ready"
}

# Update Helm dependencies
update_helm_deps() {
    log_info "Updating Helm dependencies..."
    cd "$PROJECT_ROOT"
    helm dependency update "$HELM_CHART_PATH"
    log_success "Helm dependencies updated"
}

# Create secrets from .env files
create_env_secrets() {
    local namespace=$1
    local release_name=$2

    # Backend .env.api (look in monorepo root first, then project root)
    local env_api_path=""
    if [[ -f "$MONOREPO_ROOT/.env.api" ]]; then
        env_api_path="$MONOREPO_ROOT/.env.api"
    elif [[ -f "$PROJECT_ROOT/.env.api" ]]; then
        env_api_path="$PROJECT_ROOT/.env.api"
    fi

    if [[ -n "$env_api_path" ]]; then
        log_info "Creating backend secret from $env_api_path..."
        kubectl --context "$KUBE_CONTEXT" -n "$namespace" create secret generic "${release_name}-backend-env" \
            --from-env-file="$env_api_path" \
            --dry-run=client -o yaml | kubectl --context "$KUBE_CONTEXT" apply -f -
        log_success "Backend env secret created"
    else
        log_warning ".env.api not found - skipping backend env secret"
    fi

    # Frontend .env.web (look in monorepo root first, then project root)
    local env_web_path=""
    if [[ -f "$MONOREPO_ROOT/.env.web" ]]; then
        env_web_path="$MONOREPO_ROOT/.env.web"
    elif [[ -f "$PROJECT_ROOT/.env.web" ]]; then
        env_web_path="$PROJECT_ROOT/.env.web"
    fi

    if [[ -n "$env_web_path" ]]; then
        log_info "Creating frontend secret from $env_web_path..."
        kubectl --context "$KUBE_CONTEXT" -n "$namespace" create secret generic "${release_name}-frontend-env" \
            --from-env-file="$env_web_path" \
            --dry-run=client -o yaml | kubectl --context "$KUBE_CONTEXT" apply -f -
        log_success "Frontend env secret created"
    else
        log_warning ".env.web not found - skipping frontend env secret"
    fi
}

# Deploy application
deploy() {
    local namespace=$1
    local dev_mode=$2
    local release_name="${RELEASE_PREFIX}-${namespace}"

    log_info "Deploying to namespace '$namespace' (dev_mode=$dev_mode)..."

    # Build helm values
    local helm_args=(
        "--namespace" "$namespace"
        "--create-namespace"
        "--kube-context" "$KUBE_CONTEXT"
    )

    # Add dev values file if exists
    if [[ -f "$PROJECT_ROOT/helm/values-dev.yaml" ]]; then
        helm_args+=("-f" "$PROJECT_ROOT/helm/values-dev.yaml")
    fi

    if [[ "$dev_mode" == "true" ]]; then
        helm_args+=(
            "--set" "devMode.enabled=true"
            "--set" "devMode.hostPath=$PROJECT_ROOT"
            "--set" "backend.image.pullPolicy=IfNotPresent"
            "--set" "frontend.image.pullPolicy=IfNotPresent"
        )
        log_info "Dev mode enabled - mounting source code from: $PROJECT_ROOT"
    fi

    # Set ingress host based on namespace (format: BRANCH.myelectricaldata.ingress.local)
    local ingress_host="${namespace}.${INGRESS_DOMAIN}"
    helm_args+=(
        "--set" "ingress.hosts[0].host=$ingress_host"
        "--set" "ingress.hosts[0].paths[0].path=/"
        "--set" "ingress.hosts[0].paths[0].pathType=Prefix"
        "--set" "ingress.hosts[0].paths[0].service=frontend"
        "--set" "ingress.hosts[0].paths[1].path=/api"
        "--set" "ingress.hosts[0].paths[1].pathType=Prefix"
        "--set" "ingress.hosts[0].paths[1].service=backend"
        "--set" "ingress.hosts[0].paths[2].path=/docs"
        "--set" "ingress.hosts[0].paths[2].pathType=Prefix"
        "--set" "ingress.hosts[0].paths[2].service=backend"
    )

    # Deploy with helm
    cd "$PROJECT_ROOT"
    log_info "Running: helm upgrade --install $release_name $HELM_CHART_PATH ${helm_args[*]}"
    helm upgrade --install "$release_name" "$HELM_CHART_PATH" "${helm_args[@]}"

    log_success "Deployment complete!"
    echo ""
    log_info "Access your application at: http://$ingress_host"
    log_info "API docs at: http://$ingress_host/docs"
    echo ""
    log_info "Useful commands:"
    echo "  kubectl --context $KUBE_CONTEXT -n $namespace get pods"
    echo "  kubectl --context $KUBE_CONTEXT -n $namespace logs -f deploy/${release_name}-backend"
    echo "  kubectl --context $KUBE_CONTEXT -n $namespace logs -f deploy/${release_name}-frontend"
}

# Delete deployment
delete_deployment() {
    local namespace=$1
    local release_name="${RELEASE_PREFIX}-${namespace}"

    log_warning "Deleting deployment '$release_name' from namespace '$namespace'..."

    # Uninstall helm release
    if helm --kube-context "$KUBE_CONTEXT" -n "$namespace" status "$release_name" &> /dev/null; then
        helm --kube-context "$KUBE_CONTEXT" -n "$namespace" uninstall "$release_name"
        log_success "Helm release '$release_name' deleted"
    else
        log_warning "Helm release '$release_name' not found"
    fi

    # Ask to delete namespace
    read -p "Delete namespace '$namespace'? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl --context "$KUBE_CONTEXT" delete namespace "$namespace" --ignore-not-found
        log_success "Namespace '$namespace' deleted"
    fi
}

# Show status
show_status() {
    local namespace=$1
    local release_name="${RELEASE_PREFIX}-${namespace}"

    log_info "Status for namespace '$namespace':"
    echo ""

    echo "=== Helm Release ==="
    helm --kube-context "$KUBE_CONTEXT" -n "$namespace" status "$release_name" 2>/dev/null || echo "Release not found"
    echo ""

    echo "=== Pods ==="
    kubectl --context "$KUBE_CONTEXT" -n "$namespace" get pods -o wide 2>/dev/null || echo "No pods found"
    echo ""

    echo "=== Services ==="
    kubectl --context "$KUBE_CONTEXT" -n "$namespace" get svc 2>/dev/null || echo "No services found"
    echo ""

    echo "=== Ingress ==="
    kubectl --context "$KUBE_CONTEXT" -n "$namespace" get ingress 2>/dev/null || echo "No ingress found"
}

# Show logs
show_logs() {
    local namespace=$1
    local component=$2
    local release_name="${RELEASE_PREFIX}-${namespace}"

    if [[ -z "$component" ]]; then
        log_error "Please specify a component: backend or frontend"
        exit 1
    fi

    log_info "Showing logs for $component in namespace '$namespace'..."
    kubectl --context "$KUBE_CONTEXT" -n "$namespace" logs -f "deploy/${release_name}-${component}"
}

# =============================================================================
# Main
# =============================================================================

# Parse arguments
NAMESPACE=""
DEV_MODE="true"
COMMAND="deploy"
COMPONENT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -c|--context)
            KUBE_CONTEXT="$2"
            shift 2
            ;;
        --prod)
            DEV_MODE="false"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        deploy|delete|status)
            COMMAND="$1"
            shift
            ;;
        logs)
            COMMAND="$1"
            COMPONENT="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Set namespace from branch if not specified
if [[ -z "$NAMESPACE" ]]; then
    NAMESPACE=$(get_namespace)
fi

log_info "Using Kubernetes context: $KUBE_CONTEXT"
log_info "Using namespace: $NAMESPACE"

# Execute command
case $COMMAND in
    deploy)
        check_prerequisites
        ensure_namespace "$NAMESPACE"
        create_env_secrets "$NAMESPACE" "${RELEASE_PREFIX}-${NAMESPACE}"
        update_helm_deps
        deploy "$NAMESPACE" "$DEV_MODE"
        ;;
    delete)
        check_prerequisites
        delete_deployment "$NAMESPACE"
        ;;
    status)
        check_prerequisites
        show_status "$NAMESPACE"
        ;;
    logs)
        check_prerequisites
        show_logs "$NAMESPACE" "$COMPONENT"
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        usage
        exit 1
        ;;
esac
