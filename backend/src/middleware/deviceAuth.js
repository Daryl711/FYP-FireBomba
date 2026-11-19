const crypto = require("crypto");
const SyncDevice = require("../models/SyncDevice");

// Authenticates a Pi on the /api/sync routes.
//
// The Pi sends:
//   X-Device-Id:   PI001
//   Authorization: Bearer <device key>
//
// On success req.device = { id, roomIds } and the controllers only accept
// data for those rooms. Unknown device, wrong key and disabled device all get
// the same 401 so a caller cannot tell which one it was.

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const hashKey = (key) => crypto.createHash("sha256").update(key, "utf8").digest();

const deny = (req, res, deviceId, reason) => {
  console.warn(`Sync auth failed for device ${deviceId ?? "-"} from ${req.ip}: ${reason}`);
  return res.status(401).json({ error: "Invalid device credentials" });
};

module.exports = async (req, res, next) => {
  const deviceId = req.headers["x-device-id"];
  const [scheme, key] = String(req.headers["authorization"] || "").split(" ");

  if (!deviceId || !DEVICE_ID_PATTERN.test(deviceId)) {
    return deny(req, res, null, "missing or malformed device id");
  }
  if (scheme !== "Bearer" || !key) {
    return deny(req, res, deviceId, "missing key");
  }

  let device;
  try {
    device = await SyncDevice.getById(deviceId);
  } catch (error) {
    // 500 makes the Pi back off and retry, rather than treat it as bad keys.
    console.error("Sync device lookup failed:", error);
    return res.status(500).json({ error: "Server error" });
  }

  if (!device) return deny(req, res, deviceId, "unknown device");
  if (!device.is_active) return deny(req, res, deviceId, "device disabled");

  const expected = Buffer.from(device.key_hash || "", "hex");
  const actual = hashKey(key);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return deny(req, res, deviceId, "wrong key");
  }

  req.device = { id: device.device_id, roomIds: new Set(device.room_ids) };
  return next();
};

module.exports.hashKey = hashKey;
