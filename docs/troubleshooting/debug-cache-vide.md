# Debug : Cache vide après récupération des données

## Symptômes

- Le bouton "Récupérer les données" (dans le header) tourne et semble travailler
- Aucune erreur visible
- Le cache reste vide (vérifiable sur `/diagnostic`)
- Aucun graphique ne s'affiche sur `/consumption`

## Étapes de débogage

### 1. Ouvrir la console du navigateur

Appuyez sur **F12** → Onglet **Console**

### 2. Vider le cache d'abord

1. Cliquez sur "Vider le cache" dans la sidebar
2. Rafraîchissez la page (F5)
3. Allez sur `/diagnostic` pour confirmer que le cache est vide

### 3. Récupérer les données avec les logs

1. Restez sur la console (F12 ouverte)
2. Cliquez sur "Récupérer les données" dans le header
3. Observez les logs en temps réel

### 4. Logs à chercher

#### ✅ Logs de succès attendus

```javascript
Starting unified data fetch: {
  pdl: "12345678901234",
  hasConsumption: true,
  hasProduction: false,
  linkedProductionPdl: null
}

Fetching consumption daily: 2022-11-22 → 2025-11-21
Fetching max power: 2022-11-22 → 2025-11-21
Fetching consumption detail batch: 2023-11-22 → 2025-11-21

Consumption daily data fetched successfully
Max power data fetched successfully

✅ Consommation détaillée: 2 ans et 47 jours, 17424 points
```

#### ❌ Erreurs possibles

**Erreur 1 : Pas de PDL sélectionné**
```
Veuillez sélectionner un PDL
```
→ **Solution** : Sélectionner un PDL dans le sélecteur du header

**Erreur 2 : Erreur d'authentification**
```
Error fetching consumption daily: 401 Unauthorized
```
→ **Solution** : Se déconnecter et se reconnecter

**Erreur 3 : Pas de consentement Enedis**
```
Error: No consent found for PDL
Erreur données quotidiennes de consommation: Consent required
```
→ **Solution** : Aller sur `/dashboard` et donner le consentement Enedis

**Erreur 4 : API Enedis indisponible**
```
Error fetching consumption daily: 503 Service Unavailable
Erreur données quotidiennes de consommation: Service temporairement indisponible
```
→ **Solution** : Réessayer plus tard (problème côté Enedis)

**Erreur 5 : Quota dépassé**
```
Error: API quota exceeded
Erreur données quotidiennes de consommation: Quota d'appels dépassé
```
→ **Solution** : Attendre 24h ou contacter l'admin

### 5. Vérifier le cache après fetch

Allez sur `/diagnostic` et cliquez sur "Analyser le cache"

#### ✅ Cache rempli correctement

```
Total requêtes: 387
Types: 8
Taille totale: 2.4 MB
Points de données: 17,424

▼ consumptionDetail (365)    1.8 MB
▼ consumption (1)            15 KB
▼ maxPower (1)               8 KB
```

#### ❌ Cache vide

```
Total requêtes: 5
Types: 2
Taille totale: 2 KB
Points de données: 0

▶ pdls (1)                   1 KB
▶ credentials (1)            1 KB
```

→ **Problème** : Les données n'ont pas été mises en cache

### 6. Vérifier les requêtes réseau

Dans la console :
1. Onglet **Network** (Réseau)
2. Filtrer par "XHR"
3. Cliquer sur "Récupérer les données"
4. Observer les requêtes

#### Requêtes attendues

```
GET /api/v1/enedis/consumption/daily?pdl=...&start=...&end=...
GET /api/v1/enedis/consumption/max_power?pdl=...&start=...&end=...
GET /api/v1/enedis/consumption/detail_batch?pdl=...&start=...&end=...
```

#### Vérifier les réponses

- **Status 200** = ✅ Succès
- **Status 401** = ❌ Non authentifié
- **Status 403** = ❌ Pas de consentement
- **Status 429** = ❌ Quota dépassé
- **Status 500/503** = ❌ Erreur serveur

## Cas spécifiques

### Cas 1 : Les logs montrent un succès mais le cache est vide

**Cause probable** : Les données sont reçues mais pas mises en cache correctement

**Debug** :
1. Dans la console, après le fetch, tapez :
```javascript
window.__REACT_QUERY_DEVTOOLS__ = true
```
2. Rafraîchissez la page
3. Un panel de debug React Query devrait apparaître en bas à droite
4. Explorez les queries pour voir ce qui est en cache

**Solution** :
- Vérifier que `queryClient.setQueryData` est bien appelé
- Vérifier les clés de cache dans le code

### Cas 2 : Toast de succès mais aucun graphique

**Cause probable** : Décalage entre les clés de cache du fetch et de la page

**Vérification** :
1. Aller sur `/diagnostic`
2. Développer `consumptionDetail`
3. Noter les clés, par exemple :
   ```
   ["consumptionDetail", "12345678901234", "2024-10-10", "2024-10-10"]
   ```

4. Sur `/consumption`, ouvrir la console et taper :
```javascript
// Vérifier ce que la page cherche
const cache = queryClient.getQueryCache()
const queries = cache.findAll({
  queryKey: ['consumptionDetail'],
  exact: false
})
console.log('Queries found:', queries.length)
queries.forEach(q => console.log('Key:', q.queryKey))
```

Si `queries.length === 0`, le problème est un décalage de clés.

### Cas 3 : Le bouton tourne indéfiniment

**Cause probable** : Une promesse ne se résout jamais

**Debug** :
1. Regarder les logs de la console
2. Chercher une erreur non catchée
3. Vérifier les requêtes réseau bloquées

**Solution** :
- Rafraîchir la page (F5)
- Vider le cache navigateur
- Se déconnecter/reconnecter

## Solutions communes

### Solution 1 : Vider complètement le cache et réessayer

```bash
# Dans la sidebar :
1. Cliquer sur "Vider le cache"
2. Confirmer

# Puis :
3. Rafraîchir la page (F5)
4. Sélectionner un PDL
5. Cliquer sur "Récupérer les données"
```

### Solution 2 : Vérifier le consentement Enedis

```bash
1. Aller sur /dashboard
2. Vérifier que "Consentement Enedis" est actif
3. Si non : cliquer sur "Donner mon consentement"
4. Suivre le processus OAuth
5. Revenir sur /consumption
6. Réessayer "Récupérer les données"
```

### Solution 3 : Utiliser le bouton de la page directement

Au lieu d'utiliser le bouton du header, utiliser le bouton local de la page :

```bash
1. Aller sur /consumption
2. Cliquer sur le bouton "Récupérer les données" DE LA PAGE
   (pas celui du header)
3. Vérifier si cela fonctionne mieux
```

### Solution 4 : Mode démo

Si rien ne fonctionne, tester avec le compte démo :

```bash
1. Se déconnecter
2. Se connecter avec :
   Email: demo@myelectricaldata.fr
   Mot de passe: DemoPassword123!
3. Les données sont pré-chargées
4. Tester si l'affichage fonctionne
```

## Vérifications backend

Si le problème persiste, vérifier les logs backend :

```bash
# Voir les logs du backend
make backend-logs

# Ou
docker compose logs -f backend
```

Chercher des erreurs comme :
- `ERROR` - Erreurs graves
- `WARNING` - Avertissements
- `enedis` - Problèmes avec l'API Enedis

## Aide supplémentaire

Si aucune des solutions ne fonctionne :

1. **Capturer les logs** :
   - Console navigateur (F12 → Console → Clic droit → Save as...)
   - Logs backend (`make backend-logs > backend.log`)

2. **Capturer les requêtes réseau** :
   - F12 → Network → Export HAR file

3. **Créer une issue GitHub** avec :
   - Description du problème
   - Logs capturés
   - Fichier HAR (attention aux données sensibles !)
   - Version du navigateur
   - Version de l'application

## Références

- [Guide utilisateur](/docs/pages/consumption.md)
- [Architecture du cache](/docs/architecture/cache.md)
- [API Enedis](/docs/enedis-api/)
