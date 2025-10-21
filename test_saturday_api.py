#!/usr/bin/env python3
"""
Script to test Enedis API responses for date ranges containing Saturdays
This will help us determine if Saturday data is missing from the API or filtered by our code
"""

import requests
import json
from datetime import datetime, timedelta

# API Configuration
BASE_URL = "http://localhost:8081"
PDL_ID = "01226049119129"  # Maison - actual PDL from database

# Test date ranges that include known missing Saturdays
# 2025-10-04 (Saturday) and 2025-10-11 (Saturday) were reported as missing
test_ranges = [
    {
        "start": "2025-10-01",
        "end": "2025-10-07",
        "expected_saturdays": ["2025-10-04"]
    },
    {
        "start": "2025-10-08",
        "end": "2025-10-14",
        "expected_saturdays": ["2025-10-11"]
    }
]

def get_auth_token():
    """Get authentication token"""
    # You would need to implement proper authentication here
    # For now, we'll try without auth or add bearer token if needed
    return None

def test_consumption_detail(pdl_id, start_date, end_date):
    """Test /consumption/detail endpoint"""
    url = f"{BASE_URL}/consumption/detail/{pdl_id}"
    params = {
        "start": start_date,
        "end": end_date,
        "use_cache": False  # Force fresh API call
    }

    print(f"\n{'='*80}")
    print(f"Testing range: {start_date} → {end_date}")
    print(f"{'='*80}")

    try:
        response = requests.get(url, params=params, timeout=30)
        print(f"Status Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"Response keys: {list(data.keys())}")

            # Check if we have data
            if data.get('success'):
                response_data = data.get('data', {})

                # Try different data structures
                readings = None
                if response_data.get('meter_reading', {}).get('interval_reading'):
                    readings = response_data['meter_reading']['interval_reading']
                elif response_data.get('interval_reading'):
                    readings = response_data['interval_reading']
                elif isinstance(response_data, list):
                    readings = response_data

                if readings:
                    print(f"✅ Total readings: {len(readings)}")

                    # Extract all unique dates from readings
                    dates_in_response = set()
                    for reading in readings:
                        reading_date = reading.get('date', '')
                        if reading_date:
                            # Extract just the date part (YYYY-MM-DD)
                            date_str = reading_date.split('T')[0] if 'T' in reading_date else reading_date.split(' ')[0]
                            dates_in_response.add(date_str)

                    print(f"📅 Unique dates in response: {len(dates_in_response)}")
                    print(f"📅 Date range in response: {sorted(dates_in_response)}")

                    # Check for Saturdays
                    saturdays_found = []
                    for date_str in sorted(dates_in_response):
                        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                        if date_obj.weekday() == 5:  # 5 = Saturday
                            saturdays_found.append(date_str)

                    if saturdays_found:
                        print(f"✅ SATURDAYS FOUND in API response: {saturdays_found}")
                    else:
                        print(f"❌ NO SATURDAYS found in API response!")

                    # Show sample reading
                    if readings:
                        print(f"\n📊 Sample reading:")
                        print(json.dumps(readings[0], indent=2))
                else:
                    print(f"❌ No readings found in response")
                    print(f"Response data structure: {json.dumps(response_data, indent=2)[:500]}...")
            else:
                print(f"❌ API returned success=False")
                print(f"Error: {data.get('error')}")
        else:
            print(f"❌ HTTP Error: {response.status_code}")
            print(f"Response: {response.text[:500]}")

    except Exception as e:
        print(f"❌ Exception: {type(e).__name__}: {e}")

def main():
    print("🔍 Testing Enedis API for Saturday data availability")
    print(f"Base URL: {BASE_URL}")
    print(f"PDL ID: {PDL_ID}")

    for test_range in test_ranges:
        test_consumption_detail(
            PDL_ID,
            test_range["start"],
            test_range["end"]
        )
        print(f"\n🔍 Expected Saturdays: {test_range['expected_saturdays']}")

if __name__ == "__main__":
    main()
