const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const stream = require("../src/services/riskStatusStream");

function response() {
  const res = new EventEmitter();
  res.messages = [];
  res.write = (message) => res.messages.push(message);
  res.status = () => res;
  res.set = () => res;
  res.flushHeaders = () => {};
  res.json = (body) => { res.body = body; };
  return res;
}

function risk(score, level, timestamp = new Date().toISOString()) {
  return { risk_score: score, risk_level: level, timestamp };
}

function loadWithMocks(relativePath, mocks) {
  const filename = path.resolve(__dirname, relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, console, setInterval, clearInterval,
    require: (name) => name in mocks ? mocks[name] : require(name),
  }, { filename });
  return module.exports;
}

test("streams scaled scores and preserves flame override severity per room", () => {
  const first = response();
  const other = response();
  const close = stream.subscribeToRoom(101, first);
  const closeOther = stream.subscribeToRoom(102, other);
  assert.equal(stream.publishRiskStatus(101, risk(0.4, "Warning")), true);
  assert.equal(first.messages.length, 1);
  assert.equal(other.messages.length, 0);
  const data = JSON.parse(first.messages[0].split("data: ")[1]);
  assert.equal(data.score, 40);
  assert.equal(data.severity, "Warning");
  assert.equal(data.room_id, "101");
  for (const [score, level] of [[0, "Normal"], [0.751, "Critical"], [1, "Critical"]]) {
    stream.publishRiskStatus(101, risk(score, level));
    assert.equal(JSON.parse(first.messages.at(-1).split("data: ")[1]).score,
      Math.round(score * 1000) / 10);
  }
  close();
  closeOther();
  stream.publishRiskStatus(101, risk(0, "Normal"));
  assert.equal(first.messages.length, 4);
});

test("replays a fresh result and rejects malformed, stale and out-of-order results", () => {
  const timestamp = new Date(Date.now() - 1000).toISOString();
  stream.publishRiskStatus(201, risk(0.82, "Critical", timestamp));
  const res = response();
  const close = stream.subscribeToRoom(201, res);
  assert.equal(res.messages.length, 1);
  for (const invalid of [null, {}, risk(-1, "Normal"), risk(1.1, "Critical"),
    risk(NaN, "Warning"), risk("0.5", "Warning"), risk(0, "Unknown"),
    risk(0, "Normal", "bad"), risk(0, "Normal", new Date(Date.now() - 31000).toISOString()),
    risk(0, "Normal", new Date(Date.now() + 10000).toISOString()),
    risk(0, "Normal", new Date(Date.now() - 2000).toISOString())]) {
    assert.equal(stream.publishRiskStatus(201, invalid), false);
  }
  assert.equal(res.messages.length, 1);
  close();
});

test("cloud MQTT subscribes to risk and routes risk messages into SSE", () => {
  const client = new EventEmitter();
  let subscribed;
  client.subscribe = (topics, options, callback) => { subscribed = topics; callback(null, []); };
  const service = loadWithMocks("../src/services/mqttService.js", {
    mqtt: { connect: () => client },
    "../config/mqtt": { protocol: "mqtts", host: "test", port: 8883 },
    "./riskStatusStream": stream,
    events: EventEmitter,
  });
  const res = response();
  const close = stream.subscribeToRoom(301, res);
  client.emit("connect");
  assert.ok(subscribed.includes("firebomba/room/+/risk"));
  client.emit("message", "firebomba/room/301/risk", Buffer.from(JSON.stringify(risk(0.82, "Critical"))));
  assert.match(res.messages[0], /event: risk-status/);
  assert.equal(JSON.parse(res.messages[0].split("data: ")[1]).score, 82);
  let pump;
  service.mqttEvents.on("pump-status", (message) => { pump = message; });
  client.emit("message", "firebomba/room/301/pump/status", Buffer.from('{"state":1}'));
  assert.equal(pump.data.state, 1);
  close();
});

test("sensor SSE authorizes room access and unsubscribes risk on disconnect", async () => {
  let allowed = false;
  const controller = loadWithMocks("../src/controller/roomDetailController.js", {
    "../services/mqttService": { mqttEvents: new EventEmitter() },
    "../models/Actuator": {}, "../models/SensorAggregate": {},
    "../models/Room": { userCanAccessRoom: async () => allowed },
    "../models/SensorReading": { getRecentSensorReadings: async () => [] },
    "../services/sensorReadingStream": { subscribeToRoom: () => () => {} },
    "../services/sensorAggregateStream": {},
    "../services/riskStatusStream": stream,
  });
  const req = new EventEmitter();
  req.query = { roomId: "401" };
  req.user = { id: 7 };
  const denied = response();
  await controller.streamSensorReadings(req, denied);
  assert.equal(denied.body.error, "Room access denied");
  assert.equal(denied.messages.length, 0);
  allowed = true;
  const res = response();
  await controller.streamSensorReadings(req, res);
  try {
    stream.publishRiskStatus(401, risk(0.4, "Warning"));
    assert.match(res.messages.at(-1), /risk-status/);
  } finally {
    res.emit("close");
  }
  const count = res.messages.length;
  stream.publishRiskStatus(401, risk(0.9, "Critical"));
  assert.equal(res.messages.length, count);
});
