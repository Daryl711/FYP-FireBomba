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

#### Supabase migrations
The live database is Supabase. Schema changes are in `backend/sql/migrations/` and are run by hand in the Supabase SQL editor, in number order:

1. `001_sensor_aggregates_unique_window.sql`
2. `002_sensor_readings_pi_reading_id.sql`: needed by the bulk sensor sync. Without it, the Pi's readings can't be stored.
3. `004_sync_devices.sql`: per-Pi keys for the sync endpoints. Without it (and a registered device), every sync request gets 401.

## Raspberry Pi sync worker

`raspberry/sync/sync.py` sends the Pi's buffered sensor readings to the backend. Run it on the Pi from the `raspberry/` folder:

```python -m sync.sync```

- Every 10 s, it sends up to 50 unsynced readings in one request to `/api/sync/insert-sensor-readings/bulk`.
- If the backend can't be reached, it retries after 10, 20, 40, then at most 60 s.
- It's safe to resend a batch: the backend skips readings it already stored.

#### Device keys
Every `/api/sync` request must carry the Pi's id and key (`X-Device-Id` and `Authorization: Bearer <key>`). Each Pi has its own key and may only sync the rooms registered to it; readings for other rooms are rejected, and other aggregates get 403.

Register a Pi (or give it a new key) on the backend machine, which has the Supabase credentials:

```bash
cd backend
npm run sync-device -- PI001 1-4     # rooms as a range or list, e.g. 1,2,5
```

It prints the key once. Put both lines in `raspberry/.env` on the Pi and restart `sync.sync` and `mqtt.mqtt`:

```
SYNC_DEVICE_ID=PI001
SYNC_DEVICE_KEY=<printed key>
```

Running the command again for the same device replaces the old key at once. To revoke a Pi, set `is_active = false` on its `sync_devices` row. A refused key does not lose data: the Pi logs `SYNC AUTH ERROR`, keeps the readings pending, and retries every 5 min.

**Deploying a change to sync:** update in this order, so the Pi never calls an endpoint the backend doesn't have yet:
1. Run any new Supabase migration.
2. Deploy the backend to EC2.
3. Update the `raspberry/` code on the Pi and restart `sync.sync` and `mqtt.mqtt`.

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

