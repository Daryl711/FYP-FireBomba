// Creates a Pi sync device, or gives an existing one a new key and room list.
//
//   npm run sync-device -- <device id> <rooms>
//   npm run sync-device -- PI001 1-4
//   npm run sync-device -- PI002 5,6,8
//
// Prints the new key once; only its hash is stored. Put it in the Pi's
// raspberry/.env as SYNC_DEVICE_KEY. Re-running for an existing device
// replaces its key, so the old key stops working immediately.
const crypto = require("crypto");
const SyncDevice = require("../src/models/SyncDevice");
const { hashKey } = require("../src/middleware/deviceAuth");

const parseRooms = (text) => {
  const rooms = new Set();
  for (const part of String(text || "").split(",")) {
    const range = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!range) throw new Error(`Bad room list "${text}". Use e.g. 1-4 or 1,2,5`);
    const from = Number(range[1]);
    const to = Number(range[2] ?? range[1]);
    if (from < 1 || to < from) throw new Error(`Bad room range "${part}"`);
    for (let room = from; room <= to; room += 1) rooms.add(room);
  }
  return [...rooms];
};

const main = async () => {
  const [deviceId, roomsArg] = process.argv.slice(2);
  if (!deviceId || !/^[A-Za-z0-9_-]{1,64}$/.test(deviceId) || !roomsArg) {
    console.error("Usage: npm run sync-device -- <device id> <rooms, e.g. 1-4>");
    process.exit(1);
  }

  const roomIds = parseRooms(roomsArg);
  const key = crypto.randomBytes(32).toString("hex");

  await SyncDevice.upsert({
    deviceId,
    keyHash: hashKey(key).toString("hex"),
    roomIds,
  });

  console.log(`Device ${deviceId} may sync rooms ${roomIds.join(", ")}.`);
  console.log("Add these to raspberry/.env on the Pi (the key is not shown again):\n");
  console.log(`SYNC_DEVICE_ID=${deviceId}`);
  console.log(`SYNC_DEVICE_KEY=${key}`);
};

main().catch((error) => {
  console.error("Failed to create sync device:", error.message || error);
  process.exit(1);
});
