"""Configuration Enedis Data Connect 2026 (MED-14)."""

from src.config.settings import Settings


def make_settings(**env) -> Settings:
    return Settings(_env_file=None, DEBUG=True, **env)


def test_mode_api_auto_par_defaut():
    assert make_settings().ENEDIS_API_MODE == "auto"


def test_authorize_v1_par_defaut_en_production():
    """Enedis sert encore la v1 (consentement testé le 04/10/2026) : la bascule v2 est un réglage."""
    s = make_settings(ENEDIS_ENVIRONMENT="production")

    assert s.enedis_authorize_url == "https://mon-compte-particulier.enedis.fr/dataconnect/v1/oauth2/authorize"


def test_authorize_v2_configurable():
    s = make_settings(ENEDIS_ENVIRONMENT="production", ENEDIS_AUTHORIZE_VERSION="v2")

    assert s.enedis_authorize_url == "https://mon-compte-particulier.enedis.fr/dataconnect/v2/oauth2/authorize"


def test_authorize_url_surchargeable():
    s = make_settings(ENEDIS_AUTHORIZE_URL="https://exemple.test/authorize")

    assert s.enedis_authorize_url == "https://exemple.test/authorize"
