import os
import sys
import requests
import time
from pathlib import Path
from threading import Lock
from dotenv import load_dotenv
from database.conn import get_pooled_connection

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# This Pi's sync credentials, from raspberry/.env. Created on the backend with
# `npm run sync-device -- PI001 1-4`; the backend only accepts readings for
# the rooms registered to this device.
DEVICE_ID = os.getenv("SYNC_DEVICE_ID")
DEVICE_KEY = os.getenv("SYNC_DEVICE_KEY")


PC_API_BASE = "https://firebomba-mobile-backend.duckdns.org/api/sync"  # Change IP address whenever necessary...
PC_API = f"{PC_API_BASE}/insert-sensor-readings/bulk"
AGGREGATE_API = f"{PC_API_BASE}/insert-sensor-aggregates"
AGGREGATE_RETRY_INTERVAL_SECONDS = 120
aggregate_sync_lock = Lock()

BATCH_SIZE = 50
SYNC_INTERVAL_SECONDS = 10
MAX_BACKOFF_SECONDS = 60
REQUEST_TIMEOUT_SECONDS = 5
# A rejected key will not fix itself; retry slowly until someone updates .env.
AUTH_RETRY_SECONDS = 300

# One session per process start: keeps the HTTPS connection to the backend
# alive between requests instead of a new TCP + TLS handshake per reading.
# requests.Session is not guaranteed thread-safe; every user here is
# serialised (sync() runs in the main loop only, sync_aggregates holds a lock).
SESSION = requests.Session()
# Not raised at import: mqtt.py imports this module, and a missing sync key
# must never stop local sensor storage or the alarm.
if DEVICE_ID and DEVICE_KEY:
    SESSION.headers.update({
        "X-Device-Id": DEVICE_ID,
        "Authorization": f"Bearer {DEVICE_KEY}",
    })


class BackendUnavailable(Exception):
    """The backend could not be reached or answered 5xx; retry later."""


class DeviceUnauthorized(Exception):
    """Credentials missing or refused (401). Nothing is marked FAILED: the
    data is fine, the key is not, so it all syncs once .env is fixed."""


def require_credentials():
    if not (DEVICE_ID and DEVICE_KEY):
        raise DeviceUnauthorized(
            "SYNC_DEVICE_ID / SYNC_DEVICE_KEY missing from raspberry/.env"
        )


def unauthorized_message():
    return (
        f"backend refused device {DEVICE_ID} (401): check SYNC_DEVICE_ID and "
        f"SYNC_DEVICE_KEY in raspberry/.env, or re-create the key with "
        f"`npm run sync-device` on the backend"
    )


def get_unsynced_readings(limit=BATCH_SIZE):
    connection = get_pooled_connection()
    cursor = connection.cursor(dictionary=True)

    # PENDING first so a few readings the backend keeps rejecting cannot
    # block newer readings from ever reaching the front of the queue.
    cursor.execute("""
        SELECT *
        FROM SensorReadings
        WHERE cloud_sync_status IN ('PENDING', 'FAILED')
        ORDER BY cloud_sync_status = 'FAILED', reading_id
        LIMIT %s
    """, (limit,))

    readings = cursor.fetchall()

    cursor.close()
    connection.close()

    return readings


def set_readings_status(reading_ids, status):
    if not reading_ids:
        return

    connection = get_pooled_connection()
    cursor = connection.cursor()

    placeholders = ", ".join(["%s"] * len(reading_ids))
    cursor.execute(
        f"""
        UPDATE SensorReadings
        SET cloud_sync_status = %s
        WHERE reading_id IN ({placeholders})
        """,
        (status, *reading_ids),
    )

    connection.commit()

    cursor.close()
    connection.close()


READING_FIELDS = (
    "reading_id",
    "room_id",
    "reading_timestamp",
    "flame_detected",
    "temperature",
    "humidity",
    "smoke",
    "co",
)


def to_payload(reading):
    payload = {key: reading.get(key) for key in READING_FIELDS}
    if payload["reading_timestamp"] is not None:
        payload["reading_timestamp"] = payload["reading_timestamp"].isoformat()
    return payload


def sync():
    """Send one batch of up to BATCH_SIZE readings in a single request.

    Returns True when the batch was full, meaning more readings are likely
    waiting and the caller should run again straight away.
    Raises BackendUnavailable when the backend is down so the caller backs off,
    and DeviceUnauthorized when this Pi's key is missing or refused.

    Resending a batch is safe: the backend skips readings it already stored
    (matched on room, Pi reading_id and timestamp) and reports them as synced.
    """
    require_credentials()
    readings = get_unsynced_readings()

    if not readings:
        print("No readings to sync.", flush=True)
        return False

    batch_ids = [reading["reading_id"] for reading in readings]

    try:
        response = SESSION.post(
            PC_API,
            json={"readings": [to_payload(reading) for reading in readings]},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as e:
        # Statuses stay as they are; the whole batch is retried after backoff.
        raise BackendUnavailable(f"connection failed: {e}") from e

    if response.status_code >= 500:
        raise BackendUnavailable(f"backend returned {response.status_code}")

    if response.status_code == 401:
        raise DeviceUnauthorized(unauthorized_message())

    if response.status_code != 200:
        # The backend refused the request as a whole (e.g. a malformed body).
        set_readings_status(batch_ids, "FAILED")
        print(
            f"Batch of {len(batch_ids)} rejected: "
            f"{response.status_code} {response.text[:200]}",
            flush=True,
        )
        return False

    result = response.json()
    synced_ids = result.get("synced", [])
    rejected = result.get("rejected", [])
    rejected_ids = [item.get("reading_id") for item in rejected]

    set_readings_status(synced_ids, "SYNCED")
    set_readings_status([i for i in rejected_ids if i is not None], "FAILED")

    if synced_ids:
        print(
            f"Synced {len(synced_ids)} reading(s) "
            f"({min(synced_ids)}..{max(synced_ids)})",
            flush=True,
        )
    for item in rejected:
        print(
            f"Rejected reading {item.get('reading_id')}: {item.get('error')}",
            flush=True,
        )

    return len(readings) == BATCH_SIZE


def get_unsynced_aggregates():
    connection = get_pooled_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            aggregate_id,
            room_id,
            window_start,
            window_end,
            avg_temperature,
            avg_smoke,
            avg_co,
            avg_humidity
        FROM SensorAggregates
        WHERE cloud_sync_status IN ('PENDING', 'FAILED')
          AND (
              cloud_sync_attempted_at IS NULL
              OR cloud_sync_attempted_at <= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
          )
        ORDER BY aggregate_id
    """)
    aggregates = cursor.fetchall()
    cursor.close()
    connection.close()
    return aggregates


def mark_aggregate_attempted(aggregate_id):
    connection = get_pooled_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE SensorAggregates
        SET cloud_sync_attempted_at = NOW()
        WHERE aggregate_id = %s
          AND cloud_sync_status IN ('PENDING', 'FAILED')
    """, (aggregate_id,))

    connection.commit()
    cursor.close()
    connection.close()


def update_aggregate_sync_status(aggregate_id, status):
    connection = get_pooled_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE SensorAggregates
        SET cloud_sync_status = %s,
            cloud_synced_at = CASE
                WHEN %s = 'SYNCED' THEN NOW()
                ELSE cloud_synced_at
            END
        WHERE aggregate_id = %s
    """, (status, status, aggregate_id))

    connection.commit()
    cursor.close()
    connection.close()


def sync_aggregates():
    if not (DEVICE_ID and DEVICE_KEY):
        print("Skipping aggregate sync: SYNC_DEVICE_ID / SYNC_DEVICE_KEY "
              "missing from raspberry/.env", flush=True)
        return

    aggregate_sync_lock.acquire()
    try:
        aggregates = get_unsynced_aggregates()
        for aggregate in aggregates:
            aggregate_id = aggregate["aggregate_id"]
            mark_aggregate_attempted(aggregate_id)

            payload = {
                key: value.isoformat() if hasattr(value, "isoformat") else value
                for key, value in aggregate.items()
                if key != "aggregate_id"
            }

            try:
                response = SESSION.post(
                    AGGREGATE_API,
                    json=payload,
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
                if response.status_code == 200:
                    update_aggregate_sync_status(aggregate_id, "SYNCED")
                    print(f"Synced aggregate {aggregate_id}", flush=True)
                elif response.status_code == 401:
                    # Every remaining aggregate would be refused too. Status
                    # is left as is; the retry interval picks them up.
                    print(unauthorized_message(), flush=True)
                    break
                else:
                    # Includes 403: a room not registered to this device.
                    update_aggregate_sync_status(aggregate_id, "FAILED")
                    print(
                        f"Failed aggregate {aggregate_id}: "
                        f"{response.status_code} {response.text[:200]}",
                        flush=True,
                    )
            except requests.RequestException as error:
                update_aggregate_sync_status(aggregate_id, "FAILED")
                print(
                    f"Connection failed for aggregate {aggregate_id}: {error}",
                    flush=True,
                )
                # Backend unreachable: don't wait out the timeout for each
                # remaining aggregate; the retry interval picks them up.
                break
    finally:
        aggregate_sync_lock.release()


def next_backoff(consecutive_failures):
    # 10s, 20s, 40s, then capped at 60s.
    return min(
        SYNC_INTERVAL_SECONDS * (2 ** (consecutive_failures - 1)),
        MAX_BACKOFF_SECONDS,
    )


if __name__ == "__main__":

    if not (DEVICE_ID and DEVICE_KEY):
        sys.exit(
            "SYNC_DEVICE_ID and SYNC_DEVICE_KEY must be set in raspberry/.env "
            "(create them with `npm run sync-device -- PI001 1-4` on the backend)."
        )

    print(f"Sync service started as device {DEVICE_ID}.", flush=True)

    consecutive_failures = 0

    while True:

        try:
            more_waiting = sync()
            consecutive_failures = 0

            if more_waiting:
                # Backlog: drain the next batch immediately.
                continue

            delay = SYNC_INTERVAL_SECONDS

        except DeviceUnauthorized as e:
            delay = AUTH_RETRY_SECONDS
            print(f"SYNC AUTH ERROR, retrying in {delay}s: {e}", flush=True)

        except Exception as e:
            consecutive_failures += 1
            delay = next_backoff(consecutive_failures)
            print(
                f"Sync error ({consecutive_failures} in a row), "
                f"retrying in {delay}s: {e}",
                flush=True,
            )

        time.sleep(delay)
