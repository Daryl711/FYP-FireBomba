const supabase = require("../config/supabase");

exports.getRoomIdsByBilik = async (bilikId) => {
  const { data, error } = await supabase
    .from("rooms")
    .select("room_id")
    .eq("bilik_id", bilikId)
    .order("room_id");

  if (error) {
    throw error;
  }

  return data.map((room) => room.room_id);
};

// Returns the bilik the room belongs to and every room in that bilik.
exports.getRoomData = async (roomId) => {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("bilik_id")
    .eq("room_id", roomId)
    .maybeSingle();

  if (roomError) {
    throw roomError;
  }

  if (!room) {
    return { bilik: null, rooms: [] };
  }

  const roomsQuery = supabase
    .from("rooms")
    .select("room_id, name, status, last_updated, camera_enabled, space_type, bilik:bilik_id (bilik_id, bilik_number, household_name)")
    .order("room_id");

  const { data: rows, error } = room.bilik_id === null
    ? await roomsQuery.eq("room_id", roomId)
    : await roomsQuery.eq("bilik_id", room.bilik_id);

  if (error) {
    throw error;
  }

  const bilik = rows[0]?.bilik;

  return {
    bilik: bilik
      ? {
          bilikId: bilik.bilik_id,
          number: bilik.bilik_number,
          householdName: bilik.household_name,
        }
      : null,
    rooms: rows.map((row) => ({
      roomId: row.room_id,
      name: row.name,
      status: row.status,
      lastUpdated: row.last_updated,
      cameraEnabled: row.camera_enabled,
      spaceType: row.space_type,
    })),
  };
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
