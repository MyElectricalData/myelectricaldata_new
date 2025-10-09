from .accounts import router as accounts_router
from .pdl import router as pdl_router
from .oauth import router as oauth_router
from .enedis import router as enedis_router
from .admin import router as admin_router
from .energy_offers import router as energy_offers_router
from .tempo import router as tempo_router
from .ecowatt import router as ecowatt_router
from .roles import router as roles_router
from .logs import router as logs_router

__all__ = ["accounts_router", "pdl_router", "oauth_router", "enedis_router", "admin_router", "energy_offers_router", "tempo_router", "ecowatt_router", "roles_router", "logs_router"]
