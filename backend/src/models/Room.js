const supabase = require("../config/supabase");

exports.getRoomData = async (roomId) => {
  const sql = `
    SELECT
      r.room_id AS roomId,
      r.name,
      r.status,
      r.last_updated AS lastUpdated,
      r.camera_enabled AS cameraEnabled,
      r.space_type AS spaceType,
      b.bilik_id AS bilikId,
      b.bilik_number AS bilikNumber,
      b.household_name AS householdName
    FROM Rooms r
    LEFT JOIN Bilik b ON b.bilik_id = r.bilik_id
    WHERE r.bilik_id = (
      SELECT bilik_id FROM Rooms WHERE room_id = ?
    )
    OR r.room_id = ?
    ORDER BY r.room_id
  `;
  const [rows] = await db.query(sql, [roomId, roomId]);

  if (rows.length === 0) {
    return { bilik: null, rooms: [] };
  }

  const firstRoom = rows[0];
  const hasBilik = firstRoom.bilikId !== null;

  return {
    bilik: hasBilik
      ? {
          bilikId: firstRoom.bilikId,
          number: firstRoom.bilikNumber,
          householdName: firstRoom.householdName,
        }
      : null,
    rooms: rows.map(({ bilikId, bilikNumber, householdName, ...room }) => room),
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