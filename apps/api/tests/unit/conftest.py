import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES_ENEDIS_2026 = Path(__file__).parent.parent / "fixtures" / "enedis_2026"


@pytest.fixture
def enedis_fixture():
    """Charge une réponse Enedis capturée en prod (anonymisée) depuis tests/fixtures/enedis_2026."""

    def _load(name: str) -> Any:
        return json.loads((FIXTURES_ENEDIS_2026 / f"{name}.json").read_text())

    return _load
