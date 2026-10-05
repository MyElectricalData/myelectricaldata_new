---
sidebar_position: 4
title: API EDF Zen Flex
description: Calendrier des jours Éco, Sobriété et Bonus de l'offre EDF Zen Week-End Option Flex
---

# API EDF Zen Flex (getOPMStatut)

L'offre EDF Zen Week-End Option Flex compte 345 jours **Éco** et 20 jours **Sobriété** par an (heures
pleines environ 3,5 fois plus chères), plus d'éventuels jours **Bonus**. EDF publie le type du
lendemain en cours de journée.

MyElectricalData lit ce calendrier dans l'API utilisée par le site particulier.edf.fr. Elle n'est
pas documentée par EDF et peut changer sans préavis.

## Requête

```http
GET https://particulier.edf.fr/services/rest/opm/getOPMStatut?dateRelevant=2025-12-15&urlPlaasmaCommerce=https%3A%2F%2Fapi-commerce.edf.fr
Accept: application/json
```

- `dateRelevant` : jour J (`YYYY-MM-DD`). Les dates passées répondent aussi : l'historique remonte au
  lancement de l'offre (novembre 2023).
- `urlPlaasmaCommerce` : obligatoire, sans lui EDF sert sa page d'erreur.

## Réponse

```json
{"couleurJourJ": "RAS", "couleurJourJ1": "ZENF_PM"}
```

| Valeur EDF | Type MyElectricalData |
|------------|-----------------------|
| `RAS` | `ECO` |
| `ZENF_PM` | `SOBRIETE` |
| `ZENF_BONIF` (relevé en 2023 et 2025), `ZENF_BONUS` | `BONUS` |
| `NON_DETERMINE` | aucun (J+1 pas encore publié) |

Une valeur inconnue n'est pas interprétée : le jour reste absent du calendrier, jamais supposé Éco.

## Pare-feu EDF

Le pare-feu d'EDF répond parfois une page HTML « Page inaccessible » (en 403, ou en 200) au lieu du
JSON, selon des heuristiques sur la requête. Seule une réponse `application/json` est acceptée, et
la première erreur arrête la passe de rattrapage en cours.

## Utilisation dans MyElectricalData

- **Mode serveur** : `services/edf_zen_flex.py`, tâche toutes les 10 minutes. Elle relit J et J+1,
  puis rattrape au plus 30 jours manquants de l'historique (la veille d'abord). Comptez environ 2 h
  pour l'historique complet après le premier déploiement. Table `zen_flex_days`.
- **Route publique** : `GET /zen-flex/days?start=&end=` (calendrier), `GET /zen-flex/today`,
  `POST /zen-flex/refresh` (administrateur).
- **Mode client** : synchronisation depuis la passerelle (`/zen-flex/days`), jamais d'appel direct à
  EDF. Synchro complète tant que l'historique local a des trous, puis seulement les 7 derniers jours.
- **Exports** : capteurs Home Assistant et topics MQTT Zen Flex, coût du panneau Énergie au prix du
  jour (cf. [Home Assistant](../local-client/integrations/home-assistant.md)).
