"""Négociation du format des réponses Enedis de la passerelle (MED-12).

Les conteneurs locaux <= 1.22.0 ne lisent que le format v5 et n'envoient aucun
en-tête : sans `X-MED-Format: 2026`, la passerelle sert donc le v5, avec l'en-tête
`Deprecation`, et journalise l'appel pour mesurer combien d'anciens clients restent.
Le front et le client 2.x envoient l'en-tête ; ils savent aussi lire le v5.
"""

import functools
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from ..schemas import APIResponse
from ..services.enedis_legacy import address_2026_to_v5, contract_2026_to_v5, measure_2026_to_v5

logger = logging.getLogger(__name__)

FORMAT_HEADER = "X-MED-Format"
FORMAT_2026 = "2026"

_CONVERTERS: dict[str, Callable[[Any, str], Any]] = {
    "measure": lambda data, _usage_point_id: measure_2026_to_v5(data),
    "contract": contract_2026_to_v5,
    "address": address_2026_to_v5,
}


def wants_2026(request: Request) -> bool:
    return request.headers.get(FORMAT_HEADER, "").strip() == FORMAT_2026


def legacy_v5(kind: str) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
    """Sert la réponse d'une route Enedis au format v5 aux clients qui ne demandent pas le 2026.

    À placer sous `@router.get(...)` ; la route doit recevoir `request` et `usage_point_id`.
    """
    convert = _CONVERTERS[kind]

    def decorator(func: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            result = await func(*args, **kwargs)
            request = kwargs.get("request")
            if not isinstance(request, Request) or wants_2026(request) or not isinstance(result, APIResponse):
                return result

            if result.success and result.data is not None:
                result.data = convert(result.data, kwargs.get("usage_point_id", ""))
            logger.info(
                f"[COMPAT v5] {kind} servi en v5 à un client sans {FORMAT_HEADER} "
                f"(User-Agent: {request.headers.get('user-agent', '?')})"
            )
            return JSONResponse(content=jsonable_encoder(result), headers={"Deprecation": "true"})

        return wrapper

    return decorator
