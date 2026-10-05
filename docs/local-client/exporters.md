# Page Exporter

## Vue d'ensemble

La page **Exporter** (`/export`) permet de configurer les destinations d'export pour vos données de consommation et production. C'est une fonctionnalité exclusive au mode client.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PAGE EXPORTER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ⚡ Exporter                                                        │    │
│  │  Configurez les destinations pour exporter vos données             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐ ┌─────────┐                   │
│  │ Home    │ │  MQTT   │ │ VictoriaMetrics │ │ Jeedom  │                   │
│  │ Assist. │ │         │ │                 │ │         │                   │
│  └────┬────┘ └────┬────┘ └────────┬────────┘ └────┬────┘                   │
│       │           │               │               │                         │
│       ▼           ▼               ▼               ▼                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                     │    │
│  │  [Configuration spécifique à l'onglet sélectionné]                 │    │
│  │                                                                     │    │
│  │  • URL / Host                                                       │    │
│  │  • Authentification                                                 │    │
│  │  • Options d'export                                                 │    │
│  │                                                                     │    │
│  │  [Tester la connexion]  [Sauvegarder]                              │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  📊 Historique des exports                                          │    │
│  │                                                                     │    │
│  │  Date       │ Destination      │ Statut  │ Enregistrements         │    │
│  │  ─────────────────────────────────────────────────────────────────  │    │
│  │  2024-01-15 │ Home Assistant   │ ✓ OK    │ 365 records             │    │
│  │  2024-01-15 │ MQTT             │ ✓ OK    │ 365 records             │    │
│  │  2024-01-14 │ Home Assistant   │ ✗ Erreur│ Timeout                 │    │
│  │                                                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Destinations supportées

### Home Assistant

Capteurs créés par MQTT Discovery, et statistiques du panneau Énergie importées par l'API WebSocket.

| Champ | Description |
|-------|-------------|
| Broker MQTT | Broker utilisé par l'intégration MQTT de Home Assistant |
| Préfixe de discovery | Celui de l'intégration MQTT (`homeassistant` par défaut) |
| URL et token | Home Assistant et token longue durée, pour les statistiques |

**Données exportées** (détail dans [Intégration Home Assistant](integrations/home-assistant.md)) :

- `sensor.myelectricaldata_linky_{pdl}_consumption` et `_production` : veille, historique en attributs
- `sensor.myelectricaldata_linky_{pdl}_consumption_{periode}_{hp,hc}` : heures pleines / creuses
- `sensor.myelectricaldata_tempo_today` / `_tomorrow` : couleurs Tempo
- `sensor.myelectricaldata_zen_flex_today` / `_tomorrow` : jours EDF Zen Flex (Éco, Sobriété, Bonus)
- `sensor.myelectricaldata_ecowatt_j0` à `_j2` : signal EcoWatt
- statistiques `myelectricaldata:consumption_*`, `cost_*`, `production_*` pour le panneau Énergie

### MQTT

Publication vers un broker MQTT compatible.

| Champ | Description |
|-------|-------------|
| Broker | Nom d'hôte ou IP du broker, et port |
| Username | Utilisateur (optionnel) |
| Password | Mot de passe (optionnel) |
| Topic prefix | Préfixe des topics |
| QoS | Niveau de QoS (0, 1, 2) |
| Retain | Conserver les messages |

**Topics publiés** :

```
{prefix}/{pdl}/consumption/stats     # totaux, dont {yesterday,this_week,this_month,this_year}_{hp,hc}_kwh
{prefix}/{pdl}/production/stats
{prefix}/tempo/today                 # {"color": "BLUE", "date": "..."}
{prefix}/tempo/tomorrow
{prefix}/tempo/remaining             # jours restants par couleur dans la saison
{prefix}/zen_flex/today               # {"day_type": "ECO", "date": "..."} (ECO, SOBRIETE, BONUS, UNKNOWN)
{prefix}/zen_flex/tomorrow
{prefix}/ecowatt/today               # niveau de l'heure courante et de l'heure suivante
{prefix}/status
```

### VictoriaMetrics

Export vers une base de données time-series VictoriaMetrics.

| Champ | Description |
|-------|-------------|
| URL | URL de l'API VictoriaMetrics |
| Username | Utilisateur (optionnel) |
| Password | Mot de passe (optionnel) |
| Labels | Labels additionnels (JSON) |

**Métriques exportées** :

```
myelectricaldata_consumption_wh{pdl="xxx", type="daily"}
myelectricaldata_production_wh{pdl="xxx", type="daily"}
myelectricaldata_tempo_color{pdl="xxx"}
myelectricaldata_ecowatt_level{pdl="xxx"}
```

### Jeedom

Intégration avec l'API Jeedom.

| Champ | Description |
|-------|-------------|
| URL | URL de votre instance Jeedom |
| API Key | Clé API Jeedom |
| Plugin | Plugin cible (virtuel recommandé) |

---

## Fonctionnement

### Export automatique

Après chaque synchronisation réussie, les exports activés sont automatiquement déclenchés.

```
Sync quotidien (06:00)
       │
       ▼
┌─────────────────┐
│ Nouvelles       │
│ données en BDD  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Pour chaque     │────▶│ Export vers     │
│ export activé   │     │ destination     │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Log résultat    │
                        │ dans export_logs│
                        └─────────────────┘
```

### Export manuel

Depuis la page Exporter, vous pouvez déclencher un export immédiat :

1. Sélectionner la destination
2. Cliquer sur **Exporter maintenant**
3. Suivre la progression

### Export sélectif

Vous pouvez choisir quelles données exporter :

- [x] Consommation journalière
- [x] Consommation mensuelle
- [ ] Consommation détaillée (30 min)
- [x] Production journalière
- [x] Tempo
- [x] EcoWatt

---

## Interface utilisateur

### Onglet Home Assistant

```tsx
<Card>
  <CardHeader>
    <h2>Home Assistant</h2>
    <Toggle enabled={config.enabled} onChange={setEnabled} />
  </CardHeader>

  <CardBody>
    <Input
      label="URL"
      placeholder="http://homeassistant.local:8123"
      value={config.url}
      onChange={setUrl}
    />

    <Input
      label="Token d'accès"
      type="password"
      placeholder="eyJ0eXAi..."
      value={config.token}
      onChange={setToken}
    />

    <Select
      label="Intervalle d'export"
      options={['15 min', '30 min', '1 heure', '6 heures', '24 heures']}
      value={config.interval}
      onChange={setInterval}
    />

    <Checkboxes
      label="Données à exporter"
      options={[
        { id: 'consumption_daily', label: 'Consommation journalière', checked: true },
        { id: 'consumption_monthly', label: 'Consommation mensuelle', checked: true },
        { id: 'production_daily', label: 'Production journalière', checked: true },
        { id: 'tempo', label: 'Tempo', checked: true },
        { id: 'ecowatt', label: 'EcoWatt', checked: true },
      ]}
    />

    <ButtonGroup>
      <Button variant="secondary" onClick={testConnection}>
        Tester la connexion
      </Button>
      <Button variant="primary" onClick={save}>
        Sauvegarder
      </Button>
    </ButtonGroup>
  </CardBody>
</Card>
```

### Historique des exports

```tsx
<Card>
  <CardHeader>
    <h2>Historique des exports</h2>
  </CardHeader>

  <Table>
    <TableHead>
      <tr>
        <th>Date</th>
        <th>Destination</th>
        <th>Statut</th>
        <th>Détails</th>
      </tr>
    </TableHead>
    <TableBody>
      {logs.map(log => (
        <tr key={log.id}>
          <td>{formatDate(log.started_at)}</td>
          <td>{log.destination}</td>
          <td>
            <StatusBadge status={log.status} />
          </td>
          <td>
            {log.status === 'success'
              ? `${log.records_exported} enregistrements`
              : log.error_message}
          </td>
        </tr>
      ))}
    </TableBody>
  </Table>
</Card>
```

---

## API Backend

### Endpoints

```
GET    /api/export/configs           # Liste des configurations
GET    /api/export/configs/{type}    # Configuration spécifique
PUT    /api/export/configs/{type}    # Mettre à jour
POST   /api/export/configs/{type}/test  # Tester la connexion
POST   /api/export/{type}/run        # Lancer un export manuel
GET    /api/export/logs              # Historique des exports
```

### Schémas

```python
class ExportConfig(BaseModel):
    type: Literal['home_assistant', 'mqtt', 'victoriametrics', 'jeedom']
    enabled: bool = False
    config: dict  # Configuration spécifique au type
    last_export_at: datetime | None = None

class ExportLog(BaseModel):
    id: UUID
    export_config_id: UUID
    status: Literal['success', 'error', 'running']
    records_exported: int | None
    error_message: str | None
    started_at: datetime
    completed_at: datetime | None
```

---

## Sécurité

### Stockage des credentials

Les tokens et mots de passe sont chiffrés en base de données avec Fernet (même algorithme que le mode serveur).

```python
# Chiffrement avant stockage
encrypted_config = encrypt(config.model_dump_json())

# Déchiffrement à la lecture
config = ExportConfig.model_validate_json(decrypt(encrypted_config))
```

### Validation des URLs

Les URLs sont validées avant sauvegarde pour éviter les injections :

```python
def validate_url(url: str) -> bool:
    parsed = urlparse(url)
    return (
        parsed.scheme in ('http', 'https', 'mqtt', 'mqtts')
        and parsed.netloc
        and not any(c in url for c in ['<', '>', '"', "'"])
    )
```

---

## Logs et monitoring

### Logs backend

```bash
# Voir les logs d'export
docker compose -f docker-compose.yml logs backend | grep -i export
```

### Métriques (optionnel)

Si VictoriaMetrics est configuré, des métriques internes sont également exportées :

```
myelectricaldata_export_total{destination="home_assistant", status="success"}
myelectricaldata_export_duration_seconds{destination="mqtt"}
myelectricaldata_export_records_total{destination="victoriametrics"}
```

---

## Dépannage

### Home Assistant : "Unauthorized"

- Vérifier que le token est un **Long-Lived Access Token**
- Le créer depuis : Profil utilisateur > Tokens d'accès longue durée
- Vérifier que l'utilisateur a les droits admin

### MQTT : "Connection refused"

- Vérifier que le broker est accessible depuis Docker
- Si le broker est sur l'hôte, utiliser `host.docker.internal` au lieu de `localhost`
- Vérifier les logs du broker pour plus de détails

### VictoriaMetrics : "400 Bad Request"

- Vérifier le format des métriques
- Utiliser `/api/v1/import` et non `/api/v1/write`
- Vérifier les labels (pas de caractères spéciaux)

### Jeedom : "API Error"

- Vérifier que la clé API est celle du plugin "API" ou "Virtuel"
- Activer le mode debug dans Jeedom pour voir les erreurs
