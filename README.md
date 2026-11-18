# Fire Detection and Early Warning for Sarawak Longhouse

## To run this project, please do the following instructions:
```git init```

```git clone https://github.com/Daryl711/FYP-FireBomba```

Locate to the directory that contains the repository that you have downloaded.

### Reminder:
please do ```git pull``` everytimes before you start to develop.

## Deployment: where each part runs

| Part | Folder | Runs on |
|---|---|---|
| Backend API, cloud MQTT subscriber, alerts | `backend/` | **AWS EC2 server** |
| MQTT bridge, local Mosquitto broker, anomaly detector, risk engine, camera (YOLO) service, local MySQL, sync worker | `raspberry/` | **Raspberry Pi** |
| Arduino Uno and ESP32-S3 sketches | `arduino_script/` | Flashed to the boards |
| Mobile app | `frontend/` | Developer laptop through Expo Go for now. It will be built as an **Android APK** |
| Database and auth | (hosted) | Supabase |
| Pi-to-backend MQTT | (hosted) | AWS IoT Core |

The laptop runs only the frontend. It does not run the backend, a broker or any `raspberry/` script.
Run Pi scripts, such as `python -m mqtt.mqtt` and the risk-detection test tools, on the Pi itself (for example over SSH).
The local MQTT broker (port `1883`) that the ESP32 and the bridge use is on the Pi.
See [ARCHITECTURE_FLOW.md](ARCHITECTURE_FLOW.md) for the data flow between them.


### Frontend:
#### Prerequisite: 
Must download EXPO GO in your phone.

```cd frontend```

Install dependencies:

```npm install```

**❗IMPORTANT:** 
Please create an .env file that contains the following:

```EXPO_PUBLIC_API_URL=[EC2 backend URL]```

Point this at the backend deployed on EC2. Use `http://[your_ip_address]:3000` only when you run the backend on your laptop for local development. In that case, the laptop must be on the same network as your phone.

When the app is built as an APK, the backend URL is fixed at build time from this variable. Set it to the EC2 URL before building.

#### To run:
```npm run start```

Then scan the QR code using EXPO GO that is shown in the terminal.


### Backend:
> The live backend is deployed on the **EC2 server**. The steps below are only for running a copy on your own laptop for development.

#### Prerequiste:
Must download XAMPP in your laptop.

#### Steps to Setup Database in localhost:
1. Start Apache and MySQL in the XAMPP
2. Open the admin page by using localhost/phpmyadmin
3. Go to the IMPORT tab, and import the sql file that is contained in backend > sql > database.sql.

Then navigate to your backend using:

```cd backend```

Install dependencies:

```npm install```

**❗IMPORTANT:** 
Please create an .env file that contains the following:

```JWT_SECRET = [some random string]```

```JWT_EXPIRES_IN = 15m```

Then run by using:

```npm run start```

## MQTT Connection Setup

These brokers run on the **Raspberry Pi**, not on the laptop or EC2.

Temporarily, there are two MQTT brokers configured:
- Cloud broker: stored in `/var/lib/mosquitto/cloud`
- Local broker: stored in `/var/lib/mosquitto/local`

To start both brokers, run the following commands:

```bash
sudo mosquitto -c /etc/mosquitto/local-broker.conf -v
sudo mosquitto -c /etc/mosquitto/cloud-broker.conf -v
```

Broker ports:
- Local broker: `1883`
- Cloud broker: `1884`

## Testing:
To test the alert, please run the following command:

```cd testing```

```node simulate.js --login [your_registered_email] [your_password] [EC2 backend URL]```

Without the URL, the script uses `http://localhost:3000`, which only works when the backend runs on your laptop.

To simulate a critical fire through MQTT and sound the buzzer and LED, run `python -m risk_detection.simulate_critical_fire` **on the Raspberry Pi**. See [raspberry/risk_detection/README.md](raspberry/risk_detection/README.md#simulating-a-critical-fire).

