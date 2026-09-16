#include <DHT.h>
#include <Servo.h>

// Define Sensor and Actuator PIN
#define LED 13
#define BUZZER 12
#define FLAME_PIN 7
#define DHT_PIN 4
#define DHT_TYPE DHT11
#define MQ2_PIN A0
#define MQ7_PIN A1
#define RELAY1_PIN 8

DHT dht(DHT_PIN, DHT_TYPE); // Define DHT version 
Servo flameServo;
Servo pumpServo;

int flameValue; // Define integer variable for flame
float tempValue, humidValue; // Define float variable for temperature and humidity
float smokePPM, coPPM; // Define float variable for PPM measurement of smoke and carbon monoxide(CO)
int flameDetected; // Define boolean variable for flame detected

#define RL 10.0 // Load resistor on module ≈10k ohm

float R0_MQ2 = 10;
float R0_MQ7 = 10;

bool fireAlarmActive = false;
bool waterPumpActive = false;
bool fireAlertSent = false; // prevent alert notification send spam
bool alertNotificationTrigger = false;
bool waterPumpPrevActive = false;
bool manualControl = false;

unsigned long sirenTimer = 0;
int sirenFreq = 700;
bool sirenGoingUp = true;
int sirenCycleCount = 0; // how many sweeps finished
bool sirenRunning = false; // playing or paused
unsigned long sirenPauseTimer = 0;

int servoAngle = 0; // Initialise default servo angle
int servoDirection = 5; // Set the rotate angle as 5 degree
unsigned long previousServoTime = 0;
const unsigned long rotateSpeed = 3;  // 10 ms

// Function for get voltage from MQ sensor
float getVoltage(int adcValue)
{
  return adcValue * (5.0 / 1023.0);
}

// Function for get the MQ Sensor Resistance (Rs)
float getRS(int adcValue)
{
  float voltage = getVoltage(adcValue);
  float RS = RL * (5.0 - voltage) / voltage;
  return RS;
}

// Function for calibrate MQ sensor
void calibrateMQSensors()
{
  Serial.println("=================================");
  Serial.println("MQ SENSOR CALIBRATION START");
  Serial.println("Keep air CLEAN (no smoke!)");
  Serial.println("Calibrating in 20 seconds...");
  Serial.println("=================================");

  delay(20000);

  float rs_mq2 = 0;
  float rs_mq7 = 0;

  for(int i = 0; i < 50; i++)
  {
    rs_mq2 += getRS(analogRead(MQ2_PIN));
    rs_mq7 += getRS(analogRead(MQ7_PIN));
    delay(200);
  }

  rs_mq2 = rs_mq2 / 50.0;
  rs_mq7 = rs_mq7 / 50.0;

  R0_MQ2 = rs_mq2 / 9.83;
  R0_MQ7 = rs_mq7 / 27.0;

  Serial.println("Calibration DONE!");
  Serial.print("R0_MQ2 = ");
  Serial.println(R0_MQ2);

  Serial.print("R0_MQ7 = ");
  Serial.println(R0_MQ7);

  Serial.println("SAVE THESE VALUES!!");
  Serial.println("=================================");
}

// Smoke PPM Measurement Convert
float getSmokePPM()
{
  float RS = getRS(analogRead(MQ2_PIN));
  float ratio = RS / R0_MQ2;

  float ppm = 116.6020682 * pow(ratio, -2.769034857);
  return ppm;
}

// CO PPM Measurement Convert
float getCOPPM()
{
  float RS = getRS(analogRead(MQ7_PIN));
  float ratio = RS / R0_MQ7;

  float ppm = 99.042 * pow(ratio, -1.518);
  return ppm;
}

int checkFlame(int flame){
  if(flame == 1){
    return 0;
  }else{
    return 1;
  }
}

// Function for check whether the thresholds for each sensor be trigger or not
void checkFireCondition(){
  if(((flameValue == 0 || smokePPM >= 1000) && tempValue >= 55) || coPPM > 50){
    fireAlarmActive = true;
    waterPumpActive = true;
  }else{
    fireAlarmActive = false;
    waterPumpActive = false;
  }
}

// Function to retrieve alert notification messages
String checkAlert()
{
  int dangerCount = 0;
  String message = "";

  // Flame detection
  if (flameValue == 0)
  {
    message += "FlameAlert: ";
    message += "Flame detected, ";
    dangerCount++;
  }

  // High temperature
  if (tempValue >= 55)
  {
    message += "TemperatureAlert: ";
    message += "Abnormal temperature, ";
    dangerCount++;
  }

  // Smoke
  if (smokePPM >= 1000)
  {
    message += "SmokeAlert: ";
    message += "High smoke concentration, ";
    dangerCount++;
  }

  // CO gas
  if (coPPM >= 50)
  {
    message += "COAlert: ";
    message += "High carbon monoxide concentration, ";
    dangerCount++;
  }

  // Fire confirmation rule
  if (dangerCount > 0)
  {
    return "Alert Notification: " + message + "\n";
  }

  return ""; // no fire yet
}

void handleAlertNotification()
{
  String alertMsg = checkAlert();

  if (alertMsg != ""){
    alertNotificationTrigger = true;

    if(!fireAlertSent){
      Serial.print(alertMsg);
      fireAlertSent = true; // lock notification
    }
  }else{
    if(alertNotificationTrigger){
      Serial.println("Fire cleared. Reset alert flag");
      fireAlertSent = false; // unlock for next notification
      alertNotificationTrigger = false;
    }
  }
}

// Function for active the fire alarm system
void activeFireAlarm()
{
  static bool restartGap = false;
  static unsigned long gapTimer = 0;

  if(!fireAlarmActive)
  {
    digitalWrite(LED, LOW);
    noTone(BUZZER);
    sirenFreq = 700;
    sirenGoingUp = true;
    restartGap = false;
    return;
  }

  digitalWrite(LED, HIGH);

  // small restart gap like original loop()
  if(restartGap)
  {
    if(millis() - gapTimer < 40) return; // tiny silence
    restartGap = false;
  }

  if(millis() - sirenTimer < 8) return;
  sirenTimer = millis();

  tone(BUZZER, sirenFreq);

  if(sirenGoingUp)
  {
    sirenFreq += 10;
    if(sirenFreq > 1500)
      sirenGoingUp = false;
  }
  else
  {
    sirenFreq -= 10;
    if(sirenFreq < 700)
    {
      sirenGoingUp = true;
      restartGap = true;      // simulate loop() restart
      gapTimer = millis();
    }
  }
}

// Function for active the water pump system
void activeWaterPump(){
  if(waterPumpActive){
    digitalWrite(RELAY1_PIN, LOW);
  }else{
    digitalWrite(RELAY1_PIN, HIGH);
  }

  // Send messages only when pump status changes
  if(waterPumpActive != waterPumpPrevActive){
    if(waterPumpActive){
      Serial.println("WaterPump:ON");
    }else{
      Serial.println("WaterPump:OFF");
    }
  }

  waterPumpPrevActive = waterPumpActive;
}

// Function for read the manual control water pump signal
String getValue(String data, String key) {
  int start = data.indexOf(key);
  if (start == -1) return "";

  start += key.length();
  int end = data.indexOf(",", start);
  if (end == -1) end = data.length();

  return data.substring(start, end);
}

// Function for manual active the water pump through Serial Messages for subscribed topic
void manualControlWaterPump()
{
  if(Serial.available())
  {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    String manualActive = getValue(command, "Pump:");

    if(manualActive == "ON")
    {
        manualControl = true;
        waterPumpActive = true;

        Serial.println("Manual Pump ON");
    }
    else if(manualActive == "OFF")
    {
        manualControl = false;
        waterPumpActive = false;

        Serial.println("Back to AUTO mode");
    }
  }
}

// Function for control the servo motor rotate
void servoControl(unsigned long currentTime){
  if(flameValue == 0)
  {
    flameServo.write(servoAngle);
    pumpServo.write(servoAngle);
  }
  else
  {
    pumpServo.write(0); // return to default angle

    if (currentTime - previousServoTime >= rotateSpeed)
    {
      previousServoTime = currentTime;
      servoAngle += servoDirection;

      // Reach 150°
      if (servoAngle >= 150)
      {
          servoAngle = 150;
          servoDirection = -5;
      }

      // Reach 0°
      if (servoAngle <= 0)
      {
          servoAngle = 0;
          servoDirection = 5;
      }
    
      flameServo.write(servoAngle);
    }
  }
}

// Function to display the sensor readings from flame, DHT22, MQ7 and MQ2 sensor
void displaySensorReadings(bool flame, int temp, int humid, float smoke, float co){
  // Format for transmit to ESP32
  Serial.print("Room:1");
  Serial.print(", ");

  Serial.print("Flame:");
  Serial.print(flame);
  Serial.print(", ");

  Serial.print("Temp:");
  Serial.print(temp);
  Serial.print(", ");

  Serial.print("Humid:");
  Serial.print(humid);
  Serial.print(", ");

  Serial.print("Smoke:");
  Serial.print(smoke);
  Serial.print(", ");

  Serial.print("CO:");
  Serial.println(co);
}

void setup() {
  Serial.begin(9600);
  dht.begin();

  // Pin Mode setup for the sensor and actuator
  pinMode(LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(FLAME_PIN, INPUT);
  pinMode(MQ2_PIN, INPUT);
  pinMode(MQ7_PIN, INPUT);
  pinMode(RELAY1_PIN, OUTPUT);
  flameServo.attach(9);
  pumpServo.attach(10);

  // Set default relay as off
  digitalWrite(RELAY1_PIN, HIGH); // OFF relay

  // Set default motor angle
  flameServo.write(servoAngle);
  pumpServo.write(servoAngle);

  // Calibrate the MQ sensors once when the power up
  calibrateMQSensors();
}

void loop() {
  // Initialise the run time for servo motor
  unsigned long runTime = millis();

  // Read digital data pin value from flame and DHT11 sensor
  flameValue = digitalRead(FLAME_PIN);
  tempValue = dht.readTemperature();
  humidValue = dht.readHumidity();
  
  // Convert smoke and CO analog value to PPM
  smokePPM = getSmokePPM();
  coPPM = getCOPPM();
  flameDetected = checkFlame(flameValue); // Convert flame digital output 1 to false, 0 to true

  // Check manual command
  manualControlWaterPump();
  
  if(!manualControl){
    checkFireCondition();
  }

  activeWaterPump();

  servoControl(runTime);
  activeFireAlarm();
  handleAlertNotification();
  
  displaySensorReadings(flameDetected, tempValue, humidValue, smokePPM, coPPM);
}

