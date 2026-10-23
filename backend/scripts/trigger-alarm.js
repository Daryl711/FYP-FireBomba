/**
 * Manual fire alarm trigger
 *
 * Creates a real alert for a room, the same way a sensor alert does: every user
 * in that room's bilik gets a notification row and an alarm push to their phone.
 *
 * Commands:
 *   node scripts/trigger-alarm.js --list                    → show rooms and who would be alarmed
 *   node scripts/trigger-alarm.js <roomId>                  → trigger now
 *   node scripts/trigger-alarm.js <roomId> --delay 30       → trigger after 30s (time to close the app)
 *   node scripts/trigger-alarm.js <roomId> --title "Smoke detected (TEST)"
 *
 * Or from backend/: npm run alarm -- 3 --delay 30
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const supabase = require("../src/config/supabase");
const Alert = require("../src/models/AlertNotification");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listRooms() {
  const [{ data: rooms, error }, { data: users }, { data: tokens }] = await Promise.all([
    supabase.from("rooms").select("room_id, name, bilik_id").order("room_id"),
    supabase.from("users").select("user_id, bilik_id"),
    supabase.from("push_tokens").select("user_id"),
  ]);
  if (error) throw error;

  const tokenUsers = new Set((tokens || []).map((t) => t.user_id));

  console.log(`\n${C.bold}Rooms${C.reset}`);
  for (const room of rooms) {
    const members = (users || []).filter((u) => u.bilik_id === room.bilik_id);
    const phones = members.filter((u) => tokenUsers.has(u.user_id)).length;
    const colour = phones > 0 ? C.green : C.gray;
    console.log(
      `${colour}  ${String(room.room_id).padStart(3)}  ${room.name.padEnd(20)} bilik ${room.bilik_id}  ` +
        `users: ${members.length}  phones with push: ${phones}${C.reset}`,
    );
  }
  console.log(`\n${C.gray}Green rooms will ring at least one phone.${C.reset}\n`);
}

async function trigger(roomId) {
  const delay = Number(option("--delay", 0));
  const title = option("--title", "Flame detected (TEST)");

  const { data: room, error } = await supabase
    .from("rooms")
    .select("room_id, name")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!room) {
    console.error(`${C.red}Room ${roomId} not found. Run with --list to see rooms.${C.reset}`);
    process.exitCode = 1;
    return;
  }

  if (delay > 0) {
    console.log(`${C.yellow}Alarm for "${room.name}" in ${delay}s - close the app now...${C.reset}`);
    for (let left = delay; left > 0; left--) {
      process.stdout.write(`\r  ${left}s `);
      await sleep(1000);
    }
    process.stdout.write("\r");
  }

  const alertIds = await Alert.createAlert({ roomId, warningTitles: [title] });
  console.log(`${C.green}${C.bold}Alarm sent${C.reset} → ${room.name}: "${title}" (alert id ${alertIds.join(", ")})`);
}

(async () => {
  try {
    if (args.length === 0 || args[0] === "--list") {
      await listRooms();
      if (args.length === 0) {
        console.log("Usage: node scripts/trigger-alarm.js <roomId> [--delay seconds] [--title text]\n");
      }
    } else {
      await trigger(Number(args[0]));
    }
  } catch (err) {
    console.error(`${C.red}Failed:${C.reset}`, err.message || err);
    process.exitCode = 1;
  }
})();
