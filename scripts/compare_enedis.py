#!/usr/bin/env python3
"""Compare Enedis CSV data with database data"""

import csv
from datetime import datetime

from sqlalchemy import create_engine, text

# Database connection
DATABASE_URL = "postgresql://myelectricaldata:myelectricaldata@postgres:5432/myelectricaldata"


def parse_csv_date(date_str, time_str):
    """Parse DD/MM/YYYY and HH:MM:SS into datetime"""
    dt_str = f"{date_str} {time_str}"
    return datetime.strptime(dt_str, "%d/%m/%Y %H:%M:%S")


def read_enedis_csv(filepath):
    """Read Enedis CSV and return dict of {datetime: watts}"""
    data = {}
    current_date = None

    with open(filepath, "r", encoding="latin-1") as f:
        reader = csv.reader(f, delimiter=";")

        for row in reader:
            if not row or len(row) < 2:
                continue

            # Skip header rows
            if row[0].startswith("Date") or row[0].startswith("Récap") or not row[0].strip():
                continue

            # Check if this is a date row (DD/MM/YYYY format)
            if "/" in row[0] and ":" not in row[0]:
                current_date = row[0].strip()
                continue

            # This is a time row
            if current_date and ":" in row[0]:
                time_str = row[0].strip()
                if len(row) >= 2 and row[1].strip():
                    try:
                        watts = float(row[1].strip())
                        dt = parse_csv_date(current_date, time_str)
                        data[dt] = watts
                    except (ValueError, IndexError):
                        continue

    return data


def get_db_data(usage_point_id, start_date, end_date):
    """Get consumption data from database"""
    engine = create_engine(DATABASE_URL)

    query = text(
        """
        SELECT date, value, interval_length
        FROM consumption_detail
        WHERE usage_point_id = :usage_point_id
        AND date >= :start_date
        AND date <= :end_date
        ORDER BY date
    """
    )

    with engine.connect() as conn:
        result = conn.execute(query, {"usage_point_id": usage_point_id, "start_date": start_date, "end_date": end_date})

        data = {}
        for row in result:
            data[row.date] = {"value": float(row.value), "interval_length": row.interval_length}

        return data


def main():
    csv_file = "/app/enedis_data.csv"
    usage_point_id = "01226049119129"

    print("📊 Comparaison des données Enedis CSV vs Base de données\n")

    # Read CSV
    print("Lecture du CSV Enedis...")
    csv_data = read_enedis_csv(csv_file)
    print(f"  ✓ {len(csv_data)} points trouvés dans le CSV")

    if not csv_data:
        print("❌ Aucune donnée trouvée dans le CSV")
        return

    # Get date range
    dates = sorted(csv_data.keys())
    start_date = dates[0]
    end_date = dates[-1]
    print(f"  ✓ Période: {start_date} → {end_date}\n")

    # Get DB data
    print("Récupération des données en base...")
    db_data = get_db_data(usage_point_id, start_date, end_date)
    print(f"  ✓ {len(db_data)} points trouvés en base\n")

    # Compare
    print("Comparaison des valeurs:")
    matches = 0
    mismatches = 0
    missing_in_db = 0
    missing_in_csv = 0

    sample_shown = 0
    max_samples = 10

    # Check CSV data in DB
    for dt, csv_watts in sorted(csv_data.items()):
        if dt in db_data:
            db_watts = db_data[dt]["value"]

            if abs(csv_watts - db_watts) < 0.01:  # Allow small floating point differences
                matches += 1
            else:
                mismatches += 1
                if sample_shown < max_samples:
                    print(f"  ⚠️  {dt}: CSV={csv_watts}W, DB={db_watts}W (diff: {abs(csv_watts - db_watts)}W)")
                    sample_shown += 1
        else:
            missing_in_db += 1
            if sample_shown < max_samples:
                print(f"  ❌ {dt}: présent dans CSV ({csv_watts}W) mais absent en base")
                sample_shown += 1

    # Check for extra data in DB
    for dt in db_data.keys():
        if dt not in csv_data:
            missing_in_csv += 1

    print("\n📈 Résultats:")
    print(f"  ✅ Correspondances parfaites: {matches}")
    print(f"  ⚠️  Valeurs différentes: {mismatches}")
    print(f"  ❌ Manquant en base: {missing_in_db}")
    print(f"  ℹ️  En base mais pas dans CSV: {missing_in_csv}")

    # Calculate totals
    csv_total_wh = sum(w / (60 / 30) for w in csv_data.values())  # Convert W to Wh
    csv_total_kwh = csv_total_wh / 1000

    db_total_wh = sum(d["value"] for d in db_data.values())
    db_total_kwh = db_total_wh / 1000

    print("\n💡 Consommation totale:")
    print(f"  CSV Enedis: {csv_total_kwh:.2f} kWh")
    print(f"  Base de données: {db_total_kwh:.2f} kWh")
    print(
        f"  Différence: {abs(csv_total_kwh - db_total_kwh):.2f} kWh ({abs(csv_total_kwh - db_total_kwh) / csv_total_kwh * 100:.2f}%)"
    )


if __name__ == "__main__":
    main()
