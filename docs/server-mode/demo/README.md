---
sidebar_position: 1
title: Compte Démo
description: Guide d'implémentation du compte de démonstration
---

# MyElectricalData Demo Account Implementation - Complete Guide

Welcome! This guide helps you implement a `/demo` command to create a demo account with realistic mock data for testing the MyElectricalData application.

## Documentation Files

This project now includes three comprehensive documentation files:

### 1. **ARCHITECTURE_SUMMARY.md** (Quick Visual Overview)
**Best for:** Getting a quick understanding of the system at a glance

Contents:
- Data flow diagrams
- Database schema (simplified)
- Authentication flow
- Caching strategy
- Demo account structure
- Quick test commands

**Reading time:** 10 minutes

---

### 2. **DEMO_ACCOUNT_ARCHITECTURE.md** (Detailed Technical Guide)
**Best for:** Understanding every component in depth

Contents:
- User authentication & account management (complete details)
- User data storage & database models
- Enedis API integration & token management
- PDL (meter) management
- Consumption & production data structures
- Caching system details
- Existing mock/seed data patterns
- Implementation checklist
- Data examples (JSON)
- Security considerations
- Frontend integration details

**Reading time:** 30 minutes

---

### 3. **DEMO_IMPLEMENTATION_GUIDE.md** (Step-by-Step Implementation)
**Best for:** Actually implementing the demo account creation

Contents:
- Complete Python script for creating demo account (`create_demo_account.py`)
- Optional FastAPI endpoint for demo creation
- Running the script (3 options)
- Testing the demo account (curl & frontend)
- Data generation best practices
- Cache management details
- Security notes
- Expected output
- Cleanup instructions

**Reading time:** 20 minutes + implementation time

---

## Quick Start

### For Quick Understanding (10 min)
1. Read: **ARCHITECTURE_SUMMARY.md**
2. Focus on sections: "Data Flow Overview", "Demo Account Implementation"

### For Implementation (1-2 hours)
1. Read: **DEMO_ACCOUNT_ARCHITECTURE.md** (skim sections 1-7)
2. Read: **DEMO_IMPLEMENTATION_GUIDE.md** (Part 1: Script)
3. Copy and adapt the script
4. Test with commands in Part 4

### For Deep Dive (Full Understanding)
1. Read all three documents in order
2. Review the actual source code files mentioned
3. Run the implementation guide step by step

---

## Key Facts at a Glance

### User Authentication
- Password hashing: bcrypt
- JWT tokens: expire in 30 days
- Client credentials: OAuth2 machine-to-machine
- Two auth methods: JWT token or client_secret as bearer token

### Database
- Default: SQLite (`./data/myelectricaldata.db`)
- Supports: PostgreSQL
- Models: User, PDL, Token, Role, Permissions

### Demo Account
- Email: `demo@myelectricaldata.fr`
- Password: `DemoPassword123!`
- Includes 2 PDLs with realistic mock data
- 365 days of consumption/production readings
- All data cached in Redis for instant access

### Enedis API Mocking
- Uses real client credentials (machine-to-machine)
- Calls real Enedis API with global token
- Data is cached locally to avoid rate limits
- Can be switched to sandbox mode for testing

### Caching
- Backend: Redis
- Granular: daily per PDL
- TTL: 24 hours
- Encryption: user's client_secret

---

## File Locations

### Source Code Key Files
```
apps/api/src/
├─ models/user.py           # User model definition
├─ models/pdl.py            # PDL (meter) model
├─ models/token.py          # Enedis token storage
├─ routers/accounts.py      # Signup, Login, Token endpoints
├─ routers/pdl.py           # PDL CRUD operations
├─ routers/enedis.py        # Consumption/Production data
├─ adapters/enedis.py       # Enedis API wrapper
├─ middleware/auth.py       # Authentication logic
├─ services/cache.py        # Redis caching
└─ utils/auth.py            # Password & token utilities
```

### New Script to Create
```
apps/api/scripts/create_demo_account.py    # NEW - Demo account creation
```

### Optional: New Router
```
apps/api/src/routers/demo.py               # OPTIONAL - API endpoint for demo creation
```

---

## Step-by-Step Implementation

### Step 1: Copy the Script (5 min)
```bash
# Copy from DEMO_IMPLEMENTATION_GUIDE.md Part 1
# Save as: apps/api/scripts/create_demo_account.py
```

### Step 2: Adapt for Your Setup (10 min)
- Check imports work with your environment
- Update demo email/password if desired
- Adjust PDL identifiers if needed

### Step 3: Run the Script (5 min)
```bash
cd apps/api
python scripts/create_demo_account.py
```

### Step 4: Test the Account (10 min)
```bash
# Get token
curl -X POST http://localhost:8000/api/accounts/token ...

# List PDLs
curl http://localhost:8000/api/pdl/ ...

# Get consumption data
curl "http://localhost:8000/api/enedis/consumption/daily/12345678901234?..."
```

### Step 5: Login via Frontend (5 min)
- Open http://localhost:3000
- Login with: demo@myelectricaldata.fr / DemoPassword123!
- View mock data in dashboard

---

## Important Concepts

### PDL (Point de Livraison)
- French for "Delivery Point"
- Identifier: 14-digit number (e.g., "12345678901234")
- Represents a meter/property
- User can have multiple PDLs (main house + apartment)

### Consumption Data Structure
```json
{
  "date": "2024-01-01",
  "value": 18.5,
  "quality": "CORRIGE"  // CORRIGE = validated/corrected
}
```

### Cache Keys
- `consumption:daily:{pdl}:{date}` - Individual day readings
- `consumption:reading_type:{pdl}` - Metadata (unit, measurement type)
- `rate_limit:{user_id}:cached:{date}` - Tracks cached API calls

### Authentication Headers
```
Authorization: Bearer {jwt_token}
or
Authorization: Bearer {client_secret}
```

---

## Data Ranges for Demo

### Consumption (Realistic Values)
- **Daily**: 10-30 kWh/day (residential home)
- **Winter** (Dec-Feb): +30% higher (heating)
- **Summer** (Jun-Aug): -20% lower (less heating)
- **Variation**: Gaussian distribution (natural randomness)

### Production (Solar, if has_production=True)
- **Daily**: 0-20 kWh/day
- **Summer** (Jun-Aug): 15-20 kWh/day (peak)
- **Winter** (Dec-Feb): 3-5 kWh/day (low)
- **Cloud days**: 60% reduction (20% probability)

---

## Security & Best Practices

### For Demo Accounts
- Use obvious but secure demo password (DemoPassword123!)
- Set email_verified=True to skip verification
- Set debug_mode=True for verbose logging
- Don't use in production

### For Production
- Use strong random passwords for real accounts
- Require email verification
- Disable debug_mode
- Use environment variables for secrets
- Enable CAPTCHA on signup

### Token Security
- JWT tokens expire after 30 days by default
- Client secrets are 64-character random strings
- All tokens encrypted in Redis
- Rate limiting prevents brute force

---

## Troubleshooting

### Demo account already exists?
- Check database: `SELECT * FROM users WHERE email = 'demo@myelectricaldata.fr'`
- Delete and recreate: `DELETE FROM users WHERE email = 'demo@myelectricaldata.fr'`
- Or update the script to check for existing user

### Cache not working?
- Ensure Redis is running: `redis-cli ping`
- Check Redis URL in settings
- Try clearing cache: `redis-cli FLUSHDB`

### Data not showing?
- Verify PDL in database: `SELECT * FROM pdls`
- Check cache keys: `redis-cli KEYS "*12345678901234*"`
- Verify user authentication: Check JWT token expiration

### Permission denied?
- Verify user is active: `is_active = True`
- Check email verified if required: `REQUIRE_EMAIL_VERIFICATION`
- Verify PDL belongs to user: user_id matches

---

## Related Documentation

- **AUTHENTICATION.md** - Authentication system details
- **DATABASE.md** - Database schema and migrations
- **DEV-MODE.md** - Development mode setup
- **README.md** - Project overview

---

## Questions & Next Steps

### After Creating Demo Account:
1. Test all consumption/production endpoints
2. Verify caching is working (use Redis monitoring)
3. Check rate limiting
4. Test frontend dashboard with demo data
5. Load test with multiple PDLs

### For Production:
1. Create real user accounts via signup
2. Implement user consent flow for Enedis OAuth
3. Set up real Enedis API credentials
4. Configure email verification
5. Enable CAPTCHA
6. Set up proper logging and monitoring

---

## Support

For issues or questions:
1. Check ARCHITECTURE_SUMMARY.md for quick reference
2. Review DEMO_ACCOUNT_ARCHITECTURE.md for detailed info
3. Follow DEMO_IMPLEMENTATION_GUIDE.md for step-by-step help
4. Check troubleshooting section above
5. Review source code files mentioned in file locations

---

**Last updated:** November 11, 2025  
**Guide version:** 1.0  
**API version:** 1.5.15  

