/**
 * IoT Sensor Simulator
 *
 * Commands:
 *   node simulate.js --seed                        → create test user + 3 rooms, then run scenarios
 *   node simulate.js --login <email> <password>    → log in as YOUR account, create rooms, run scenarios
 *   node simulate.js --list                        → show existing rooms in the DB
 *   node simulate.js [roomId] [baseUrl]            → run fire alert scenarios against a room
 *
 * Examples:
 *   node simulate.js --login you@email.com yourPassword
 *   node simulate.js --seed
 *   node simulate.js --list
 *   node simulate.js 1
 *   node simulate.js 2 http://192.168.1.5:3000
 *
 * Fire alert thresholds (backend):
 *   Temperature ≥ 60 °C  |  Smoke ≥ 300 ppm  |  Gas ≥ 500 ppm  |  Flame = 1
 */

const arg1 = process.argv[2];
const arg2 = process.argv[3];
const arg3 = process.argv[4];
const BASE_URL = (
  arg1 === "--login" ? (process.argv[5] || "http://localhost:3000") : (process.argv[3] || "http://localhost:3000")
).replace(/\/$/, "");

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  green:  "\x1b[32m",
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
};

const TEST_USER = { fullName: "Test User", email: "test@firebomba.dev", password: "Test1234!" };
const TEST_ROOMS = ["Living Room", "Server Room", "Kitchen"];

const SCENARIOS = [
  { label: "Normal temperature (28°C)", sensorType: "temperature", value: 28  },
  { label: "Normal smoke (50 ppm)",     sensorType: "smoke",       value: 50  },
  { label: "Normal gas (100 ppm)",      sensorType: "gas",         value: 100 },
  { label: "No flame",                  sensorType: "flame",       value: 0   },
  { label: "HIGH temperature (75°C)",   sensorType: "temperature", value: 75  },
  { label: "HIGH smoke (450 ppm)",      sensorType: "smoke",       value: 450 },
  { label: "HIGH gas (620 ppm)",        sensorType: "gas",         value: 620 },
  { label: "FLAME DETECTED",            sensorType: "flame",       value: 1   },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return { status: res.status, data: await res.json() };
}

// ─── --list ───────────────────────────────────────────────────────────────────

async function listRooms() {
  console.log(`\n${C.bold}Available Rooms${C.reset}  (${BASE_URL}/api/rooms)\n`);
  try {
    const { status, data } = await get("/api/alerts/rooms");
    if (status !== 200 || data.error) {
      console.log(`  ${C.red}Error: ${data.error || status}${C.reset}\n`);
      return;
    }
    if (data.length === 0) {
      console.log(`  ${C.yellow}No rooms found.${C.reset} Run ${C.bold}node simulate.js --seed${C.reset} to create test data.\n`);
      return;
    }
    console.log(`  ${"ID".padEnd(6)} ${"Name".padEnd(22)} Status`);
    console.log(`  ${"─".repeat(40)}`);
    for (const r of data) {
      console.log(`  ${String(r.id).padEnd(6)} ${r.name.padEnd(22)} ${r.status}`);
    }
    console.log(`\n  ${C.gray}Run: node simulate.js <roomId>${C.reset}\n`);
  } catch (err) {
    console.log(`  ${C.red}Cannot connect to backend: ${err.message}${C.reset}`);
    console.log(`  ${C.gray}Start it first: cd backend && npm run dev${C.reset}\n`);
  }
}

// ─── --login ──────────────────────────────────────────────────────────────────

async function loginAs(email, password) {
  if (!email || !password) {
    console.log(`\n${C.red}Usage: node simulate.js --login <email> <password>${C.reset}\n`);
    return;
  }

  console.log(`\n${C.bold}FireBomba Login${C.reset}  (${BASE_URL})\n`);

  // 1. Login
  process.stdout.write(`  Logging in as ${email}... `);
  const login = await post("/api/login", { email, password });
  if (login.status !== 200) {
    console.log(`${C.red}failed: ${login.data?.error}${C.reset}\n`);
    return;
  }
  const token = login.data.token;
  console.log(`${C.green}OK${C.reset}`);

  // 2. Use the user's existing room (from their JWT roomId) so alerts show up in the app
  const roomId = login.data.user?.roomId ?? login.data.roomId;

  // Decode roomId from JWT payload if not in response body
  let targetRoomId = roomId;
  if (!targetRoomId) {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    targetRoomId = payload.roomId;
  }

  if (!targetRoomId) {
    console.log(`\n  ${C.red}Could not determine your room ID from login response.${C.reset}\n`);
    return;
  }

  console.log(`  Using your assigned room id: ${C.cyan}${targetRoomId}${C.reset}`);
  console.log(`\n  ${C.bold}Running fire alert scenarios on room id: ${targetRoomId}...${C.reset}\n`);
  await runScenarios(targetRoomId);
}

// ─── --seed ───────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`\n${C.bold}FireBomba Seed${C.reset}  (${BASE_URL})\n`);

  // 1. Sign up test user (ignore error if already exists)
  process.stdout.write(`  Creating test user (${TEST_USER.email})... `);
  const signup = await post("/api/signup", TEST_USER);
  if (signup.status === 201) {
    console.log(`${C.green}created${C.reset}`);
  } else if (signup.data?.error?.includes("already")) {
    console.log(`${C.gray}already exists${C.reset}`);
  } else {
    console.log(`${C.red}failed: ${signup.data?.error}${C.reset}`);
    return;
  }

  // 2. Login to get token
  process.stdout.write(`  Logging in... `);
  const login = await post("/api/login", { email: TEST_USER.email, password: TEST_USER.password });
  if (login.status !== 200) {
    console.log(`${C.red}failed: ${login.data?.error}${C.reset}`);
    return;
  }
  const token = login.data.token;
  console.log(`${C.green}OK${C.reset}  (token received)`);

  // 3. Create rooms
  console.log(`  Creating rooms...`);
  let firstRoomId = null;
  for (const name of TEST_ROOMS) {
    const room = await post("/api/alerts/rooms", { name }, token);
    if (room.status === 201) {
      if (!firstRoomId) firstRoomId = room.data.roomId;
      console.log(`    ${C.green}✓${C.reset} "${name}"  (id: ${room.data.roomId})`);
    } else {
      console.log(`    ${C.yellow}⚠ "${name}" — ${room.data?.error}${C.reset}`);
    }
  }

  if (!firstRoomId) {
    console.log(`\n  ${C.red}No rooms created. Cannot run scenarios.${C.reset}\n`);
    return;
  }

  console.log(`\n  ${C.gray}Credentials saved: ${TEST_USER.email} / ${TEST_USER.password}${C.reset}`);
  console.log(`  ${C.bold}Running fire alert scenarios on room id: ${firstRoomId}...${C.reset}\n`);

  await runScenarios(firstRoomId);
}

// ─── scenarios ────────────────────────────────────────────────────────────────

async function sendReading(roomId, scenario) {
  const body = { roomId, sensorType: scenario.sensorType, value: scenario.value };
  try {
    const { status, data } = await post("/api/alerts/sensor-reading", body);
    if (status !== 201) {
      const hint = data.error === "Room not found"
        ? ` ${C.gray}(run --list to see valid room IDs)${C.reset}`
        : "";
      console.log(`  ${C.red}✗ ${scenario.label}${C.reset} → ${data.error}${hint}`);
      return;
    }
    if (data.alertCreated) {
      console.log(`  ${C.red}🔥 ALERT${C.reset}  ${C.cyan}${scenario.label}${C.reset}  → alert id: ${data.alertId}`);
    } else {
      console.log(`  ${C.green}✓ OK${C.reset}      ${C.gray}${scenario.label}${C.reset}  → no alert`);
    }
  } catch (err) {
    console.log(`  ${C.red}✗ Network error: ${err.message}${C.reset}`);
  }
}

async function runScenarios(roomId) {
  console.log(`${C.bold}FireBomba Sensor Scenarios${C.reset}  (room ${roomId})`);
  console.log(`${"─".repeat(55)}`);
  for (const s of SCENARIOS) {
    await sendReading(roomId, s);
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`${"─".repeat(55)}`);
  console.log(`${C.bold}Done.${C.reset} Open the app → Alerts tab to see the fire alerts.\n`);
}

// ─── entry ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    if (arg1 === "--login") {
      await loginAs(arg2, arg3);
    } else if (arg1 === "--seed") {
      await seed();
    } else if (arg1 === "--list") {
      await listRooms();
    } else {
      const roomId = parseInt(arg1 || "1", 10);
      console.log(`\nBackend: ${BASE_URL}\n`);
      await runScenarios(roomId);
    }
  } catch (err) {
    console.log(`\n${C.red}Unexpected error: ${err.message}${C.reset}`);
    console.log(`${C.gray}Make sure the backend is running: cd backend && npm run dev${C.reset}\n`);
  }
}

main();
