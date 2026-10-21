const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const twinStream = require("../src/services/twinSensorStream");
const frontendStream = require("../src/services/sensorReadingStream");

function load(relativePath, mocks, globals = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, console, setInterval, clearInterval,
    require: (name) => name in mocks ? mocks[name] : require(name), ...globals,
  }, { filename });
  return module.exports;
}

function response() {
  const res = new EventEmitter();
  res.messages = [];
  res.write = (message) => res.messages.push(message);
  res.status = () => res;
  res.set = () => res;
  res.flushHeaders = () => {};
  res.json = (body) => { res.body = body; };
  res.end = () => { res.writableEnded = true; res.emit("close"); };
  return res;
}

function reading(roomId = 1, timestamp = new Date().toISOString()) {
  return { reading_id: 7, room_id: roomId, timestamp, temperature: 32,
    smoke: 4, co: 2, humidity: 65, flame_detected: false };
}

test("saved Pi timestamps use Malaysian time before reaching the event streams", async () => {
  let inserted;
  const model = load("../src/models/SensorReading.js", {
    "../utils/sensorTimestamp": require("../src/utils/sensorTimestamp"),
    "../config/supabase": { from: () => ({
      insert: (row) => {
        inserted = row;
        return { select: () => ({ single: async () => ({ data: row }) }) };
      },
    }) },
  });
  const saved = await model.insertSensorReading({ roomId: 1,
    reading_timestamp: "2026-10-21T14:05:00", temperature: 32 });
  assert.equal(inserted.timestamp, "2026-10-21T06:05:00.000Z");
  assert.equal(saved.timestamp, inserted.timestamp);
  await assert.rejects(model.insertSensorReading({ roomId: 1,
    reading_timestamp: "invalid" }), /Invalid sensor reading timestamp/);
});

test("successful sync publishes saved readings to independent frontend and twin subscribers", async () => {
  const saved = reading();
  const twin = response(), frontend = response();
  const unsubscribe = twinStream.subscribe(twin);
  const unsubscribeFrontend = frontendStream.subscribeToRoom(1, frontend);
  const controller = load("../src/controller/syncController.js", {
    "../models/SensorReading": { insertSensorReading: async () => saved },
    "../models/AlertNotification": {}, "../models/SensorAggregate": {},
    "../services/sensorAggregateStream": {},
    "../utils/sensorTimestamp": require("../src/utils/sensorTimestamp"),
    "../services/sensorReadingStream": frontendStream,
    "../services/twinSensorStream": twinStream,
  });
  try {
    const res = response();
    await controller.insertSensorReading({ body: { room_id: 1 } }, res);
    assert.equal(res.body.readingId, saved.reading_id);
    assert.match(twin.messages[0], /^event: sensor-reading\n/);
    assert.deepEqual(JSON.parse(twin.messages[0].split("data: ")[1]), saved);
    assert.equal(frontend.messages.length, 1);
    unsubscribe();
    twinStream.publishSensorReading(reading(2));
    assert.equal(twin.messages.length, 1);
    assert.equal(frontend.messages.length, 1);
    frontendStream.publishSensorReading(saved);
    assert.equal(frontend.messages.length, 2);
  } finally {
    unsubscribe(); unsubscribeFrontend();
  }
});

test("twin stream loads the database snapshot, receives live updates and cleans up on close", async () => {
  let resolveSnapshot;
  const snapshot = new Promise((resolve) => { resolveSnapshot = resolve; });
  const controller = load("../src/controller/twinController.js", {
    "../config/supabase": { from: () => ({ select: async () => ({ data: [{ room_id: 1 }] }) }) },
    "../models/SensorReading": { getLatestSensorReading: () => snapshot },
    "../services/twinSensorStream": twinStream,
  });
  const req = new EventEmitter(), res = response();
  const connecting = controller.streamSensors(req, res);
  try {
    const live = reading();
    twinStream.publishSensorReading(live);
    assert.ok(res.messages.some((frame) => frame.includes(JSON.stringify(live))));
    const older = reading(1, new Date(Date.now() - 5000).toISOString());
    resolveSnapshot(older);
    await connecting;
    assert.ok(res.messages.some((frame) => frame.includes(JSON.stringify(older))));
  } finally {
    resolveSnapshot(null);
    res.emit("close");
    await connecting;
  }
  const count = res.messages.length;
  twinStream.publishSensorReading(reading());
  assert.equal(res.messages.length, count);
});

test("twin closes and unsubscribes when its initial database query fails", async () => {
  const controller = load("../src/controller/twinController.js", {
    "../config/supabase": { from: () => ({ select: async () => ({ error: new Error("offline") }) }) },
    "../models/SensorReading": {}, "../services/twinSensorStream": twinStream,
  }, { console: { error() {} } });
  const res = response();
  await controller.streamSensors(new EventEmitter(), res);
  assert.ok(res.messages.some((frame) => frame.startsWith("event: stream-error")));
  assert.equal(res.writableEnded, true);
  const count = res.messages.length;
  twinStream.publishSensorReading(reading());
  assert.equal(res.messages.length, count);
});

test("digital twin consumes named sensor events and ignores stale, invalid and older readings", () => {
  let source;
  class EventSource {
    constructor(url) { this.url = url; this.handlers = {}; source = this; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    close() { this.closed = true; }
  }
  const live = load("../../digital_twin/js/live.js", {}, {
    FB: { Layout: { apiUrl: () => "https://backend.test" } }, EventSource,
  });
  live.connect();
  assert.equal(source.url, "https://backend.test/api/twin/stream");
  source.onopen();
  assert.equal(live.status(), "connected");
  const now = Date.now();
  const fresh = reading(1, new Date(now - 1000).toISOString());
  source.handlers["sensor-reading"]({ data: JSON.stringify(fresh) });
  assert.equal(live.readingFor({ roomId: 1 }, now).temp, 32);
  source.handlers["sensor-reading"]({ data: JSON.stringify({ ...fresh,
    timestamp: new Date(now - 5000).toISOString(), temperature: 100 }) });
  assert.equal(live.readingFor({ roomId: 1 }, now).temp, 32);
  source.handlers["sensor-reading"]({ data: JSON.stringify(reading(2, new Date(now - 60000).toISOString())) });
  assert.equal(live.readingFor({ roomId: 2 }, now), null);
  assert.equal(live.liveCount(now), 1);
  assert.equal(live._ingestReading({ ...fresh, timestamp: "invalid" }), false);
  assert.equal(live._ingestReading({ ...fresh, room_id: null }), false);
  assert.equal(live._ingestReading({ ...fresh, temperature: null }), false);
  assert.equal(live._ingestReading({ ...fresh, timestamp: new Date(now + 60000).toISOString() }), false);
  source.handlers["sensor-reading"]({ data: "invalid json" });
  live.disconnect();
  assert.equal(source.closed, true);
  assert.equal(live.liveCount(now), 0);
});
