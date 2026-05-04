#include <WiFi.h>
#include <PubSubClient.h>
#include <esp_log.h>

// Define RX and TX PIN
#define RXD2 44
#define TXD2 43

// WiFi Setup
const char* ssid = "";
const char* password = "";

// Mosquitto Setup
const char* mqtt_server = "192.168.16.219"; // need to change based on your ip address
const char* mqtt_user = "room1";
const char* mqtt_pass = "BombaRoom1";

WiFiClient esps3Client;
PubSubClient client(esps3Client);

void connectMosquittoMQTT(){
  Serial.println("Connecting to MQTT...");
  client.setBufferSize(512);
  client.setServer(mqtt_server, 8883);

  int attempts = 0;

  while(!client.connected() && attempts < 10){
    Serial.print("Connecting to Mosquitto...");
    
    if(client.connect("ESP32S3Client", mqtt_user, mqtt_pass)){
      Serial.println("MQTT CONNECTED!");
    }else{
      Serial.print("\nFAILED, rc= ");

      if(client.state() == -2){
        Serial.println("MQTT_CONNECT_FAILED, Network failed.");

      }else if(client.state() == -4){
        Serial.println("MQTT_CONNECTED_TIMEOUT, Broker didn't respond.");

      }else{
        Serial.println(client.state());
      }

      delay(2000);
      attempts++;
    }
  }
  Serial.println("MQTT connection failed, Will retry in loop.");
}

void connectWifi(){
  Serial.println();
  Serial.println("Starting WiFi Connection...");

  WiFi.begin(ssid, password);
  int wifi_attempts = 0;

  while(WiFi.status() != WL_CONNECTED){
    delay(500);
    Serial.print(".");
    wifi_attempts++;

    if(wifi_attempts > 20){
      Serial.println("\nConnection Failed!!!");
      break;
    }
  }

  if(WiFi.status() == WL_CONNECTED){
    Serial.println("\nWiFi Connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    connectMosquittoMQTT();
  }
}

// Publish timing setup 5 seconds per time publish
unsigned long lastPublishTime = 0;
const unsigned long publishInterval = 5000;  // 5 seconds

// Define variables to store the publish messages
String serialData = "";
String sensorPayload = "";
String alertPayload = "";
String lastAlertSent = "";
bool alertActive = false;

void setup() {
  Serial.begin(115200);
  esp_log_level_set("*", ESP_LOG_NONE);
  delay(3000);

  Serial.println("ESP32S3 Booting...");
  Serial.println("build: " __DATE__ " " __TIME__);
  Serial.println("--------------------------------");

  connectWifi();

  Serial2.begin(9600, SERIAL_8N1, RXD2, TXD2);
  Serial.println("Waiting Arduino data...");
}

void loop() {
  // Reconnect WIFI if lost connection
  if(WiFi.status() != WL_CONNECTED){
    Serial.println("WiFi lost connection. Reconnecting...");
    connectWifi();
    return; // stop loop until WiFi connected
  }

  // Reconnect Mosquitto MQTT
  if(!client.connected()){
    connectMosquittoMQTT();
  }
  client.loop();

  // Read Serial data only
  while (Serial2.available()) {
    char c = Serial2.read();

    if (c == '\n') {
      Serial.println("Data from Arduino:");
      Serial.println(serialData);

      // Parse sensor values
      String flame  = getValue(serialData, "Flame:");
      String temp   = getValue(serialData, "Temp:");
      String humid  = getValue(serialData, "Humid:");
      String smoke  = getValue(serialData, "Smoke:");
      String co     = getValue(serialData, "CO:");

      // Build JSON store sensor readings
      sensorPayload = "{";
      sensorPayload += "\"room_id\":\"1\",";
      sensorPayload += "\"flame\":\"" + flame + "\",";
      sensorPayload += "\"temperature\":" + temp + ",";
      sensorPayload += "\"humidity\":" + humid + ",";
      sensorPayload += "\"smoke\":" + smoke + ",";
      sensorPayload += "\"co\":" + co;
      sensorPayload += "}";

      // Parse alert messages
      String flameAlert = getValue(serialData, "FlameAlert:");
      String temperatureAlert = getValue(serialData, "TemperatureAlert:");
      String smokeAlert = getValue(serialData, "SmokeAlert:");
      String coAlert = getValue(serialData, "COAlert:");

      // Combine all the warning title in an array list
      String alertList = "";

      // Add alerts only if exist
      if (flameAlert != "") {
        if (alertList != "") alertList += ",";
        alertList += "\"" + flameAlert + "\"";
      }

      if (temperatureAlert != "") {
        if (alertList != "") alertList += ",";
        alertList += "\"" + temperatureAlert + "\"";
      }

      if (smokeAlert != "") {
        if (alertList != "") alertList += ",";
        alertList += "\"" + smokeAlert + "\"";
      }

      if (coAlert != "") {
        if (alertList != "") alertList += ",";
        alertList += "\"" + coAlert + "\"";
      }

      // Build JSON store alert notification messages
      if (alertList != "")
      {
        alertPayload = "{";
        alertPayload += "\"room_id\":1,";
        alertPayload += "\"warning_titles\":[" + alertList + "]";
        alertPayload += "}";
      } else {
        alertPayload = "";
      }

      serialData = ""; // clear buffer
    } else {
      serialData += c;
    }
  }

  // Publish every 5 seconds
  unsigned long now = millis();

  if (now - lastPublishTime >= publishInterval && sensorPayload != "") {
    lastPublishTime = now;

    Serial.println("Publishing sensor readings to MQTT:");
    Serial.println(sensorPayload);
    client.publish("home/room-1/sensor-data", sensorPayload.c_str());
  }

  // Only publish when alert is NEW (not same as last one)
  if (alertPayload != "" && alertPayload != lastAlertSent)
  {
    Serial.println("NEW ALERT → Publishing once:");
    Serial.println(alertPayload);

    client.publish("home/room-1/alerts", alertPayload.c_str());

    lastAlertSent = alertPayload;  // remember last sent alert
    alertActive = true;
  }

  // Reset when fire cleared
  if (alertPayload == "" && alertActive)
  {
    Serial.println("Alert cleared");

    lastAlertSent = "";  // allow future alerts again
    alertActive = false;
  }

}

String getValue(String data, String key) {
  int start = data.indexOf(key);
  if (start == -1) return "";

  start += key.length();
  int end = data.indexOf(",", start);
  if (end == -1) end = data.length();

  return data.substring(start, end);
}

