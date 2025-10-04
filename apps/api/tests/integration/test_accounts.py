import pytest
from httpx import AsyncClient
from src.main import app


@pytest.mark.asyncio
async def test_signup():
    """Test user signup"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/accounts/signup", json={"email": "test@example.com", "password": "test123456"})

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert "client_id" in data["data"]
        assert "client_secret" in data["data"]


@pytest.mark.asyncio
async def test_signup_duplicate_email():
    """Test signup with duplicate email"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # First signup
        await client.post("/accounts/signup", json={"email": "duplicate@example.com", "password": "test123456"})

        # Second signup with same email
        response = await client.post(
            "/accounts/signup", json={"email": "duplicate@example.com", "password": "test123456"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["error"]["code"] == "USER_EXISTS"


@pytest.mark.asyncio
async def test_login():
    """Test user login"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Signup first
        await client.post("/accounts/signup", json={"email": "login@example.com", "password": "test123456"})

        # Login
        response = await client.post("/accounts/login", json={"email": "login@example.com", "password": "test123456"})

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "access_token" in data["data"]


@pytest.mark.asyncio
async def test_login_invalid_credentials():
    """Test login with invalid credentials"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/accounts/login", json={"email": "nonexistent@example.com", "password": "wrongpassword"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["error"]["code"] == "INVALID_CREDENTIALS"
