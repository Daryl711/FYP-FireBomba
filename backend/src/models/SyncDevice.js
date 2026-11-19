const supabase = require("../config/supabase");

// A Pi allowed to call the /api/sync endpoints, with the rooms it may write.
// Returns { device_id, key_hash, is_active, room_ids } or null when unknown.
// Needs sql/migrations/004_sync_devices.sql.
exports.getById = async (deviceId) => {
  const { data, error } = await supabase
    .from("sync_devices")
    .select("device_id, key_hash, is_active, sync_device_rooms(room_id)")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    device_id: data.device_id,
    key_hash: data.key_hash,
    is_active: data.is_active,
    room_ids: (data.sync_device_rooms || []).map((row) => row.room_id),
  };
};

// Creates the device, or gives an existing one a new key and room list.
// Used by scripts/createSyncDevice.js.
exports.upsert = async ({ deviceId, keyHash, roomIds }) => {
  const { error: deviceError } = await supabase.from("sync_devices").upsert({
    device_id: deviceId,
    key_hash: keyHash,
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  if (deviceError) throw deviceError;

  const { error: clearError } = await supabase
    .from("sync_device_rooms")
    .delete()
    .eq("device_id", deviceId);
  if (clearError) throw clearError;

  const { error: roomsError } = await supabase
    .from("sync_device_rooms")
    .insert(roomIds.map((roomId) => ({ device_id: deviceId, room_id: roomId })));
  if (roomsError) throw roomsError;
};
