from database.conn import get_database_connection


def ensure_aggregate_sync_columns():
    connection = get_database_connection()
    cursor = connection.cursor()

    try:
        cursor.execute("SHOW COLUMNS FROM SensorAggregates")
        existing_columns = {column[0] for column in cursor.fetchall()}
        missing_columns = {
            "cloud_sync_status": (
                "ENUM('PENDING', 'SYNCED', 'FAILED') DEFAULT 'PENDING'"
            ),
            "cloud_synced_at": "DATETIME NULL",
            "cloud_sync_attempted_at": "DATETIME NULL",
        }

        for column_name, definition in missing_columns.items():
            if column_name not in existing_columns:
                cursor.execute(
                    f"ALTER TABLE SensorAggregates "
                    f"ADD COLUMN {column_name} {definition}"
                )

        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def get_room_id(device_id):

    connection = get_database_connection()

    cursor = connection.cursor()



    query = """

        SELECT room_id

        FROM Rooms

        WHERE device_id = %s

    """



    cursor.execute(query, (device_id,))



    result = cursor.fetchone()



    cursor.close()
    connection.close()

    if result:
        return result[0]

    return None


def aggregate_sensor_readings():
    connection = get_database_connection()
    cursor = connection.cursor()

    query = """
        INSERT IGNORE INTO SensorAggregates (
            room_id,
            window_start,
            window_end,
            avg_temperature,
            avg_smoke,
            avg_co,
            avg_humidity
        )
        SELECT
            grouped.room_id,
            grouped.window_start,
            grouped.window_end,
            grouped.avg_temperature,
            grouped.avg_smoke,
            grouped.avg_co,
            grouped.avg_humidity
        FROM (
            SELECT
                readings.room_id,
                FROM_UNIXTIME(
                    FLOOR(UNIX_TIMESTAMP(readings.reading_timestamp) / 300) * 300
                ) AS window_start,
                DATE_ADD(
                    FROM_UNIXTIME(
                        FLOOR(UNIX_TIMESTAMP(readings.reading_timestamp) / 300) * 300
                    ),
                    INTERVAL 5 MINUTE
                ) AS window_end,
                AVG(readings.temperature) AS avg_temperature,
                AVG(readings.smoke) AS avg_smoke,
                AVG(readings.co) AS avg_co,
                AVG(readings.humidity) AS avg_humidity
            FROM SensorReadings AS readings
            WHERE readings.reading_timestamp < FROM_UNIXTIME(
                FLOOR(UNIX_TIMESTAMP(NOW()) / 300) * 300
            )
            GROUP BY
                readings.room_id,
                FLOOR(UNIX_TIMESTAMP(readings.reading_timestamp) / 300)
        ) AS grouped
        WHERE NOT EXISTS (
            SELECT 1
            FROM SensorAggregates AS existing
            WHERE existing.room_id = grouped.room_id
              AND grouped.window_start < existing.window_end
              AND grouped.window_end > existing.window_start
        )
    """

    try:
        cursor.execute(query)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def insert_sensor_reading(

    room_id,

    flame_detected,

    temperature,

    humidity,

    smoke,

    co

):

    connection = get_database_connection()

    cursor = connection.cursor()



    query = """

        INSERT INTO SensorReadings (

            room_id,

            flame_detected,

            temperature,

            humidity,

            smoke,

            co

        )

        VALUES (%s, %s, %s, %s, %s, %s)

    """



    values = (

        room_id,

        flame_detected,

        temperature,

        humidity,

        smoke,

        co

    )



    cursor.execute(query, values)



    connection.commit()



    cursor.close()

    connection.close()