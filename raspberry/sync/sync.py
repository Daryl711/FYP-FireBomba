import requests
import time
from threading import Lock
from database.conn import get_database_connection


PC_API_BASE = "http://192.168.1.100:5000/api/sync"  # Change IP address whenever necessary...
PC_API = f"{PC_API_BASE}/insert-sensor-readings"
AGGREGATE_API = f"{PC_API_BASE}/insert-sensor-aggregates"
AGGREGATE_RETRY_INTERVAL_SECONDS = 120
aggregate_sync_lock = Lock()


def get_unsynced_readings():
    connection = get_database_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT *
        FROM SensorReadings
        WHERE cloud_sync_status IN ('PENDING', 'FAILED')
        ORDER BY reading_id
    """)

    readings = cursor.fetchall()

    cursor.close()
    connection.close()

    return readings


def mark_as_synced(reading_id):
    connection = get_database_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE SensorReadings
        SET cloud_sync_status = 'SYNCED'
        WHERE reading_id = %s
    """, (reading_id,))

    connection.commit()

    cursor.close()
    connection.close()


def mark_as_failed(reading_id):
    connection = get_database_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE SensorReadings
        SET cloud_sync_status = 'FAILED'
        WHERE reading_id = %s
    """, (reading_id,))

    connection.commit()

    cursor.close()
    connection.close()


def sync():
    readings = get_unsynced_readings()

    if not readings:
        print("No readings to sync.", flush=True)
        return

    
    for reading in readings:
        if reading["reading_timestamp"] is not None:
            reading["reading_timestamp"] = reading["reading_timestamp"].isoformat()

        try:
            response = requests.post(
                PC_API,
                json=reading,
                timeout=5
            )

            if response.status_code == 200:
                mark_as_synced(reading["reading_id"])

                print(
                    f"Synced reading {reading['reading_id']}"
                )

            else:
                mark_as_failed(reading["reading_id"])

                print(
                    f"Failed reading {reading['reading_id']}: "
                    f"{response.status_code}"
                )

        except requests.RequestException as e:

            mark_as_failed(reading["reading_id"])

            print(
                f"Connection failed for reading "
                f"{reading['reading_id']}: {e}"
            )

    


def get_unsynced_aggregates():
    connection = get_database_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            aggregate_id,
            room_id,
            window_start,
            window_end,
            avg_temperature,
            avg_smoke,
            avg_co,
            avg_humidity
        FROM SensorAggregates
        WHERE cloud_sync_status IN ('PENDING', 'FAILED')
          AND (
              cloud_sync_attempted_at IS NULL
              OR cloud_sync_attempted_at <= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
          )
        ORDER BY aggregate_id
    """)
    aggregates = cursor.fetchall()
    cursor.close()
    connection.close()
    return aggregates


def mark_aggregate_attempted(aggregate_id):
    connection = get_database_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE SensorAggregates
        SET cloud_sync_attempted_at = NOW()
        WHERE aggregate_id = %s
          AND cloud_sync_status IN ('PENDING', 'FAILED')
    """, (aggregate_id,))

    connection.commit()
    cursor.close()
    connection.close()


def update_aggregate_sync_status(aggregate_id, status):
    connection = get_database_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE SensorAggregates
        SET cloud_sync_status = %s,
            cloud_synced_at = CASE
                WHEN %s = 'SYNCED' THEN NOW()
                ELSE cloud_synced_at
            END
        WHERE aggregate_id = %s
    """, (status, status, aggregate_id))

    connection.commit()
    cursor.close()
    connection.close()


def sync_aggregates():
    aggregate_sync_lock.acquire()
    try:
        aggregates = get_unsynced_aggregates()
        for aggregate in aggregates:
            aggregate_id = aggregate["aggregate_id"]
            mark_aggregate_attempted(aggregate_id)

            payload = {
                key: value.isoformat() if hasattr(value, "isoformat") else value
                for key, value in aggregate.items()
                if key != "aggregate_id"
            }

            try:
                response = requests.post(
                    AGGREGATE_API,
                    json=payload,
                    timeout=5,
                )
                if response.status_code == 200:
                    update_aggregate_sync_status(aggregate_id, "SYNCED")
                    print(f"Synced aggregate {aggregate_id}", flush=True)
                else:
                    update_aggregate_sync_status(aggregate_id, "FAILED")
                    print(
                        f"Failed aggregate {aggregate_id}: "
                        f"{response.status_code}",
                        flush=True,
                    )
            except requests.RequestException as error:
                update_aggregate_sync_status(aggregate_id, "FAILED")
                print(
                    f"Connection failed for aggregate {aggregate_id}: {error}",
                    flush=True,
                )
    finally:
        aggregate_sync_lock.release()


if __name__ == "__main__":

    print("Sync service started.", flush=True)

    while True:

        try:
            sync()

        except Exception as e:
            print(f"Sync error: {e}", flush=True)

        time.sleep(10)