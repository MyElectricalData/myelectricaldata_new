---
sidebar_position: 3
title: VictoriaMetrics
---

# Intégration VictoriaMetrics / Prometheus

Le client local expose des métriques au format Prometheus, compatibles avec VictoriaMetrics, Prometheus, Grafana et tout système de monitoring basé sur le format OpenMetrics.

## Avantages de cette intégration

- **Historisation longue durée** : Conservez des années de données sans surcharger votre système domotique
- **Dashboards Grafana** : Créez des visualisations avancées et personnalisées
- **Alertes** : Configurez des alertes basées sur la consommation
- **Agrégations** : Calculez des moyennes, percentiles, comparaisons

## Configuration

### Exposition des métriques (pull)

Le client expose un endpoint `/metrics` que Prometheus/VictoriaMetrics peut scraper :

```yaml
metrics:
  enabled: true
  port: 9090
  path: "/metrics"

  labels:
    instance: "home"
    location: "paris"
```

### Push vers VictoriaMetrics

Pour les environnements où le scraping n'est pas possible :

```yaml
metrics:
  enabled: true

  push:
    enabled: true
    url: "http://victoriametrics:8428/api/v1/import/prometheus"
    interval: 60  # Toutes les 60 secondes

    # Authentification (optionnel)
    username: ""
    password: ""

    # Headers personnalisés
    headers:
      X-Custom-Header: "value"
```

### Variables d'environnement

```bash
METRICS_ENABLED=true
METRICS_PORT=9090
METRICS_PATH=/metrics
METRICS_PUSH_ENABLED=true
METRICS_PUSH_URL=http://victoriametrics:8428/api/v1/import/prometheus
METRICS_PUSH_INTERVAL=60
```

## Métriques exposées

### Consommation

```prometheus
# Consommation journalière en kWh
myelectricaldata_consumption_daily_kwh{pdl="12345678901234",tariff="hc_hp"} 15.234

# Consommation heures creuses
myelectricaldata_consumption_hc_kwh{pdl="12345678901234"} 8.5

# Consommation heures pleines
myelectricaldata_consumption_hp_kwh{pdl="12345678901234"} 6.734

# Consommation mensuelle
myelectricaldata_consumption_monthly_kwh{pdl="12345678901234",month="2024-01"} 450.5

# Consommation annuelle
myelectricaldata_consumption_yearly_kwh{pdl="12345678901234",year="2024"} 5420.8

# Puissance maximale quotidienne en kVA
myelectricaldata_max_power_kva{pdl="12345678901234"} 6.5
```

### Production

```prometheus
# Production journalière en kWh
myelectricaldata_production_daily_kwh{pdl="12345678901234"} 12.8

# Production mensuelle
myelectricaldata_production_monthly_kwh{pdl="12345678901234",month="2024-01"} 280.5

# Production annuelle
myelectricaldata_production_yearly_kwh{pdl="12345678901234",year="2024"} 3200.0
```

### Métadonnées et statut

```prometheus
# Informations sur le PDL
myelectricaldata_pdl_info{pdl="12345678901234",tariff="hc_hp",power="6"} 1

# Timestamp de la dernière synchronisation
myelectricaldata_last_sync_timestamp{pdl="12345678901234"} 1705312200

# Statut de synchronisation (1=ok, 0=erreur)
myelectricaldata_sync_status{pdl="12345678901234"} 1

# Nombre de jours synchronisés
myelectricaldata_synced_days_total{pdl="12345678901234"} 365
```

### Métriques internes

```prometheus
# Nombre de synchronisations
myelectricaldata_sync_total{status="success"} 150
myelectricaldata_sync_total{status="error"} 2

# Durée des synchronisations
myelectricaldata_sync_duration_seconds{quantile="0.5"} 2.5
myelectricaldata_sync_duration_seconds{quantile="0.9"} 5.2

# Requêtes API effectuées
myelectricaldata_api_requests_total{endpoint="consumption"} 500
```

## Déploiement

### VictoriaMetrics (Docker Compose)

```yaml
version: '3.8'

services:
  myelectricaldata:
    image: myelectricaldata/local-client:latest
    environment:
      - CLIENT_ID=votre_client_id
      - CLIENT_SECRET=votre_client_secret
      - METRICS_ENABLED=true
      - METRICS_PORT=9090
    ports:
      - "8080:8080"
      - "9090:9090"

  victoriametrics:
    image: victoriametrics/victoria-metrics:latest
    ports:
      - "8428:8428"
    volumes:
      - vm_data:/storage
    command:
      - "-storageDataPath=/storage"
      - "-retentionPeriod=5y"  # Conserver 5 ans de données

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin

volumes:
  vm_data:
  grafana_data:
```

### Configuration du scraping

Créez un fichier `prometheus.yml` pour VictoriaMetrics :

```yaml
scrape_configs:
  - job_name: 'myelectricaldata'
    scrape_interval: 60s
    static_configs:
      - targets: ['myelectricaldata:9090']
        labels:
          instance: 'home'
```

Montez-le dans VictoriaMetrics :

```yaml
victoriametrics:
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  command:
    - "-promscrape.config=/etc/prometheus/prometheus.yml"
```

### Prometheus

```yaml
# prometheus.yml
global:
  scrape_interval: 60s

scrape_configs:
  - job_name: 'myelectricaldata'
    static_configs:
      - targets: ['myelectricaldata:9090']
```

## Dashboards Grafana

### Installation

1. Connectez-vous à Grafana (http://localhost:3000)
2. Ajoutez VictoriaMetrics comme source de données :
   - Type : Prometheus
   - URL : http://victoriametrics:8428
3. Importez le dashboard

### Dashboard de base

Importez ce JSON dans Grafana :

```json
{
  "title": "MyElectricalData - Consommation",
  "panels": [
    {
      "title": "Consommation journalière",
      "type": "timeseries",
      "targets": [
        {
          "expr": "myelectricaldata_consumption_daily_kwh",
          "legendFormat": "{{pdl}}"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "kwatth"
        }
      }
    },
    {
      "title": "HC vs HP",
      "type": "piechart",
      "targets": [
        {
          "expr": "myelectricaldata_consumption_hc_kwh",
          "legendFormat": "Heures Creuses"
        },
        {
          "expr": "myelectricaldata_consumption_hp_kwh",
          "legendFormat": "Heures Pleines"
        }
      ]
    },
    {
      "title": "Consommation mensuelle",
      "type": "barchart",
      "targets": [
        {
          "expr": "sum(increase(myelectricaldata_consumption_daily_kwh[30d])) by (pdl)",
          "legendFormat": "{{pdl}}"
        }
      ]
    }
  ]
}
```

### Requêtes PromQL utiles

```promql
# Consommation des 7 derniers jours
sum(increase(myelectricaldata_consumption_daily_kwh[7d]))

# Moyenne journalière sur le mois
avg_over_time(myelectricaldata_consumption_daily_kwh[30d])

# Comparaison avec le mois précédent
myelectricaldata_consumption_daily_kwh - myelectricaldata_consumption_daily_kwh offset 30d

# Puissance max sur la semaine
max_over_time(myelectricaldata_max_power_kva[7d])

# Ratio production/consommation
myelectricaldata_production_daily_kwh / myelectricaldata_consumption_daily_kwh * 100

# Consommation par tarif
sum by (tariff) (myelectricaldata_consumption_daily_kwh)
```

## Alertes

### Alertmanager

```yaml
# alertmanager.yml
groups:
  - name: myelectricaldata
    rules:
      - alert: HighConsumption
        expr: myelectricaldata_consumption_daily_kwh > 30
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Consommation élevée détectée"
          description: "{{ $labels.pdl }} consomme {{ $value }} kWh"

      - alert: SyncFailed
        expr: myelectricaldata_sync_status == 0
        for: 6h
        labels:
          severity: critical
        annotations:
          summary: "Synchronisation échouée"
          description: "Le PDL {{ $labels.pdl }} n'a pas été synchronisé depuis 6h"

      - alert: MaxPowerExceeded
        expr: myelectricaldata_max_power_kva > 6
        labels:
          severity: warning
        annotations:
          summary: "Puissance maximale dépassée"
```

### Grafana Alerts

Dans Grafana 8+, créez des alertes directement sur les panels :

1. Éditez un panel
2. Onglet **Alert**
3. Configurez les conditions
4. Définissez les notifications

## Rétention des données

### VictoriaMetrics

```bash
# Conserver 5 ans de données
docker run -d \
  -v vm_data:/storage \
  victoriametrics/victoria-metrics \
  -storageDataPath=/storage \
  -retentionPeriod=5y
```

### Downsampling

Pour les données anciennes, utilisez le downsampling :

```bash
# Créer des agrégations mensuelles pour les données > 1 an
vmctl prometheus \
  --vm-addr=http://victoriametrics:8428 \
  --match='{__name__=~"myelectricaldata.*"}' \
  --step=30d
```

## Dépannage

### Métriques non disponibles

```bash
# Vérifier l'endpoint
curl http://localhost:9090/metrics

# Vérifier dans VictoriaMetrics
curl 'http://localhost:8428/api/v1/query?query=myelectricaldata_consumption_daily_kwh'
```

### Push échoue

```bash
# Tester le push manuellement
curl -X POST http://victoriametrics:8428/api/v1/import/prometheus \
  -d 'myelectricaldata_test{pdl="test"} 1'
```

### Données manquantes dans Grafana

1. Vérifiez la période sélectionnée
2. Vérifiez la source de données
3. Testez la requête dans **Explore**

## Ressources

- [VictoriaMetrics Documentation](https://docs.victoriametrics.com/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
