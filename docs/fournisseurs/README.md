# Documentation des Fournisseurs d'Électricité

Ce dossier contient la documentation sur les différents fournisseurs d'électricité intégrés dans le comparateur de tarifs.

## Fournisseurs Intégrés

- [EDF](./edf.md) - Électricité de France (tarifs réglementés et offres de marché) - 49 offres
- [Enercoop](./enercoop.md) - Fournisseur d'électricité verte coopératif - 33 offres
- [TotalEnergies](./totalenergies.md) - Offres de marché TotalEnergies - 34 offres
- **Priméo Énergie** - Offre fixe avec -20% de réduction - 17 offres
- **Engie** - Électricité de référence 1 an - 17 offres
- **ALPIQ** - Électricité Stable et Référence - 34 offres
- **Alterna** - Électricité verte 100% locale et française - 34 offres
- **Ekwateur** - Électricité verte variable, fixe et spéciale VE - 18 offres

**Total : ~236 offres énergétiques**

## Structure des Données

Chaque fournisseur dispose d'un fichier de documentation décrivant :

1. **URLs de récupération des tarifs** - Endpoints ou pages web contenant les grilles tarifaires
2. **Structure des données** - Format JSON/HTML des tarifs
3. **Types d'offres** - Tarifs réglementés, offres vertes, etc.
4. **Particularités** - Spécificités du fournisseur (heures creuses, tempo, etc.)

## Mise à Jour des Tarifs

Les tarifs sont mis à jour via l'endpoint admin : `POST /api/admin/offers/refresh`

La mise à jour récupère automatiquement les derniers tarifs depuis les sources officielles de chaque fournisseur.

## Modèle de Données

```
Provider (Fournisseur)
  └─ Offer (Offre)
      └─ OfferPrice (Prix par option tarifaire)
          - Base
          - Heures Creuses / Heures Pleines
          - Tempo (Bleu/Blanc/Rouge)
          - etc.
```
