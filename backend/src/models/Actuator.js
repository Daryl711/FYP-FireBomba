const db = require("../config/supabase");

exports.getWaterPumpStatus = async (roomId) => {
    const { data, error } = await supabase
        .from("actuators")
        .select("waterpump_enabled")
        .eq("room_id", roomId)
        .maybeSingle();

    if (error) {
        console.error("Error getting water pump status:", error);
        throw error;
    }

    return data?.activated_status ?? false;
};

exports.updateWaterPumpStatus = async (waterPumpStatus, roomId) => {
  const sql =
    "UPDATE Actuators SET activated_status = ?, last_updated = NOW() WHERE room_id = ?";
  const [result] = await db.query(sql, [waterPumpStatus, roomId]);
  return;
};
