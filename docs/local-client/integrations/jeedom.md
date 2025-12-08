---
sidebar_position: 4
title: Jeedom
---

# Intégration Jeedom

Le client local peut envoyer vos données de consommation et production directement vers Jeedom via son API ou le plugin Virtuel.

## Méthodes d'intégration

### 1. Plugin Virtuel (Recommandé)

Utilisez le plugin Virtuel de Jeedom pour créer des équipements personnalisés.

### 2. API Jeedom directe

Le client envoie les données directement via l'API JSON RPC.

### 3. MQTT + Plugin MQTT

Utilisez l'intégration MQTT du client avec le plugin MQTT de Jeedom.

## Configuration

### Via le Plugin Virtuel

```yaml
jeedom:
  enabled: true
  method: "virtual"

  # URL de votre Jeedom
  url: "http://jeedom.local"

  # Clé API (Réglages → Système → Configuration → API)
  api_key: "votre_cle_api"

  # ID de l'équipement virtuel
  virtual_equipment_id: "123"
```

### Via l'API directe

```yaml
jeedom:
  enabled: true
  method: "api"

  url: "http://jeedom.local"
  api_key: "votre_cle_api"

  # Mapping des commandes Jeedom
  commands:
    consumption_daily: "456"      # ID de la commande info
    consumption_hc: "457"
    consumption_hp: "458"
    production_daily: "459"
    max_power: "460"
    last_sync: "461"
```

### Via MQTT

```yaml
jeedom:
  enabled: false  # Désactiver l'intégration directe

mqtt:
  enabled: true
  host: "jeedom.local"
  port: 1883
  topic_prefix: "myelectricaldata"
```

### Variables d'environnement

```bash
JEEDOM_ENABLED=true
JEEDOM_METHOD=virtual
JEEDOM_URL=http://jeedom.local
JEEDOM_API_KEY=votre_cle_api
JEEDOM_VIRTUAL_ID=123
```

## Configuration dans Jeedom

### Étape 1 : Obtenir la clé API

1. Allez dans **Réglages** → **Système** → **Configuration**
2. Onglet **API**
3. Copiez la **Clé API** générale ou créez une clé dédiée

### Étape 2 : Créer l'équipement Virtuel

1. Installez le plugin **Virtuel** (Plugins → Gestion des plugins)
2. Créez un nouvel équipement :
   - Nom : `Linky`
   - Objet parent : `Maison` (ou votre choix)
   - Catégorie : `Énergie`
   - Activer : `Oui`
   - Visible : `Oui`

### Étape 3 : Créer les commandes

Créez les commandes info suivantes :

| Nom | Sous-type | Unité | Historiser |
|-----|-----------|-------|------------|
| Consommation Jour | Numérique | kWh | Oui |
| Consommation HC | Numérique | kWh | Oui |
| Consommation HP | Numérique | kWh | Oui |
| Consommation Mois | Numérique | kWh | Oui |
| Production Jour | Numérique | kWh | Oui |
| Puissance Max | Numérique | kVA | Oui |
| Dernière Sync | Autre | - | Non |

### Étape 4 : Récupérer les IDs

Pour chaque commande créée, notez son ID (visible dans l'URL ou les paramètres avancés).

### Étape 5 : Configurer le client

Utilisez les IDs dans la configuration :

```yaml
jeedom:
  enabled: true
  method: "api"
  url: "http://192.168.1.100"
  api_key: "aBcDeFgH123456"
  commands:
    consumption_daily: "1234"
    consumption_hc: "1235"
    consumption_hp: "1236"
    consumption_monthly: "1237"
    production_daily: "1238"
    max_power: "1239"
    last_sync: "1240"
```

## Widgets Jeedom

### Widget personnalisé pour la consommation

Créez un widget via **Outils** → **Widgets** :

```html
<div class="cmd cmd-widget" data-cmd_id="#id#">
  <div class="title">#name_display#</div>
  <div class="value">
    <span class="cmdValue">#state#</span>
    <span class="cmdUnit">#unite#</span>
  </div>
  <div class="subtitle">
    HC: #hc# kWh | HP: #hp# kWh
  </div>
</div>

<style>
.cmd-widget {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px;
  padding: 15px;
  color: white;
}
.cmd-widget .title {
  font-size: 14px;
  opacity: 0.8;
}
.cmd-widget .value {
  font-size: 32px;
  font-weight: bold;
}
.cmd-widget .subtitle {
  font-size: 12px;
  margin-top: 10px;
}
</style>
```

### Tuile énergie

Utilisez le plugin **Widget** pour créer une tuile complète :

```html
<div class="energy-card">
  <div class="header">
    <i class="fas fa-bolt"></i>
    Consommation Électrique
  </div>

  <div class="main-value">
    <span class="value">#[Maison][Linky][Consommation Jour]#</span>
    <span class="unit">kWh</span>
  </div>

  <div class="details">
    <div class="detail">
      <span class="label">Heures Creuses</span>
      <span class="value">#[Maison][Linky][Consommation HC]# kWh</span>
    </div>
    <div class="detail">
      <span class="label">Heures Pleines</span>
      <span class="value">#[Maison][Linky][Consommation HP]# kWh</span>
    </div>
    <div class="detail">
      <span class="label">Puissance Max</span>
      <span class="value">#[Maison][Linky][Puissance Max]# kVA</span>
    </div>
  </div>

  <div class="footer">
    Mise à jour : #[Maison][Linky][Dernière Sync]#
  </div>
</div>
```

## Scénarios Jeedom

### Alerte consommation élevée

Créez un scénario avec le trigger :

```
#[Maison][Linky][Consommation Jour]# > 30
```

Actions :

```php
// Envoyer une notification
$scenario->setLog('Consommation élevée : ' . cmd::byString('#[Maison][Linky][Consommation Jour]#')->execCmd() . ' kWh');

// Notification push
message::add('Alerte Énergie', 'Consommation du jour : ' . cmd::byString('#[Maison][Linky][Consommation Jour]#')->execCmd() . ' kWh');
```

### Rapport journalier

Scénario programmé à 20h :

```php
$conso = cmd::byString('#[Maison][Linky][Consommation Jour]#')->execCmd();
$hc = cmd::byString('#[Maison][Linky][Consommation HC]#')->execCmd();
$hp = cmd::byString('#[Maison][Linky][Consommation HP]#')->execCmd();

$message = "📊 Rapport énergie du jour\n";
$message .= "Consommation totale : {$conso} kWh\n";
$message .= "- Heures Creuses : {$hc} kWh\n";
$message .= "- Heures Pleines : {$hp} kWh";

// Envoyer via Telegram, mail, etc.
cmd::byString('#[Communication][Telegram][Envoyer]#')->execCmd($message);
```

### Comparaison avec la veille

```php
$aujourdhui = cmd::byString('#[Maison][Linky][Consommation Jour]#')->execCmd();
$hier = history::getStatistique('#[Maison][Linky][Consommation Jour]#', date('Y-m-d', strtotime('-1 day')), date('Y-m-d', strtotime('-1 day')))['avg'];

$diff = $aujourdhui - $hier;
$pct = round(($diff / $hier) * 100, 1);

if ($diff > 0) {
    $scenario->setLog("Consommation en hausse de {$pct}%");
} else {
    $scenario->setLog("Consommation en baisse de " . abs($pct) . "%");
}
```

## Intégration via MQTT

### Configuration du plugin MQTT

1. Installez **jMQTT** ou **MQTT Manager**
2. Configurez le broker (local ou externe)
3. Créez un équipement avec les topics :

| Topic | Type | Nom |
|-------|------|-----|
| `myelectricaldata/+/consumption/daily` | Info | Consommation Jour |
| `myelectricaldata/+/consumption/hc` | Info | Consommation HC |
| `myelectricaldata/+/production/daily` | Info | Production Jour |

### Template JSON pour jMQTT

```json
{
  "topic": "myelectricaldata/{pdl}/consumption/daily",
  "payload_template": "{{ value_json.value }}"
}
```

## Historique et graphiques

### Activer l'historisation

Pour chaque commande dans Jeedom :

1. Cliquez sur la roue dentée de la commande
2. **Historique** → **Historiser** : Oui
3. **Mode de lissage** : Aucun (pour des données exactes)
4. **Purge** : 1 an (ou plus selon vos besoins)

### Afficher les graphiques

Sur le dashboard, cliquez sur la valeur pour voir l'historique graphique.

### Vue Analyse

Utilisez **Analyse** → **Historique** pour :
- Comparer plusieurs équipements
- Exporter les données
- Créer des graphiques personnalisés

## Dépannage

### Les valeurs ne se mettent pas à jour

1. Vérifiez la clé API Jeedom
2. Testez l'API manuellement :
   ```bash
   curl "http://jeedom.local/core/api/jeeApi.php?apikey=VOTRE_CLE&type=cmd&id=1234"
   ```
3. Vérifiez les logs du client local

### Erreur d'authentification

1. Vérifiez que l'API est activée dans Jeedom
2. Vérifiez les droits de la clé API
3. Essayez avec la clé API générale

### Commandes non trouvées

1. Vérifiez les IDs des commandes
2. Assurez-vous que les commandes sont de type "info"
3. Vérifiez que l'équipement est actif

## Ressources

- [Documentation Jeedom](https://doc.jeedom.com/)
- [Plugin Virtuel](https://doc.jeedom.com/fr_FR/plugins/programming/virtual/)
- [API JSON RPC](https://doc.jeedom.com/fr_FR/core/4.4/jsonrpc_api)
- [Plugin jMQTT](https://domochip.github.io/jMQTT/)
