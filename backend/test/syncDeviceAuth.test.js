const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { load, plain, response } = require("./helpers/load");
const sensorTimestamp = require("../src/utils/sensorTimestamp");

const KEY = "a".repeat(64);
const keyHash = (key) => crypto.createHash("sha256").update(key).digest("hex");

const PI001 = {
  device_id: "PI001",
  key_hash: keyHash(KEY),
  is_active: true,
  room_ids: [1, 2, 3, 4],
};

// Runs the middleware against a fake device table. Returns the response and
// whether the request was let through, plus what it put on req.device.
async function authenticate(headers, { devices = [PI001], failLookup = false } = {}) {
  const lookups = [];
  const deviceAuth = load("middleware/deviceAuth.js", {
    crypto,
    "../models/SyncDevice": {
      getById: async (id) => {
        lookups.push(id);
        if (failLookup) throw new Error("db down");
        return devices.find((device) => device.device_id === id) ?? null;
      },
    },
  }, { globals: { String, Set } });

  const req = { headers, ip: "203.0.113.5" };
  const res = response();
  let passed = false;
  await deviceAuth(req, res, () => { passed = true; });
  return {
    res,
    passed,
    lookups,
    device: req.device && { id: req.device.id, roomIds: [...req.device.roomIds] },
  };
}

const goodHeaders = (overrides = {}) => ({
  "x-device-id": "PI001",
  authorization: `Bearer ${KEY}`,
  ...overrides,
});

test("a known device with the right key passes and carries its rooms", async () => {
  const result = await authenticate(goodHeaders());

  assert.equal(result.passed, true);
  assert.deepEqual(result.device, { id: "PI001", roomIds: [1, 2, 3, 4] });
});

test("missing, malformed or wrong credentials all get the same 401", async () => {
  const cases = [
    {},
    goodHeaders({ "x-device-id": undefined }),
    goodHeaders({ "x-device-id": "PI001; drop table" }),
    goodHeaders({ authorization: undefined }),
    goodHeaders({ authorization: KEY }),
    goodHeaders({ authorization: `Basic ${KEY}` }),
    goodHeaders({ authorization: `Bearer ${"b".repeat(64)}` }),
    goodHeaders({ authorization: "Bearer short" }),
    goodHeaders({ "x-device-id": "PI999" }),
  ];

  for (const headers of cases) {
    const result = await authenticate(headers);
    assert.equal(result.passed, false, JSON.stringify(headers));
    assert.equal(result.res.code, 401);
    assert.deepEqual(result.res.body, { error: "Invalid device credentials" });
    assert.equal(result.device, undefined);
  }
});

test("malformed headers are refused without a database lookup", async () => {
  const result = await authenticate(goodHeaders({ authorization: undefined }));
  assert.deepEqual(result.lookups, []);
});

test("a disabled device is refused even with the right key", async () => {
  const result = await authenticate(goodHeaders(), {
    devices: [{ ...PI001, is_active: false }],
  });

  assert.equal(result.passed, false);
  assert.equal(result.res.code, 401);
});

test("one device's key does not work for another device", async () => {
  const PI002 = { ...PI001, device_id: "PI002", key_hash: keyHash("c".repeat(64)) };
  const result = await authenticate(goodHeaders({ "x-device-id": "PI002" }), {
    devices: [PI001, PI002],
  });

  assert.equal(result.passed, false);
  assert.equal(result.res.code, 401);
});

test("a failed device lookup is a 500 so the Pi retries, not a 401", async () => {
  const result = await authenticate(goodHeaders(), { failLookup: true });

  assert.equal(result.passed, false);
  assert.equal(result.res.code, 500);
});

// --- Aggregates: the room check in the controller ---

function aggregateController() {
  const calls = { stored: [], published: [] };
  const controller = load("controller/syncController.js", {
    "../models/SensorReading": {},
    "../models/AlertNotification": {},
    "../models/SensorAggregate": {
      insertSyncedAggregate: async (row) => {
        calls.stored.push(plain(row));
        return { aggregate_id: 7, ...row };
      },
    },
    "../services/sensorAggregateStream": {
      publishSensorAggregate: (row) => calls.published.push(plain(row)),
    },
    "../utils/sensorTimestamp": sensorTimestamp,
    "../services/sensorReadingStream": {},
    "../services/twinSensorStream": {},
  }, { globals: { Date, Map, Set, Number, Object, Array } });

  const send = async (roomId, device) => {
    const res = response();
    await controller.insertSensorAggregate({
      body: {
        room_id: roomId,
        window_start: "2026-10-21T14:00:00",
        window_end: "2026-10-21T14:05:00",
        avg_temperature: 30,
        avg_smoke: 1,
        avg_co: 2,
        avg_humidity: 60,
      },
      device,
    }, res);
    return res;
  };
  return { calls, send };
}

test("aggregates are stored only for rooms the device is authorized for", async () => {
  const { calls, send } = aggregateController();
  const device = { id: "PI001", roomIds: new Set([1, 2, 3, 4]) };

  assert.equal((await send(4, device)).code, 200);

  const refused = await send(5, device);
  assert.equal(refused.code, 403);
  assert.deepEqual(refused.body, { error: "room 5 is not authorized for device PI001" });

  assert.deepEqual(calls.stored.map((row) => row.room_id), [4]);
  assert.equal(calls.published.length, 1);
});

test("without an authenticated device no room is accepted", async () => {
  const { calls, send } = aggregateController();

  assert.equal((await send(1, undefined)).code, 403);
  assert.deepEqual(calls.stored, []);
});
