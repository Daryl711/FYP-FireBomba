const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, plain, response } = require("./helpers/load");
const sensorTimestamp = require("../src/utils/sensorTimestamp");

// A Pi SensorReadings row as sync.py sends it (naive Malaysian time).
const piReading = (id, overrides = {}) => ({
  reading_id: id,
  room_id: 1,
  reading_timestamp: "2026-10-21T14:05:00",
  flame_detected: 0,
  temperature: 30,
  humidity: 60,
  smoke: 1,
  co: 2,
  ...overrides,
});

// Wires the controller to fakes and records what it stored and published.
// deviceRooms: rooms the calling Pi is authorized for (set by deviceAuth).
function setup({
  rooms = [1, 2],
  stored = [],
  failInsert = false,
  deviceRooms = [1, 2, 99],
} = {}) {
  const device = { id: "PI001", roomIds: new Set(deviceRooms) };
  const calls = { inserted: null, frontend: [], twin: [], alerts: [] };

  const model = {
    getExistingRoomIds: async (ids) => new Set(ids.filter((id) => rooms.includes(id))),
    insertSensorReadings: async (rows) => {
      if (failInsert) throw new Error("db down");
      calls.inserted = plain(rows);
      // Mimic ON CONFLICT DO NOTHING: rows already stored are not returned.
      return rows
        .filter((row) => !stored.includes(row.pi_reading_id))
        .map((row, index) => ({ reading_id: 1000 + index, ...row }));
    },
  };

  const controller = load("controller/syncController.js", {
    "../models/SensorReading": model,
    "../models/AlertNotification": {
      createAlert: async ({ roomId }) => calls.alerts.push(roomId),
    },
    "../models/SensorAggregate": {},
    "../services/sensorAggregateStream": {},
    "../utils/sensorTimestamp": sensorTimestamp,
    "../services/sensorReadingStream": {
      publishSensorReading: (reading) => calls.frontend.push(plain(reading)),
    },
    "../services/twinSensorStream": {
      publishSensorReading: (reading) => calls.twin.push(plain(reading)),
    },
  }, { globals: { Date, Map, Set, Number, Object, Array } });

  const send = async (body) => {
    const res = response();
    await controller.insertSensorReadingsBulk({ body, device }, res);
    return res;
  };

  return { calls, send };
}

test("bulk sync stores every valid reading in one insert with its Pi id", async () => {
  const { calls, send } = setup();
  const res = await send({ readings: [piReading(1), piReading(2, { room_id: 2 })] });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body.synced, [1, 2]);
  assert.deepEqual(res.body.rejected, []);
  assert.equal(calls.inserted.length, 2);
  assert.deepEqual(calls.inserted[0], {
    pi_reading_id: 1, room_id: 1, timestamp: "2026-10-21T06:05:00.000Z",
    flame_detected: false, temperature: 30, humidity: 60, smoke: 1, co: 2,
  });
});

test("bulk sync rejects bad readings and unknown rooms but keeps the rest", async () => {
  const { calls, send } = setup({ rooms: [1] });
  const res = await send({
    readings: [
      piReading(1),
      piReading(2, { reading_timestamp: null }),
      piReading(3, { temperature: "hot" }),
      piReading(4, { room_id: 99 }),
      piReading(0),
    ],
  });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body.synced, [1]);
  assert.deepEqual(res.body.rejected.map((item) => item.reading_id), [2, 3, 0, 4]);
  assert.match(res.body.rejected[3].error, /room 99 does not exist/);
  assert.deepEqual(calls.inserted.map((row) => row.pi_reading_id), [1]);
});

test("readings for rooms the device is not authorized for are rejected, not stored or alerted", async () => {
  const { calls, send } = setup({ deviceRooms: [1] });
  const now = new Date().toISOString();
  const res = await send({
    readings: [
      piReading(1),
      piReading(2, { room_id: 2, reading_timestamp: now, flame_detected: 1 }),
    ],
  });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body.synced, [1]);
  assert.deepEqual(res.body.rejected, [
    { reading_id: 2, error: "room 2 is not authorized for device PI001" },
  ]);
  assert.deepEqual(calls.inserted.map((row) => row.room_id), [1]);
  assert.deepEqual(calls.alerts, []);
});

test("a retried batch counts as synced without re-publishing or re-alerting", async () => {
  const { calls, send } = setup({ stored: [1, 2] });
  const now = new Date().toISOString();
  const res = await send({
    readings: [
      piReading(1, { reading_timestamp: now, flame_detected: 1 }),
      piReading(2, { reading_timestamp: now }),
    ],
  });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body.synced, [1, 2]);
  assert.equal(calls.frontend.length, 0);
  assert.equal(calls.twin.length, 0);
  assert.deepEqual(calls.alerts, []);
});

test("bulk sync publishes only the newest reading per room", async () => {
  const { calls, send } = setup();
  await send({
    readings: [
      piReading(1, { reading_timestamp: "2026-10-21T14:05:00" }),
      piReading(2, { reading_timestamp: "2026-10-21T14:05:20", temperature: 35 }),
      piReading(3, { reading_timestamp: "2026-10-21T14:05:10" }),
      piReading(4, { room_id: 2 }),
    ],
  });

  assert.deepEqual(calls.frontend.map((r) => r.pi_reading_id).sort(), [2, 4]);
  assert.deepEqual(calls.twin.map((r) => r.pi_reading_id).sort(), [2, 4]);
});

test("a live flame raises one alert per room; backlogged flames raise none", async () => {
  const { calls, send } = setup();
  const now = new Date().toISOString();
  await send({
    readings: [
      piReading(1, { reading_timestamp: now, flame_detected: 1 }),
      piReading(2, { reading_timestamp: now, flame_detected: "1" }),
      // An hour old: history from a backlog, not a live fire.
      piReading(3, {
        room_id: 2,
        reading_timestamp: new Date(Date.now() - 3600000).toISOString(),
        flame_detected: 1,
      }),
    ],
  });

  assert.deepEqual(calls.alerts, [1]);
});

test("bulk sync rejects a malformed body and reports database failures as 500", async () => {
  const { send } = setup();
  for (const body of [{}, { readings: [] }, { readings: "x" },
    { readings: Array.from({ length: 101 }, (_, i) => piReading(i + 1)) }]) {
    assert.equal((await send(body)).code, 400);
  }

  const failing = setup({ failInsert: true });
  const res = await failing.send({ readings: [piReading(1)] });
  assert.equal(res.code, 500);
});
