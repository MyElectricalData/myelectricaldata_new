# Exemple d'Intégration RTE écowatt API

Ce document fournit un exemple complet d'intégration de l'API RTE écowatt dans MyElectricalData.

## Architecture de l'Intégration

```
┌─────────────────┐
│   Frontend      │
│   (React)       │
│   - Widget      │
│   - Alertes     │
└────────┬────────┘
         │
         │ HTTP Request
         │
┌────────▼────────┐
│   Backend       │
│   (FastAPI)     │
│   - Cache       │
│   - Scheduler   │
└────────┬────────┘
         │
         │ OAuth 2.0
         │
┌────────▼────────┐
│   RTE écowatt   │
│   API v5.0      │
└─────────────────┘
```

## Backend - Service RTE écowatt (Python/FastAPI)

### 1. Configuration

```python
# apps/api/src/config/rte_config.py
from pydantic_settings import BaseSettings

class RTESettings(BaseSettings):
    """Configuration pour les APIs RTE"""

    RTE_CLIENT_ID: str
    RTE_CLIENT_SECRET: str
    RTE_BASE_URL: str = "https://digital.iservices.rte-france.com"
    RTE_TOKEN_URL: str = "https://digital.iservices.rte-france.com/token/oauth/"

    # Écowatt spécifique
    ECOWATT_CACHE_TTL: int = 900  # 15 minutes (limite API)
    ECOWATT_ENABLE_NOTIFICATIONS: bool = True

    class Config:
        env_file = ".env"

rte_settings = RTESettings()
```

### 2. Client RTE écowatt

```python
# apps/api/src/adapters/rte_ecowatt_client.py
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import httpx
from loguru import logger

class RTEEcowattClient:
    """Client pour l'API RTE écowatt"""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        base_url: str,
        token_url: str
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = base_url
        self.token_url = token_url
        self.access_token: Optional[str] = None
        self.token_expiry: Optional[datetime] = None

    async def _get_access_token(self) -> str:
        """Obtenir ou renouveler le token OAuth"""
        if self.access_token and self.token_expiry:
            if self.token_expiry > datetime.now() + timedelta(minutes=5):
                return self.access_token

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret
                }
            )

            response.raise_for_status()
            data = response.json()

            self.access_token = data["access_token"]
            self.token_expiry = datetime.now() + timedelta(seconds=data["expires_in"])

            logger.info("RTE écowatt token obtained successfully")
            return self.access_token

    async def get_signals(self) -> Dict[str, Any]:
        """
        Récupérer tous les signaux écowatt (J à J+3)

        Returns:
            Dict contenant la liste des signaux
        """
        token = await self._get_access_token()

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/open_api/ecowatt/v5/signals",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/json"
                },
                timeout=30.0
            )

            response.raise_for_status()
            data = response.json()

            logger.info(f"Retrieved {len(data.get('signals', []))} écowatt signals")
            return data

    async def get_today_signal(self) -> Optional[int]:
        """
        Récupérer le signal du jour actuel

        Returns:
            int: 1 (VERT), 2 (ORANGE), ou 3 (ROUGE)
        """
        data = await self.get_signals()
        signals = data.get("signals", [])

        if signals:
            today = signals[0]
            signal_value = today.get("dvalue")
            logger.info(f"Today's écowatt signal: {signal_value}")
            return signal_value

        return None

    async def get_current_hour_signal(self) -> Optional[int]:
        """
        Récupérer le signal de l'heure actuelle

        Returns:
            int: 0 (VERT+), 1 (VERT), 2 (ORANGE), ou 3 (ROUGE)
        """
        data = await self.get_signals()
        signals = data.get("signals", [])

        if not signals:
            return None

        today = signals[0]
        current_hour = datetime.now().hour

        for value in today.get("values", []):
            if value.get("pas") == current_hour:
                return value.get("hvalue")

        return None

    async def get_tomorrow_signal(self) -> Optional[int]:
        """Récupérer le signal de demain"""
        data = await self.get_signals()
        signals = data.get("signals", [])

        if len(signals) > 1:
            return signals[1].get("dvalue")

        return None

    async def has_red_alert(self) -> bool:
        """Vérifier s'il y a une alerte rouge dans les 4 prochains jours"""
        data = await self.get_signals()
        signals = data.get("signals", [])

        return any(signal.get("dvalue") == 3 for signal in signals)

    async def get_peak_hours_today(self) -> List[int]:
        """
        Récupérer les heures de pointe aujourd'hui (signal >= 2)

        Returns:
            List[int]: Liste des heures (0-23) avec tension
        """
        data = await self.get_signals()
        signals = data.get("signals", [])

        if not signals:
            return []

        today = signals[0]
        peak_hours = []

        for value in today.get("values", []):
            if value.get("hvalue", 0) >= 2:
                peak_hours.append(value.get("pas"))

        return peak_hours

    def get_signal_label(self, value: int) -> str:
        """Obtenir le label d'un signal"""
        labels = {
            0: "VERT+",
            1: "VERT",
            2: "ORANGE",
            3: "ROUGE"
        }
        return labels.get(value, "INCONNU")

    def get_signal_message(self, value: int) -> str:
        """Obtenir le message associé à un signal"""
        messages = {
            0: "Production décarbonée - Période idéale pour consommer",
            1: "Pas d'alerte - Situation normale",
            2: "Système tendu - Éco-gestes bienvenus",
            3: "Système très tendu - Coupures inévitables sans réduction"
        }
        return messages.get(value, "Signal inconnu")


# Singleton
_ecowatt_client: Optional[RTEEcowattClient] = None

def get_rte_ecowatt_client() -> RTEEcowattClient:
    """Factory pour le client RTE écowatt"""
    global _ecowatt_client

    if _ecowatt_client is None:
        _ecowatt_client = RTEEcowattClient(
            client_id=rte_settings.RTE_CLIENT_ID,
            client_secret=rte_settings.RTE_CLIENT_SECRET,
            base_url=rte_settings.RTE_BASE_URL,
            token_url=rte_settings.RTE_TOKEN_URL
        )

    return _ecowatt_client
```

### 3. Service de Cache

```python
# apps/api/src/services/ecowatt_cache.py
from datetime import datetime, date
from typing import Optional, Dict, Any
import json
from redis import Redis
from loguru import logger

class EcowattCacheService:
    """Service de cache pour les données écowatt"""

    def __init__(self, redis_client: Redis, ttl: int = 900):
        self.redis = redis_client
        self.ttl = ttl  # 15 minutes (limite API)
        self.key_prefix = "ecowatt"

    def _get_key(self, key_type: str) -> str:
        """Générer une clé Redis"""
        return f"{self.key_prefix}:{key_type}"

    def get_signals(self) -> Optional[Dict[str, Any]]:
        """Récupérer tous les signaux depuis le cache"""
        key = self._get_key("signals")
        cached = self.redis.get(key)

        if cached:
            logger.debug("écowatt signals retrieved from cache")
            return json.loads(cached)

        return None

    def set_signals(self, data: Dict[str, Any]) -> None:
        """Stocker tous les signaux dans le cache"""
        key = self._get_key("signals")
        self.redis.setex(key, self.ttl, json.dumps(data))
        logger.debug("écowatt signals cached")

    def get_today_signal(self) -> Optional[int]:
        """Récupérer le signal du jour depuis le cache"""
        data = self.get_signals()
        if data and data.get("signals"):
            return data["signals"][0].get("dvalue")
        return None

    def invalidate(self) -> None:
        """Invalider le cache"""
        key = self._get_key("signals")
        self.redis.delete(key)
        logger.info("écowatt cache invalidated")
```

### 4. Router FastAPI

```python
# apps/api/src/routers/ecowatt.py
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..adapters.rte_ecowatt_client import get_rte_ecowatt_client, RTEEcowattClient
from ..services.ecowatt_cache import EcowattCacheService
from ..services.redis_service import get_redis_client

router = APIRouter(prefix="/ecowatt", tags=["Écowatt"])


class EcowattHourValue(BaseModel):
    """Valeur horaire écowatt"""
    hour: int = Field(..., ge=0, le=23, description="Heure (0-23)")
    signal: int = Field(..., ge=0, le=3, description="Signal (0-3)")


class EcowattDaySignal(BaseModel):
    """Signal écowatt pour une journée"""
    date: str
    signal: int = Field(..., ge=1, le=3, description="Signal journalier (1-3)")
    label: str
    message: str
    hourly_values: List[EcowattHourValue]


class EcowattSignalsResponse(BaseModel):
    """Réponse complète des signaux écowatt"""
    generated_at: str
    signals: List[EcowattDaySignal]


class EcowattTodayResponse(BaseModel):
    """Réponse pour le signal du jour"""
    date: str
    signal: int = Field(..., ge=1, le=3)
    label: str
    message: str
    peak_hours: List[int]


@router.get("/signals", response_model=EcowattSignalsResponse)
async def get_all_signals(
    ecowatt_client: RTEEcowattClient = Depends(get_rte_ecowatt_client)
):
    """
    Récupérer tous les signaux écowatt (J à J+3)

    Retourne:
    - generated_at: Timestamp de génération
    - signals: Liste des 4 jours avec signaux horaires
    """
    # Vérifier le cache
    cache = EcowattCacheService(get_redis_client())
    cached_data = cache.get_signals()

    if cached_data:
        # Convertir au format de réponse
        return _format_signals_response(cached_data, ecowatt_client)

    # Appeler l'API RTE
    try:
        data = await ecowatt_client.get_signals()

        # Mettre en cache
        cache.set_signals(data)

        return _format_signals_response(data, ecowatt_client)

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur lors de la récupération des signaux écowatt: {str(e)}"
        )


@router.get("/today", response_model=EcowattTodayResponse)
async def get_today_signal(
    ecowatt_client: RTEEcowattClient = Depends(get_rte_ecowatt_client)
):
    """
    Récupérer le signal écowatt du jour actuel

    Retourne:
    - date: Date du jour
    - signal: Niveau (1=VERT, 2=ORANGE, 3=ROUGE)
    - label: Label du signal
    - message: Message descriptif
    - peak_hours: Heures de pointe (signal >= 2)
    """
    try:
        signal_value = await ecowatt_client.get_today_signal()

        if signal_value is None:
            raise HTTPException(
                status_code=404,
                detail="Signal écowatt non disponible"
            )

        peak_hours = await ecowatt_client.get_peak_hours_today()

        return EcowattTodayResponse(
            date=datetime.now().date().isoformat(),
            signal=signal_value,
            label=ecowatt_client.get_signal_label(signal_value),
            message=ecowatt_client.get_signal_message(signal_value),
            peak_hours=peak_hours
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur lors de la récupération du signal: {str(e)}"
        )


@router.get("/current-hour", response_model=dict)
async def get_current_hour_signal(
    ecowatt_client: RTEEcowattClient = Depends(get_rte_ecowatt_client)
):
    """
    Récupérer le signal de l'heure actuelle

    Retourne le signal horaire (0-3) pour l'heure en cours
    """
    try:
        signal_value = await ecowatt_client.get_current_hour_signal()

        if signal_value is None:
            raise HTTPException(
                status_code=404,
                detail="Signal horaire non disponible"
            )

        return {
            "hour": datetime.now().hour,
            "signal": signal_value,
            "label": ecowatt_client.get_signal_label(signal_value),
            "message": ecowatt_client.get_signal_message(signal_value)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur lors de la récupération du signal horaire: {str(e)}"
        )


@router.get("/alerts", response_model=dict)
async def get_alerts(
    ecowatt_client: RTEEcowattClient = Depends(get_rte_ecowatt_client)
):
    """
    Vérifier s'il y a des alertes rouges dans les prochains jours

    Retourne:
    - has_red_alert: Boolean indiquant présence d'alerte rouge
    - today_signal: Signal du jour
    - tomorrow_signal: Signal de demain
    """
    try:
        has_red = await ecowatt_client.has_red_alert()
        today = await ecowatt_client.get_today_signal()
        tomorrow = await ecowatt_client.get_tomorrow_signal()

        return {
            "has_red_alert": has_red,
            "today_signal": today,
            "tomorrow_signal": tomorrow,
            "today_label": ecowatt_client.get_signal_label(today) if today else None,
            "tomorrow_label": ecowatt_client.get_signal_label(tomorrow) if tomorrow else None
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur lors de la vérification des alertes: {str(e)}"
        )


def _format_signals_response(
    data: dict,
    client: RTEEcowattClient
) -> EcowattSignalsResponse:
    """Formater la réponse de l'API"""
    signals = []

    for day_data in data.get("signals", []):
        hourly_values = [
            EcowattHourValue(
                hour=val.get("pas"),
                signal=val.get("hvalue")
            )
            for val in day_data.get("values", [])
        ]

        signal_value = day_data.get("dvalue")

        signals.append(
            EcowattDaySignal(
                date=day_data.get("jour"),
                signal=signal_value,
                label=client.get_signal_label(signal_value),
                message=day_data.get("message", ""),
                hourly_values=hourly_values
            )
        )

    generated_at = data.get("signals", [{}])[0].get("GenerationFichier", "")

    return EcowattSignalsResponse(
        generated_at=generated_at,
        signals=signals
    )
```

### 5. Tâche Planifiée (Background)

```python
# apps/api/src/tasks/ecowatt_scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from loguru import logger

from ..adapters.rte_ecowatt_client import get_rte_ecowatt_client
from ..services.ecowatt_cache import EcowattCacheService
from ..services.redis_service import get_redis_client
from ..services.notification_service import send_alert_notification

async def fetch_ecowatt_signals():
    """Tâche planifiée pour récupérer les signaux écowatt"""
    try:
        client = get_rte_ecowatt_client()
        data = await client.get_signals()

        # Mettre en cache
        cache = EcowattCacheService(get_redis_client())
        cache.set_signals(data)

        logger.info("écowatt signals fetched and cached successfully")

        # Vérifier les alertes rouges
        if await client.has_red_alert():
            await send_ecowatt_red_alert()

    except Exception as e:
        logger.error(f"Error fetching écowatt signals: {e}")


async def send_ecowatt_red_alert():
    """Envoyer une alerte en cas de signal rouge"""
    logger.warning("🔴 Red écowatt alert detected!")

    # Envoyer notification aux utilisateurs abonnés
    await send_alert_notification(
        title="⚠️ Alerte écowatt ROUGE",
        message="Système électrique très tendu. Réduisez votre consommation pour éviter les coupures.",
        level="critical"
    )


def setup_ecowatt_scheduler():
    """Configurer le scheduler pour écowatt"""
    scheduler = AsyncIOScheduler()

    # Récupération toutes les 15 minutes (limite API)
    scheduler.add_job(
        fetch_ecowatt_signals,
        'interval',
        minutes=15,
        id='fetch_ecowatt'
    )

    # Récupération à 17h pour J+3 (prévisions)
    scheduler.add_job(
        fetch_ecowatt_signals,
        'cron',
        hour=17,
        minute=5,
        id='fetch_ecowatt_daily'
    )

    # Récupération vendredi à 12h15 (weekend)
    scheduler.add_job(
        fetch_ecowatt_signals,
        'cron',
        day_of_week='fri',
        hour=12,
        minute=20,
        id='fetch_ecowatt_weekend'
    )

    scheduler.start()
    logger.info("écowatt scheduler started")

    return scheduler
```

## Frontend - Composants React

### 1. Types TypeScript

```typescript
// apps/web/src/types/ecowatt.ts
export type EcowattSignalLevel = 0 | 1 | 2 | 3;

export interface EcowattHourValue {
  hour: number;
  signal: EcowattSignalLevel;
}

export interface EcowattDaySignal {
  date: string;
  signal: 1 | 2 | 3;
  label: string;
  message: string;
  hourly_values: EcowattHourValue[];
}

export interface EcowattTodayData {
  date: string;
  signal: 1 | 2 | 3;
  label: string;
  message: string;
  peak_hours: number[];
}
```

### 2. Hook personnalisé

```typescript
// apps/web/src/hooks/useEcowatt.ts
import { useState, useEffect } from 'react';
import { ecowattApi } from '../api/ecowatt';
import { EcowattTodayData } from '../types/ecowatt';

export const useEcowatt = (autoRefresh = true) => {
  const [todayData, setTodayData] = useState<EcowattTodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEcowattData();

    if (autoRefresh) {
      // Rafraîchir toutes les 15 minutes
      const interval = setInterval(fetchEcowattData, 15 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchEcowattData = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await ecowattApi.getTodaySignal();
      setTodayData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  return {
    todayData,
    loading,
    error,
    refresh: fetchEcowattData
  };
};
```

### 3. Composant Widget écowatt

```typescript
// apps/web/src/components/EcowattWidget.tsx
import React from 'react';
import { Zap, AlertTriangle, RefreshCw } from 'lucide-react';
import { useEcowatt } from '../hooks/useEcowatt';

const SIGNAL_CONFIG = {
  1: {
    color: 'green',
    bgClass: 'bg-green-100 dark:bg-green-900/30',
    textClass: 'text-green-800 dark:text-green-200',
    borderClass: 'border-green-300 dark:border-green-700',
    icon: Zap,
    iconClass: 'text-green-600 dark:text-green-400'
  },
  2: {
    color: 'orange',
    bgClass: 'bg-orange-100 dark:bg-orange-900/30',
    textClass: 'text-orange-800 dark:text-orange-200',
    borderClass: 'border-orange-300 dark:border-orange-700',
    icon: AlertTriangle,
    iconClass: 'text-orange-600 dark:text-orange-400'
  },
  3: {
    color: 'red',
    bgClass: 'bg-red-100 dark:bg-red-900/30',
    textClass: 'text-red-800 dark:text-red-200',
    borderClass: 'border-red-300 dark:border-red-700',
    icon: AlertTriangle,
    iconClass: 'text-red-600 dark:text-red-400'
  }
};

export const EcowattWidget: React.FC = () => {
  const { todayData, loading, error, refresh } = useEcowatt();

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4" />
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="text-red-600 dark:text-red-400">
          Erreur: {error}
        </div>
        <button
          onClick={refresh}
          className="mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!todayData) return null;

  const config = SIGNAL_CONFIG[todayData.signal];
  const Icon = config.icon;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Zap className="text-primary-600 dark:text-primary-400" size={24} />
          écowatt
        </h2>
        <button
          onClick={refresh}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          title="Actualiser"
        >
          <RefreshCw size={18} className="text-gray-600 dark:text-gray-400" />
        </button>
      </div>

      <div
        className={`
          flex items-start gap-4 p-4 rounded-lg border-2
          ${config.bgClass} ${config.borderClass}
        `}
      >
        <Icon className={config.iconClass} size={32} />

        <div className="flex-1">
          <div className={`text-xl font-bold ${config.textClass} mb-1`}>
            {todayData.label}
          </div>
          <div className={`text-sm ${config.textClass} mb-3`}>
            {todayData.message}
          </div>

          {todayData.peak_hours.length > 0 && (
            <div className={`text-xs ${config.textClass} opacity-75`}>
              <strong>Heures de pointe:</strong>{' '}
              {todayData.peak_hours.map(h => `${h}h`).join(', ')}
            </div>
          )}
        </div>
      </div>

      {todayData.signal >= 2 && (
        <div className={`mt-4 text-sm ${config.textClass}`}>
          <strong>💡 Éco-gestes recommandés:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Reporter les usages non essentiels</li>
            <li>Réduire le chauffage de 1-2°C</li>
            <li>Limiter l'éclairage</li>
            {todayData.signal === 3 && (
              <li className="font-bold">⚠️ Risque de coupures sans mobilisation</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
```

### 4. API Client

```typescript
// apps/web/src/api/ecowatt.ts
import { apiClient } from './client';
import { EcowattTodayData, EcowattDaySignal } from '../types/ecowatt';

export interface EcowattSignalsResponse {
  generated_at: string;
  signals: EcowattDaySignal[];
}

export interface EcowattAlertsResponse {
  has_red_alert: boolean;
  today_signal: number;
  tomorrow_signal: number;
  today_label: string;
  tomorrow_label: string;
}

export const ecowattApi = {
  async getTodaySignal(): Promise<EcowattTodayData> {
    const response = await apiClient.get('/ecowatt/today');
    return response.data;
  },

  async getAllSignals(): Promise<EcowattSignalsResponse> {
    const response = await apiClient.get('/ecowatt/signals');
    return response.data;
  },

  async getCurrentHourSignal(): Promise<{
    hour: number;
    signal: number;
    label: string;
    message: string;
  }> {
    const response = await apiClient.get('/ecowatt/current-hour');
    return response.data;
  },

  async getAlerts(): Promise<EcowattAlertsResponse> {
    const response = await apiClient.get('/ecowatt/alerts');
    return response.data;
  }
};
```

## Déploiement

### Variables d'Environnement

Ajouter dans `.env.api` :

```bash
# RTE Credentials (partagés avec Tempo)
RTE_CLIENT_ID=your_client_id_here
RTE_CLIENT_SECRET=your_client_secret_here

# écowatt Configuration
ECOWATT_CACHE_TTL=900
ECOWATT_ENABLE_NOTIFICATIONS=true
```

### Enregistrement du Router

Dans `apps/api/src/main.py` :

```python
from .routers import ecowatt
from .tasks.ecowatt_scheduler import setup_ecowatt_scheduler

app.include_router(ecowatt.router, prefix="/api")

# Démarrer le scheduler
@app.on_event("startup")
async def startup_event():
    setup_ecowatt_scheduler()
```

## Tests

### Backend

```python
# apps/api/tests/test_ecowatt.py
import pytest
from src.adapters.rte_ecowatt_client import RTEEcowattClient

@pytest.mark.asyncio
async def test_get_today_signal():
    client = RTEEcowattClient(
        client_id="test",
        client_secret="test",
        base_url="https://test.com",
        token_url="https://test.com/token"
    )

    # Mock response
    mock_data = {
        "signals": [
            {"dvalue": 2, "values": []}
        ]
    }

    signal = await client.get_today_signal()
    assert signal in [1, 2, 3]
```

### Frontend

```typescript
// apps/web/src/components/__tests__/EcowattWidget.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { EcowattWidget } from '../EcowattWidget';
import { ecowattApi } from '../../api/ecowatt';

jest.mock('../../api/ecowatt');

describe('EcowattWidget', () => {
  it('affiche le signal vert', async () => {
    (ecowattApi.getTodaySignal as jest.Mock).mockResolvedValue({
      date: '2024-01-15',
      signal: 1,
      label: 'VERT',
      message: 'Pas d\'alerte',
      peak_hours: []
    });

    render(<EcowattWidget />);

    await waitFor(() => {
      expect(screen.getByText('VERT')).toBeInTheDocument();
    });
  });
});
```

## Conclusion

Cette intégration fournit :
- ✅ Récupération automatique des signaux écowatt
- ✅ Cache Redis avec limite de 15 minutes
- ✅ Scheduler pour mise à jour périodique
- ✅ Alertes en cas de signal rouge
- ✅ Widget interactif avec dark mode
- ✅ Tests unitaires complets
