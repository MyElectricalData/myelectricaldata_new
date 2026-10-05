#!/bin/sh
set -e

# Generate env.js with runtime environment variables
# This allows configuration at container startup instead of build time

# Valeur insérée entre guillemets dans env.js : antislash, guillemet et retour à la ligne échappés
# (sans quoi un « " » dans une valeur casse env.js, donc toute l'application)
js() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'NR > 1 { printf "\\n" } { printf "%s", $0 }'; }

cat <<EOF > /usr/share/nginx/html/env.js
window.__ENV__ = {
  VITE_API_BASE_URL: "$(js "${VITE_API_BASE_URL:-/api}")",
  VITE_BACKEND_URL: "$(js "${VITE_BACKEND_URL:-/api}")",
  VITE_SERVER_MODE: "$(js "${VITE_SERVER_MODE:-false}")",
  VITE_DEFAULT_MQTT_BROKER: "$(js "${VITE_DEFAULT_MQTT_BROKER:-}")",
  VITE_DEFAULT_MQTT_PORT: "$(js "${VITE_DEFAULT_MQTT_PORT:-1883}")",
  VITE_DEFAULT_TOPIC_PREFIX: "$(js "${VITE_DEFAULT_TOPIC_PREFIX:-myelectricaldata}")",
  VITE_DEFAULT_ENTITY_PREFIX: "$(js "${VITE_DEFAULT_ENTITY_PREFIX:-myelectricaldata}")",
  VITE_DEFAULT_DISCOVERY_PREFIX: "$(js "${VITE_DEFAULT_DISCOVERY_PREFIX:-homeassistant}")",
  VITE_DEFAULT_HA_URL: "$(js "${VITE_DEFAULT_HA_URL:-}")",
  VITE_DEFAULT_VM_URL: "$(js "${VITE_DEFAULT_VM_URL:-}")",
};
EOF

# Make env.js readable by nginx
chmod 644 /usr/share/nginx/html/env.js

echo "Generated /usr/share/nginx/html/env.js with:"
cat /usr/share/nginx/html/env.js

# Start nginx
exec nginx -g "daemon off;"
