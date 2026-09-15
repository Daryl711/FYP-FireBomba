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
  const { error } = await supabase
    .from("actuators")
    .update({
      waterpump_enabled: waterPumpStatus,
      last_updated: new Date().toISOString(),
    })
    .eq("room_id", roomId);

  if (error) {
    console.error("Error updating water pump status:", error);
    throw error;
  }

  return;
};
