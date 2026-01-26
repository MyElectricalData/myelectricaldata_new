# RTE écowatt API - Documentation Complète

## Vue d'Ensemble

L'API **écowatt** de RTE expose les signaux sur l'équilibre du système électrique français. Elle permet d'alerter sur les tensions entre l'offre et la demande d'électricité et de communiquer sur les périodes de production bas-carbone.

**Version actuelle**: 5.0

**Public cible**: Acteurs du marché et grand public

## Objectifs de l'API

L'API écowatt permet de :
- ✅ **Prévenir** les tensions sur l'équilibre offre-demande
- ✅ **Alerter** en cas de risque de coupure
- ✅ **Communiquer** sur les périodes de production bas-carbone
- ✅ **Anticiper** jusqu'à J+3 les tensions du réseau
- ✅ **Encourager** les éco-gestes lors des périodes critiques

## Système de Signaux écowatt

L'API retourne des signaux avec **4 niveaux** pour les données horaires et **3 niveaux** pour les données journalières.

### Signaux Horaires (0 à 3)

| Niveau | Couleur | Signification | Action |
|--------|---------|---------------|--------|
| **0** | 🟢 Vert+ | Pas d'alerte + production décarbonée | Période idéale pour consommer |
| **1** | 🟢 Vert | Pas d'alerte | Consommation normale |
| **2** | 🟠 Orange | Système tendu - Éco-gestes bienvenus | Réduire la consommation si possible |
| **3** | 🔴 Rouge | Système très tendu - Coupures inévitables sans réduction | **Réduction impérative** de la consommation |

### Signaux Journaliers (1 à 3)

L'agrégation quotidienne utilise uniquement les niveaux **1, 2 et 3** (pas de niveau 0).

| Niveau | Couleur | Signification |
|--------|---------|---------------|
| **1** | 🟢 Vert | Journée sans tension |
| **2** | 🟠 Orange | Journée avec tensions - Modération recommandée |
| **3** | 🔴 Rouge | Journée critique - Risque de coupures |

### Interprétation des Signaux

#### Signal VERT (1)
- Situation normale
- Consommation sans contrainte
- Aucune action particulière requise

#### Signal ORANGE (2)
- **Tensions sur le réseau électrique**
- Éco-gestes fortement recommandés
- Actions suggérées :
  - Reporter les usages non essentiels
  - Réduire le chauffage de 1-2°C
  - Limiter l'éclairage
  - Décaler les charges de véhicules électriques

#### Signal ROUGE (3)
- **Situation critique**
- Risque de coupures tournantes si pas de réduction
- Actions impératives :
  - Réduire au maximum la consommation
  - Reporter tous les usages non essentiels
  - Mobilisation collective nécessaire
  - Possibilité de coupures localisées de 2h

## Authentification

L'accès à l'API nécessite une authentification OAuth 2.0.

### Obtention des Identifiants

1. Créer un compte sur [data.rte-france.com](https://data.rte-france.com)
2. Souscrire à l'API "écowatt"
3. Récupérer les credentials OAuth 2.0

### Format d'Authentification

```http
Authorization: Bearer [access_token]
```

### Obtention d'un Token

```bash
curl -X POST "https://digital.iservices.rte-france.com/token/oauth/" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
```

**Réponse**:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 7200
}
```

## Endpoints Disponibles

### Endpoint Principal (Production)

```
GET https://digital.iservices.rte-france.com/open_api/ecowatt/v5/signals
```

Retourne les signaux écowatt pour 4 jours (aujourd'hui jusqu'à J+3).

### Endpoint Sandbox (Tests)

```
GET https://digital.iservices.rte-france.com/open_api/ecowatt/v5/sandbox/signals
```

Fournit des données de test cohérentes sans consommer de quota API.

## Paramètres de Requête

**Aucun paramètre requis** - L'API retourne automatiquement les 4 prochains jours.

## Format de Réponse

### Structure JSON

```json
{
  "signals": [
    {
      "GenerationFichier": "2024-01-15T16:30:00+01:00",
      "jour": "2024-01-15",
      "dvalue": 1,
      "message": "Pas d'alerte. Situation normale.",
      "values": [
        {
          "pas": 0,
          "hvalue": 1
        },
        {
          "pas": 1,
          "hvalue": 1
        },
        {
          "pas": 2,
          "hvalue": 0
        },
        {
          "pas": 3,
          "hvalue": 0
        },
        // ... 24 heures au total (pas 0 à 23)
        {
          "pas": 23,
          "hvalue": 1
        }
      ]
    },
    {
      "GenerationFichier": "2024-01-15T16:30:00+01:00",
      "jour": "2024-01-16",
      "dvalue": 2,
      "message": "Système électrique tendu. Éco-gestes bienvenus.",
      "values": [
        // 24 heures...
      ]
    },
    // J+2 et J+3...
  ]
}
```

### Structure des Données

#### Objet Signal (Journalier)

| Champ | Type | Description |
|-------|------|-------------|
| `GenerationFichier` | ISO 8601 | Timestamp de génération des données |
| `jour` | String (YYYY-MM-DD) | Date concernée |
| `dvalue` | Integer (1-3) | Valeur agrégée de la journée |
| `message` | String | Message descriptif du jour |
| `values` | Array | 24 valeurs horaires (une par heure) |

#### Objet Value (Horaire)

| Champ | Type | Description |
|-------|------|-------------|
| `pas` | Integer (0-23) | Heure de la journée (0 = 00h-01h, 23 = 23h-00h) |
| `hvalue` | Integer (0-3) | Niveau de signal horaire |

## Exemples d'Utilisation

### Récupérer les Signaux écowatt

```bash
curl -X GET "https://digital.iservices.rte-france.com/open_api/ecowatt/v5/signals" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Accept: application/json"
```

### Exemple Python

```python
import requests
from datetime import datetime
from typing import List, Dict, Any

# Configuration
BASE_URL = "https://digital.iservices.rte-france.com/open_api/ecowatt/v5"
CLIENT_ID = "your_client_id"
CLIENT_SECRET = "your_client_secret"

def get_access_token() -> str:
    """Obtenir un token OAuth"""
    token_url = "https://digital.iservices.rte-france.com/token/oauth/"
    response = requests.post(
        token_url,
        data={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET
        }
    )
    return response.json()["access_token"]

def get_ecowatt_signals() -> Dict[str, Any]:
    """Récupérer les signaux écowatt"""
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    response = requests.get(
        f"{BASE_URL}/signals",
        headers=headers
    )

    return response.json()

def get_today_signal() -> int:
    """Récupérer le signal du jour"""
    data = get_ecowatt_signals()
    if data.get("signals") and len(data["signals"]) > 0:
        return data["signals"][0]["dvalue"]
    return None

def get_current_hour_signal() -> int:
    """Récupérer le signal de l'heure actuelle"""
    data = get_ecowatt_signals()
    current_hour = datetime.now().hour

    if data.get("signals") and len(data["signals"]) > 0:
        today = data["signals"][0]
        for value in today["values"]:
            if value["pas"] == current_hour:
                return value["hvalue"]
    return None

def get_tomorrow_signal() -> int:
    """Récupérer le signal de demain"""
    data = get_ecowatt_signals()
    if data.get("signals") and len(data["signals"]) > 1:
        return data["signals"][1]["dvalue"]
    return None

def has_red_alert_in_next_days() -> bool:
    """Vérifier s'il y a une alerte rouge dans les prochains jours"""
    data = get_ecowatt_signals()
    for signal in data.get("signals", []):
        if signal["dvalue"] == 3:
            return True
    return False

def get_peak_hours_today() -> List[int]:
    """Récupérer les heures de pointe (signal >= 2) aujourd'hui"""
    data = get_ecowatt_signals()
    peak_hours = []

    if data.get("signals") and len(data["signals"]) > 0:
        today = data["signals"][0]
        for value in today["values"]:
            if value["hvalue"] >= 2:
                peak_hours.append(value["pas"])

    return peak_hours

# Utilisation
if __name__ == "__main__":
    # Signal du jour
    today_signal = get_today_signal()
    signal_colors = {1: "VERT", 2: "ORANGE", 3: "ROUGE"}
    print(f"Signal du jour: {signal_colors.get(today_signal, 'INCONNU')}")

    # Signal de l'heure actuelle
    current_signal = get_current_hour_signal()
    print(f"Signal actuel: {current_signal}")

    # Heures de pointe aujourd'hui
    peak_hours = get_peak_hours_today()
    if peak_hours:
        print(f"Heures de tension aujourd'hui: {peak_hours}")

    # Alerte rouge
    if has_red_alert_in_next_days():
        print("⚠️ ALERTE: Jour rouge prévu dans les prochains jours!")
```

### Exemple JavaScript/TypeScript

```typescript
interface EcowattValue {
  pas: number;        // Heure (0-23)
  hvalue: number;     // Signal horaire (0-3)
}

interface EcowattSignal {
  GenerationFichier: string;
  jour: string;       // YYYY-MM-DD
  dvalue: number;     // Signal journalier (1-3)
  message: string;
  values: EcowattValue[];
}

interface EcowattResponse {
  signals: EcowattSignal[];
}

class RTEEcowattClient {
  private baseUrl = 'https://digital.iservices.rte-france.com/open_api/ecowatt/v5';
  private tokenUrl = 'https://digital.iservices.rte-france.com/token/oauth/';
  private clientId: string;
  private clientSecret: string;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);

    return this.accessToken;
  }

  async getSignals(): Promise<EcowattResponse> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}/signals`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getTodaySignal(): Promise<number | null> {
    const data = await this.getSignals();
    return data.signals?.[0]?.dvalue ?? null;
  }

  async getCurrentHourSignal(): Promise<number | null> {
    const data = await this.getSignals();
    const currentHour = new Date().getHours();

    const today = data.signals?.[0];
    if (!today) return null;

    const hourValue = today.values.find(v => v.pas === currentHour);
    return hourValue?.hvalue ?? null;
  }

  async getTomorrowSignal(): Promise<number | null> {
    const data = await this.getSignals();
    return data.signals?.[1]?.dvalue ?? null;
  }

  async hasRedAlert(): Promise<boolean> {
    const data = await this.getSignals();
    return data.signals.some(signal => signal.dvalue === 3);
  }

  async getPeakHoursToday(): Promise<number[]> {
    const data = await this.getSignals();
    const today = data.signals?.[0];

    if (!today) return [];

    return today.values
      .filter(v => v.hvalue >= 2)
      .map(v => v.pas);
  }

  getSignalLabel(value: number): string {
    const labels: Record<number, string> = {
      0: 'Vert+',
      1: 'Vert',
      2: 'Orange',
      3: 'Rouge'
    };
    return labels[value] ?? 'Inconnu';
  }

  getSignalColor(value: number): string {
    const colors: Record<number, string> = {
      0: '#00FF00',
      1: '#00AA00',
      2: '#FFA500',
      3: '#FF0000'
    };
    return colors[value] ?? '#CCCCCC';
  }
}

// Utilisation
const client = new RTEEcowattClient('your_client_id', 'your_client_secret');

// Récupérer le signal du jour
const todaySignal = await client.getTodaySignal();
console.log(`Signal du jour: ${client.getSignalLabel(todaySignal)}`);

// Récupérer les heures de pointe
const peakHours = await client.getPeakHoursToday();
if (peakHours.length > 0) {
  console.log(`Heures de tension: ${peakHours.join(', ')}h`);
}

// Vérifier les alertes rouges
if (await client.hasRedAlert()) {
  console.log('⚠️ Alerte rouge dans les prochains jours!');
}
```

## Disponibilité des Données

### Horaires de Publication

- **Prévisions J+3** : Calculées et accessibles quotidiennement vers **17h00**
- **Vendredi** : Publication vers **12h15** pour le weekend
- **Initialisation** : Les signaux J+3 sont d'abord remplis avec des signaux verts, puis mis à jour

### Recommandations de Requêtes

| Moment | Fréquence recommandée | Raison |
|--------|----------------------|--------|
| **Matin (8h-10h)** | 1 appel | Récupérer le signal du jour |
| **Après-midi (17h-18h)** | 1 appel | Récupérer les prévisions J+3 |
| **Vendredi 12h-13h** | 1 appel | Prévisions weekend |
| **Autres moments** | Utiliser le cache | Économiser les appels API |

## Limites de Taux

### Contraintes API

- **Limite** : 1 appel toutes les **15 minutes**
- **Dépassement** : HTTP 429 avec en-tête `Retry-After` indiquant le temps d'attente

### Bonnes Pratiques

```python
import time
from datetime import datetime, timedelta

class EcowattCache:
    def __init__(self):
        self.cache = None
        self.cache_time = None
        self.min_interval = timedelta(minutes=15)

    def get_signals(self):
        """Récupérer les signaux avec cache"""
        now = datetime.now()

        # Vérifier le cache
        if self.cache and self.cache_time:
            if now - self.cache_time < self.min_interval:
                return self.cache

        # Appeler l'API
        self.cache = get_ecowatt_signals()
        self.cache_time = now

        return self.cache
```

## Gestion des Erreurs

### Codes HTTP

| Code | Signification | Action |
|------|---------------|--------|
| 200 | Succès | Traiter les données |
| 401 | Non authentifié | Renouveler le token |
| 403 | Accès interdit | Vérifier la souscription |
| 404 | Non trouvé | Vérifier l'URL |
| 408 | Timeout | Réessayer |
| 429 | Limite dépassée | Attendre (voir Retry-After) |
| 500 | Erreur serveur | Réessayer plus tard |
| 503 | Service indisponible | Attendre et réessayer |
| 509 | Quota dépassé | Attendre le renouvellement |

### Format d'Erreur

```json
{
  "error": "ECOWATT_ERROR_CODE",
  "error_description": "Description de l'erreur",
  "transaction_id": "abc123-def456-ghi789"
}
```

### Exemple de Gestion d'Erreurs

```python
import time
from requests.exceptions import HTTPError

def get_ecowatt_with_retry(max_retries=3):
    """Récupérer les signaux avec retry automatique"""
    for attempt in range(max_retries):
        try:
            response = requests.get(
                f"{BASE_URL}/signals",
                headers=headers
            )
            response.raise_for_status()
            return response.json()

        except HTTPError as e:
            if e.response.status_code == 429:
                # Limite de taux dépassée
                retry_after = int(e.response.headers.get('Retry-After', 900))
                print(f"Rate limit hit. Waiting {retry_after}s...")
                time.sleep(retry_after)
                continue

            elif e.response.status_code in [500, 503]:
                # Erreur serveur - retry avec backoff
                wait_time = (attempt + 1) * 30
                print(f"Server error. Waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            elif e.response.status_code == 401:
                # Token expiré - renouveler
                print("Token expired. Renewing...")
                token = get_access_token()
                headers["Authorization"] = f"Bearer {token}"
                continue

            else:
                # Autre erreur
                error_data = e.response.json()
                print(f"Error: {error_data}")
                raise

    raise Exception(f"Failed after {max_retries} attempts")
```

## Cas d'Usage

### 1. Dashboard écowatt

Afficher le signal du jour avec code couleur :

```python
def display_ecowatt_status():
    signal = get_today_signal()

    if signal == 1:
        print("🟢 Situation normale")
    elif signal == 2:
        print("🟠 Système tendu - Réduisez votre consommation")
    elif signal == 3:
        print("🔴 ALERTE - Risque de coupures - Réduction impérative")
```

### 2. Alertes Préventives

Envoyer une notification avant une alerte rouge :

```python
def check_and_alert():
    data = get_ecowatt_signals()

    for i, signal in enumerate(data["signals"]):
        if signal["dvalue"] == 3:
            day_name = ["aujourd'hui", "demain", "J+2", "J+3"][i]
            send_notification(
                f"⚠️ Alerte écowatt ROUGE {day_name}!",
                "Réduisez votre consommation électrique pour éviter les coupures."
            )
```

### 3. Optimisation Automatique

Décaler automatiquement les charges non essentielles :

```python
def should_delay_consumption() -> bool:
    """Déterminer si on doit reporter la consommation"""
    current_signal = get_current_hour_signal()
    return current_signal >= 2  # Orange ou Rouge
```

### 4. Statistiques

Analyser les périodes de tension :

```python
def analyze_week_tensions():
    data = get_ecowatt_signals()
    tension_hours = 0

    for signal in data["signals"]:
        for value in signal["values"]:
            if value["hvalue"] >= 2:
                tension_hours += 1

    print(f"Heures de tension prévues : {tension_hours}/96")
```

## Support et Contact

### Support Technique RTE

- **Téléphone** : 0810 80 50 50
- **Email** : [rte-hotline@rte-france.com](mailto:rte-hotline@rte-france.com)
- **Documentation** : [data.rte-france.com](https://data.rte-france.com)

### Transaction ID

Conservez le `transaction_id` des erreurs pour faciliter le support.

## Ressources Supplémentaires

- [Page officielle écowatt](https://www.monecowatt.fr)
- [Documentation API RTE](https://data.rte-france.com/catalog/-/api/doc/user-guide/Ecowatt/5.0)
- [Portail développeur RTE](https://data.rte-france.com)
- [Guide des éco-gestes](https://www.monecowatt.fr/comprendre/les-ecogestes)

## Intégration avec MyElectricalData

Voir [ecowatt-integration-example.md](./ecowatt-integration-example.md) pour un exemple complet d'intégration dans MyElectricalData.
