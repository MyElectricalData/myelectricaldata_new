import secrets
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True)

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/myelectricaldata.db"
    POSTGRES_PASSWORD: str = "changeme"

    @property
    def database_type(self) -> str:
        """Auto-detect database type from DATABASE_URL"""
        if "postgresql" in self.DATABASE_URL:
            return "postgresql"
        return "sqlite"

    # Redis Cache
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 86400

    # Enedis API
    ENEDIS_CLIENT_ID: str = ""
    ENEDIS_CLIENT_SECRET: str = ""
    ENEDIS_ENVIRONMENT: Literal["sandbox", "production"] = "sandbox"
    ENEDIS_REDIRECT_URI: str = "http://localhost:3000/oauth/callback"

    # RTE API (for Tempo Calendar)
    RTE_CLIENT_ID: str = ""
    RTE_CLIENT_SECRET: str = ""
    RTE_BASE_URL: str = "https://digital.iservices.rte-france.com"

    # ===========================================
    # SERVER MODE CONFIGURATION
    # ===========================================
    # By default, the app runs in CLIENT MODE:
    # - Connects to MyElectricalData API (not Enedis directly)
    # - Stores data permanently in PostgreSQL
    # - Enables export features (Home Assistant, MQTT, etc.)
    # - Sync runs every 30 minutes
    #
    # When SERVER_MODE=True, the app runs as a multi-user gateway:
    # - Direct access to Enedis API
    # - Uses Valkey (Redis) for caching
    # - Admin features, user management, OAuth consent flow

    SERVER_MODE: bool = False

    @property
    def CLIENT_MODE(self) -> bool:
        """Returns True if running in client mode (not server mode).

        Client mode is the default. Server mode requires SERVER_MODE=True.
        """
        return not self.SERVER_MODE

    # MyElectricalData API credentials (required in client mode, i.e. SERVER_MODE=False)
    MED_API_URL: str = "https://www.v2.myelectricaldata.fr/api"
    MED_CLIENT_ID: str = ""      # Your client_id from MyElectricalData
    MED_CLIENT_SECRET: str = ""  # Your client_secret from MyElectricalData

    # API Security
    # SECRET_KEY is required in production (no default value for security)
    # In DEBUG mode, a random key is generated if not provided
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200

    # Rate Limiting
    ENEDIS_RATE_LIMIT: int = 5  # requests per second
    USER_DAILY_LIMIT_NO_CACHE: int = 50
    USER_DAILY_LIMIT_WITH_CACHE: int = 1000

    # Application
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = False
    DEBUG_SQL: bool = False

    # URLs
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"

    # Cookie settings
    COOKIE_SECURE: bool = False  # Set True in production (HTTPS only)
    COOKIE_SAMESITE: Literal["lax", "strict", "none"] = "lax"
    COOKIE_DOMAIN: str = ""  # Empty = browser uses current host. If set (e.g. ".example.com"), must match frontend domain

    # Mailgun Email
    MAILGUN_API_KEY: str = ""
    MAILGUN_DOMAIN: str = ""
    MAILGUN_FROM_EMAIL: str = "MyElectricalData <noreply@myelectricaldata.fr>"
    MAILGUN_API_BASE_URL: str = "https://api.mailgun.net/v3"  # or https://api.eu.mailgun.net/v3 for EU
    REQUIRE_EMAIL_VERIFICATION: bool = False

    # Cloudflare Turnstile
    TURNSTILE_SECRET_KEY: str = ""
    REQUIRE_CAPTCHA: bool = False

    # Admin
    ADMIN_EMAILS: str = ""

    # Slack Notifications
    SLACK_WEBHOOK_URL: str = ""
    SLACK_NOTIFICATIONS_ENABLED: bool = False

    def is_admin(self, email: str) -> bool:
        """Check if an email is in the admin list"""
        if not self.ADMIN_EMAILS:
            return False
        admin_list = [e.strip() for e in self.ADMIN_EMAILS.split(",")]
        return email.lower() in [e.lower() for e in admin_list]

    @property
    def enedis_base_url(self) -> str:
        if self.ENEDIS_ENVIRONMENT == "sandbox":
            return "https://gw.ext.prod-sandbox.api.enedis.fr"
        return "https://gw.ext.prod.api.enedis.fr"

    @property
    def enedis_authorize_url(self) -> str:
        if self.ENEDIS_ENVIRONMENT == "production":
            return "https://mon-compte-particulier.enedis.fr/dataconnect/v1/oauth2/authorize"
        return f"{self.enedis_base_url}/dataconnect/v1/oauth2/authorize"

    @model_validator(mode="after")
    def validate_secret_key(self) -> Self:
        """Validate SECRET_KEY configuration.

        - Production (DEBUG=False): SECRET_KEY is required and must be secure
        - Development (DEBUG=True): Generate a random key if not provided (with warning)
        - Client Mode (SERVER_MODE=False): Generate a random key if not provided (local installation)
        """
        insecure_patterns = ["dev-", "changeme", "secret", "password", "test", "example"]

        if not self.SECRET_KEY:
            if self.DEBUG or not self.SERVER_MODE:
                # Generate random key for development or client mode (will change on restart)
                object.__setattr__(self, "SECRET_KEY", secrets.token_urlsafe(32))
                import warnings
                mode_desc = "client mode" if not self.SERVER_MODE else "development"
                warnings.warn(
                    f"SECRET_KEY not configured - using random key for {mode_desc} "
                    "(sessions will be invalidated on restart). "
                    "Set SECRET_KEY environment variable for persistent sessions.",
                    UserWarning,
                    stacklevel=2,
                )
            else:
                raise ValueError(
                    "SECRET_KEY environment variable is required in production (DEBUG=False). "
                    "Generate a secure key with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )
        elif any(pattern in self.SECRET_KEY.lower() for pattern in insecure_patterns):
            if not self.DEBUG:
                raise ValueError(
                    "SECRET_KEY appears to be insecure (contains common patterns). "
                    "Generate a secure key with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )
            else:
                import warnings
                warnings.warn(
                    "SECRET_KEY appears to be insecure. Use a strong random key in production.",
                    UserWarning,
                    stacklevel=2,
                )

        return self


settings = Settings()
