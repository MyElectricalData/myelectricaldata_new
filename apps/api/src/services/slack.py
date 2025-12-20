import httpx
from typing import Any
from ..config import settings
from ..models import OfferContribution, User
import logging


logger = logging.getLogger(__name__)


class SlackService:
    """Service for sending Slack notifications via webhook"""

    def __init__(self) -> None:
        self.webhook_url = settings.SLACK_WEBHOOK_URL
        self.enabled = settings.SLACK_NOTIFICATIONS_ENABLED

    async def send_notification(
        self, message: str, blocks: list[dict[str, Any]] | None = None
    ) -> bool:
        """Send a notification to Slack

        Args:
            message: Fallback text message
            blocks: Slack block kit blocks for rich formatting

        Returns:
            True if message was sent successfully, False otherwise
        """
        if not self.enabled:
            logger.debug("[SLACK] Notifications disabled")
            return False

        if not self.webhook_url:
            logger.warning("[SLACK] Webhook URL not configured")
            return False

        try:
            payload: dict[str, Any] = {"text": message}
            if blocks:
                payload["blocks"] = blocks

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(self.webhook_url, json=payload)
                response.raise_for_status()
                logger.info("[SLACK] Notification sent successfully")
                return True
        except httpx.TimeoutException:
            logger.error("[SLACK] Timeout while sending notification")
            return False
        except httpx.HTTPStatusError as e:
            logger.error(f"[SLACK] HTTP error {e.response.status_code}: {e.response.text}")
            return False
        except Exception as e:
            logger.error(f"[SLACK] Failed to send notification: {str(e)}")
            return False

    async def send_contribution_notification(self, contribution: OfferContribution, contributor: User) -> bool:
        """Send a notification about a new contribution

        Args:
            contribution: The contribution object
            contributor: The user who submitted the contribution

        Returns:
            True if notification was sent successfully, False otherwise
        """
        # Determine emoji based on contribution type
        emoji_map = {
            "NEW_PROVIDER": ":star2:",
            "NEW_OFFER": ":new:",
            "UPDATE_OFFER": ":arrows_counterclockwise:",
        }
        emoji = emoji_map.get(contribution.contribution_type, ":information_source:")

        # Build fallback text message
        fallback_text = (
            f"{emoji} Nouvelle contribution: {contribution.offer_name} "
            f"par {contributor.email}"
        )

        # Format pricing for display
        pricing = contribution.pricing_data or {}
        price_lines = []

        # Subscription price (always present)
        subscription = pricing.get("subscription_price", 0)
        price_lines.append(f"Abonnement: *{subscription:.2f} €/mois*")

        # Add main pricing based on offer type
        offer_type = contribution.offer_type.upper()
        if offer_type == "BASE":
            if "base_price" in pricing:
                price_lines.append(f"Base: {pricing['base_price']:.5f} €/kWh")
        elif offer_type in ["HC_HP", "HPHC"]:
            if "hc_price" in pricing:
                price_lines.append(f"HC: {pricing['hc_price']:.5f} €/kWh")
            if "hp_price" in pricing:
                price_lines.append(f"HP: {pricing['hp_price']:.5f} €/kWh")
        elif offer_type == "TEMPO":
            tempo_prices = []
            for color in ["blue", "white", "red"]:
                hc_key = f"tempo_{color}_hc"
                hp_key = f"tempo_{color}_hp"
                if hc_key in pricing:
                    tempo_prices.append(f"{color.capitalize()} HC: {pricing[hc_key]:.5f} €/kWh")
                if hp_key in pricing:
                    tempo_prices.append(f"{color.capitalize()} HP: {pricing[hp_key]:.5f} €/kWh")
            price_lines.extend(tempo_prices[:4])  # Limit display
        elif offer_type == "EJP":
            if "ejp_normal" in pricing:
                price_lines.append(f"Normal: {pricing['ejp_normal']:.5f} €/kWh")
            if "ejp_peak" in pricing:
                price_lines.append(f"Pointe: {pricing['ejp_peak']:.5f} €/kWh")

        pricing_text = "\n".join(price_lines) if price_lines else "Détails non disponibles"

        # Determine provider name
        provider_display = contribution.provider_name or "[Fournisseur existant]"

        # Build contribution type display
        type_map = {
            "NEW_PROVIDER": "Nouveau fournisseur",
            "NEW_OFFER": "Nouvelle offre",
            "UPDATE_OFFER": "Mise à jour d'offre",
        }
        type_display = type_map.get(contribution.contribution_type, contribution.contribution_type)

        # Build power display
        power_display = f"{contribution.power_kva} kVA" if contribution.power_kva else "Non spécifié"

        # Build Slack blocks for rich formatting
        blocks: list[dict[str, Any]] = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} Nouvelle contribution - {contribution.offer_name}",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Type:*\n{type_display}"},
                    {"type": "mrkdwn", "text": f"*Fournisseur:*\n{provider_display}"},
                    {"type": "mrkdwn", "text": f"*Offre:*\n{contribution.offer_name}"},
                    {"type": "mrkdwn", "text": f"*Type d'offre:*\n{offer_type}"},
                    {"type": "mrkdwn", "text": f"*Puissance:*\n{power_display}"},
                    {"type": "mrkdwn", "text": f"*Contributeur:*\n{contributor.email}"},
                ],
            },
            {"type": "divider"},
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Tarification:*\n{pricing_text}"},
            },
        ]

        # Add price sheet link if available
        if contribution.price_sheet_url:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Fiche des prix:*\n<{contribution.price_sheet_url}|Voir la fiche>",
                    },
                }
            )

        # Add admin link
        admin_url = f"{settings.FRONTEND_URL}/admin/contributions?id={contribution.id}"
        blocks.append(
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Gérer cette contribution", "emoji": True},
                        "url": admin_url,
                        "style": "primary",
                    }
                ],
            }
        )

        return await self.send_notification(fallback_text, blocks)


slack_service = SlackService()
