# Guide Utilisateur - Gestion des Offres Électricité

## 📍 Accès

**URL** : `/admin/offers`
**Permissions** : Administrateur avec permission `offers`

## 🎯 Vue d'ensemble

La page de gestion des offres permet aux administrateurs de :
- **Mettre à jour automatiquement** les tarifs des fournisseurs via scraping web
- **Prévisualiser les changements** avant de les appliquer
- **Gérer manuellement** les offres (ajout, modification, suppression)
- **Consulter l'historique** des tarifs

## 📋 Fonctionnalités

### 1. Gestion Automatique des Fournisseurs

#### Section "Gestion des Fournisseurs"

Cette section affiche une carte pour chaque fournisseur intégré :

| Fournisseur | Nombre d'offres | Dernière mise à jour | Actions |
|-------------|-----------------|---------------------|---------|
| **EDF** | 25 offres actives | 22/11/2025 10:30 | 👁️ Prévisualiser · 🔄 Rafraîchir |
| **Enercoop** | 17 offres actives | 22/11/2025 10:30 | 👁️ Prévisualiser · 🔄 Rafraîchir |
| **TotalEnergies** | 36 offres actives | 22/11/2025 10:30 | 👁️ Prévisualiser · 🔄 Rafraîchir |

#### Bouton "Prévisualiser" 👁️

**Utilisation recommandée** : Toujours prévisualiser avant de rafraîchir !

1. Cliquez sur **"Prévisualiser"** pour le fournisseur souhaité
2. Le système **scrape les tarifs** depuis le site du fournisseur (sans rien sauvegarder)
3. Un **modal s'ouvre** avec 3 onglets :
   - **Nouvelles offres** (badge vert) : Offres qui n'existent pas encore en base
   - **Mises à jour** (badge bleu) : Offres existantes avec changements de prix
   - **Désactivations** (badge rouge) : Offres qui ne sont plus disponibles

4. Pour chaque mise à jour, vous voyez :
   ```
   Tarif Bleu - Base 6 kVA
   Type: BASE
   Puissance: 6 kVA

   Prix kWh BASE:
   0.2062 € → 0.2276 € (+10.4%)
   ^^^^^^^^   ^^^^^^^^  ^^^^^^^^^
   Ancien     Nouveau   Variation
   ```

5. **Décisions possibles** :
   - **Annuler** : Ferme le modal sans rien faire
   - **Appliquer les changements** : Sauvegarde les nouveaux tarifs en base

#### Bouton "Rafraîchir" 🔄

**⚠️ Attention** : Applique les changements immédiatement sans prévisualisation !

1. Cliquez sur **"Rafraîchir"**
2. Le système scrape et sauvegarde directement les tarifs
3. Une notification indique le résultat :
   - ✅ Succès : "25 offres mises à jour pour EDF"
   - ❌ Erreur : "Erreur lors du scraping : ..."

**Recommandation** : Utilisez toujours "Prévisualiser" d'abord, sauf si vous êtes certain des changements.

### 2. Modal de Prévisualisation

#### Onglet "Nouvelles offres" (badge vert)

Affiche les offres qui seraient **créées** :

```
┌─────────────────────────────────────────┐
│ 🟢 2 nouvelles offres                   │
├─────────────────────────────────────────┤
│ ✓ Tarif Bleu - Tempo 24 kVA            │
│   Type: TEMPO                           │
│   Puissance: 24 kVA                     │
│   Abonnement: 33.94 €/mois              │
│   Prix Bleu HP: 0.1609 €/kWh            │
│                                         │
│ ✓ Verte Fixe 3 ans - Base 3 kVA        │
│   Type: BASE                            │
│   Puissance: 3 kVA                      │
│   Abonnement: 10.50 €/mois              │
│   Prix BASE: 0.2190 €/kWh               │
└─────────────────────────────────────────┘
```

#### Onglet "Mises à jour" (badge bleu)

Affiche les offres qui seraient **modifiées** avec diff :

```
┌─────────────────────────────────────────┐
│ 🔵 3 offres mises à jour                │
├─────────────────────────────────────────┤
│ Tarif Bleu - Base 6 kVA                 │
│ Type: BASE · Puissance: 6 kVA           │
│                                         │
│ Changements:                            │
│ • Prix kWh BASE:                        │
│   0.2062 € → 0.2276 € (+10.4%)          │
│                                         │
│ • Abonnement:                           │
│   12.00 € → 12.44 € (+3.7%)             │
├─────────────────────────────────────────┤
│ Offre Particuliers - HC 9 kVA          │
│ Type: HC_HP · Puissance: 9 kVA          │
│                                         │
│ Changements:                            │
│ • Prix kWh HP:                          │
│   0.2400 € → 0.2480 € (+3.3%)           │
│                                         │
│ • Prix kWh HC:                          │
│   0.1950 € → 0.1990 € (+2.1%)           │
└─────────────────────────────────────────┘
```

#### Onglet "Désactivations" (badge rouge)

Affiche les offres qui seraient **désactivées** :

```
┌─────────────────────────────────────────┐
│ 🔴 1 offre désactivée                   │
├─────────────────────────────────────────┤
│ ⚠️ Tarif Bleu - EJP 12 kVA              │
│   Type: EJP                             │
│   Puissance: 12 kVA                     │
│   Raison: Plus disponible chez EDF      │
└─────────────────────────────────────────┘
```

### 3. Workflow Recommandé

#### Mise à jour mensuelle des tarifs

1. **Prévisualiser tous les fournisseurs** (un par un)
2. **Vérifier les changements** dans le modal
3. **Si tout est OK** : Appliquer les changements
4. **Si problème** : Annuler et enquêter

#### Cas d'usage : Augmentation tarifaire EDF

```
Scénario : Les tarifs réglementés EDF augmentent au 1er février

1. Le 1er février, accédez à /admin/offers
2. Cliquez sur "Prévisualiser" pour EDF
3. Le modal s'ouvre avec :
   - Nouvelles offres: 0
   - Mises à jour: 25 (toutes les offres EDF)
   - Désactivations: 0

4. Vérifiez quelques exemples de changements :
   ✓ Tarif Bleu Base 6 kVA : 0.2062 € → 0.2276 € (+10.4%)
   ✓ Tarif Bleu HC 6 kVA HP : 0.27 € → 0.2943 € (+9.0%)
   ✓ Tarif Bleu HC 6 kVA HC : 0.2068 € → 0.2228 € (+7.7%)

5. Cliquez sur "Appliquer les changements"
6. ✅ Notification : "25 offres mises à jour pour EDF"
7. Les nouveaux tarifs sont maintenant utilisés dans le simulateur
```

### 4. Section "Toutes les offres"

Tableau complet de toutes les offres avec :

#### Filtres disponibles

- **Par fournisseur** : EDF, Enercoop, TotalEnergies
- **Par type** : BASE, HC_HP, TEMPO, EJP
- **Par puissance** : 3, 6, 9, 12, 15, 18, 24, 30, 36 kVA
- **Recherche** : Recherche par nom d'offre

#### Colonnes affichées

| Fournisseur | Nom | Type | Puissance | Abonnement | Prix kWh | Statut | Actions |
|-------------|-----|------|-----------|------------|----------|--------|---------|
| EDF | Tarif Bleu - Base 6 kVA | BASE | 6 kVA | 12.44 €/mois | 0.2276 €/kWh | ✅ Actif | ✏️ 🗑️ |
| Enercoop | Offre Particuliers - HC 9 kVA | HC_HP | 9 kVA | 22.40 €/mois | HP: 0.2480 €<br>HC: 0.1990 € | ✅ Actif | ✏️ 🗑️ |

### 5. Gestion des Erreurs

#### Erreur de scraping

```
❌ Erreur lors du scraping EDF
Raison: Le site EDF est temporairement indisponible

Actions possibles:
• Réessayer plus tard
• Utiliser le bouton "Rafraîchir" (les tarifs fallback seront utilisés)
• Contacter le support si le problème persiste
```

#### Aucun changement détecté

```
ℹ️ Aucun changement pour Enercoop
Les tarifs actuels sont déjà à jour
```

## 🔧 Fonctionnalités Avancées

### Historique des tarifs

Chaque mise à jour conserve l'historique :
- `valid_from` : Date de début de validité
- `valid_to` : Date de fin de validité (NULL = tarif actuel)
- `price_updated_at` : Timestamp de mise à jour

Cela permet de :
- **Comparer l'évolution** des prix dans le temps
- **Recalculer des simulations** historiques
- **Analyser les tendances** tarifaires

### Scraping vs Fallback

Les scrapers fonctionnent en 2 modes :

1. **Mode scraping** (prioritaire) :
   - Récupération en direct depuis les sites web
   - Données toujours à jour
   - Peut échouer si le site est indisponible

2. **Mode fallback** (secours) :
   - Tarifs pré-configurés dans le code
   - Mise à jour manuelle lors de changements officiels
   - Garantit que les tarifs sont toujours disponibles

Le système utilise automatiquement le fallback si le scraping échoue.

## 📊 Indicateurs de Performance

La page affiche des métriques utiles :

- **Nombre total d'offres** : 78 offres actives
- **Dernière mise à jour** : Par fournisseur
- **Taux de succès** : % de scraping réussis
- **Historique** : Nombre de versions de tarifs conservées

## ⚙️ Configuration Requise

### Permissions

- **Rôle** : Administrateur
- **Permission** : `admin.offers.edit` (gérée automatiquement par le rôle admin)

### Navigateurs supportés

- Chrome/Edge (dernières versions)
- Firefox (dernières versions)
- Safari (dernières versions)

## 🆘 Support

En cas de problème :

1. **Vérifiez les logs** dans `/admin/logs`
2. **Consultez la documentation** des scrapers dans `docs/fournisseurs/`
3. **Testez l'API** directement avec `/api-docs`
4. **Contactez** le support technique

## 📚 Ressources Complémentaires

- [Documentation technique des scrapers](../../fournisseurs/README.md)
- [Guide de mise à jour des tarifs fallback](../../features-spec/price-comparison.md#maintenance)
- [Spécifications de l'API](../features-spec/rules/api-design.json)
