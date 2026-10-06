const supabase = require("../config/supabase");

class SensorPrediction {
  static async save(forecast) {
    const { data, error } = await supabase
      .from("sensor_predictions")
      .upsert(forecast, { onConflict: "room_id,base_time,generated_at" })
      .select("room_id,base_time,generated_at,predictions")
      .single();
    if (error) throw error;
    return data;
  }

  static async getLatestByRoom(roomId) {
    const { data, error } = await supabase
      .from("sensor_predictions")
      .select("room_id,base_time,generated_at,predictions")
      .eq("room_id", roomId)
      .order("base_time", { ascending: false })
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}

module.exports = SensorPrediction;
