const supabase = require("../config/supabase");

exports.createLog = async ({
  userId,
  performedBy,
  action,
  sensorId,
  sensorType,
  roomName,
  details,
}) => {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: userId ?? null,
    performed_by: performedBy ?? null,
    action,
    sensor_id: sensorId ?? null,
    sensor_type: sensorType ?? null,
    room_name: roomName ?? null,
    details: details ?? null,
  });

  if (error) {
    throw error;
  }
};
