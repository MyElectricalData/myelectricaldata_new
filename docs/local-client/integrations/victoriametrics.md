# Intégration VictoriaMetrics

## Vue d'ensemble

L'intégration VictoriaMetrics permet d'exporter vos données vers une base de données time-series, idéale pour le monitoring long terme et la visualisation avec Grafana.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INTÉGRATION VICTORIAMETRICS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MyElectricalData Client          VictoriaMetrics         Grafana           │
│  ━━━━━━━━━━━━━━━━━━━━━━           ━━━━━━━━━━━━━━━━        ━━━━━━━           │
│                                                                             │
│  ┌─────────────┐                  ┌─────────────┐        ┌──────────┐       │
│  │ PostgreSQL  │                  │ Time-Series │        │ Dashboards│      │
│  │             │                  │ Storage     │        │          │       │
│  │ consumption │───────────────▶  │             │───────▶│ 📊 Conso │       │
│  │ production  │  POST /import    │ Metrics     │  Query │ 📈 Prod  │       │
│  │ tempo       │                  │             │        │ 🎨 Tempo │       │
│  │ ecowatt     │                  │             │        │          │       │
│  └─────────────┘                  └─────────────┘        └──────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prérequis

1. VictoriaMetrics single-node ou cluster
2. Accès réseau depuis le client MyElectricalData
3. (Optionnel) Grafana pour la visualisation

### Installation VictoriaMetrics

```bash
# Docker simple
docker run -d -p 8428:8428 \
  -v vmdata:/victoria-metrics-data \
  victoriametrics/victoria-metrics

# Docker Compose (avec rétention 1 an)
# Voir docker-compose.yml
```

---

## Configuration

### Via l'interface web

1. Aller dans **Exporter** > **VictoriaMetrics**
2. Renseigner :
   - **URL** : `http://victoriametrics:8428`
   - **Username/Password** (si authentification)
3. Cliquer sur **Tester la connexion**
4. Si OK, activer l'export et **Sauvegarder**

### Via variables d'environnement

```bash
# .env.client
VICTORIAMETRICS_URL=http://localhost:8428
VICTORIAMETRICS_ENABLED=true

# Authentification (optionnel)
VICTORIAMETRICS_USERNAME=admin
VICTORIAMETRICS_PASSWORD=secret

# Labels additionnels
VICTORIAMETRICS_LABELS={"env": "production", "host": "raspberry"}
```

---

## Métriques exportées

### Format Prometheus

Les métriques sont exportées au format Prometheus :

```prometheus
# Consommation
myelectricaldata_consumption_wh{pdl="12345678901234",type="daily"} 15200 1705312800000
myelectricaldata_consumption_wh{pdl="12345678901234",type="monthly"} 245600 1705312800000

# Production
myelectricaldata_production_wh{pdl="12345678901234",type="daily"} 8500 1705312800000
myelectricaldata_production_wh{pdl="12345678901234",type="monthly"} 120300 1705312800000

# Tempo
myelectricaldata_tempo_color{pdl="12345678901234",color="BLEU"} 1 1705312800000
myelectricaldata_tempo_remaining{pdl="12345678901234",color="blue"} 280 1705312800000
myelectricaldata_tempo_remaining{pdl="12345678901234",color="white"} 40 1705312800000
myelectricaldata_tempo_remaining{pdl="12345678901234",color="red"} 20 1705312800000

# EcoWatt
myelectricaldata_ecowatt_level{region="france"} 1 1705312800000
```

### Labels

| Label | Description |
|-------|-------------|
| `pdl` | Identifiant du point de livraison |
| `type` | Type de données (daily, monthly) |
| `color` | Couleur Tempo (BLEU, BLANC, ROUGE) |
| `quality` | Qualité des données (BRUT, CORRIGE) |

---

## API utilisée

L'exportateur utilise l'API `/api/v1/import` de VictoriaMetrics :

```bash
# Exemple d'import manuel
curl -X POST "http://localhost:8428/api/v1/import" \
  -H "Content-Type: text/plain" \
  -d 'myelectricaldata_consumption_wh{pdl="12345678901234"} 15200 1705312800000'
```

### Batch import

Les données sont envoyées par batch pour optimiser les performances :

```python
# 100 lignes par batch
async def export_batch(self, metrics: list[str]):
    payload = "\n".join(metrics)
    await self.session.post(
        f"{self.url}/api/v1/import",
        data=payload,
        headers={"Content-Type": "text/plain"}
    )
```

---

## Dashboards Grafana

### Dashboard de base

Importer le dashboard depuis `docs/grafana/myelectricaldata.json` ou créer manuellement :

#### Consommation journalière

```promql
sum(myelectricaldata_consumption_wh{type="daily"}) by (pdl) / 1000
```

#### Comparaison mensuelle

```promql
sum(increase(myelectricaldata_consumption_wh{type="daily"}[$__range])) by (pdl) / 1000
```

#### Coût estimé Tempo

```promql
# Hypothèse : prix HP
sum(myelectricaldata_consumption_wh{type="daily"}) by (pdl) / 1000 *
  on(pdl) group_left()
  (
    myelectricaldata_tempo_color{color="BLEU"} * 0.1609 +
    myelectricaldata_tempo_color{color="BLANC"} * 0.1894 +
    myelectricaldata_tempo_color{color="ROUGE"} * 0.7324
  )
```

### Alertes Grafana

#### Alerte Tempo Rouge

```yaml
# Grafana alerting rule
alert: TempoRouge
expr: myelectricaldata_tempo_color{color="ROUGE"} == 1
for: 0m
labels:
  severity: warning
annotations:
  summary: "Jour Tempo Rouge"
  description: "Demain est un jour Tempo Rouge, réduisez votre consommation"
```

#### Alerte EcoWatt

```yaml
alert: EcoWattAlerte
expr: myelectricaldata_ecowatt_level >= 2
for: 0m
labels:
  severity: warning
annotations:
  summary: "Alerte EcoWatt niveau {{ $value }}"
```

---

## Rétention des données

VictoriaMetrics supporte une rétention configurable :

```bash
# Docker avec rétention 2 ans
docker run -d -p 8428:8428 \
  -v vmdata:/victoria-metrics-data \
  victoriametrics/victoria-metrics \
  -retentionPeriod=24M
```

### Estimation de l'espace disque

| Données | Métriques/jour | Espace/an |
|---------|----------------|-----------|
| 1 PDL | ~10 | ~50 MB |
| 5 PDLs | ~50 | ~250 MB |
| 10 PDLs | ~100 | ~500 MB |

---

## Architecture cluster

Pour une haute disponibilité :

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLUSTER VICTORIAMETRICS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MyElectricalData                   VictoriaMetrics Cluster                 │
│                                                                             │
│  ┌─────────────┐                    ┌─────────────────────┐                 │
│  │ Exporter    │                    │ vminsert (write)    │                 │
│  │             │───────────────────▶│   ↓                 │                 │
│  └─────────────┘                    │ vmstorage (x3)      │                 │
│                                     │   ↓                 │                 │
│  ┌─────────────┐                    │ vmselect (read)     │                 │
│  │ Grafana     │◀───────────────────│                     │                 │
│  └─────────────┘                    └─────────────────────┘                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Dépannage

### Erreur "Connection refused"

- Vérifier que VictoriaMetrics est démarré
- Vérifier le port (8428 par défaut)
- Si sur l'hôte Docker, utiliser `host.docker.internal`

### Erreur "400 Bad Request"

- Vérifier le format des métriques (pas d'espace dans les labels)
- Utiliser `/api/v1/import` et non `/api/v1/write`
- Valider avec :
  ```bash
  curl -X POST "http://localhost:8428/api/v1/import" \
    -d 'test_metric{label="value"} 1'
  ```

### Données non visibles dans Grafana

- Vérifier que la datasource est configurée
- Attendre quelques secondes après l'import
- Vérifier la plage de temps dans Grafana

### Test de l'API

```bash
# Écrire une métrique test
curl -X POST "http://localhost:8428/api/v1/import" \
  -d 'myelectricaldata_test{pdl="test"} 42'

# Lire la métrique
curl "http://localhost:8428/api/v1/query?query=myelectricaldata_test"
```

---

## Code source

L'exportateur VictoriaMetrics est implémenté dans :

```
apps/api/src/services/exporters/victoriametrics.py
```

### Exemple d'export

```python
class VictoriaMetricsExporter:
    async def export_consumption(self, data: ConsumptionData):
        timestamp_ms = int(data.date.timestamp() * 1000)

        metrics = [
            f'myelectricaldata_consumption_wh{{pdl="{data.pdl}",type="daily"}} '
            f'{data.value_wh} {timestamp_ms}'
        ]

        await self._send_metrics(metrics)

    async def _send_metrics(self, metrics: list[str]):
        payload = "\n".join(metrics)
        async with self.session.post(
            f"{self.url}/api/v1/import",
            data=payload,
            headers={"Content-Type": "text/plain"},
        ) as resp:
            if resp.status != 204:
                raise ExportError(f"VictoriaMetrics error: {resp.status}")
```
