
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "firebomba/#" # subject to change


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT broker")

        client.subscribe(MQTT_TOPIC)
        print(f"Subscribed to: {MQTT_TOPIC}")

    else:
        print(f"Failed to connect. Return code: {rc}")


def on_message(client, userdata, msg):
    print("\n--- MQTT Message Received ---")
    print(f"Topic: {msg.topic}")
    print(f"Payload: {msg.payload.decode()}")


client = mqtt.Client()

client.on_connect = on_connect
client.on_message = on_message

client.connect(MQTT_BROKER, MQTT_PORT, 60)

print("Waiting for MQTT messages...")

client.loop_forever()