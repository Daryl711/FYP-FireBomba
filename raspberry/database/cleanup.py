"""Delete old local sensor readings and sensor aggregates.

Only rows already SYNCED to the cloud are deleted. PENDING and FAILED rows
are kept whatever their age, so a long Internet outage never loses data that
has not reached Supabase yet.

Run from the raspberry/ folder:

    python -m database.cleanup                  # readings > 7 days, aggregates > 30 days
    python -m database.cleanup --days 14        # custom reading retention
    python -m database.cleanup --aggregate-days 60
    python -m database.cleanup --dry-run        # only count what would be deleted

Schedule it once a day with cron (crontab -e on the Pi), e.g. 03:15:

    15 3 * * * cd /home/pi/FYP-FireBomba/raspberry && /usr/bin/python3 -m database.cleanup >> /home/pi/cleanup.log 2>&1
"""

import argparse
import time

from database.conn import get_database_connection

DEFAULT_READING_RETENTION_DAYS = 7
DEFAULT_AGGREGATE_RETENTION_DAYS = 30
# Small batches keep each DELETE short, so the MQTT service inserting new
# readings and the sync service updating statuses are never blocked for long.
BATCH_SIZE = 5000
PAUSE_BETWEEN_BATCHES_SECONDS = 0.2

# Timestamps default to the Pi's NOW(), so comparing against NOW() on the
# same server keeps both sides in the same time zone.
READINGS_WHERE = """
    cloud_sync_status = 'SYNCED'
    AND reading_timestamp < NOW() - INTERVAL %s DAY
"""

# aggregate_sensor_readings() rebuilds an aggregate for any window that still
# has readings but no aggregate. Readings that never synced are kept forever,
# so an aggregate is only deleted once its window has no readings left;
# otherwise it would be recreated and synced to the cloud all over again.
AGGREGATES_WHERE = """
    cloud_sync_status = 'SYNCED'
    AND window_end < NOW() - INTERVAL %s DAY
    AND NOT EXISTS (
        SELECT 1
        FROM SensorReadings AS readings
        WHERE readings.room_id = SensorAggregates.room_id
          AND readings.reading_timestamp >= SensorAggregates.window_start
          AND readings.reading_timestamp < SensorAggregates.window_end
    )
"""

TABLES = {
    # table: (where clause, index name, indexed column(s))
    "SensorReadings": (
        READINGS_WHERE,
        "idx_sensor_readings_room_timestamp",
        "room_id, reading_timestamp",
    ),
    "SensorAggregates": (
        AGGREGATES_WHERE,
        "idx_sensor_aggregates_window_end",
        "window_end",
    ),
}


def ensure_index(cursor, table, index_name, columns):
    """Without these indexes every cleanup run scans the whole table."""
    cursor.execute("""
        SELECT COUNT(*)
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name = %s
          AND index_name = %s
    """, (table, index_name))
    if cursor.fetchone()[0] == 0:
        print(f"Creating index {index_name}...", flush=True)
        cursor.execute(f"CREATE INDEX {index_name} ON {table} ({columns})")


def purge(connection, cursor, table, days, dry_run):
    where = TABLES[table][0]

    if dry_run:
        cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE {where}", (days,))
        total = cursor.fetchone()[0]
        print(
            f"[dry run] {total} synced row(s) in {table} older than "
            f"{days} day(s) would be deleted.",
            flush=True,
        )
        return total

    total = 0
    while True:
        cursor.execute(
            f"DELETE FROM {table} WHERE {where} LIMIT %s",
            (days, BATCH_SIZE),
        )
        deleted = cursor.rowcount
        connection.commit()
        total += deleted

        if deleted < BATCH_SIZE:
            break
        time.sleep(PAUSE_BETWEEN_BATCHES_SECONDS)

    print(
        f"Deleted {total} synced row(s) from {table} older than "
        f"{days} day(s).",
        flush=True,
    )
    return total


def run_cleanup(reading_days, aggregate_days, dry_run=False):
    connection = get_database_connection()
    cursor = connection.cursor()

    try:
        for table, (_, index_name, columns) in TABLES.items():
            ensure_index(cursor, table, index_name, columns)

        # Readings first, so more aggregate windows are free of readings.
        purge(connection, cursor, "SensorReadings", reading_days, dry_run)
        purge(connection, cursor, "SensorAggregates", aggregate_days, dry_run)
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_READING_RETENTION_DAYS,
        help="reading retention in days "
             f"(default {DEFAULT_READING_RETENTION_DAYS})",
    )
    parser.add_argument(
        "--aggregate-days",
        type=int,
        default=DEFAULT_AGGREGATE_RETENTION_DAYS,
        help="aggregate retention in days "
             f"(default {DEFAULT_AGGREGATE_RETENTION_DAYS})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="only count the rows that would be deleted",
    )
    args = parser.parse_args()

    if args.days < 1 or args.aggregate_days < 1:
        parser.error("retention must be at least 1 day")

    run_cleanup(args.days, args.aggregate_days, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
