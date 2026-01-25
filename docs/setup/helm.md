---
sidebar_position: 2
title: Installation Helm (Kubernetes)
description: Déploiement Kubernetes avec Helm Charts
---

# Installation Helm (Kubernetes)

Ce guide couvre le déploiement de MyElectricalData sur Kubernetes via Helm Charts.

## Prérequis

- Kubernetes 1.25+
- Helm 3.10+
- kubectl configuré
- Un Ingress Controller (nginx recommandé)
- StorageClass disponible (pour la persistence)

```bash
# Vérifier les versions
kubectl version --client
helm version
```

## Charts disponibles

| Chart | Mode | Description | Dépendances |
|-------|------|-------------|-------------|
| `myelectricaldata-client` | Client | Installation locale mono-utilisateur | PostgreSQL, VictoriaMetrics |
| `myelectricaldata-server` | Serveur | Gateway multi-utilisateurs | PostgreSQL, Valkey |

## Chart Client

Le chart Client est destiné aux installations personnelles avec intégration domotique.

### Installation rapide

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata/helm

# Télécharger les dépendances
helm dependency build ./myelectricaldata-client

# Créer un fichier de valeurs personnalisé
cat > my-values.yaml << EOF
secrets:
  med:
    apiUrl: "https://www.v2.myelectricaldata.fr/api"
    clientId:
      value: "votre-client-id"
    clientSecret:
      value: "votre-client-secret"

postgres:
  auth:
    password: "motdepasse-securise"

ingress:
  enabled: true
  hosts:
    - host: myelectricaldata.local
      paths:
        - path: /
          pathType: Prefix
          service: frontend
        - path: /api
          pathType: Prefix
          service: backend
EOF

# Installer le chart
helm install myelectricaldata ./myelectricaldata-client -f my-values.yaml
```

### Architecture déployée

```
┌────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                       │
├────────────────────────────────────────────────────────────┤
│  ┌─────────────┐                                           │
│  │   Ingress   │ ◄─── myelectricaldata.local               │
│  └──────┬──────┘                                           │
│         │                                                  │
│    ┌────┴────┐                                             │
│    │         │                                             │
│  ┌─▼───────┐ ┌─▼───────┐                                   │
│  │Frontend │ │ Backend │                                   │
│  │(Deploy) │ │(Deploy) │                                   │
│  └─────────┘ └────┬────┘                                   │
│                   │                                        │
│         ┌─────────┼─────────┐                              │
│         │         │         │                              │
│  ┌──────▼───┐ ┌───▼────┐ ┌──▼──────────┐                   │
│  │PostgreSQL│ │Victoria│ │ MED API     │                   │
│  │(Stateful)│ │Metrics │ │ (externe)   │                   │
│  └──────────┘ │(Deploy)│ └─────────────┘                   │
│               └────────┘                                   │
└────────────────────────────────────────────────────────────┘
```

### Configuration complète

```yaml
# values.yaml pour myelectricaldata-client

# --- Identifiants MyElectricalData API ---
# Obtenez-les sur https://v2.myelectricaldata.fr
secrets:
  med:
    apiUrl: "https://www.v2.myelectricaldata.fr/api"
    clientId:
      value: ""
      # Ou utiliser un secret existant :
      # existingSecretRef:
      #   name: "med-credentials"
      #   key: "client-id"
    clientSecret:
      value: ""
      # existingSecretRef:
      #   name: "med-credentials"
      #   key: "client-secret"

# --- PostgreSQL ---
postgres:
  enabled: true
  auth:
    database: myelectricaldata_client
    username: myelectricaldata
    password: ""  # Requis si pas de existingSecret
    existingSecret: ""  # Nom d'un secret existant
    existingSecretKey: "password"
  persistence:
    enabled: true
    size: 10Gi
    storageClass: ""  # Utilise la StorageClass par défaut

# --- VictoriaMetrics (métriques) ---
victoriametrics:
  enabled: true
  server:
    retentionPeriod: "365d"
    persistentVolume:
      enabled: true
      size: 10Gi

# --- Exports domotique (optionnel) ---
exports:
  homeAssistant:
    enabled: false
    url: "http://homeassistant.local:8123"
    token: ""

  mqtt:
    enabled: false
    host: "mqtt.local"
    port: 1883
    username: ""
    password: ""
    topic: "myelectricaldata"

  jeedom:
    enabled: false
    url: "http://jeedom.local"
    apiKey: ""

# --- Ingress ---
ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: myelectricaldata.local
      paths:
        - path: /
          pathType: Prefix
          service: frontend
        - path: /api
          pathType: Prefix
          service: backend
  tls: []
  # - secretName: myelectricaldata-tls
  #   hosts:
  #     - myelectricaldata.local
```

### Commandes utiles

```bash
# Statut de l'installation
helm status myelectricaldata

# Voir les valeurs actuelles
helm get values myelectricaldata

# Mettre à jour
helm upgrade myelectricaldata ./myelectricaldata-client -f my-values.yaml

# Désinstaller
helm uninstall myelectricaldata
```

---

## Chart Serveur

Le chart Serveur est destiné aux déploiements multi-utilisateurs avec accès direct aux API Enedis.

### Installation rapide

```bash
# Cloner le repository
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata/helm

# Télécharger les dépendances
helm dependency build ./myelectricaldata-server

# Créer un fichier de valeurs personnalisé
cat > my-server-values.yaml << EOF
secrets:
  secretKey:
    value: "$(openssl rand -hex 32)"

  enedis:
    environment: "production"
    clientId:
      value: "votre-enedis-client-id"
    clientSecret:
      value: "votre-enedis-client-secret"

  rte:
    clientId:
      value: "votre-rte-client-id"
    clientSecret:
      value: "votre-rte-client-secret"

config:
  adminEmails: "admin@example.com"
  frontendUrl: "https://myelectricaldata.example.com"
  enedisRedirectUri: "https://myelectricaldata.example.com/consent"

postgres:
  auth:
    password: "motdepasse-securise"

valkey:
  auth:
    password: "motdepasse-valkey"

ingress:
  enabled: true
  hosts:
    - host: myelectricaldata.example.com
      paths:
        - path: /
          pathType: Prefix
          service: frontend
        - path: /api
          pathType: Prefix
          service: backend
  tls:
    - secretName: myelectricaldata-tls
      hosts:
        - myelectricaldata.example.com
EOF

# Installer le chart
helm install myelectricaldata ./myelectricaldata-server -f my-server-values.yaml
```

### Architecture déployée

```
┌────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                       │
├────────────────────────────────────────────────────────────┤
│  ┌─────────────┐                                           │
│  │   Ingress   │ ◄─── myelectricaldata.example.com         │
│  └──────┬──────┘                                           │
│         │                                                  │
│    ┌────┴────┐                                             │
│    │         │                                             │
│  ┌─▼───────┐ ┌─▼───────┐                                   │
│  │Frontend │ │ Backend │ ──────► Enedis API                │
│  │(Deploy) │ │(Deploy) │ ──────► RTE API                   │
│  └─────────┘ └────┬────┘                                   │
│                   │                                        │
│         ┌─────────┼─────────┐                              │
│         │         │         │                              │
│  ┌──────▼───┐ ┌───▼────┐                                   │
│  │PostgreSQL│ │ Valkey │                                   │
│  │(Stateful)│ │(Stateful)                                  │
│  └──────────┘ └────────┘                                   │
└────────────────────────────────────────────────────────────┘
```

### Configuration complète

```yaml
# values.yaml pour myelectricaldata-server

# --- Secrets applicatifs ---
secrets:
  # JWT secret (requis)
  secretKey:
    value: ""  # Générer avec: openssl rand -hex 32
    # Ou utiliser un secret existant :
    # existingSecretRef:
    #   name: "app-secrets"
    #   key: "jwt-secret"

  # Admins
  adminEmails:
    value: "admin@example.com"

  # Enedis API (requis)
  enedis:
    environment: "production"  # ou "sandbox"
    clientId:
      value: ""
    clientSecret:
      value: ""

  # RTE API (optionnel, pour Tempo/Ecowatt)
  rte:
    clientId:
      value: ""
    clientSecret:
      value: ""

  # Mailgun (optionnel)
  mailgun:
    apiKey:
      value: ""
    domain:
      value: ""
    fromEmail:
      value: "MyElectricalData <noreply@example.com>"

  # Turnstile (optionnel, anti-spam)
  turnstile:
    secretKey:
      value: ""

  # Slack (optionnel, notifications)
  slack:
    enabled: false
    webhookUrl:
      value: ""

# --- Configuration applicative ---
config:
  adminEmails: ""
  frontendUrl: ""
  enedisRedirectUri: ""
  cookie:
    secure: true
    sameSite: "lax"
    domain: ""

# --- Backend ---
backend:
  enabled: true
  replicaCount: 1
  image:
    repository: ghcr.io/myelectricaldata/myelectricaldata_new/backend
    tag: "latest"
  resources:
    limits:
      cpu: 2000m
      memory: 2048Mi
    requests:
      cpu: 500m
      memory: 768Mi

# --- Frontend ---
frontend:
  enabled: true
  replicaCount: 1
  image:
    repository: ghcr.io/myelectricaldata/myelectricaldata_new/frontend
    tag: "latest"

# --- PostgreSQL ---
postgres:
  enabled: true
  auth:
    database: myelectricaldata
    username: myelectricaldata
    password: ""
  persistence:
    enabled: true
    size: 5Gi

# --- Valkey (cache) ---
valkey:
  enabled: true
  auth:
    password: ""
  config:
    maxmemory: "256mb"
    maxmemory-policy: "allkeys-lru"
  persistence:
    enabled: true
    size: 1Gi

# --- Ingress ---
ingress:
  enabled: true
  className: "nginx"
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: myelectricaldata.example.com
      paths:
        - path: /
          pathType: Prefix
          service: frontend
        - path: /api
          pathType: Prefix
          service: backend
        - path: /docs
          pathType: Prefix
          service: backend
  tls:
    - secretName: myelectricaldata-tls
      hosts:
        - myelectricaldata.example.com

# --- Autoscaling (optionnel) ---
autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 5
  targetCPUUtilizationPercentage: 80
```

---

## Gestion des secrets

### Option 1 : Valeurs directes (dev/test)

```yaml
secrets:
  secretKey:
    value: "ma-cle-secrete"
  enedis:
    clientId:
      value: "mon-client-id"
```

### Option 2 : Secrets Kubernetes existants (production)

```yaml
secrets:
  secretKey:
    existingSecretRef:
      name: "myelectricaldata-secrets"
      key: "jwt-secret"
  enedis:
    clientId:
      existingSecretRef:
        name: "enedis-credentials"
        key: "client-id"
```

Créez les secrets au préalable :

```bash
# Créer un secret pour les credentials Enedis
kubectl create secret generic enedis-credentials \
  --from-literal=client-id=xxx \
  --from-literal=client-secret=xxx

# Créer un secret pour l'application
kubectl create secret generic myelectricaldata-secrets \
  --from-literal=jwt-secret=$(openssl rand -hex 32)
```

### Option 3 : External Secrets Operator

Intégration avec Vault, AWS Secrets Manager, etc. :

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: myelectricaldata-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: myelectricaldata-secrets
  data:
    - secretKey: jwt-secret
      remoteRef:
        key: myelectricaldata/secrets
        property: jwt-secret
```

---

## Bases de données externes

### PostgreSQL externe

```yaml
postgres:
  enabled: false

externalDatabase:
  host: "postgres.example.com"
  port: 5432
  database: myelectricaldata
  username: myelectricaldata
  existingSecret: "postgres-credentials"  # Contient la clé 'password'
```

### Valkey/Redis externe (mode Serveur)

```yaml
valkey:
  enabled: false

externalValkey:
  host: "redis.example.com"
  port: 6379
  existingSecret: "redis-credentials"  # Contient la clé 'password'
```

### VictoriaMetrics externe (mode Client)

```yaml
victoriametrics:
  enabled: false

externalVictoriametrics:
  url: "http://victoriametrics.monitoring:8428"
```

---

## Dépannage

### Vérifier les pods

```bash
# Statut des pods
kubectl get pods -l app.kubernetes.io/instance=myelectricaldata

# Logs du backend
kubectl logs -l app.kubernetes.io/name=myelectricaldata-backend -f

# Logs du frontend
kubectl logs -l app.kubernetes.io/name=myelectricaldata-frontend -f
```

### Vérifier les secrets

```bash
# Lister les secrets créés
kubectl get secrets -l app.kubernetes.io/instance=myelectricaldata

# Voir le contenu d'un secret (base64)
kubectl get secret myelectricaldata -o jsonpath='{.data}'
```

### Problèmes courants

#### Le backend ne démarre pas

```bash
# Vérifier les événements
kubectl describe pod -l app.kubernetes.io/name=myelectricaldata-backend

# Vérifier la connexion à PostgreSQL
kubectl exec -it deploy/myelectricaldata-backend -- python -c "from src.config.database import engine; print('OK')"
```

#### L'Ingress ne fonctionne pas

```bash
# Vérifier l'Ingress
kubectl describe ingress myelectricaldata

# Vérifier les Services
kubectl get svc -l app.kubernetes.io/instance=myelectricaldata
```

#### Problème de persistence

```bash
# Vérifier les PVC
kubectl get pvc -l app.kubernetes.io/instance=myelectricaldata

# Vérifier les StorageClasses
kubectl get storageclass
```

---

## Mise à jour

```bash
# Mettre à jour les dépendances
helm dependency update ./myelectricaldata-client

# Mettre à jour le déploiement
helm upgrade myelectricaldata ./myelectricaldata-client -f my-values.yaml

# Rollback si problème
helm rollback myelectricaldata 1
```

---

## Prochaines étapes

- [Configuration de la base de données](/setup/database)
- [Installation Docker](/setup/docker)
- [Mode développement](/setup/dev-mode)
