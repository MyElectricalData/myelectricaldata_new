# RTE Tempo API - Documentation Complète

## Vue d'Ensemble

L'API **Tempo Like Supply Contract** de RTE (Réseau de Transport d'Électricité) expose les couleurs des jours pour les offres de type Tempo. Cette API permet d'obtenir la classification quotidienne des périodes de consommation électrique selon trois niveaux tarifaires.

**Version actuelle**: 1.2 (effective depuis le 24 octobre 2019)

**Données disponibles**: Depuis le 1er septembre 2014

## Système de Couleurs Tempo

Le système Tempo classe chaque jour dans l'une des trois catégories suivantes :

| Couleur | Description | Tarification |
|---------|-------------|--------------|
| **BLEU** | Périodes de faible consommation | Tarif le plus avantageux |
| **BLANC** | Périodes de consommation intermédiaire | Tarif moyen |
| **ROUGE** | Périodes de forte consommation | Tarif le plus élevé |

### Répartition Annuelle

- **Jours BLEUS**: ~300 jours par an
- **Jours BLANCS**: ~43 jours par an
- **Jours ROUGES**: ~22 jours par an (limités, généralement en hiver)

## Authentification

L'accès à l'API nécessite une authentification OAuth 2.0.

### Obtention des Identifiants

1. Créer un compte sur le portail digital de RTE : [https://data.rte-france.com](https://data.rte-france.com)
2. Souscrire à l'API "Tempo Like Supply Contract"
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
GET https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/tempo_like_calendars
```

### Endpoint Sandbox (Tests)

```
GET https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/sandbox/tempo_like_calendars
```

Le sandbox retourne des données non paramétrées pour les tests sans consommer de quota.

## Paramètres de Requête

| Paramètre | Type | Obligatoire | Description |
|-----------|------|-------------|-------------|
| `start_date` | ISO 8601 | Non* | Date de début de période |
| `end_date` | ISO 8601 | Non* | Date de fin de période |
| `fallback_status` | Boolean | Non | Inclure les informations de mode dégradé |

**Format de date**: `YYYY-MM-DDThh:mm:sszzzzzz` (ex: `2024-01-15T00:00:00+01:00`)

**\*Notes importantes**:
- `start_date` et `end_date` doivent être utilisés ensemble
- Sans paramètres : retourne la couleur du jour le plus récent
- Période maximale : 366 jours
- Date future maximale : J+2 (par rapport à la date système)

## Formats de Réponse

L'API supporte deux formats de réponse, contrôlés par l'en-tête `Accept` :

### JSON (recommandé)

```http
Accept: application/json
```

**Exemple de réponse**:
```json
{
  "tempo_like_calendars": [
    {
      "start_date": "2024-01-15T00:00:00+01:00",
      "end_date": "2024-01-16T00:00:00+01:00",
      "values": [
        {
          "start_date": "2024-01-15T00:00:00+01:00",
          "end_date": "2024-01-16T00:00:00+01:00",
          "value": "BLUE",
          "updated_date": "2024-01-14T11:00:00+01:00"
        }
      ]
    }
  ]
}
```

### XML

```http
Accept: application/xml
```

**Exemple de réponse**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<tempo_like_calendars>
  <tempo_like_calendar>
    <start_date>2024-01-15T00:00:00+01:00</start_date>
    <end_date>2024-01-16T00:00:00+01:00</end_date>
    <values>
      <value>
        <start_date>2024-01-15T00:00:00+01:00</start_date>
        <end_date>2024-01-16T00:00:00+01:00</end_date>
        <value>BLUE</value>
        <updated_date>2024-01-14T11:00:00+01:00</updated_date>
      </value>
    </values>
  </tempo_like_calendar>
</tempo_like_calendars>
```

## Structure des Données

### Objet TempoCalendar

| Champ | Type | Description |
|-------|------|-------------|
| `start_date` | ISO 8601 | Date/heure de début de la période |
| `end_date` | ISO 8601 | Date/heure de fin de la période |
| `values` | Array | Liste des valeurs de couleur pour la période |

### Objet TempoValue

| Champ | Type | Description |
|-------|------|-------------|
| `start_date` | ISO 8601 | Date/heure de début |
| `end_date` | ISO 8601 | Date/heure de fin |
| `value` | String | Couleur du jour (`BLUE`, `WHITE`, `RED`) |
| `fallback` | Boolean | Indicateur de mode dégradé (si demandé) |
| `updated_date` | ISO 8601 | Date de dernière mise à jour de la donnée |

## Exemples d'Utilisation

### Récupérer la Couleur du Jour Actuel

```bash
curl -X GET "https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/tempo_like_calendars" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Accept: application/json"
```

### Récupérer les Couleurs sur une Période

```bash
curl -X GET "https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/tempo_like_calendars?start_date=2024-01-01T00:00:00+01:00&end_date=2024-01-31T23:59:59+01:00" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Accept: application/json"
```

### Récupérer avec Statut de Fallback

```bash
curl -X GET "https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1/tempo_like_calendars?fallback_status=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Accept: application/json"
```

### Exemple Python

```python
import requests
from datetime import datetime, timedelta

# Configuration
BASE_URL = "https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1"
CLIENT_ID = "your_client_id"
CLIENT_SECRET = "your_client_secret"

# Obtenir un token
def get_access_token():
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

# Récupérer la couleur du jour
def get_today_color():
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    response = requests.get(
        f"{BASE_URL}/tempo_like_calendars",
        headers=headers
    )

    data = response.json()
    if data["tempo_like_calendars"]:
        color = data["tempo_like_calendars"][0]["values"][0]["value"]
        return color
    return None

# Récupérer les couleurs sur une période
def get_tempo_period(start_date, end_date):
    token = get_access_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    params = {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat()
    }

    response = requests.get(
        f"{BASE_URL}/tempo_like_calendars",
        headers=headers,
        params=params
    )

    return response.json()

# Utilisation
if __name__ == "__main__":
    # Couleur du jour
    today_color = get_today_color()
    print(f"Couleur du jour: {today_color}")

    # Couleurs du mois en cours
    start = datetime.now().replace(day=1, hour=0, minute=0, second=0)
    end = datetime.now()

    period_data = get_tempo_period(start, end)
    for calendar in period_data["tempo_like_calendars"]:
        for value in calendar["values"]:
            print(f"{value['start_date']}: {value['value']}")
```

### Exemple JavaScript/TypeScript

```typescript
interface TempoValue {
  start_date: string;
  end_date: string;
  value: 'BLUE' | 'WHITE' | 'RED';
  fallback?: boolean;
  updated_date: string;
}

interface TempoCalendar {
  start_date: string;
  end_date: string;
  values: TempoValue[];
}

interface TempoResponse {
  tempo_like_calendars: TempoCalendar[];
}

class RTETempoClient {
  private baseUrl = 'https://digital.iservices.rte-france.com/open_api/tempo_like_supply_contract/v1';
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

  async getTodayColor(): Promise<'BLUE' | 'WHITE' | 'RED' | null> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}/tempo_like_calendars`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    const data: TempoResponse = await response.json();

    if (data.tempo_like_calendars?.length > 0) {
      return data.tempo_like_calendars[0].values[0].value;
    }

    return null;
  }

  async getTempoCalendar(
    startDate: Date,
    endDate: Date,
    includeFallback = false
  ): Promise<TempoResponse> {
    const token = await this.getAccessToken();

    const params = new URLSearchParams({
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString()
    });

    if (includeFallback) {
      params.append('fallback_status', 'true');
    }

    const response = await fetch(
      `${this.baseUrl}/tempo_like_calendars?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      }
    );

    return response.json();
  }
}

// Utilisation
const client = new RTETempoClient('your_client_id', 'your_client_secret');

// Récupérer la couleur du jour
const todayColor = await client.getTodayColor();
console.log(`Couleur du jour: ${todayColor}`);

// Récupérer un mois complet
const startDate = new Date('2024-01-01T00:00:00+01:00');
const endDate = new Date('2024-01-31T23:59:59+01:00');
const calendar = await client.getTempoCalendar(startDate, endDate);
console.log(calendar);
```

## Gestion des Erreurs

### Codes d'Erreur Fonctionnels

L'API retourne des erreurs HTTP 400 avec un corps JSON/XML structuré :

```json
{
  "error": "TMPLIKSUPCON_TMPLIKCAL_F01",
  "error_description": "Les paramètres start_date et end_date doivent être fournis ensemble",
  "transaction_id": "abc123-def456-ghi789"
}
```

### Codes d'Erreur Courants

| Code | Description |
|------|-------------|
| `TMPLIKSUPCON_TMPLIKCAL_F01` | Paramètres de date manquants ou incomplets |
| `TMPLIKSUPCON_TMPLIKCAL_F02` | start_date postérieure à end_date |
| `TMPLIKSUPCON_TMPLIKCAL_F03` | Période supérieure à 366 jours |
| `TMPLIKSUPCON_TMPLIKCAL_F04` | Format de date invalide |
| `TMPLIKSUPCON_TMPLIKCAL_F05` | Date future au-delà de J+2 |

### Codes HTTP

| Code | Signification |
|------|---------------|
| 200 | Succès |
| 400 | Erreur fonctionnelle (paramètres invalides) |
| 401 | Non authentifié (token invalide ou expiré) |
| 403 | Accès interdit (pas de souscription active) |
| 429 | Limite de taux dépassée |
| 500 | Erreur serveur interne |
| 503 | Service temporairement indisponible |

### Exemple de Gestion d'Erreurs

```python
import requests
from requests.exceptions import HTTPError

def get_tempo_with_error_handling(start_date, end_date):
    try:
        response = requests.get(
            f"{BASE_URL}/tempo_like_calendars",
            headers=headers,
            params={
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat()
            }
        )
        response.raise_for_status()
        return response.json()

    except HTTPError as e:
        if e.response.status_code == 400:
            error_data = e.response.json()
            print(f"Erreur fonctionnelle: {error_data['error_description']}")
            print(f"Transaction ID: {error_data['transaction_id']}")
        elif e.response.status_code == 401:
            print("Token expiré ou invalide, renouvellement nécessaire")
        elif e.response.status_code == 429:
            print("Limite de taux dépassée, veuillez patienter")
        elif e.response.status_code == 503:
            print("Service temporairement indisponible")
        else:
            print(f"Erreur HTTP {e.response.status_code}")
        raise
```

## Limites et Contraintes

### Limites Techniques

| Limite | Valeur |
|--------|--------|
| Période maximale par requête | 366 jours |
| Période minimale | 1 jour calendaire |
| Date future maximale | J+2 |
| Taille maximale de réponse | 7 MB |
| Longueur maximale URI | 2048 caractères |

### Limites de Taux

Les limites de taux dépendent de votre plan de souscription. En général :
- **Plan gratuit**: Limité en nombre de requêtes par jour/mois
- **Plan commercial**: Quotas plus élevés selon contrat

**Recommandation**: Effectuer un appel quotidien vers **10h40** pour obtenir la couleur du jour suivant.

### Bonnes Pratiques

1. **Cache des données**: Mettre en cache les couleurs historiques (ne changent pas)
2. **Gestion du token**: Réutiliser le token jusqu'à expiration (7200s)
3. **Gestion des erreurs**: Implémenter un système de retry avec backoff exponentiel
4. **Période de requête**: Limiter les requêtes à 366 jours maximum
5. **Horaire optimal**: Récupérer J+1 après 10h40 pour garantir la disponibilité

## Fuseaux Horaires

Toutes les dates/heures sont exprimées dans le fuseau horaire français :
- **Hiver** (UTC+1): De fin octobre à fin mars
- **Été** (UTC+2): De fin mars à fin octobre

**Exemple**:
- Date d'hiver: `2024-01-15T00:00:00+01:00`
- Date d'été: `2024-07-15T00:00:00+02:00`

## Support et Contact

### Support Technique

- **Téléphone**: 0810 80 50 50
- **Email**: [rte-hotline@rte-france.com](mailto:rte-hotline@rte-france.com)
- **Portail**: [https://data.rte-france.com](https://data.rte-france.com)

### Transaction ID

En cas d'erreur, conservez le `transaction_id` fourni dans la réponse d'erreur pour faciliter le support.

## Cycle de Vie de la Souscription

- La souscription à l'API est liée au compte utilisateur
- **Résiliation automatique** lors de la suppression du compte utilisateur
- Pas de période d'engagement minimum
- Gratuit pour usage non commercial (selon conditions)

## Annexes

### Exemple Complet d'Intégration

Voir le fichier [tempo-integration-example.md](./tempo-integration-example.md) pour un exemple complet d'intégration dans une application web.

### Mapping avec MyElectricalData

Dans le contexte de MyElectricalData, l'API Tempo peut être utilisée pour :
- Afficher la couleur du jour sur le tableau de bord
- Calculer les coûts selon les périodes Tempo
- Optimiser les prévisions de consommation
- Alerter les utilisateurs avant les jours rouges

Voir [tempo-myelectricaldata-integration.md](./tempo-myelectricaldata-integration.md) pour les détails d'intégration.

## Ressources Supplémentaires

- [Page officielle RTE Tempo](https://www.rte-france.com/eco2mix/les-offres-tempo)
- [Documentation API RTE](https://data.rte-france.com/catalog/-/api/doc/user-guide/Tempo+Like+Supply+Contract/1.1)
- [Portail développeur RTE](https://data.rte-france.com)
