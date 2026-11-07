const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), {
    module, exports: module.exports, console: { log() {}, error() {} }, Date, Number,
    require(name) {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return module.exports;
}

// Fake Supabase table: holds at most one row per user and records every write.
function fakeSupabase(row = null, { failWith } = {}) {
  const db = { row, writes: [] };
  db.client = {
    from(table) {
      assert.equal(table, "user_fire_safety_progress");
      let pending = null;
      const query = {
        select: () => query,
        eq: (column, value) => { assert.equal(column, "user_id"); assert.equal(value, "user-1"); return query; },
        update(changes) { pending = { type: "update", changes }; return query; },
        upsert(values, options) { pending = { type: "upsert", changes: values, options }; return query; },
        async maybeSingle() { return failWith ? { data: null, error: failWith } : { data: db.row, error: null }; },
        async single() {
          if (failWith) return { data: null, error: failWith };
          db.writes.push(pending);
          db.row = { ...db.row, ...pending.changes };
          delete db.row.user_id;
          return { data: db.row, error: null };
        },
      };
      return query;
    },
  };
  return db;
}

const loadModel = (db) => load("models/FireSafetyProgress.js", { "../config/supabase": db.client });
// Objects made inside the vm sandbox fail strict deep equality, so compare plain copies.
const plain = (value) => JSON.parse(JSON.stringify(value));
const passedRow = (score) => ({ quiz_passed: true, passed_at: "2026-11-01T00:00:00.000Z", best_quiz_score: score });

// ---------- Model ----------

test("a user with no saved progress is reported as not passed", async () => {
  const model = loadModel(fakeSupabase(null));
  assert.deepEqual(plain(await model.getByUserId("user-1")), { quiz_passed: false, passed_at: null, best_quiz_score: null });
});

test("the first pass saves the score and the time it was passed", async () => {
  const db = fakeSupabase(null);
  const result = await loadModel(db).recordQuizPass("user-1", 8);
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].type, "upsert");
  assert.equal(db.writes[0].changes.user_id, "user-1");
  assert.deepEqual(plain(db.writes[0].options), { onConflict: "user_id" });
  assert.equal(result.quiz_passed, true);
  assert.equal(result.best_quiz_score, 8);
  assert.ok(!Number.isNaN(Date.parse(result.passed_at)));
});

test("a lower or equal score never overwrites the saved best score", async () => {
  for (const score of [8, 9]) {
    const db = fakeSupabase(passedRow(9));
    const result = await loadModel(db).recordQuizPass("user-1", score);
    assert.equal(db.writes.length, 0);
    assert.deepEqual(plain(result), passedRow(9));
  }
});

test("a higher score updates only the best score and keeps the original pass date", async () => {
  const db = fakeSupabase(passedRow(8));
  const result = await loadModel(db).recordQuizPass("user-1", 10);
  assert.deepEqual(plain(db.writes), [{ type: "update", changes: { best_quiz_score: 10 } }]);
  assert.deepEqual(plain(result), passedRow(10));
});

test("database errors are thrown instead of looking like an unpassed quiz", async () => {
  const failure = new Error("database down");
  const model = loadModel(fakeSupabase(null, { failWith: failure }));
  await assert.rejects(model.getByUserId("user-1"), failure);
  await assert.rejects(model.recordQuizPass("user-1", 9), failure);
});

// ---------- Controller ----------

function loadController(progress = {}) {
  const calls = [];
  const FireSafetyProgress = {
    getByUserId: async (userId) => { calls.push(["get", userId]); return progress.get ?? passedRow(9); },
    recordQuizPass: async (userId, score) => {
      calls.push(["record", userId, score]);
      if (progress.fail) throw new Error("database down");
      return passedRow(score);
    },
  };
  const api = load("controller/profileController.js", {
    "../models/UserProfile": {}, "../models/OtpCode": {}, "../services/smsService": {},
    "../models/FireSafetyProgress": FireSafetyProgress,
  });
  return { api, calls };
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const request = (body) => ({ body, user: { userId: "user-1" } });

test("quiz pass rejects missing, failing, too-high and non-whole scores without saving", async () => {
  for (const body of [undefined, {}, { score: null }, { score: "abc" }, { score: 7 }, { score: 0 }, { score: 11 }, { score: 8.5 }, { score: -9 }]) {
    const { api, calls } = loadController();
    const res = response();
    await api.recordFireSafetyQuizPass(request(body), res);
    assert.equal(res.code, 400, `score ${JSON.stringify(body)} should be rejected`);
    assert.equal(calls.length, 0);
  }
});

test("quiz pass accepts scores 8 to 10, including numbers sent as text, for the logged-in user", async () => {
  for (const [score, saved] of [[8, 8], [9, 9], [10, 10], ["10", 10]]) {
    const { api, calls } = loadController();
    const res = response();
    await api.recordFireSafetyQuizPass(request({ score }), res);
    assert.equal(res.code, 200);
    assert.deepEqual(calls, [["record", "user-1", saved]]);
    assert.deepEqual(plain(res.body), { quizPassed: true, passedAt: "2026-11-01T00:00:00.000Z", bestQuizScore: saved });
  }
});

test("progress is returned in the app's format and defaults to not passed", async () => {
  const { api } = loadController({ get: { quiz_passed: false, passed_at: null, best_quiz_score: null } });
  const res = response();
  await api.getFireSafetyProgress(request(), res);
  assert.equal(res.code, 200);
  assert.deepEqual(plain(res.body), { quizPassed: false, passedAt: null, bestQuizScore: null });
});

test("database failures return a 500 instead of crashing", async () => {
  const { api } = loadController({ fail: true });
  const res = response();
  await api.recordFireSafetyQuizPass(request({ score: 9 }), res);
  assert.equal(res.code, 500);
  assert.deepEqual(plain(res.body), { error: "Server error" });
});
