const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const plain = (value) => JSON.parse(JSON.stringify(value));
function load(relativePath, mocks, globals = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, console, process: { env: {} }, ...globals,
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  return module.exports;
}

// Exercise the existing models and push service together, with an in-memory
// database and captured Expo requests. No real alarms are sent by these tests.
function pipeline({ users, rooms, devices = [], failPush = false }) {
  const tables = { users, rooms, push_tokens: devices, alert_notifications: [], user_notifications: [] };
  const queries = [];
  const supabase = { from(table) {
    const record = { table, filters: [] };
    queries.push(record);
    let inserted;
    let sortColumn;
    const result = () => {
      let rows = [...tables[table]];
      for (const [column, values] of record.filters) rows = rows.filter((row) => values.includes(row[column]));
      if (sortColumn) rows.sort((a, b) => String(a[sortColumn]).localeCompare(String(b[sortColumn])));
      return { data: rows };
    };
    const query = {
      select(columns) { record.columns = columns; return query; },
      eq(column, value) { record.filters.push([column, [value]]); return query; },
      in(column, values) { record.filters.push([column, values]); return query; },
      order(column) { sortColumn = column; return query; },
      insert(row) {
        const key = table === "alert_notifications" ? "alert_id" : "user_notification_id";
        inserted = { ...row, [key]: tables[table].length + 1 };
        tables[table].push(inserted);
        return query;
      },
      single: async () => ({ data: inserted }),
      maybeSingle: async () => ({ data: result().data[0] ?? null }),
      range: async (start, end) => ({ data: result().data.slice(start, end + 1) }),
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
    return query;
  } };
  const dbMock = { "../config/supabase": supabase };
  const User = load("../src/models/User.js", dbMock);
  const UserNotification = load("../src/models/UserNotification.js", dbMock);
  const PushToken = load("../src/models/PushToken.js", dbMock);
  const requests = [];
  const push = load("../src/services/pushService.js", { "../models/PushToken": PushToken }, {
    console: { error() {} },
    fetch: async (_url, options) => {
      if (failPush) throw new Error("Push provider offline");
      const messages = JSON.parse(options.body);
      requests.push(messages);
      return { ok: true, json: async () => ({ data: messages.map(() => ({ status: "ok" })) }) };
    },
  });
  const Alert = load("../src/models/AlertNotification.js", {
    ...dbMock, "./User": User, "./UserNotification": UserNotification,
    "../services/pushService": push,
  });
  return { Alert, User, tables, queries, requests };
}

test("fire alerts reach every household, role, and registered device through the existing pipeline", async () => {
  const users = [
    { user_id: "owner", bilik_id: 1, role: "user" },
    { user_id: "neighbour", bilik_id: 2, role: "user" },
    { user_id: "admin", bilik_id: null, role: "admin" },
    { user_id: "no-device", bilik_id: 3, role: "user" },
  ];
  const p = pipeline({ users, rooms: [{ room_id: 7, name: "Kitchen", bilik_id: 1 }], devices: [
    { user_id: "owner", token: "owner-phone", alarm_sound: "siren" },
    { user_id: "neighbour", token: "neighbour-phone", alarm_sound: "bell" },
    { user_id: "neighbour", token: "neighbour-tablet", alarm_sound: "beep" },
    { user_id: "admin", token: "admin-phone", alarm_sound: null },
  ] });
  assert.deepEqual(plain(await p.Alert.createAlert({ roomId: 7, warningTitles: "Fire Detected" })), [1]);
  assert.equal(p.tables.alert_notifications.length, 1);
  assert.deepEqual(p.tables.user_notifications.map((row) => row.user_id).sort(), users.map((row) => row.user_id).sort());
  assert.ok(p.tables.user_notifications.every((row) => row.alert_id === 1));
  const messages = p.requests.flat();
  assert.equal(messages.length, 4);
  assert.deepEqual(messages.map((message) => message.to).sort(), ["admin-phone", "neighbour-phone", "neighbour-tablet", "owner-phone"]);
  for (const message of messages) {
    assert.match(message.body, /Kitchen \(Room 7\): Fire Detected/);
    assert.deepEqual(message.data, { type: "fire", roomId: 7, roomName: "Kitchen", alertIds: [1] });
    assert.equal(message.priority, "high");
  }
  assert.equal(messages.find((message) => message.to === "owner-phone").sound, "fire_alarm_siren.wav");
  assert.equal(messages.find((message) => message.to === "neighbour-phone").sound, "fire_alarm_bell.wav");
  assert.ok(p.queries.filter((query) => query.table === "users").every((query) => query.filters.length === 0));
});

test("a fire in a shared space is broadcast and multiple warnings retain separate unread records", async () => {
  const p = pipeline({ users: [{ user_id: "user", bilik_id: 1 }], rooms: [{ room_id: 9, name: "Shared space", bilik_id: null }] });
  assert.deepEqual(plain(await p.Alert.createAlert({ roomId: 9, warningTitles: ["Fire Detected", "Smoke detected"] })), [1, 2]);
  assert.deepEqual(p.tables.user_notifications.map((row) => row.alert_id), [1, 2]);
});

test("all-user and device queries paginate and Expo requests stay within 100 messages", async () => {
  const users = Array.from({ length: 501 }, (_, i) => ({ user_id: `user-${String(i).padStart(4, "0")}`, bilik_id: i + 1 }));
  const devices = users.map((user, i) => ({ user_id: user.user_id, token: `device-${i}` }));
  // A single user's many devices also exceed one page of push tokens.
  devices.push(...Array.from({ length: 501 }, (_, i) => ({ user_id: users[0].user_id, token: `extra-${i}` })));
  const p = pipeline({ users, devices, rooms: [{ room_id: 7, name: "Kitchen" }] });
  await p.Alert.createAlert({ roomId: 7, warningTitles: "Fire Detected" });
  assert.equal(p.tables.user_notifications.length, 501);
  assert.equal(p.queries.filter((query) => query.table === "users").length, 2);
  const messages = p.requests.flat();
  assert.equal(messages.length, devices.length);
  assert.equal(new Set(messages.map((message) => message.to)).size, devices.length);
  assert.ok(p.requests.every((batch) => batch.length <= 100));
});

test("push failures preserve each user's in-app fire notification", async () => {
  const p = pipeline({ users: [{ user_id: "user" }], rooms: [{ room_id: 7, name: "Kitchen" }], devices: [{ user_id: "user", token: "device" }], failPush: true });
  assert.deepEqual(plain(await p.Alert.createAlert({ roomId: 7, warningTitles: "Fire Detected" })), [1]);
  assert.equal(p.tables.user_notifications.length, 1);
});

test("no warnings never create notifications or pushes", async () => {
  const p = pipeline({ users: [], rooms: [] });
  assert.deepEqual(plain(await p.Alert.createAlert({ roomId: 7 })), []);
  assert.equal(p.queries.length, 0);
  assert.equal(p.requests.length, 0);
});

test("older push-token schemas retain the default alarm fallback", async () => {
  const columns = [];
  const PushToken = load("../src/models/PushToken.js", { "../config/supabase": { from: () => {
    let selected;
    const query = {
      select(value) { selected = value; columns.push(value); return query; },
      in() { return query; }, order() { return query; },
      range: async () => selected === "token, alarm_sound"
        ? { error: { code: "42703", message: "alarm_sound missing" } }
        : { data: [{ token: "device" }] },
    };
    return query;
  } } });
  assert.deepEqual(plain(await PushToken.getTokensForUsers(["user"])), [{ token: "device", alarmSound: null }]);
  assert.deepEqual(columns, ["token, alarm_sound", "token"]);
});
