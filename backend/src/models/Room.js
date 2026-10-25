const supabase = require("../config/supabase");
const Bilik = require("./Bilik");

// Compatibility for existing consumers; Bilik owns these operations.
exports.getRoomIdsByBilik = Bilik.getRoomIdsByBilik;
exports.getRoomData = Bilik.getRoomData;
exports.getRoomsByBilik = Bilik.getRoomsByBilik;

exports.getRoomName = async (roomId) => {
  const { data, error } = await supabase
    .from("rooms")
    .select("name")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.name ?? null;
};

exports.getCameraStatus = async (roomId) => {
  const { data, error } = await supabase
    .from("rooms")
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
    .from("rooms")
    .update({
      camera_enabled: cameraStatus,
      last_updated: new Date().toISOString(),
    })
    .eq("room_id", roomId);

  if (error) {
    throw error;
  }
};
