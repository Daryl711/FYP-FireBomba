import mysql.connector
import os
from dotenv import load_dotenv


load_dotenv()


def get_database_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME")
    )


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