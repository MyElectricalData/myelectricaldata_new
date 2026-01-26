---
sidebar_position: 3
---

# Installation Helm

Déploiement sur Kubernetes via Helm Chart.

## Prérequis

- Kubernetes 1.25+
- Helm 3.10+
- kubectl configuré
- Ingress Controller (nginx recommandé)
- StorageClass disponible
- Credentials Enedis DataHub

```bash
# Vérifier les versions
kubectl version --client
helm version
```

---

## Installation

### Étape 1 : Cloner le dépôt

```bash
git clone https://github.com/MyElectricalData/myelectricaldata.git
cd myelectricaldata/helm
```

### Étape 2 : Télécharger les dépendances

```bash
helm dependency build ./myelectricaldata-server
```

### Étape 3 : Créer un fichier de valeurs

```bash
cat > my-values.yaml << EOF
secrets:
  enedis:
    clientId:
      value: "your-enedis-client-id"
    clientSecret:
      value: "your-enedis-client-secret"
    environment: "production"

  rte:
    enabled: true
    clientId:
      value: "your-rte-client-id"
    clientSecret:
      value: "your-rte-client-secret"

  jwt:
    secretKey:
      value: "your-super-secret-key-minimum-32-characters"

  admin:
    emails: "admin@example.com"

postgres:
  enabled: true
  auth:
    password: "your-secure-postgres-password"

valkey:
  enabled: true

ingress:
  enabled: true
  className: "nginx"
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
```

### Étape 4 : Installer

```bash
helm install myelectricaldata ./myelectricaldata-server -f my-values.yaml
```

### Étape 5 : Vérifier

```bash
# Statut
helm status myelectricaldata

# Pods
kubectl get pods -l app.kubernetes.io/instance=myelectricaldata

# Services
kubectl get svc -l app.kubernetes.io/instance=myelectricaldata
```

---

## Architecture déployée

```
┌────────────────────────────────────────────────────────┐
│                  Kubernetes Cluster                     │
├────────────────────────────────────────────────────────┤
│  ┌─────────────┐                                       │
│  │   Ingress   │ ◄─── myelectricaldata.example.com     │
│  └──────┬──────┘                                       │
│         │                                              │
│    ┌────┴────┐                                         │
│    │         │                                         │
│  ┌─▼───────┐ ┌─▼───────┐                               │
│  │Frontend │ │ Backend │───► Enedis API                │
│  └─────────┘ └────┬────┘───► RTE API                   │
│                   │                                    │
│         ┌─────────┼─────────┐                          │
│         │         │         │                          │
│  ┌──────▼───┐ ┌───▼────┐ ┌──▼──────┐                   │
│  │PostgreSQL│ │ Valkey │ │ Secret  │                   │
│  └──────────┘ └────────┘ └─────────┘                   │
└────────────────────────────────────────────────────────┘
```

---

## Configuration

### Secrets Enedis (requis)

```yaml
secrets:
  enedis:
    clientId:
      value: "xxx"
      # Ou avec un secret Kubernetes existant :
      # existingSecretRef:
      #   name: "enedis-credentials"
      #   key: "client-id"
    clientSecret:
      value: "xxx"
    environment: "production"  # ou "sandbox"
    redirectUri: ""  # Auto-détecté si vide
```

### Secrets RTE (optionnel)

```yaml
secrets:
  rte:
    enabled: true
    clientId:
      value: "xxx"
    clientSecret:
      value: "xxx"
```

### JWT

```yaml
secrets:
  jwt:
    secretKey:
      value: "minimum-32-characters-secret-key"
    accessTokenExpireDays: 30
```

### PostgreSQL

```yaml
postgres:
  enabled: true
  auth:
    database: myelectricaldata
    username: myelectricaldata
    password: ""  # Requis
    # Ou avec un secret existant :
    # existingSecret: "postgres-credentials"
  persistence:
    enabled: true
    size: 20Gi
    storageClass: ""  # Utilise la default StorageClass
```

### Valkey (Cache)

```yaml
valkey:
  enabled: true
  persistence:
    enabled: true
    size: 5Gi
```

### Ingress

```yaml
ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
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
        - path: /oauth
          pathType: Prefix
          service: backend
  tls:
    - secretName: myelectricaldata-tls
      hosts:
        - myelectricaldata.example.com
```

### Ressources

```yaml
backend:
  replicaCount: 2
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

frontend:
  replicaCount: 2
  resources:
    requests:
      cpu: 50m
      memory: 64Mi
    limits:
      cpu: 200m
      memory: 128Mi
```

### Autoscaling

```yaml
backend:
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 10
    targetCPUUtilizationPercentage: 80

frontend:
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilizationPercentage: 80
```

### PodDisruptionBudget

```yaml
backend:
  pdb:
    enabled: true
    minAvailable: 1

frontend:
  pdb:
    enabled: true
    minAvailable: 1
```

---

## Commandes utiles

```bash
# Statut de la release
helm status myelectricaldata

# Valeurs actuelles
helm get values myelectricaldata

# Mise à jour avec nouvelles valeurs
helm upgrade myelectricaldata ./myelectricaldata-server -f my-values.yaml

# Rollback
helm rollback myelectricaldata 1

# Historique des révisions
helm history myelectricaldata

# Désinstaller
helm uninstall myelectricaldata

# Logs backend
kubectl logs -l app.kubernetes.io/name=myelectricaldata-backend -f

# Logs frontend
kubectl logs -l app.kubernetes.io/name=myelectricaldata-frontend -f

# Shell dans le pod backend
kubectl exec -it deploy/myelectricaldata-backend -- /bin/bash

# Migrations
kubectl exec -it deploy/myelectricaldata-backend -- alembic upgrade head
```

---

## Dépannage

### Pods en erreur

```bash
# Événements du pod
kubectl describe pod -l app.kubernetes.io/name=myelectricaldata-backend

# Logs détaillés
kubectl logs -l app.kubernetes.io/name=myelectricaldata-backend --previous
```

### Problèmes de secrets

```bash
# Vérifier les secrets créés
kubectl get secrets -l app.kubernetes.io/instance=myelectricaldata

# Décoder un secret
kubectl get secret myelectricaldata-secrets -o jsonpath='{.data.enedis-client-id}' | base64 -d
```

### Ingress non fonctionnel

```bash
# Vérifier l'Ingress
kubectl describe ingress myelectricaldata

# Vérifier les endpoints
kubectl get endpoints -l app.kubernetes.io/instance=myelectricaldata

# Logs Ingress Controller
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx
```

### PVC en attente

```bash
# Vérifier les PVC
kubectl get pvc -l app.kubernetes.io/instance=myelectricaldata

# Vérifier les événements
kubectl describe pvc -l app.kubernetes.io/instance=myelectricaldata

# Vérifier la StorageClass
kubectl get storageclass
```

### Base de données inaccessible

```bash
# Vérifier le pod PostgreSQL
kubectl get pods -l app.kubernetes.io/name=postgres

# Logs PostgreSQL
kubectl logs -l app.kubernetes.io/name=postgres

# Tester la connexion depuis le backend
kubectl exec -it deploy/myelectricaldata-backend -- python -c "
from sqlalchemy import create_engine
e = create_engine('postgresql://...')
print(e.execute('SELECT 1').fetchone())
"
```

---

## Haute disponibilité

### Configuration recommandée pour la production

```yaml
# my-values-prod.yaml
backend:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
  pdb:
    enabled: true
    minAvailable: 2
  resources:
    requests:
      cpu: 200m
      memory: 512Mi
    limits:
      cpu: 1000m
      memory: 1Gi

frontend:
  replicaCount: 2
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
  pdb:
    enabled: true
    minAvailable: 1

postgres:
  primary:
    persistence:
      size: 50Gi
  readReplicas:
    replicaCount: 2

valkey:
  replica:
    replicaCount: 2
  sentinel:
    enabled: true
```

---

## Désinstallation

```bash
# Supprimer la release
helm uninstall myelectricaldata

# Supprimer les PVC (ATTENTION: perte de données)
kubectl delete pvc -l app.kubernetes.io/instance=myelectricaldata

# Supprimer le namespace (si dédié)
kubectl delete namespace myelectricaldata
```
