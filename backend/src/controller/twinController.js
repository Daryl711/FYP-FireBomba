const supabase = require("../config/supabase");

// Read-only floor layout for the digital twin. Only ids, names and the
// bilik/space grouping are returned; no household names or user data.
exports.getLayout = async (req, res) => {
  try {
    const [bilikRes, roomsRes] = await Promise.all([
      supabase.from("bilik").select("bilik_id, bilik_number").order("bilik_id"),
      supabase
        .from("rooms")
        .select("room_id, name, space_type, bilik_id")
        .order("room_id")
    ]);

    if (bilikRes.error) throw bilikRes.error;
    if (roomsRes.error) throw roomsRes.error;

    res.json({
      bilik: bilikRes.data.map((b) => ({
        bilikId: b.bilik_id,
        bilikNumber: b.bilik_number
      })),
      rooms: roomsRes.data.map((r) => ({
        roomId: r.room_id,
        name: r.name,
        spaceType: r.space_type,
        bilikId: r.bilik_id
      }))
    });
  } catch (err) {
    console.error("Twin layout error:", err);
    res.status(500).json({ error: "Could not load layout." });
  }
};
