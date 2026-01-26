---
sidebar_position: 1
---

# Simulateur de Tarifs

## Contexte

Le simulateur permet aux utilisateurs de comparer différents tarifs et offres d'électricité (BASE, HC/HP, TEMPO) en fonction de leur consommation réelle récupérée via l'API Enedis. L'objectif est d'aider l'utilisateur à identifier l'offre la plus économique selon son profil de consommation.

## Objectifs

- Récupérer automatiquement les données de consommation détaillée de l'utilisateur via l'API Enedis
- Calculer avec précision les coûts pour chaque type d'offre (BASE, HC/HP, TEMPO)
- Afficher les résultats de manière claire et comparative
- Gérer les différents intervalles de mesure (PT10M, PT15M, PT30M, PT60M)
- Intégrer les données TEMPO (couleurs des jours) pour les calculs spécifiques

## Architecture technique

### Récupération des données de consommation

#### Découpage en périodes

L'API Enedis limite les requêtes à **7 jours consécutifs maximum**. Pour récupérer une année complète de données :

1. **Génération des périodes** : La période totale (365 jours) est découpée en périodes de 7 jours
2. **Chevauchement** : Les périodes se chevauchent d'**1 jour** pour éviter les pertes de données
   - Exemple : Période 1 (4-10 oct) → Période 2 (10-16 oct) → Période 3 (16-22 oct)
   - L'avancement est de **6 jours** au lieu de 7 pour créer le chevauchement
3. **Détection des duplicats** : Les doublons sont automatiquement filtrés lors de l'agrégation

**Raison du chevauchement** : L'API Enedis ne garantit pas toujours 7 jours complets par période (souvent seulement 6 jours retournés). Le chevauchement assure qu'aucun jour n'est manqué.

```typescript
// Génération des périodes avec chevauchement
while (currentStart < endDate) {
  const currentEnd = new Date(currentStart);
  currentEnd.setDate(currentEnd.getDate() + 6); // 7 jours (début inclus)

  periods.push({
    start: currentStart.toISOString().split("T")[0],
    end: currentEnd.toISOString().split("T")[0],
  });

  // Avancer de 6 jours au lieu de 7 pour chevaucher d'1 jour
  currentStart.setDate(currentStart.getDate() + 6);
}
```

#### Conversion W → Wh

**Important** : Les valeurs retournées par l'API Enedis sont en **Watts (W)** et représentent la **puissance moyenne** sur l'intervalle de mesure.

Pour calculer l'énergie en **Wattheures (Wh)** :

```typescript
Énergie(Wh) = Puissance(W) / (60 / interval_minutes);
```

**Extraction de l'intervalle** :

```typescript
// Chaque mesure a son propre interval_length
const intervalLength = reading.interval_length || "PT30M";
const intervalMatch = intervalLength.match(/PT(\d+)M/);
const intervalMinutes = intervalMatch ? parseInt(intervalMatch[1]) : 30;

// Conversion W → Wh
const valueW = parseFloat(reading.value);
const valueWh = valueW / (60 / intervalMinutes);
```

**Tableau de conversion** :

| interval_length | Minutes | Formule | Exemple (1800 W)   |
| --------------- | ------- | ------- | ------------------ |
| PT10M           | 10      | W / 6   | 1800 / 6 = 300 Wh  |
| PT15M           | 15      | W / 4   | 1800 / 4 = 450 Wh  |
| PT30M           | 30      | W / 2   | 1800 / 2 = 900 Wh  |
| PT60M           | 60      | W / 1   | 1800 / 1 = 1800 Wh |

**Raison** : Chaque mesure peut avoir un `interval_length` différent selon le type de compteur et la période. Il est crucial d'appliquer la conversion individuelle à chaque point de mesure avec son intervalle spécifique.

### Calcul des tarifs

#### BASE

Tarif simple : un seul prix du kWh, constant toute l'année.

```typescript
energyCost = totalKwh * offer.base_price;
totalCost = subscriptionCostYear + energyCost;
```

#### HC/HP (Heures Creuses / Heures Pleines)

Tarif avec deux prix selon l'heure de la journée.

**Configuration HC** : Récupérée depuis le PDL de l'utilisateur (`offpeak_hours`)

- Format : `"HC (22H00-6H00)"` ou `"HC (02H00-07H00 + 13H00-16H00)"`
- Parsing automatique des plages horaires

**Algorithme** :

```typescript
for (const reading of allConsumption) {
  const hour = reading.hour;
  const kwh = reading.value / 1000;

  if (isOffpeakHour(hour, pdl.offpeak_hours)) {
    hcKwh += kwh; // Heures creuses
  } else {
    hpKwh += kwh; // Heures pleines
  }
}

energyCost = hcKwh * offer.hc_price + hpKwh * offer.hp_price;
```

#### TEMPO

Tarif avec 6 prix différents selon la couleur du jour (BLUE/WHITE/RED) et l'heure (HC/HP).

**Couleurs TEMPO** :

- **BLUE** (bleu) : jours les moins chers (~300 jours/an)
- **WHITE** (blanc) : jours moyens (~43 jours/an)
- **RED** (rouge) : jours les plus chers (~22 jours/an)

**Plages horaires TEMPO** :

- **HC** : 22h00 → 6h00 (heures creuses)
- **HP** : 6h00 → 22h00 (heures pleines)

**Algorithme** :

```typescript
for (const reading of allConsumption) {
  const dateOnly = reading.dateOnly; // Format YYYY-MM-DD
  const hour = reading.hour;
  const kwh = reading.value / 1000;

  // Récupérer la couleur TEMPO du jour
  const tempoColor = tempoColorMap.get(dateOnly);

  // Déterminer la période (HC ou HP)
  let period: "HC" | "HP";
  if (hour >= 22 || hour < 6) {
    period = "HC";
  } else {
    period = "HP";
  }

  // Accumuler selon couleur + période
  // Ex: blueHcKwh, blueHpKwh, whiteHcKwh, whiteHpKwh, redHcKwh, redHpKwh
  accumulate(tempoColor, period, kwh);
}

energyCost =
  blueHcKwh * offer.tempo_blue_hc +
  blueHpKwh * offer.tempo_blue_hp +
  whiteHcKwh * offer.tempo_white_hc +
  whiteHpKwh * offer.tempo_white_hp +
  redHcKwh * offer.tempo_red_hc +
  redHpKwh * offer.tempo_red_hp;
```

**Source des couleurs TEMPO** : Récupérées depuis l'API `/tempo/days` qui synchronise quotidiennement les données RTE.

### Gestion des erreurs et cas limites

#### Données manquantes

- **Dates sans données** : Ignorées dans les calculs (pas de valeur = 0 kWh)
- **Couleur TEMPO manquante** : Point marqué comme "UNKNOWN", exclu du calcul TEMPO
- **interval_length manquant** : Utilisation par défaut de PT30M (30 minutes)

#### Duplicats

Détection automatique basée sur la date complète (`YYYY-MM-DD HH:MM:SS`) :

```typescript
const uniqueDates = new Set(allConsumption.map((item) => item.date));
const hasDuplicates = uniqueDates.size !== allConsumption.length;
```

Si des duplicats sont détectés, un avertissement est affiché en console mais n'empêche pas le calcul.

#### Changements d'heure

Les périodes qui incluent un changement d'heure (passage heure d'été/hiver) peuvent avoir plus ou moins de 288 points (7 jours × 48 points/jour en PT30M) :

- **Passage hiver** : +50 points (1 heure répétée)
- **Passage été** : -50 points (1 heure sautée)

Ceci est géré automatiquement par le découpage en périodes.

## Interface utilisateur

### Sélection de la période

Par défaut : **365 jours glissants** (aujourd'hui - 365 jours → hier)

Options futures :

- Sélection de période personnalisée
- Comparaison sur plusieurs années

### Affichage des résultats

**Format** :

```
Offre : Tarif Bleu BASE 12 kVA
Fournisseur : EDF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Abonnement annuel : 150.00 €
Consommation (16,754 kWh) : 2,814.00 €
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL : 2,964.00 €
```

**Tri** : Par coût total croissant (offre la moins chère en premier)

**Détails HC/HP** :

```
HC : 6,766 kWh × 0.16 €/kWh = 1,082.56 €
HP : 9,988 kWh × 0.19 €/kWh = 1,897.72 €
```

**Détails TEMPO** :

```
BLUE HC : 5,199 kWh × 0.12 €/kWh = 623.88 €
BLUE HP : 6,997 kWh × 0.15 €/kWh = 1,049.55 €
WHITE HC : 855 kWh × 0.14 €/kWh = 119.70 €
WHITE HP : 2,200 kWh × 0.17 €/kWh = 374.00 €
RED HC : 698 kWh × 0.18 €/kWh = 125.64 €
RED HP : 1,806 kWh × 0.55 €/kWh = 993.30 €
```

### Indicateurs de progression

Lors du chargement des données :

```
📊 52 périodes de 7 jours à récupérer
⏳ Récupération période 1/52 (2024-10-04 → 2024-10-10)
✅ Période 1/52 récupérée
...
🧮 Calcul des simulations en cours...
✅ Simulation terminée
```

## Performance et optimisation

### Cache des données

- Les données de consommation sont cachées par période (7 jours) dans Redis
- TTL : 24 heures pour les périodes récentes, plus long pour l'historique
- Paramètre `use_cache: true` par défaut pour éviter les appels API répétés

### Limitation des requêtes

- Maximum 52 requêtes API par simulation (1 an = 52 semaines)
- Respect des quotas utilisateur (admin = illimité, user = limité)
- Rate limiting côté backend pour éviter la surcharge

### Temps de calcul

Estimation pour 365 jours en PT30M :

- Récupération des données : ~10-30 secondes (selon cache)
- Calcul des tarifs : < 1 seconde
- Affichage des résultats : instantané

## Tests et validation

### Validation des calculs

1. **Test avec données CSV Enedis** : Comparaison des totaux kWh calculés vs export CSV officiel
2. **Test de cohérence** : Vérification que HC + HP = Total pour HC/HP
3. **Test TEMPO** : Vérification que BLUE + WHITE + RED = Total
4. **Test de conversion** : Validation de la formule W → Wh sur cas connus

### Cas de test

| Cas                    | Description             | Résultat attendu              |
| ---------------------- | ----------------------- | ----------------------------- |
| 1 valeur 1800W PT30M   | Conversion simple       | 900 Wh                        |
| 48 points/jour PT30M   | Total journalier        | 48 points acceptés            |
| Chevauchement 1 jour   | 2 périodes consécutives | Duplicats détectés et filtrés |
| Changement heure hiver | Période avec +1h        | 338 points au lieu de 288     |
| TEMPO jour rouge HP    | Calcul tarif rouge      | Prix élevé appliqué           |

## Documentation utilisateur

Messages à afficher :

- **Avant simulation** : "La simulation va récupérer vos données de consommation sur 365 jours. Cela peut prendre quelques secondes."
- **En cas d'erreur** : "Impossible de récupérer les données Enedis. Vérifiez que votre consentement est valide."
- **Quota dépassé** : "Quota d'appels API dépassé. Réessayez demain ou contactez l'administrateur."
- **Résultats** : "📊 Consommation totale sur la période : XX,XXX kWh (du JJ/MM/AAAA au JJ/MM/AAAA)"

## Gestion des types de prix (String vs Number)

### Problème

Les prix stockés en base de données sont des **chaînes de caractères** (`"0.23096"`), pas des nombres. Appeler `.toFixed()` directement sur ces valeurs provoque une erreur :

```
TypeError: (result.offer.hc_price_weekend || result.offer.hc_price)?.toFixed is not a function
```

### Solution : Helpers de formatage

Deux fonctions utilitaires ont été créées pour gérer ce cas de manière sécurisée :

#### `formatPrice()` - Formatage d'un prix unitaire

```typescript
/**
 * Formate un prix en gérant les types string et number
 * @param value - Prix (string ou number)
 * @param decimals - Nombre de décimales (défaut: 5 pour les prix unitaires)
 */
function formatPrice(
  value: string | number | undefined | null,
  decimals: number = 5
): string {
  if (value === undefined || value === null)
    return "0".padEnd(decimals + 2, "0");
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(numValue) ? "0".padEnd(decimals + 2, "0") : numValue.toFixed(decimals);
}

// Utilisation
formatPrice(offer.base_price)        // "0.23096"
formatPrice(offer.hc_price, 4)       // "0.1850"
formatPrice(undefined)               // "0.00000"
```

#### `calcPrice()` - Calcul quantité × prix

```typescript
/**
 * Calcule et formate un coût (quantité × prix unitaire)
 * @param quantity - Quantité en kWh
 * @param price - Prix unitaire (string ou number)
 */
function calcPrice(
  quantity: number | undefined,
  price: string | number | undefined
): string {
  const qty = quantity || 0;
  const priceNum = typeof price === "string" ? parseFloat(price) : (price || 0);
  return (qty * priceNum).toFixed(2);
}

// Utilisation
calcPrice(result.base_kwh, offer.base_price)     // "2814.00"
calcPrice(result.hc_kwh, offer.hc_price)         // "1082.56"
```

### Cas d'utilisation dans le JSX

#### Affichage d'un prix unitaire

```tsx
// ❌ INCORRECT - Erreur si c'est une string
<span>{offer.base_price.toFixed(5)}</span>

// ✅ CORRECT
<span>{formatPrice(offer.base_price)}</span>
```

#### Affichage d'un prix avec fallback

```tsx
// ❌ INCORRECT - Erreur si c'est une string
<span>
  {(offer.hc_price_weekend || offer.hc_price)?.toFixed(5)}
</span>

// ✅ CORRECT
<span>
  {formatPrice(offer.hc_price_weekend || offer.hc_price)}
</span>
```

#### Calcul d'un coût total

```tsx
// ❌ INCORRECT
<span>
  {(result.hc_kwh * offer.hc_price).toFixed(2)} €
</span>

// ✅ CORRECT
<span>
  {calcPrice(result.hc_kwh, offer.hc_price)} €
</span>
```

### Champs concernés

Tous les champs de prix dans `EnergyOffer` sont stockés comme strings :

| Champ | Type DB | Exemple |
|-------|---------|---------|
| `base_price` | string | `"0.23096"` |
| `hc_price` | string | `"0.18500"` |
| `hp_price` | string | `"0.24600"` |
| `hc_price_weekend` | string \| null | `"0.17200"` |
| `tempo_blue_hc` | string | `"0.12890"` |
| `tempo_blue_hp` | string | `"0.15480"` |
| `tempo_white_hc` | string | `"0.14200"` |
| `tempo_white_hp` | string | `"0.17100"` |
| `tempo_red_hc` | string | `"0.18000"` |
| `tempo_red_hp` | string | `"0.55000"` |
| `subscription_yearly` | string | `"150.00"` |

## Évolutions futures

1. **Export des résultats** : PDF ou CSV avec détail des calculs
2. **Graphiques** : Visualisation de la répartition HC/HP ou BLUE/WHITE/RED
3. **Historique** : Sauvegarde des simulations pour comparer dans le temps
4. **Recommandations** : Suggestions d'optimisation (déplacer consommation en HC, etc.)
5. **Prévisions** : Estimation du coût futur basé sur l'historique
