---
sidebar_position: 3
---

# Logs

## Vue d'ensemble

L'interface de logs permet de consulter l'activité du système et de diagnostiquer les problèmes.

**Accès** : `/admin/logs` (nécessite le rôle administrateur)

---

## Types de logs

### Logs d'activité utilisateur

| Événement | Description |
|-----------|-------------|
| `user.login` | Connexion réussie |
| `user.login_failed` | Échec de connexion |
| `user.logout` | Déconnexion |
| `user.signup` | Création de compte |
| `user.password_change` | Changement de mot de passe |
| `user.consent_granted` | Consentement Enedis accordé |
| `user.consent_revoked` | Consentement Enedis révoqué |

### Logs d'accès API

| Événement | Description |
|-----------|-------------|
| `api.consumption.read` | Lecture de consommation |
| `api.production.read` | Lecture de production |
| `api.contract.read` | Lecture de contrat |
| `api.load_curve.read` | Lecture courbe de charge |

### Logs système

| Événement | Description |
|-----------|-------------|
| `system.token_refresh` | Refresh token Enedis |
| `system.token_expired` | Token expiré |
| `system.cache_miss` | Donnée non en cache |
| `system.cache_hit` | Donnée trouvée en cache |
| `system.rate_limit` | Limite atteinte |
| `system.scraper_run` | Exécution scraper offres |

### Logs d'erreur

| Événement | Description |
|-----------|-------------|
| `error.enedis_api` | Erreur API Enedis |
| `error.rte_api` | Erreur API RTE |
| `error.database` | Erreur base de données |
| `error.cache` | Erreur cache Valkey |

---

## Interface de consultation

### Filtres disponibles

| Filtre | Options |
|--------|---------|
| **Période** | Dernière heure / Aujourd'hui / 7 jours / 30 jours / Personnalisé |
| **Niveau** | Debug / Info / Warning / Error / Critical |
| **Type** | User / API / System / Error |
| **Utilisateur** | Sélection par email |
| **Action** | Recherche textuelle |

### Colonnes affichées

| Colonne | Description |
|---------|-------------|
| Date | Horodatage précis |
| Niveau | Niveau de log (icône colorée) |
| Action | Type d'événement |
| Utilisateur | Email (si applicable) |
| IP | Adresse IP source |
| Détails | Informations supplémentaires |

---

## Export des logs

### Export CSV

```
Admin → Logs → Exporter → CSV
```

Colonnes exportées :
- timestamp
- level
- action
- user_email
- ip_address
- details (JSON)

### Export JSON

```
Admin → Logs → Exporter → JSON
```

Format complet avec tous les champs.

---

## Rétention des logs

| Type | Rétention |
|------|-----------|
| Logs d'activité | 90 jours |
| Logs d'erreur | 365 jours |
| Logs de debug | 7 jours |

### Configuration de la rétention

```bash
# Variables d'environnement
LOG_RETENTION_ACTIVITY_DAYS=90
LOG_RETENTION_ERROR_DAYS=365
LOG_RETENTION_DEBUG_DAYS=7
```

### Purge manuelle

```
Admin → Logs → Actions → Purger les anciens logs
```

⚠️ Cette action est irréversible.

---

## Alertes

### Alertes configurables

| Alerte | Seuil par défaut |
|--------|------------------|
| Erreurs API Enedis | > 10/heure |
| Erreurs API RTE | > 5/heure |
| Échecs de connexion | > 20/heure (même IP) |
| Tokens expirés | Immédiat |
| Quotas dépassés | Immédiat |

### Canaux de notification

- **Email** : Notification à `ADMIN_EMAILS`
- **Webhook** : POST vers URL configurée

### Configuration des alertes

```bash
# Variables d'environnement
ALERT_EMAIL_ENABLED=true
ALERT_WEBHOOK_URL=https://example.com/webhook
ALERT_ENEDIS_ERROR_THRESHOLD=10
ALERT_LOGIN_FAILURE_THRESHOLD=20
```

---

## Métriques

### Dashboard système

```
Admin → Dashboard
```

Métriques affichées :
- Utilisateurs actifs (24h)
- Requêtes API (24h)
- Taux de cache hit
- Erreurs (24h)
- Tokens à expirer (7j)

### Graphiques

- **Requêtes par heure** : Histogramme des appels API
- **Cache hit ratio** : Évolution du taux de cache
- **Erreurs par type** : Répartition des erreurs
- **Connexions** : Connexions réussies/échouées

---

## API Endpoints

### Lister les logs

```bash
GET /api/admin/logs
GET /api/admin/logs?level=error
GET /api/admin/logs?user_id=xxx
GET /api/admin/logs?action=user.login
GET /api/admin/logs?start=2024-01-01&end=2024-01-31
```

### Métriques

```bash
GET /api/admin/metrics
GET /api/admin/metrics/requests?period=24h
GET /api/admin/metrics/cache?period=7d
```

### Santé système

```bash
GET /api/health
GET /api/health/detailed  # Admin uniquement
```

---

## Intégration externe

### Prometheus

Endpoint métriques compatible Prometheus :

```bash
GET /metrics
```

Métriques exposées :
- `myelectricaldata_requests_total`
- `myelectricaldata_cache_hits_total`
- `myelectricaldata_cache_misses_total`
- `myelectricaldata_errors_total`
- `myelectricaldata_active_users`

### Grafana

Dashboard pré-configuré disponible :

```
docs/monitoring/grafana-dashboard.json
```

Import via Grafana → Dashboards → Import.

### Loki

Pour l'agrégation de logs avec Loki, configurer le driver Docker :

```yaml
# docker-compose.override.yml
services:
  backend:
    logging:
      driver: loki
      options:
        loki-url: "http://loki:3100/loki/api/v1/push"
        labels: "app=myelectricaldata,service=backend"
```
