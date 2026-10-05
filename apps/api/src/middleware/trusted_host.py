"""Contrôle de l'en-tête Host, sauf pour la sonde de santé /ping"""

from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import Receive, Scope, Send

HEALTH_PATHS = frozenset({"/ping"})


class TrustedHostExceptHealthMiddleware(TrustedHostMiddleware):
    """Host header check, except for /ping: Docker and Kubernetes probes reach it by localhost or the pod IP"""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"] in HEALTH_PATHS:
            await self.app(scope, receive, send)
            return
        await super().__call__(scope, receive, send)
