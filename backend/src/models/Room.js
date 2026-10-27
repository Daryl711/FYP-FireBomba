const supabase = require("../config/supabase");
const Bilik = require("./Bilik");

// Compatibility for existing consumers; Bilik owns these operations.
exports.getRoomIdsByBilik = Bilik.getRoomIdsByBilik;
exports.getRoomData = Bilik.getRoomData;
exports.getRoomsByBilik = Bilik.getRoomsByBilik;

// A room belongs to a bilik; access requires a user profile in that same bilik.
exports.userCanAccessRoom = async (roomId, userId) => {
  if (roomId == null || !userId) return false;

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("bilik_id")
    .eq("room_id", roomId)
    .maybeSingle();
  if (roomError) throw roomError;
  if (room?.bilik_id == null) return false;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("user_id")
    .eq("user_id", userId)
    .eq("bilik_id", room.bilik_id)
    .maybeSingle();
  if (userError) throw userError;
  return user != null;
};

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
