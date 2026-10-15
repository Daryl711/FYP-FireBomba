const supabase = require("../config/supabase");

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

  return data?.waterpump_enabled ?? false;
};

// Upsert, not update: a room has no actuators row until its pump is first used.
exports.updateWaterPumpStatus = async (waterPumpStatus, roomId) => {
  const row = {
    waterpump_enabled: waterPumpStatus,
    last_updated: new Date().toISOString(),
  };

  const { data: existing, error: findError } = await supabase
    .from("actuators")
    .select("actuator_id")
    .eq("room_id", roomId)
    .maybeSingle();

  if (findError) {
    console.error("Error updating water pump status:", findError);
    throw findError;
  }

  const { error } = existing
    ? await supabase.from("actuators").update(row).eq("actuator_id", existing.actuator_id)
    : await supabase.from("actuators").insert({ ...row, room_id: roomId });

  if (error) {
    console.error("Error updating water pump status:", error);
    throw error;
  }
};
