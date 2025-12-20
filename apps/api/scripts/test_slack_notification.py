#!/usr/bin/env python3
"""
Script de test pour les notifications Slack

Usage:
    python scripts/test_slack_notification.py

Configuration:
    Définir SLACK_WEBHOOK_URL et SLACK_NOTIFICATIONS_ENABLED=true dans .env
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from services.slack import slack_service
from models.energy_provider import OfferContribution
from models.user import User
from unittest.mock import MagicMock


async def test_notification():
    """Test sending a Slack notification"""
    print("Testing Slack notification service...")
    print(f"Enabled: {slack_service.enabled}")
    print(f"Webhook URL configured: {bool(slack_service.webhook_url)}")
    
    if not slack_service.enabled:
        print("\n⚠️  Slack notifications are disabled.")
        print("Set SLACK_NOTIFICATIONS_ENABLED=true in .env to enable.")
        return
    
    if not slack_service.webhook_url:
        print("\n⚠️  Slack webhook URL is not configured.")
        print("Set SLACK_WEBHOOK_URL in .env with your webhook URL.")
        return
    
    # Create mock objects
    print("\nCreating mock contribution and user...")
    
    user = MagicMock(spec=User)
    user.id = "test-user-123"
    user.email = "test@example.com"
    
    contribution = MagicMock(spec=OfferContribution)
    contribution.id = "test-contrib-456"
    contribution.contribution_type = "NEW_OFFER"
    contribution.offer_name = "Test Offer - EDF Tempo 2025"
    contribution.offer_type = "TEMPO"
    contribution.provider_name = "EDF"
    contribution.power_kva = 6
    contribution.pricing_data = {
        "subscription_price": 12.50,
        "tempo_blue_hc": 0.12340,
        "tempo_blue_hp": 0.23450,
        "tempo_white_hc": 0.34560,
        "tempo_white_hp": 0.45670,
        "tempo_red_hc": 0.56780,
        "tempo_red_hp": 0.67890,
    }
    contribution.price_sheet_url = "https://example.com/edf-tempo-2025.pdf"
    
    print("\nSending notification to Slack...")
    result = await slack_service.send_contribution_notification(contribution, user)
    
    if result:
        print("✅ Notification sent successfully!")
    else:
        print("❌ Failed to send notification. Check logs for details.")


if __name__ == "__main__":
    asyncio.run(test_notification())
