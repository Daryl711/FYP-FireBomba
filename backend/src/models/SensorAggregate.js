const db = require("../config/database");

class SensorAggregate {
  static async getLatestByRoom(roomId, limit = 10) {
    const safeLimit = Number.isFinite(Number(limit)) ? Number(limit) : 10;

    const [rows] = await db.execute(
      `
      SELECT
        aggregate_id,
        room_id,
        window_start,
        window_end,
        avg_temperature,
        avg_humidity,
        avg_smoke,
        avg_co,
        created_at
      FROM sensoraggregates
      WHERE room_id = ?
      ORDER BY window_end DESC
      LIMIT ?
      `,
      [roomId, safeLimit],
    );

    return rows;
  }
}

module.exports = SensorAggregate;
