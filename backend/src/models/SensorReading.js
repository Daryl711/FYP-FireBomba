const supabase = require("../config/supabase");

// exports.getLatestReading = async () => {
//   const sql = "SELECT * FROM SensorReadings ORDER BY timestamp DESC LIMIT 1";
//   const [result] = await db.query(sql);

//   const roomId = result[0].room_id;
//   const flame = result[0].flame_detected;
//   const temperature = result[0].temperature;
//   const humidity = result[0].humidity;
//   const smoke = result[0].smoke;
//   const co = result[0].co;

//   return {
//     roomId,
//     flame,
//     temperature,
//     humidity,
//     smoke,
//     co,
//   };
// };

// Bulk insert for the Pi sync. Rows already stored (same room, Pi id and
// timestamp, i.e. a retried batch) are skipped, and only newly inserted rows
// come back, so callers never re-publish or re-alert on a retry.
// Needs sql/migrations/002_sensor_readings_pi_reading_id.sql.
exports.insertSensorReadings = async (rows) => {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from("sensor_readings")
    .upsert(rows, {
      onConflict: "room_id,pi_reading_id,timestamp",
      ignoreDuplicates: true,
    })
    .select(
      "reading_id, pi_reading_id, room_id, timestamp, flame_detected, temperature, humidity, smoke, co",
    );

  if (error) {
    console.error("Error bulk inserting sensor readings:", error);
    throw error;
  }

  return data || [];
};

// Which of these room ids exist. A reading for a missing room would fail the
// foreign key and take the whole batch down with it.
exports.getExistingRoomIds = async (roomIds) => {
  if (roomIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("rooms")
    .select("room_id")
    .in("room_id", roomIds);

  if (error) throw error;
  return new Set((data || []).map((row) => row.room_id));
};

exports.getRoomTemperature = async (roomId) => {
  const { data, error } = await supabase
    .from("sensor_readings")
    .select("temperature")
    .eq("room_id", roomId)
    .order("timestamp", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.temperature ?? null;
};

exports.getLatestSensorReading = async (roomId) => {
  const { data, error } = await supabase
    .from("sensor_readings")
    .select(
      `
            reading_id,
            room_id,
            timestamp,
            flame_detected,
            temperature,
            humidity,
            smoke,
            co,
            created_at
        `,
    )
    .eq("room_id", roomId)
    .order("timestamp", { ascending: false })
    .order("created_at", { ascending: false })
    .order("reading_id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error retrieving latest sensor reading:", error);
    throw error;
  }

  return data;
};

exports.getRecentSensorReadings = async (roomId, limit = 10) => {
  const { data, error } = await supabase
    .from("sensor_readings")
    .select(
      `
            reading_id,
            room_id,
            timestamp,
            flame_detected,
            temperature,
            humidity,
            smoke,
            co,
            created_at
        `,
    )
    .eq("room_id", roomId)
    .order("timestamp", { ascending: false })
    .order("created_at", { ascending: false })
    .order("reading_id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error retrieving recent sensor readings:", error);
    throw error;
  }

  return (data || []).reverse();
};
