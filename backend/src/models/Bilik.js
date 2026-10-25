const supabase = require("../config/supabase");

const ROOM_COLUMNS = "room_id, name, status, last_updated, camera_enabled, space_type";

const formatBilik = (bilik) => bilik ? {
  bilikId: bilik.bilik_id,
  number: bilik.bilik_number,
  householdName: bilik.household_name,
} : null;

exports.formatRoom = (room) => ({
  roomId: room.room_id,
  name: room.name,
  status: room.status,
  lastUpdated: room.last_updated,
  cameraEnabled: room.camera_enabled,
  spaceType: room.space_type,
});

// Home uses the authenticated profile's bilik id, including households with no rooms.
exports.getBilikData = async (bilikId) => {
  if (bilikId == null) return null;
  const { data, error } = await supabase
    .from("bilik")
    .select("bilik_id, bilik_number, household_name")
    .eq("bilik_id", bilikId)
    .maybeSingle();
  if (error) throw error;
  return formatBilik(data);
};

// Public digital-twin labels deliberately omit household names and user data.
exports.getLayoutBiliks = async () => {
  const { data, error } = await supabase
    .from("bilik")
    .select("bilik_id, bilik_number")
    .order("bilik_id");
  if (error) throw error;
  return data.map((bilik) => ({ bilikId: bilik.bilik_id, bilikNumber: bilik.bilik_number }));
};

exports.getRoomIdsByBilik = async (bilikId) => {
  if (bilikId == null) return [];
  const { data, error } = await supabase
    .from("rooms")
    .select("room_id")
    .eq("bilik_id", bilikId)
    .order("room_id");
  if (error) throw error;
  return data.map((room) => room.room_id);
};

// Database-shaped rows also supply the System Settings health check.
exports.getRoomsByBilik = async (bilikId) => {
  if (bilikId == null) return [];
  const { data, error } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("bilik_id", bilikId)
    .order("room_id");
  if (error) throw error;
  return data;
};

exports.getUserIdsByBilik = async (bilikId) => {
  if (bilikId == null) return [];
  const { data, error } = await supabase
    .from("users")
    .select("user_id")
    .eq("bilik_id", bilikId);
  if (error) throw error;
  return data.map((user) => user.user_id);
};

// Legacy room overview: a shared space must not include other unowned rooms.
exports.getRoomData = async (roomId) => {
  if (roomId == null) return { bilik: null, rooms: [] };
  const { data: room, error } = await supabase
    .from("rooms")
    .select("bilik_id")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!room) return { bilik: null, rooms: [] };

  if (room.bilik_id != null) {
    const [bilik, rooms] = await Promise.all([
      exports.getBilikData(room.bilik_id),
      exports.getRoomsByBilik(room.bilik_id),
    ]);
    return { bilik, rooms: rooms.map(exports.formatRoom) };
  }

  const { data: rows, error: roomsError } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("room_id", roomId)
    .order("room_id");
  if (roomsError) throw roomsError;
  return { bilik: null, rooms: rows.map(exports.formatRoom) };
};
