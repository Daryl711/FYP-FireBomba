const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(relativePath, mocks) {
  const filename = path.resolve(__dirname, relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, console,
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  return module.exports;
}

function modelWithResults(...results) {
  const queries = [];
  const supabase = { from(table) {
    const result = results.shift();
    assert.ok(result, `Unexpected query to ${table}`);
    const query = { table, filters: [] };
    queries.push(query);
    const chain = {
      select(columns) { query.columns = columns; return chain; },
      eq(column, value) { query.filters.push([column, value]); return chain; },
      order(column) { query.order = column; return chain; },
      maybeSingle() { return Promise.resolve(result); },
      then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    };
    return chain;
  } };
  return { model: load("../src/models/Bilik.js", { "../config/supabase": supabase }), queries };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const row = { room_id: 7, name: "Kitchen", status: "NORMAL", last_updated: "2026-10-25", camera_enabled: true, space_type: "DAPUR" };
const room = { roomId: 7, name: "Kitchen", status: "NORMAL", lastUpdated: "2026-10-25", cameraEnabled: true, spaceType: "DAPUR" };

test("home reads Bilik directly even when the household has no rooms", async () => {
  const { model, queries } = modelWithResults({ data: { bilik_id: 2, bilik_number: "BILIK-02", household_name: "Abu" } });
  assert.deepEqual(plain(await model.getBilikData(2)), { bilikId: 2, number: "BILIK-02", householdName: "Abu" });
  assert.equal(queries[0].table, "bilik");
  assert.deepEqual(queries[0].filters, [["bilik_id", 2]]);
  const missing = modelWithResults({ data: null });
  assert.equal(await missing.model.getBilikData(99), null);
});

test("missing household ids never query null or expose unowned rooms", async () => {
  const { model, queries } = modelWithResults();
  assert.equal(await model.getBilikData(null), null);
  assert.deepEqual(plain(await model.getRoomsByBilik(null)), []);
  assert.deepEqual(plain(await model.getRoomIdsByBilik(undefined)), []);
  assert.deepEqual(plain(await model.getUserIdsByBilik(null)), []);
  assert.deepEqual(plain(await model.getRoomData(null)), { bilik: null, rooms: [] });
  assert.equal(queries.length, 0);
});

test("room and notification membership queries stay scoped to their Bilik", async () => {
  const { model, queries } = modelWithResults({ data: [{ room_id: 7 }] }, { data: [row] }, { data: [{ user_id: "user-1" }] });
  assert.deepEqual(plain(await model.getRoomIdsByBilik(2)), [7]);
  assert.deepEqual(plain(await model.getRoomsByBilik(2)), [row]);
  assert.deepEqual(plain(await model.getUserIdsByBilik(2)), ["user-1"]);
  assert.deepEqual(queries.map((query) => query.filters), [[["bilik_id", 2]], [["bilik_id", 2]], [["bilik_id", 2]]]);
});

test("legacy room overview retains its response and isolates shared spaces", async () => {
  const owned = modelWithResults(
    { data: { bilik_id: 2 } },
    { data: { bilik_id: 2, bilik_number: "BILIK-02", household_name: "Abu" } },
    { data: [row] },
  );
  assert.deepEqual(plain(await owned.model.getRoomData(7)), {
    bilik: { bilikId: 2, number: "BILIK-02", householdName: "Abu" }, rooms: [room],
  });
  const shared = modelWithResults({ data: { bilik_id: null } }, { data: [row] });
  assert.deepEqual(plain(await shared.model.getRoomData(7)), { bilik: null, rooms: [room] });
  assert.deepEqual(shared.queries[1].filters, [["room_id", 7]]);
});

test("digital twin selects only public Bilik labels", async () => {
  const { model, queries } = modelWithResults({ data: [{ bilik_id: 2, bilik_number: "BILIK-02" }] });
  assert.deepEqual(plain(await model.getLayoutBiliks()), [{ bilikId: 2, bilikNumber: "BILIK-02" }]);
  assert.equal(queries[0].columns, "bilik_id, bilik_number");
});

test("Bilik database failures propagate rather than looking like empty results", async () => {
  const error = new Error("Database unavailable");
  for (const [method, args] of [["getBilikData", [2]], ["getLayoutBiliks", []], ["getRoomIdsByBilik", [2]], ["getRoomsByBilik", [2]], ["getUserIdsByBilik", [2]], ["getRoomData", [7]]]) {
    const { model } = modelWithResults({ error });
    await assert.rejects(model[method](...args), (actual) => actual === error);
  }
});

function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = plain(body); return this; } };
}

test("home routes use the Bilik model and keep the frontend room response", async () => {
  const { model, queries } = modelWithResults({ data: { bilik_id: 2, bilik_number: "BILIK-02", household_name: "Abu" } }, { data: [row] });
  const controller = load("../src/controller/homeController.js", { "../models/Bilik": model, "../models/SensorReading": {} });
  const res = response();
  await controller.getBilikData({ user: { bilikId: 2, id: "auth-user-id" } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.bilikId, 2);
  assert.deepEqual(queries[0].filters, [["bilik_id", 2]]);
  await controller.getRoomsByBilik({ user: { bilikId: 2 }, params: { bilikId: "2" } }, res);
  assert.deepEqual(res.body, [room]);
});

test("home rejects invalid or other-household room requests before querying", async () => {
  const { model, queries } = modelWithResults();
  const controller = load("../src/controller/homeController.js", { "../models/Bilik": model, "../models/SensorReading": {} });
  for (const [id, owner, status] of [["3", 2, 403], ["2", null, 403], ["invalid", 2, 400], ["0", 2, 400], ["1.5", 2, 400]]) {
    const res = response();
    await controller.getRoomsByBilik({ user: { bilikId: owner }, params: { bilikId: id } }, res);
    assert.equal(res.code, status);
  }
  assert.equal(queries.length, 0);
});

test("authentication derives room access from the Bilik model", async () => {
  const middleware = load("../src/middleware/auth.js", {
    "../config/supabase": { auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } },
    "../models/UserProfile": { getById: async () => ({ bilik_id: 2 }) },
    "../models/Bilik": { getRoomIdsByBilik: async (id) => { assert.equal(id, 2); return [7, 8]; } },
  });
  for (const [requested, expected] of [["8", 8], ["99", 7]]) {
    const req = { headers: { authorization: "Bearer test-token" }, query: { roomId: requested } };
    let proceeded = false;
    await middleware(req, response(), () => { proceeded = true; });
    assert.equal(proceeded, true);
    assert.equal(req.user.bilikId, 2);
    assert.equal(req.user.roomId, expected);
  }
});

test("digital twin controller gets Bilik labels from the model and preserves layout format", async () => {
  const controller = load("../src/controller/twinController.js", {
    "../models/Bilik": { getLayoutBiliks: async () => [{ bilikId: 2, bilikNumber: "BILIK-02" }] },
    "../config/supabase": { from: (table) => {
      assert.equal(table, "rooms", "controller must not access the Bilik table directly");
      return { select: () => ({ order: async () => ({ data: [{ room_id: 7, name: "Kitchen", space_type: "DAPUR", bilik_id: 2 }] }) }) };
    } },
    "../models/SensorReading": {}, "../services/twinSensorStream": {},
  });
  const res = response();
  await controller.getLayout({}, res);
  assert.deepEqual(res.body, {
    bilik: [{ bilikId: 2, bilikNumber: "BILIK-02" }],
    rooms: [{ roomId: 7, name: "Kitchen", spaceType: "DAPUR", bilikId: 2 }],
  });
});
