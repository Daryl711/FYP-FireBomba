const supabase = require("../config/supabase");

class SensorAggregate {
  static async getLatestByRoom(roomId, limit = 10) {
    const safeLimit = Math.max(
      1,
      Math.min(100, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 10),
    );

    const { data, error } = await supabase
      .from("sensor_aggregates")
      .select(
        "aggregate_id, room_id, window_start, window_end, avg_temperature, avg_humidity, avg_smoke, avg_co, created_at",
      )
      .eq("room_id", roomId)
      .order("window_end", { ascending: false })
      .limit(safeLimit);

    if (error) {
      throw error;
    }

    return data;
  }
}

module.exports = SensorAggregate;
