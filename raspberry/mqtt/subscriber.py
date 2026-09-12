import json
import paho.mqtt.client as mqtt
from raspberry.mqtt.insert_sensor_reading import get_room_id, insert_sensor_reading

MQTT_TOPIC = "firebomba/#"
MQTT_BROKER = "localhost"
MQTT_PORT = "1883"


def on_connect(client, userdata, flags, rc):

    if rc == 0:
        print("Connected to MQTT broker")

        client.subscribe(MQTT_TOPIC)

        print(f"Subscribed to: {MQTT_TOPIC}")

    else:
        print(f"MQTT connection failed: {rc}")


def on_message(client, userdata, msg):

    print("\nMQTT message received")

    try:
        # Convert bytes → string → JSON
        payload = msg.payload.decode()

        data = json.loads(payload)

        print("Payload:", data)

        # --------------------------------
        # 1. Get device ID
        # --------------------------------

        device_id = data.get("device_id")

        if not device_id:
            print("ERROR: device_id missing")
            return

        print("Device:", device_id)

        # --------------------------------
        # 2. Find room
        # --------------------------------

        room_id = get_room_id(device_id)

        if room_id is None:
            print(f"ERROR: Unknown device: {device_id}")
            return

        print("Room ID:", room_id)

        # --------------------------------
        # 3. Get sensor values
        # --------------------------------

        flame_detected = data.get("flame_detected")
        temperature = data.get("temperature")
        humidity = data.get("humidity")
        smoke = data.get("smoke")
        co = data.get("co")

        # --------------------------------
        # 4. Store reading
        # --------------------------------

        insert_sensor_reading(
            room_id,
            flame_detected,
            temperature,
            humidity,
            smoke,
            co
        )

        print("Sensor reading stored successfully")


    except json.JSONDecodeError as e:
      print("ERROR: Invalid JSON payload")
      print("JSON error:", e)
      print("Raw payload:", repr(msg.payload))


    except Exception as e:

        print("ERROR:", e)


client = mqtt.Client()

client.on_connect = on_connect
client.on_message = on_message

client.connect(
    MQTT_BROKER,
    MQTT_PORT,
    60
)

print("Waiting for MQTT messages...")

client.loop_forever()