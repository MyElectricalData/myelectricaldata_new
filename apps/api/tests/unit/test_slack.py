import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from src.services.slack import SlackService
from src.models import OfferContribution, User
from datetime import datetime, UTC


@pytest.fixture
def slack_service() -> SlackService:
    """Create a Slack service instance"""
    service = SlackService()
    service.enabled = True
    service.webhook_url = "https://hooks.slack.com/services/TEST/WEBHOOK/URL"
    return service


@pytest.fixture
def mock_user() -> User:
    """Create a mock user"""
    user = MagicMock(spec=User)
    user.id = "user-123"
    user.email = "test@example.com"
    return user


@pytest.fixture
def mock_contribution() -> OfferContribution:
    """Create a mock contribution"""
    contribution = MagicMock(spec=OfferContribution)
    contribution.id = "contrib-123"
    contribution.contribution_type = "NEW_OFFER"
    contribution.offer_name = "Test Offer"
    contribution.offer_type = "HC_HP"
    contribution.provider_name = "Test Provider"
    contribution.power_kva = 6
    contribution.pricing_data = {
        "subscription_price": 12.5,
        "hc_price": 0.1234,
        "hp_price": 0.5678,
    }
    contribution.price_sheet_url = "https://example.com/price-sheet.pdf"
    return contribution


@pytest.mark.asyncio
async def test_send_notification_disabled(slack_service: SlackService) -> None:
    """Test that notification is not sent when disabled"""
    slack_service.enabled = False
    result = await slack_service.send_notification("Test message")
    assert result is False


@pytest.mark.asyncio
async def test_send_notification_no_webhook(slack_service: SlackService) -> None:
    """Test that notification is not sent when webhook URL is missing"""
    slack_service.webhook_url = ""
    result = await slack_service.send_notification("Test message")
    assert result is False


@pytest.mark.asyncio
async def test_send_notification_success(slack_service: SlackService) -> None:
    """Test successful notification sending"""
    with patch("httpx.AsyncClient") as mock_client:
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        
        mock_post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value.post = mock_post

        result = await slack_service.send_notification("Test message")
        assert result is True
        mock_post.assert_called_once()


@pytest.mark.asyncio
async def test_send_notification_http_error(slack_service: SlackService) -> None:
    """Test notification sending with HTTP error"""
    with patch("httpx.AsyncClient") as mock_client:
        import httpx
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Bad Request"
        
        mock_post = AsyncMock(side_effect=httpx.HTTPStatusError(
            "Bad Request", request=MagicMock(), response=mock_response
        ))
        mock_client.return_value.__aenter__.return_value.post = mock_post

        result = await slack_service.send_notification("Test message")
        assert result is False


@pytest.mark.asyncio
async def test_send_notification_timeout(slack_service: SlackService) -> None:
    """Test notification sending with timeout"""
    with patch("httpx.AsyncClient") as mock_client:
        import httpx
        mock_post = AsyncMock(side_effect=httpx.TimeoutException("Timeout"))
        mock_client.return_value.__aenter__.return_value.post = mock_post

        result = await slack_service.send_notification("Test message")
        assert result is False


@pytest.mark.asyncio
async def test_send_contribution_notification_disabled(
    slack_service: SlackService, mock_contribution: OfferContribution, mock_user: User
) -> None:
    """Test that contribution notification is not sent when disabled"""
    slack_service.enabled = False
    result = await slack_service.send_contribution_notification(mock_contribution, mock_user)
    assert result is False


@pytest.mark.asyncio
async def test_send_contribution_notification_success(
    slack_service: SlackService, mock_contribution: OfferContribution, mock_user: User
) -> None:
    """Test successful contribution notification"""
    with patch("httpx.AsyncClient") as mock_client:
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        
        mock_post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value.post = mock_post

        result = await slack_service.send_contribution_notification(mock_contribution, mock_user)
        assert result is True
        
        # Verify the call was made
        mock_post.assert_called_once()
        
        # Check the payload structure
        call_args = mock_post.call_args
        payload = call_args[1]["json"]
        
        assert "text" in payload
        assert "blocks" in payload
        assert mock_contribution.offer_name in payload["text"]


@pytest.mark.asyncio
async def test_contribution_notification_formats_pricing_base(
    slack_service: SlackService, mock_user: User
) -> None:
    """Test contribution notification with BASE pricing"""
    contribution = MagicMock(spec=OfferContribution)
    contribution.id = "contrib-base"
    contribution.contribution_type = "NEW_PROVIDER"
    contribution.offer_name = "Base Offer"
    contribution.offer_type = "BASE"
    contribution.provider_name = "Base Provider"
    contribution.power_kva = 3
    contribution.pricing_data = {
        "subscription_price": 10.0,
        "base_price": 0.1500,
    }
    contribution.price_sheet_url = "https://example.com/base.pdf"

    with patch("httpx.AsyncClient") as mock_client:
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value.post = mock_post

        result = await slack_service.send_contribution_notification(contribution, mock_user)
        assert result is True


@pytest.mark.asyncio
async def test_contribution_notification_formats_pricing_tempo(
    slack_service: SlackService, mock_user: User
) -> None:
    """Test contribution notification with TEMPO pricing"""
    contribution = MagicMock(spec=OfferContribution)
    contribution.id = "contrib-tempo"
    contribution.contribution_type = "UPDATE_OFFER"
    contribution.offer_name = "Tempo Offer"
    contribution.offer_type = "TEMPO"
    contribution.provider_name = None  # Existing provider
    contribution.power_kva = 9
    contribution.pricing_data = {
        "subscription_price": 15.0,
        "tempo_blue_hc": 0.1234,
        "tempo_blue_hp": 0.2345,
        "tempo_white_hc": 0.3456,
        "tempo_white_hp": 0.4567,
        "tempo_red_hc": 0.5678,
        "tempo_red_hp": 0.6789,
    }
    contribution.price_sheet_url = "https://example.com/tempo.pdf"

    with patch("httpx.AsyncClient") as mock_client:
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_post = AsyncMock(return_value=mock_response)
        mock_client.return_value.__aenter__.return_value.post = mock_post

        result = await slack_service.send_contribution_notification(contribution, mock_user)
        assert result is True
        
        # Check that provider is shown as "existing"
        call_args = mock_post.call_args
        payload = call_args[1]["json"]
        blocks_text = str(payload["blocks"])
        assert "[Fournisseur existant]" in blocks_text
