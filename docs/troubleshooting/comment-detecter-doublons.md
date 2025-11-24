# Comment détecter les doublons dans vos données ?

## Méthode 1 : Page de diagnostic (Recommandée) ✨

### Accès rapide
1. Connectez-vous à votre compte
2. Allez sur **`/diagnostic`** dans votre navigateur
   - Exemple : `http://localhost:8000/diagnostic`
3. Cliquez sur **"Analyser le cache"**

### Interprétation des résultats

#### ✅ Aucun doublon
```
✅ Aucun doublon détecté !
Jours analysés : 365
Total points : 17,424
```
→ **Votre cache est propre !** Les montants du simulateur seront corrects.

#### ❌ Doublons détectés
```
❌ Doublons détectés !
Jours analysés : 365
Total points : 19,872
Doublons : 2,448 points
Jours affectés : 51
Taux de doublons : 12.31%
```
→ **Action requise :**
1. Vider le cache (bouton dans la sidebar)
2. Récupérer les données depuis `/consumption`
3. Relancer le diagnostic

### Détails par jour

Si des doublons sont détectés, vous verrez une liste :
```
[CONSO] 2024-10-10   156 doublons (204 → 48)
[CONSO] 2024-10-15   92 doublons (140 → 48)
[PROD]  2024-11-03   48 doublons (96 → 48)
```

**Lecture** :
- `[CONSO]` = Données de consommation
- `[PROD]` = Données de production
- `2024-10-10` = Date affectée
- `156 doublons` = Nombre de points en double
- `(204 → 48)` = Points avant/après déduplication

---

## Méthode 2 : Console du navigateur 🔍

### Pendant une simulation

1. Allez sur `/simulator`
2. Ouvrez la console (F12 → onglet Console)
3. Lancez une simulation
4. Cherchez dans les logs :

#### ✅ Pas de doublons
```javascript
Total consumption points (before deduplication): 17424
Unique dates: 17424
Has duplicates? false
Total kWh for year: 16796
```

#### ❌ Doublons présents
```javascript
Total consumption points (before deduplication): 19872
Unique dates: 17424
Has duplicates? true
⚠️ DUPLICATE DETECTED: 2448 duplicate points found! Filtering duplicates...
Total consumption points (after deduplication): 17424
Total kWh for year: 16796
```

### Indicateurs clés

| Indicateur | Signification |
|------------|---------------|
| `before deduplication` > `after deduplication` | **Doublons détectés** |
| `before deduplication` = `after deduplication` | **Pas de doublons** ✅ |
| `Has duplicates? true` | **Doublons présents** |
| `Has duplicates? false` | **Cache propre** ✅ |

---

## Méthode 3 : Vérification manuelle des montants 💰

### Comparer avec une facture

Si vous avez une facture récente, comparez :

```
Facture EDF (12 mois) : 2,950€
Simulateur BASE :       3,260€  ❌ +10% = Doublons probables
```

```
Facture EDF (12 mois) : 2,950€
Simulateur BASE :       2,964€  ✅ Écart < 1% = Pas de doublons
```

### Ordre de grandeur attendu

Pour un logement "moyen" :
- **Appartement 50m²** : ~3,000 kWh/an → ~500-700€/an
- **Maison 100m²** : ~10,000 kWh/an → ~1,600-2,000€/an
- **Maison 150m²** : ~16,000 kWh/an → ~2,500-3,200€/an

Si vos montants sont **beaucoup plus élevés**, vous avez probablement des doublons.

---

## Que faire si j'ai des doublons ?

### ⚠️ AVANT la correction (avec doublons)

Les doublons peuvent fausser les calculs de **10-15%** :

```
Consommation réelle :     16,800 kWh
Avec 12% de doublons :    18,816 kWh  (+2,016 kWh)
Surcoût calculé :         +250-350€
```

### ✅ APRÈS correction (sans doublons)

Avec les corrections récentes (2025-11-22) :

1. **Déduplication à la source** : Les nouveaux fetch ne créent plus de doublons
2. **Filtrage dans le simulateur** : Les doublons existants sont ignorés

### Procédure de nettoyage

1. **Vider le cache**
   - Cliquez sur le bouton "Vider le cache" dans la sidebar
   - Confirmer la suppression

2. **Récupérer les données**
   - Allez sur `/consumption`
   - Cliquez sur "Récupérer les données"
   - Attendez la fin du chargement (peut prendre 1-2 minutes)

3. **Vérifier**
   - Allez sur `/diagnostic`
   - Cliquez sur "Analyser le cache"
   - Vous devriez voir : **✅ Aucun doublon détecté !**

4. **Relancer la simulation**
   - Allez sur `/simulator`
   - Lancez une nouvelle simulation
   - Les montants devraient maintenant être corrects ✅

---

## FAQ

### Pourquoi ai-je des doublons ?

Les doublons venaient de deux sources (maintenant corrigées) :

1. **Chevauchement des périodes** : L'API Enedis ne retournait pas toujours 7 jours complets, créant des chevauchements
2. **Fetches multiples** : Récupérer les données plusieurs fois pouvait accumuler les points

### Les corrections sont-elles automatiques ?

**Partiellement** :
- ✅ **Nouveaux fetch** : Plus de doublons créés (correction du 2025-11-22)
- ✅ **Simulateur** : Filtre automatiquement les doublons existants
- ⚠️ **Cache existant** : Peut contenir des doublons → Vider et refetch

### À quelle fréquence vérifier ?

- **Après chaque mise à jour du code** : Vérifier une fois
- **En cas de montants suspects** : Lancer le diagnostic
- **Utilisation normale** : Pas besoin de vérifier régulièrement

### Les doublons affectent-ils mes données réelles ?

**Non** : Les doublons sont uniquement dans le cache local (React Query).
Vos données sur les serveurs Enedis sont intactes.

---

## Support

Si vous continuez à avoir des problèmes :

1. **Documentation** : Consultez `docs/troubleshooting/simulator-duplicates-fix.md`
2. **Logs** : Vérifiez la console du navigateur (F12)
3. **Issue GitHub** : Ouvrez un ticket avec les logs et le rapport de diagnostic
