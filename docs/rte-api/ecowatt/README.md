# Documentation RTE écowatt API

## Vue d'Ensemble

L'API **écowatt** de RTE permet d'accéder aux signaux sur l'équilibre du système électrique français. Elle alerte sur les tensions entre l'offre et la demande d'électricité et communique sur les périodes de production bas-carbone.

**Version actuelle**: 5.0

**Documentation complète**: [ecowatt-api.md](./ecowatt-api.md)

**Exemple d'intégration**: [ecowatt-integration-example.md](./ecowatt-integration-example.md)

## Qu'est-ce qu'écowatt?

écowatt est le dispositif citoyen de RTE qui permet aux Français de connaître en temps réel le niveau de tension sur le réseau électrique et d'agir pour éviter les coupures.

### Système de Signaux

| Signal | Couleur | Signification | Action |
|--------|---------|---------------|--------|
| **0** | 🟢 Vert+ | Production décarbonée | Période idéale pour consommer |
| **1** | 🟢 Vert | Pas d'alerte | Consommation normale |
| **2** | 🟠 Orange | Système tendu | Éco-gestes recommandés |
| **3** | 🔴 Rouge | Système très tendu | **Réduction impérative** - Risque de coupures |

## Fonctionnalités

- ✅ Signal en temps réel (mise à jour toutes les 15 minutes)
- ✅ Prévisions jusqu'à J+3
- ✅ Signaux horaires (24h par jour)
- ✅ Signaux journaliers agrégés
- ✅ Identification des heures de pointe
- ✅ Alertes rouges pour mobilisation citoyenne

## Cas d'Usage dans MyElectricalData

### 1. Dashboard
Widget écowatt affichant le signal du jour avec code couleur et message d'action.

### 2. Alertes Préventives
Notification push avant les jours rouges pour permettre aux utilisateurs de s'organiser.

### 3. Optimisation Consommation
Recommandations automatiques pour reporter les usages non essentiels lors des périodes orange/rouge.

### 4. Statistiques
Analyse des périodes de tension et de production décarbonée sur l'année.

## Structure de la Documentation

```
docs/rte-api/ecowatt/
├── README.md                          # Ce fichier
├── ecowatt-api.md                     # Documentation complète API écowatt
└── ecowatt-integration-example.md     # Exemple d'intégration dans MyElectricalData
```

## Quick Start

### 1. Obtenir les Credentials

1. Créer un compte sur [data.rte-france.com](https://data.rte-france.com)
2. Souscrire à l'API "écowatt v5.0"
3. Récupérer `client_id` et `client_secret`

### 2. Exemple Simple

```python
import requests

# Obtenir un token
token_response = requests.post(
    "https://digital.iservices.rte-france.com/token/oauth/",
    data={
        "grant_type": "client_credentials",
        "client_id": "YOUR_CLIENT_ID",
        "client_secret": "YOUR_CLIENT_SECRET"
    }
)
token = token_response.json()["access_token"]

# Récupérer les signaux
signals_response = requests.get(
    "https://digital.iservices.rte-france.com/open_api/ecowatt/v5/signals",
    headers={"Authorization": f"Bearer {token}"}
)

data = signals_response.json()
today_signal = data["signals"][0]["dvalue"]

print(f"Signal du jour: {today_signal}")
# 1 = VERT, 2 = ORANGE, 3 = ROUGE
```

## Limites API

| Contrainte | Valeur |
|------------|--------|
| Fréquence max | 1 appel / 15 minutes |
| Données retournées | 4 jours (J à J+3) |
| Valeurs horaires | 24 par jour |
| Timeout recommandé | 30 secondes |

## Horaires de Mise à Jour

- **Quotidien** : 17h00 (prévisions J+3)
- **Vendredi** : 12h15 (prévisions weekend)
- **Temps réel** : Données actualisées en continu

## Bonnes Pratiques

### 1. Cache Obligatoire

Limité à 1 appel/15min → **cache Redis indispensable**

```python
cache_ttl = 900  # 15 minutes
```

### 2. Horaires Optimaux

- **Matin (8h-9h)** : Récupérer le signal du jour
- **Après-midi (17h-18h)** : Récupérer J+3
- **Entre-temps** : Utiliser le cache

### 3. Gestion Alertes Rouges

Mettre en place des notifications proactives :

```python
if signal["dvalue"] == 3:
    send_notification("⚠️ Alerte ROUGE écowatt!")
```

## Intégration avec Tempo

écowatt et Tempo sont complémentaires :

| API | Objectif |
|-----|----------|
| **écowatt** | Tension réseau en temps réel |
| **Tempo** | Tarification dynamique planifiée |

**Synergie** : Un jour rouge Tempo ne signifie pas forcément signal rouge écowatt, et vice-versa.

## Éco-gestes Recommandés

Lors d'un signal **ORANGE** ou **ROUGE** :

### Chauffage
- Réduire de 1-2°C
- Limiter les pièces chauffées
- Fermer volets/rideaux

### Électroménager
- Reporter lave-linge/lave-vaisselle
- Éviter four/plaques électriques
- Limiter l'eau chaude

### Éclairage & Bureautique
- Éteindre lumières inutiles
- Débrancher appareils en veille
- Reporter recharge VE

### Heures de Pointe Critiques
**8h-13h** et **18h-20h** en hiver

## Ressources

### Documentation
- [Documentation complète](./ecowatt-api.md)
- [Exemple d'intégration](./ecowatt-integration-example.md)
- [API Reference RTE](https://data.rte-france.com/catalog/-/api/doc/user-guide/Ecowatt/5.0)

### Sites Officiels
- [monecowatt.fr](https://www.monecowatt.fr) - Site grand public
- [data.rte-france.com](https://data.rte-france.com) - Portail développeur
- [Guide éco-gestes](https://www.monecowatt.fr/comprendre/les-ecogestes)

### Support
- **Téléphone** : 0810 80 50 50
- **Email** : [rte-hotline@rte-france.com](mailto:rte-hotline@rte-france.com)

## FAQ

### Quelle est la différence entre signal journalier et horaire ?
- **Journalier** (1-3) : Agrégation de la journée
- **Horaire** (0-3) : Précision par heure, avec niveau 0 (Vert+) pour production décarbonée

### Pourquoi la limite de 1 appel/15min ?
RTE calcule les signaux en temps réel. Les données évoluent peu sur 15 minutes, d'où cette limite raisonnable.

### Quand sont publiées les prévisions J+3 ?
Vers **17h chaque jour** (12h15 le vendredi pour le weekend).

### Que signifie "production décarbonée" (niveau 0) ?
Période où la production électrique est majoritairement bas-carbone (nucléaire, renouvelables), idéale pour consommer.

### Comment gérer les coupures tournantes ?
En cas de signal rouge (3) sans réduction de consommation, RTE peut déclencher des coupures localisées de **~2h** par zone géographique.

## Licence

Les données écowatt sont soumises aux conditions d'utilisation de RTE.
Voir [data.rte-france.com](https://data.rte-france.com) pour plus d'informations.
