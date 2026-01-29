---
name: ecowatt
id: ecowatt
path: /ecowatt
description: Signal EcoWatt RTE sur l'etat du reseau electrique francais
mode_client: true
mode_server: true
menu: EcoWatt
---

# EcoWatt

Page affichant les **informations EcoWatt de RTE** sur l'état du réseau électrique français.

## Features

| Feature                       | Statut |
| ----------------------------- | ------ |
| Signal EcoWatt actuel         | FAIT   |
| Previsions sur 4 jours        | FAIT   |
| Statistiques mois/annee       | FAIT   |
| Recommandations EcoGestes     | FAIT   |
| Informations complementaires  | FAIT   |

## Fichiers

| Type    | Fichier                             |
| ------- | ----------------------------------- |
| Page    | `apps/web/src/pages/EcoWatt.tsx`    |
| API     | `apps/web/src/api/ecowatt.ts`       |
| Backend | `apps/api/src/routers/ecowatt.py`   |

## Details implementation

### Signal EcoWatt actuel (FAIT)
- Indicateur visuel état réseau :
  - 🟢 Vert : Pas de tension
  - 🟠 Orange : Système tendu
  - 🔴 Rouge : Très tendu, coupures possibles
- Message explicatif selon niveau
- Heure dernière mise à jour

### Previsions sur 4 jours (FAIT)
- Tableau prévisions jour par jour
- État par tranche horaire (matin/après-midi/soir)
- Code couleur selon niveau tension

### Statistiques (FAIT)
- Nombre jours vert/orange/rouge sur mois
- Nombre jours vert/orange/rouge sur année
- Graphiques de répartition

### Recommandations (FAIT)
- Conseils EcoGestes selon niveau
- Actions en cas de tension réseau

### Informations complementaires (FAIT)
- Explication système EcoWatt
- Pourquoi et quand économiser
- Lien vers site officiel RTE

## Notes importantes

- Données fournies par API RTE
- Prévisions mises à jour plusieurs fois/jour
- Signal particulièrement important en hiver
- Coupures évitées par mobilisation citoyenne
