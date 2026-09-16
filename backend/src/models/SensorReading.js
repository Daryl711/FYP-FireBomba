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

exports.insertSensorReading = async (data) => {
  const row = {
    room_id: data.roomId,
    flame_detected: data.flame,
    temperature: data.temperature,
    humidity: data.humidity,
    smoke: data.smoke,
    co: data.co,
  };

  if (timestamp) {
    row.timestamp = timestamp;
  }

  const { data: reading, error } = await supabase
    .from("sensor_readings")
    .insert(row)
    .select("reading_id")
    .single();

  if (error) {
    console.error("Error inserting sensor reading:", error);
    throw error;
  }

  return reading.reading_id;
};

exports.getRoomTemperature = async (roomId) => {
  const sql =
    "SELECT temperature FROM SensorReadings WHERE room_id = ? ORDER BY timestamp DESC LIMIT 1";

  const [result] = await db.query(sql, [roomId]);

  return result[0].temperature;
};

exports.getLatestSensorReading = async (roomId) => {
    const { data, error } = await supabase
        .from("sensor_readings")
        .select(`
            reading_id,
            room_id,
            timestamp,
            flame_detected,
            temperature,
            humidity,
            smoke,
            co,
            created_at
        `)
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