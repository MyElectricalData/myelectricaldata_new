---
sidebar_position: 1
title: Endpoints Enedis
description: Catalogue des endpoints de l'API Enedis
---

# Endpoints Enedis

## Vue generale

Toutes les integrations avec Enedis sont disponibles via deux environnements :

- Sandbox : `https://gw.ext.prod-sandbox.api.enedis.fr`
- Production : `https://gw.ext.prod.api.enedis.fr`

Le parcours OAuth (autorisation + recuperation du token) est documente dans `docs/features-spec/01-gateway.md` et detaille dans les fichiers OpenAPI du dossier `docs/enedis-api/openapi`.

## Catalogue des endpoints

| Reference                    | Description                                                     | Sandbox                                                           | Production                                                | Specification                                                  |
| ---------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| Authorize                    | Demande de consentement OAuth2 (redirige depuis le front).      | N/A (production uniquement)                                       | <https://mon-compte-particulier.enedis.fr>                | `docs/enedis-api/openapi/01-authorize.json`                    |
| Token                        | Echange du code OAuth2 contre un token.                         | `https://gw.ext.prod-sandbox.api.enedis.fr/oauth2/v3/token`       | `https://gw.ext.prod.api.enedis.fr/oauth2/v3/token`       | `docs/enedis-api/openapi/02-token.json`                        |
| Metering Consommation Daily  | Donnees de consommation quotidienne (kWh).                      | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_dc/v5`   | `https://gw.ext.prod.api.enedis.fr/metering_data_dc/v5`   | `docs/enedis-api/openapi/03-metering-consommation-daily.json`  |
| Metering Consommation Detail | Donnees de consommation detaillees (pas horaire).               | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_clc/v5`  | `https://gw.ext.prod.api.enedis.fr/metering_data_clc/v5`  | `docs/enedis-api/openapi/04-metering-consommation-detail.json` |
| Metering Power               | Puissance apparente maximale.                                   | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_dcmp/v5` | `https://gw.ext.prod.api.enedis.fr/metering_data_dcmp/v5` | `docs/enedis-api/openapi/05-metering-power.json`               |
| Metering Production Daily    | Donnees de production quotidienne.                              | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_dp/v5`   | `https://gw.ext.prod.api.enedis.fr/metering_data_dp/v5`   | `docs/enedis-api/openapi/06-metering-production-daily.json`    |
| Metering Production Detail   | Donnees de production detaillees.                               | `https://gw.ext.prod-sandbox.api.enedis.fr/metering_data_plc/v5`  | `https://gw.ext.prod.api.enedis.fr/metering_data_plc/v5`  | `docs/enedis-api/openapi/07-metering-production-detail.json`   |
| Contract                     | Informations contractuelles (offre, puissance souscrite, etc.). | `https://gw.ext.prod-sandbox.api.enedis.fr/customers_upc/v5`      | `https://gw.ext.prod.api.enedis.fr/customers_upc/v5`      | `docs/enedis-api/openapi/08-contract.json`                     |
| Address                      | Adresse du point de livraison.                                  | `https://gw.ext.prod-sandbox.api.enedis.fr/customers_upa/v5`      | `https://gw.ext.prod.api.enedis.fr/customers_upa/v5`      | `docs/enedis-api/openapi/09-address.json`                      |
| Customer                     | Informations titulaires (identite, contacts).                   | `https://gw.ext.prod-sandbox.api.enedis.fr/customers_i/v5`        | `https://gw.ext.prod.api.enedis.fr/customers_i/v5`        | `docs/enedis-api/openapi/10-customer.json`                     |
| Contact                      | Coordonnees de contact client.                                  | `https://gw.ext.prod-sandbox.api.enedis.fr/customers_cd/v5`       | `https://gw.ext.prod.api.enedis.fr/customers_cd/v5`       | `docs/enedis-api/openapi/11-contact.json`                      |

## Contraintes de dates de l'API Enedis

L'API Enedis impose plusieurs contraintes sur les plages de dates. Ces contraintes sont gerees automatiquement par le backend (`apps/api/src/routers/enedis.py`).

### Disponibilite des donnees (J-1)

**Les donnees Enedis ne sont disponibles que jusqu'a la veille (J-1) de la date actuelle.**

- Si aujourd'hui est le 04/12/2025, les donnees les plus recentes disponibles sont celles du 03/12/2025
- Les donnees sont mises a disposition chaque jour a partir de 8h (heure de Paris)
- Certains compteurs peuvent remonter leurs donnees plus tard ; elles deviennent alors accessibles le lendemain

### Plages de dates par type d'endpoint

| Endpoint                | Plage max par appel | Historique max        | Notes                                      |
|-------------------------|--------------------|-----------------------|--------------------------------------------|
| Courbe de charge detail | **7 jours**        | 24 mois + 15 jours    | Donnees au pas 30min (ou 10/15/60min)      |
| Consommation journaliere| 365 jours          | 36 mois + 15 jours    | Une valeur par jour                        |
| Puissance max           | 365 jours          | 36 mois + 15 jours    | Une valeur par jour                        |
| Production detail       | **7 jours**        | 24 mois + 15 jours    | Donnees au pas 30min                       |
| Production journaliere  | 365 jours          | 36 mois + 15 jours    | Une valeur par jour                        |

### Contrainte minimum 2 jours (start < end)

**L'API Enedis exige que la date de debut soit strictement inferieure a la date de fin.**

- Une requete avec `start=2025-12-03` et `end=2025-12-03` sera rejetee
- Pour obtenir les donnees d'un seul jour, il faut demander une plage d'au moins 2 jours
- Exemple : pour le 03/12, demander `start=2025-12-02, end=2025-12-04`

### Gestion automatique par le backend

Le backend (`apps/api/src/routers/enedis.py`) gere automatiquement ces contraintes :

1. **`adjust_date_range()`** : Ajuste automatiquement la date de fin a J-1 si elle depasse
2. **Endpoints batch** : Decoupent les grandes plages en chunks de 7 jours max
3. **Extension automatique** : Si une requete ne contient qu'un seul jour (ex: hier), le backend etend la plage vers le passe pour garantir min 2 jours
4. **Cache granulaire** : Chaque jour est mis en cache individuellement pour eviter les re-telechargements

### Exemple de flux pour recuperer les donnees d'hier

```
Frontend demande: start=2025-12-03, end=2025-12-03 (hier)
                           ↓
Backend adjust_date_range(): end reste 2025-12-03 (< today)
                           ↓
Backend batch: detecte start == end → etend start a 2025-12-02
                           ↓
Appel Enedis: start=2025-12-02, end=2025-12-04 (today)
                           ↓
Enedis retourne: donnees du 02/12 et 03/12 (J-1 de end)
                           ↓
Backend filtre: garde uniquement les donnees demandees (03/12)
```

## Bonnes pratiques

- Chaque endpoint doit etre invoque via la passerelle interne (voir `docs/features-spec/05-gateway.md`).
- Respecter les quotas Enedis (5 requetes/seconde) et exploiter le cache detaille dans `docs/features-spec/10-cache.md`.
- Utiliser les schemas d'erreurs `docs/features-spec/rules/enedis-api-error.md` pour homogeeniser les retours.
- Controler les scopes OAuth requis par endpoint (voir les fichiers OpenAPI).
