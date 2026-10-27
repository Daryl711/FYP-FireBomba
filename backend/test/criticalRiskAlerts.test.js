const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/services", file), "utf8"), {
    module, exports: module.exports, console: { log() {}, error() {} },
    require(name) {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return module.exports;
}
const risk = (level, timestamp = new Date().toISOString()) => ({
  risk_level: level, risk_score: level === "Critical" ? 0.9 : 0.5, timestamp,
});

test("critical episodes create existing-pipeline alerts once per room and rearm after a lower level", async () => {
  const alerts = [];
  const service = load("criticalRiskAlerts.js", {
    "../models/AlertNotification": { createAlert: async (data) => alerts.push(data) },
  });
  await service.handleRiskStatus(1, risk("Warning"));
  assert.equal(alerts.length, 0);
  await Promise.all(Array.from({ length: 5 }, () => service.handleRiskStatus(1, risk("Critical"))));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].roomId, 1);
  assert.equal(alerts[0].warningTitles, "Critical Fire Risk");
  await service.handleRiskStatus(2, risk("Critical"));
  assert.equal(alerts.length, 2);
  await service.handleRiskStatus(1, risk("Normal"));
  await service.handleRiskStatus(1, risk("Critical"));
  assert.equal(alerts.length, 3);
});

test("failed alert creation retries on the next critical update", async () => {
  let attempts = 0;
  const service = load("criticalRiskAlerts.js", {
    "../models/AlertNotification": { createAlert: async () => {
      if (++attempts === 1) throw new Error("Database unavailable");
    } },
  });
  await service.handleRiskStatus(1, risk("Critical"));
  await service.handleRiskStatus(1, risk("Critical"));
  await service.handleRiskStatus(1, risk("Critical"));
  assert.equal(attempts, 2);
});

test("cloud MQTT invokes the alert pipeline only for valid, fresh, nonretained risk messages", async () => {
  const client = new EventEmitter();
  const alerts = [];
  const service = load("criticalRiskAlerts.js", {
    "../models/AlertNotification": { createAlert: async (data) => alerts.push(data) },
  });
  load("mqttService.js", {
    mqtt: { connect: () => client }, events: EventEmitter,
    "../config/mqtt": { protocol: "mqtts", host: "test", port: 8883 },
    "./riskStatusStream": load("riskStatusStream.js", {}),
    "./criticalRiskAlerts": service,
  });
  const send = (payload, packet) => client.emit("message", "firebomba/room/1/risk", Buffer.from(JSON.stringify(payload)), packet);
  send(risk("Critical"), { retain: true });
  send(risk("Critical", new Date(Date.now() - 60000).toISOString()));
  send({ ...risk("Critical"), risk_score: 2 });
  send(risk("Critical", new Date(Date.now() + 60000).toISOString()));
  assert.equal(alerts.length, 0);
  const timestamp = new Date().toISOString();
  send(risk("Critical", timestamp));
  send(risk("Critical", timestamp));
  await new Promise(setImmediate);
  assert.equal(alerts.length, 1);
  // An out-of-order lower-risk message must not re-arm a critical episode.
  send(risk("Normal", new Date(Date.now() - 5000).toISOString()));
  send(risk("Critical"));
  await new Promise(setImmediate);
  assert.equal(alerts.length, 1);
});
