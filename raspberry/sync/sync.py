import requests
from database.conn import get_database_connection


PC_API = "http://192.168.1.100:5000/api/sync/insert-sensor-readings"


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

    for reading in readings:

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


if __name__ == "__main__":
    sync()