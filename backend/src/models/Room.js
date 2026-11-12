const supabase = require("../config/supabase");
const Bilik = require("./Bilik");
const UserProfile = require("./UserProfile");

// Compatibility for existing consumers; Bilik owns these operations.
exports.getRoomIdsByBilik = Bilik.getRoomIdsByBilik;
exports.getRoomData = Bilik.getRoomData;
exports.getRoomsByBilik = Bilik.getRoomsByBilik;

// Access control: a user may only touch a room that belongs to their bilik.
// Mirrors the bilik -> room-ids logic the auth middleware already uses, so the
// rule is identical everywhere. Returns false (never throws) for bad input.
exports.userCanAccessRoom = async (roomId, userId) => {
  const rid = Number(roomId);
  if (!Number.isInteger(rid) || rid < 1 || userId == null) return false;

  const profile = await UserProfile.getById(userId);
  if (!profile || profile.bilik_id == null) return false;

  const roomIds = await Bilik.getRoomIdsByBilik(profile.bilik_id);
  return roomIds.includes(rid);
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
