const supabase = require("../config/supabase");

const mapBilik = (bilik) =>
  bilik
    ? {
        bilikId: bilik.bilik_id,
        number: bilik.bilik_number,
        householdName: bilik.household_name,
      }
    : null;

const mapRoom = (room) => ({
  roomId: room.room_id,
  name: room.name,
  status: room.status,
  lastUpdated: room.last_updated,
  cameraEnabled: room.camera_enabled,
  spaceType: room.space_type,
});

const getUserBilikId = async (userId) => {
  const { data, error } = await supabase
    .from("users")
    .select("bilik_id")
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data.bilik_id;
};

exports.getBilikData = async (userId) => {
  const bilikId = await getUserBilikId(userId);

  const { data, error } = await supabase
    .from("bilik")
    .select("bilik_id, bilik_number, household_name")
    .eq("bilik_id", bilikId)
    .single();

  if (error) throw error;
  return mapBilik(data);
};

exports.getRoomsByBilik = async (bilikId, userId) => {
  const userBilikId = await getUserBilikId(userId);

  if (String(userBilikId) !== String(bilikId)) {
    const error = new Error("Bilik does not belong to the authenticated user");
    error.status = 403;
    throw error;
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("room_id, name, status, last_updated, camera_enabled, space_type")
    .eq("bilik_id", Number(bilikId))
    .order("room_id");

  return (data || []).map(mapRoom);
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
