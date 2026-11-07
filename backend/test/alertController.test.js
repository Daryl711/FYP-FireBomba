const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { load } = require("./helpers/load");

const THRESHOLDS = { temperature: 60.0, smoke: 300.0, gas: 500.0 };

// Loads the real alert controller with the alert model, database and MQTT faked.
function alerts({ stored = [], affected = 1, rooms = { 5: { user_id: "owner", name: "Kitchen" } }, fail = false } = {}) {
  const log = [];
  const mqttEvents = new EventEmitter();
  const maybeFail = () => { if (fail) throw new Error("database down"); };
  const Alert = {
    getAlertsByUser: async (userId) => { maybeFail(); log.push(["list", userId]); return stored; },
    markRead: async (id, userId) => { maybeFail(); log.push(["read", id, userId]); return affected; },
    deleteAlert: async (id, userId) => { maybeFail(); log.push(["delete", id, userId]); return affected; },
    markAllRead: async (userId) => { maybeFail(); log.push(["readAll", userId]); },
    hideAllAlerts: async (userId) => { maybeFail(); log.push(["hideAll", userId]); },
    createAlert: async (...args) => { maybeFail(); log.push(["create", ...args]); return 77; },
  };
  const db = {
    query: async (sql, [roomId] = []) => { maybeFail(); return [rooms[roomId] ? [rooms[roomId]] : []]; },
  };
  const api = load("controller/alertController.js", {
    "../models/AlertNotification": Alert, "../config/supabase": db,
    "../services/mqttService": { mqttEvents }, "../config/thresholds": THRESHOLDS,
  });
  const run = async (name, req) => {
    const { response } = require("./helpers/load");
    const res = response();
    await api[name]({ user: { userId: "user-1" }, params: {}, body: {}, ...req }, res);
    return res;
  };
  return { run, log, mqttEvents };
}
const ago = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
const flush = () => new Promise((resolve) => setImmediate(resolve));

// ---------- Alerts from the Pi over MQTT ----------

test("an MQTT message on home/room-N/alerts creates an alert; other topics are ignored", async () => {
  const { log, mqttEvents } = alerts();
  mqttEvents.emit("new-reading", { topic: "home/room-3/alerts", data: { roomId: 3 } });
  mqttEvents.emit("new-reading", { topic: "home/room-3/sensors", data: { roomId: 3 } });
  mqttEvents.emit("new-reading", { topic: "home/room-x/alerts", data: { roomId: 3 } });
  await flush();
  assert.equal(log.length, 1);
  assert.deepEqual(log[0][0], "create");
  assert.deepEqual(log[0][1], { roomId: 3 });
});

test("a failed MQTT alert save does not crash the server", async () => {
  const { mqttEvents } = alerts({ fail: true });
  mqttEvents.emit("new-reading", { topic: "home/room-1/alerts", data: {} });
  await flush();
});

// ---------- Alert list ----------

test("the alert list is the user's own alerts in the app's format with a relative time", async () => {
  const stored = [
    { alert_id: 1, room_name: "Kitchen", room_id: 5, warning_title: "Smoke", is_read: false, timestamp: ago(30) },
    { alert_id: 2, room_name: null, room_id: 6, warning_title: "Heat", is_read: true, timestamp: ago(5 * 60) },
    { alert_id: 3, room_name: "Hall", room_id: 7, warning_title: "Gas", is_read: true, timestamp: ago(3 * 3600) },
    { alert_id: 4, room_name: "Bed", room_id: 8, warning_title: "Flame", is_read: true, timestamp: ago(2 * 86400) },
  ];
  const { run, log } = alerts({ stored });
  const res = await run("getAlerts");
  assert.equal(res.code, 200);
  assert.deepEqual(log, [["list", "user-1"]]);
  assert.deepEqual(res.body[0], { id: 1, room: "Kitchen", roomId: 5, warningTitle: "Smoke", unread: true, time: "30s ago" });
  assert.equal(res.body[1].room, "Unknown Room");
  assert.equal(res.body[1].unread, false);
  assert.deepEqual(res.body.map((a) => a.time), ["30s ago", "5m ago", "3h ago", "2d ago"]);
});

// ---------- Read, clear, read-all, clear-all ----------

test("marking read and clearing only touch the logged-in user's copy of the alert", async () => {
  for (const [name, action, message] of [["markAlertRead", "read", "Alert marked as read"], ["deleteAlert", "delete", "Alert cleared"]]) {
    const { run, log } = alerts();
    const res = await run(name, { params: { id: "9" } });
    assert.deepEqual([res.code, res.body.message], [200, message]);
    assert.deepEqual(log, [[action, "9", "user-1"]]);
  }
});

test("marking read or clearing an alert the user does not have returns 404", async () => {
  for (const name of ["markAlertRead", "deleteAlert"]) {
    const res = await alerts({ affected: 0 }).run(name, { params: { id: "9" } });
    assert.deepEqual([res.code, res.body.error], [404, "Alert not found"]);
  }
});

test("mark-all-read and clear-all apply to the logged-in user", async () => {
  for (const [name, action] of [["markAllAlertsRead", "readAll"], ["hideAllAlerts", "hideAll"]]) {
    const { run, log } = alerts();
    assert.equal((await run(name)).code, 200);
    assert.deepEqual(log, [[action, "user-1"]]);
  }
});

test("database failures return 500 for every alert action", async () => {
  for (const name of ["getAlerts", "markAlertRead", "deleteAlert", "markAllAlertsRead", "hideAllAlerts"]) {
    const res = await alerts({ fail: true }).run(name, { params: { id: "1" } });
    assert.deepEqual([res.code, res.body.error], [500, "Server error"], name);
  }
});

// ---------- Sensor thresholds (processSensorReading) ----------

const reading = (sensorType, value, roomId = 5) => ({ body: { roomId, sensorType, value } });

test("a sensor reading needs a room, a known sensor type and a value", async () => {
  for (const body of [{ sensorType: "smoke", value: 1 }, { roomId: 5, value: 1 }, { roomId: 5, sensorType: "smoke" }, { roomId: 5, sensorType: "humidity", value: 1 }]) {
    const { run, log } = alerts();
    assert.equal((await run("processSensorReading", { body })).code, 400, JSON.stringify(body));
    assert.equal(log.length, 0);
  }
  assert.equal((await alerts().run("processSensorReading", reading("smoke", 1, 99))).code, 404);
});

test("readings just below a threshold make no alert; at or above it they do", async () => {
  for (const [sensorType, limit, unit] of [["temperature", 60, "°C"], ["smoke", 300, "ppm"], ["gas", 500, "ppm"]]) {
    for (const [value, expected] of [[limit - 0.1, false], [limit, true], [limit + 100, true]]) {
      const { run, log } = alerts();
      const res = await run("processSensorReading", reading(sensorType, value));
      assert.equal(res.code, 201);
      assert.equal(res.body.alertCreated, expected, `${sensorType}=${value}`);
      if (expected) {
        const [, userId, roomId, type, level, description] = log[0];
        assert.deepEqual([userId, roomId, type, level], ["owner", 5, sensorType, "warning"]);
        assert.match(description, new RegExp(`${value} ?${unit}.*Kitchen.*Threshold: ${limit} ?${unit}`));
      } else {
        assert.equal(log.length, 0);
      }
    }
  }
});

test("a flame value of 1 makes an urgent alert and 0 makes none", async () => {
  let { run, log } = alerts();
  let res = await run("processSensorReading", reading("flame", 1));
  assert.deepEqual([res.body.alertCreated, res.body.alertId], [true, 77]);
  assert.equal(log[0][5], "Flame detected in Kitchen! Immediate action required.");
  ({ run, log } = alerts());
  res = await run("processSensorReading", reading("flame", 0));
  assert.equal(res.body.alertCreated, false);
  assert.equal(log.length, 0);
});
