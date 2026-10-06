const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { normalizePrediction } = require("../src/utils/sensorPrediction");
const stream = require("../src/services/sensorAggregateStream");

const point = { avg_temperature: 29, avg_humidity: 65, avg_smoke: 100, avg_co: 5 };
const payload = {
  base_time: "2026-10-07T14:00:00+08:00",
  generated_at: "2026-10-07T06:00:03Z",
  predictions: [point, { ...point, avg_temperature: 30 }],
};

function load(relativePath, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, relativePath), "utf8"), {
    module, exports: module.exports,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console: { log() {}, error() {} },
    setInterval: () => 1, clearInterval() {},
  });
  return module.exports;
}

test("forecast timestamps stay anchored to the input window", () => {
  const forecast = normalizePrediction(1, payload);
  assert.equal(forecast.base_time, "2026-10-07T06:00:00.000Z");
  assert.equal(forecast.predictions[0].forecast_at, "2026-10-07T06:05:00.000Z");
  assert.equal(forecast.predictions[1].forecast_at, "2026-10-07T06:10:00.000Z");
  assert.equal(normalizePrediction(1, [point], new Date("2026-10-07T06:02:00Z")).base_time,
    "2026-10-07T06:00:00.000Z");
});

test("invalid or missing metrics and timestamps are rejected", () => {
  for (const invalid of [[], {}, { ...payload, base_time: null },
    { ...payload, predictions: [{ ...point, avg_co: null }] },
    { ...payload, predictions: [{ ...point, avg_co: "bad" }] }]) {
    assert.throws(() => normalizePrediction(1, invalid));
  }
});

test("the subscribed firebomba MQTT topic emits a normalized prediction", () => {
  const client = new EventEmitter();
  let subscriptions;
  client.subscribe = (topics, options, callback) => { subscriptions = topics; callback(null, []); };
  const mqtt = load("../src/services/mqttService.js", {
    mqtt: { connect: () => client },
    "../config/mqtt": {}, events: EventEmitter,
    "../utils/sensorPrediction": { normalizePrediction },
  });
  client.emit("connect");
  assert.ok(subscriptions.includes("firebomba/room/+/sensor-prediction"));
  const forecasts = [];
  mqtt.mqttEvents.on("sensor-prediction", (forecast) => forecasts.push(forecast));
  client.emit("message", "firebomba/room/1/sensor-prediction", Buffer.from(JSON.stringify(payload)));
  assert.equal(forecasts.length, 1);
  assert.equal(forecasts[0].room_id, 1);
  client.emit("message", "firebomba/room/1/sensor-prediction", Buffer.from("bad json"));
  assert.equal(forecasts.length, 1);
});

function controllerHarness(canAccess = true, failStorage = false) {
  const mqttEvents = new EventEmitter();
  const saved = [];
  const controller = load("../src/controller/roomDetailController.js", {
    "../services/mqttService": { mqttEvents },
    "../models/Actuator": {},
    "../models/Room": { userCanAccessRoom: async () => canAccess },
    "../models/SensorReading": {},
    "../models/SensorAggregate": { getRecentByRoom: async () => [] },
    "../models/SensorPrediction": {
      save: async (forecast) => {
        if (failStorage) throw new Error("Database unavailable");
        saved.push(forecast);
      },
      getLatestByRoom: async (roomId) => saved.filter((item) => item.room_id === roomId).at(-1),
    },
    "../services/sensorReadingStream": {},
    "../services/sensorAggregateStream": stream,
  });
  const response = new EventEmitter();
  response.output = [];
  response.status = (status) => { response.statusCode = status; return response; };
  response.set = () => response;
  response.flushHeaders = () => { response.headersSent = true; };
  response.write = (text) => response.output.push(text);
  response.json = () => response;
  const request = new EventEmitter();
  request.query = { roomId: "1" };
  request.user = { id: 7 };
  return { controller, mqttEvents, saved, response, request };
}

test("a prediction received without viewers is saved and replayed on a later connection", async () => {
  const harness = controllerHarness();
  const forecast = normalizePrediction(1, payload);
  harness.mqttEvents.emit("sensor-prediction", forecast);
  await new Promise(setImmediate);
  assert.equal(harness.saved.length, 1);
  await harness.controller.streamSensorAggregates(harness.request, harness.response);
  const message = harness.response.output.find((text) => text.startsWith("event: sensor-prediction"));
  assert.ok(message);
  assert.deepEqual(JSON.parse(message.split("data: ")[1]), forecast);
  harness.response.emit("close");
});

test("room access is checked before replaying stored forecasts", async () => {
  const harness = controllerHarness(false);
  await harness.controller.streamSensorAggregates(harness.request, harness.response);
  assert.equal(harness.response.statusCode, 403);
  assert.equal(harness.response.output.length, 0);
});

test("storage failure does not interrupt live forecasts or the aggregate stream", async () => {
  const harness = controllerHarness(true, true);
  await harness.controller.streamSensorAggregates(harness.request, harness.response);
  harness.mqttEvents.emit("sensor-prediction", normalizePrediction(1, payload));
  await new Promise(setImmediate);
  assert.ok(harness.response.output.some((text) => text.startsWith("event: sensor-prediction")));
  harness.response.emit("close");
});
