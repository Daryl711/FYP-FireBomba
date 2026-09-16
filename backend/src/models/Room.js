const supabase = require("../config/supabase");

exports.getRoomData = async (roomId) => {
  const { data, error } = await supabase
    .from("Rooms")
    .select("room_id, name, status")
    .eq("room_id", roomId)
    .single();

  if (error) {
    throw error;
  }

  return {
    roomId: data.room_id,
    name: data.name,
    status: data.status,
  };
};

exports.getCameraStatus = async (roomId) => {
  const { data, error } = await supabase
    .from("Rooms")
    .select("camera_enabled")
    .eq("room_id", roomId)
    .single();

  if (error) {
    throw error;
  }

  return data.camera_enabled;
};

exports.updateCameraStatus = async (cameraStatus, roomId) => {
  const { error } = await supabase
    .from("Rooms")
    .update({
      camera_enabled: cameraStatus,
      last_updated: new Date().toISOString(),
    })
    .eq("room_id", roomId);

  if (error) {
    throw error;
  }
};