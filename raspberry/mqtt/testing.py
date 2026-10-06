from datetime import datetime, timedelta
from database.conn import get_database_connection
import random


def seed_test_aggregates(room_id):
    connection = get_database_connection()
    cursor = connection.cursor()

    # Current completed 5-minute boundary
    end_time = datetime.now().replace(second=0, microsecond=0)
    end_time = end_time.replace(
        minute=end_time.minute - end_time.minute % 5
    )

    # Generate exactly 24 × 5-minute windows
    start_time = end_time - timedelta(hours=2)

    for i in range(24):
        window_start = start_time + timedelta(minutes=i * 5)
        window_end = window_start + timedelta(minutes=5)

        cursor.execute(
            """
            INSERT INTO SensorAggregates (
                room_id,
                window_start,
                window_end,
                avg_temperature,
                avg_humidity,
                avg_smoke,
                avg_co
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                room_id,
                window_start,
                window_end,

                # Fake realistic sensor values
                28 + random.uniform(-1, 1),
                65 + random.uniform(-2, 2),
                100 + random.uniform(-10, 10),
                5 + random.uniform(-1, 1),
            )
        )

    connection.commit()
    cursor.close()
    connection.close()

    print("Inserted 24 test aggregate rows.")