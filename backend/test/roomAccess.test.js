const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadRoom(rooms, users, errors = {}) {
  const queries = [];
  const supabase = {
    from(table) {
      const query = { table, filters: [] };
      queries.push(query);
      const chain = {
        select(columns) { query.columns = columns; return chain; },
        eq(column, value) { query.filters.push([column, value]); return chain; },
        async maybeSingle() {
          const rows = table === "rooms" ? rooms : users;
          return {
            data: rows.find((row) => query.filters.every(([column, value]) => row[column] === value)) ?? null,
            error: errors[table],
          };
        },
      };
      return chain;
    },
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, "../src/models/Room.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports,
    require(name) {
      if (name === "../config/supabase") return supabase;
      if (name === "./Bilik") return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  return { Room: module.exports, queries };
}

const rooms = [{ room_id: 7, bilik_id: 2 }, { room_id: 8, bilik_id: 3 }, { room_id: 9, bilik_id: null }];
const users = [{ user_id: "user-1", bilik_id: 2 }, { user_id: "user-2", bilik_id: 3 }, { user_id: "unassigned", bilik_id: null }];

test("users can access only rooms associated with their bilik", async () => {
  const { Room, queries } = loadRoom(rooms, users);
  assert.equal(await Room.userCanAccessRoom(7, "user-1"), true);
  assert.equal(await Room.userCanAccessRoom(8, "user-1"), false);
  assert.equal(await Room.userCanAccessRoom(8, "user-2"), true);
  assert.equal(await Room.userCanAccessRoom(7, "user-2"), false);
  assert.deepEqual(queries[1].filters, [["user_id", "user-1"], ["bilik_id", 2]]);
});

test("missing and unassigned users or rooms cannot grant access", async () => {
  const { Room } = loadRoom(rooms, users);
  for (const [roomId, userId] of [[99, "user-1"], [7, "missing"], [7, "unassigned"], [9, "user-1"], [9, "unassigned"]]) {
    assert.equal(await Room.userCanAccessRoom(roomId, userId), false);
  }
});

test("missing identifiers deny access without querying the database", async () => {
  const { Room, queries } = loadRoom(rooms, users);
  for (const [roomId, userId] of [[null, "user-1"], [undefined, "user-1"], [7, null], [7, undefined], [7, ""]]) {
    assert.equal(await Room.userCanAccessRoom(roomId, userId), false);
  }
  assert.equal(queries.length, 0);
});

test("database failures propagate without granting access", async () => {
  for (const table of ["rooms", "users"]) {
    const error = new Error(`${table} query failed`);
    const { Room } = loadRoom(rooms, users, { [table]: error });
    await assert.rejects(Room.userCanAccessRoom(7, "user-1"), (actual) => actual === error);
  }
});
