---
name: admin_rte
id: rte
path: /admin/rte
description: Test et gestion des API RTE (Tempo, EcoWatt, Consumption, Generation)
mode_client: false
mode_server: true
menu: Administration
subMenu: RTE
tab: RTE
---

# Gestion RTE

Fichier : `apps/web/src/pages/Admin/RTE.tsx`

## Features

| Feature                  | Statut |
| ------------------------ | ------ |
| Configuration RTE        | FAIT   |
| Test toutes les API      | FAIT   |
| Rafraichissement Tempo   | FAIT   |
| Rafraichissement EcoWatt | FAIT   |
| Details par API          | FAIT   |
| Section aide             | FAIT   |

## Details implementation

### Configuration RTE (FAIT)

Affichage statut credentials :

- Verification variables `RTE_CLIENT_ID` et `RTE_CLIENT_SECRET`
- Indicateur vert/rouge selon configuration
- Lien vers portail RTE data.rte-france.com

### Test toutes les API (FAIT)

Bouton pour tester simultanement :

- **Tempo Calendar** : Calendrier jours Tempo EDF
- **EcoWatt** : Signaux tension reseau
- **Consumption** : Previsions consommation nationale
- **Generation Forecast Solar** : Previsions production solaire
- **Generation Forecast Wind** : Previsions production eolienne

Resume global :

- Nombre d'API fonctionnelles / total
- Horodatage du test
- Indicateur visuel (vert si tout OK, orange sinon)

### Rafraichissement manuel (FAIT)

Deux boutons d'action :

- **Rafraichir Tempo** : Force mise a jour cache Tempo depuis RTE
- **Rafraichir EcoWatt** : Force mise a jour cache EcoWatt depuis RTE

Feedback via toast notification (succes/erreur).

### Details par API (FAIT)

Cards depliables pour chaque API :

**Header** :

- Icone statut (CheckCircle, XCircle, AlertTriangle, Clock)
- Icone API (Zap, Activity, Sun, Wind)
- Nom de l'API
- Temps de reponse (ms)
- Badge statut : OK, Non activee, Erreur serveur, Timeout, Rate limit

**Details (depliable)** :

- Message d'erreur avec lien pour activer l'API
- Resume donnees selon type :
  - Tempo : Compteurs Bleu/Blanc/Rouge
  - EcoWatt : Nombre signaux + derniere date
  - Consumption : Min/Moyenne/Max en MW
  - Generation : Nombre de previsions
- Details techniques (JSON brut)

### Section aide (FAIT)

Explication des 4 types d'API :

| API                 | Description                                 |
| ------------------- | ------------------------------------------- |
| Tempo Calendar      | Calendrier jours Tempo (Bleu, Blanc, Rouge) |
| EcoWatt             | Signaux tension reseau pour anticiper pics  |
| Consumption         | Previsions consommation nationale           |
| Generation Forecast | Previsions production solaire et eolienne   |

Note sur l'activation individuelle des API sur le portail RTE.

## Statuts possibles

| Statut         | Couleur | Description                        |
| -------------- | ------- | ---------------------------------- |
| `ok`           | Vert    | API fonctionnelle                  |
| `forbidden`    | Rouge   | API non activee sur le portail RTE |
| `server_error` | Orange  | Erreur cote serveur RTE            |
| `timeout`      | Jaune   | Delai de reponse depasse           |
| `rate_limited` | Jaune   | Limite de requetes atteinte        |

## Permissions requises

- **Role** : Administrateur
- **Permission** : `admin:view`

## Technologies

- React avec TypeScript
- React Query (useQuery, useMutation)
- Lucide React pour icones
- Tailwind CSS + dark mode

## API utilisee

| Endpoint                     | Methode | Description                 |
| ---------------------------- | ------- | --------------------------- |
| `/admin/rte/status`          | GET     | Statut configuration RTE    |
| `/admin/rte/test`            | GET     | Test toutes les API         |
| `/admin/rte/refresh/tempo`   | POST    | Force refresh cache Tempo   |
| `/admin/rte/refresh/ecowatt` | POST    | Force refresh cache EcoWatt |

## Composants

- `ApiStatusCard` : Carte depliable pour afficher statut et details d'une API

## Notes

- Chaque API RTE doit etre activee individuellement sur data.rte-france.com
- Les previsions Tempo avancees necessitent Consumption + Generation Forecast
- Les credentials RTE sont configures via variables d'environnement
- Rate limiting RTE : respecter les quotas pour eviter blocage
