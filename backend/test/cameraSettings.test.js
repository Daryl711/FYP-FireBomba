const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function controller(canAccess = true) {
  const reads = [], writes = [], checks = [];
  const Room = {
    userCanAccessRoom: async (roomId, userId) => { checks.push([roomId, userId]); return canAccess; },
    getCameraStatus: async (roomId) => { reads.push(roomId); return false; },
    updateCameraStatus: async (value, roomId) => writes.push([value, roomId]),
    getRoomName: async () => "Bedroom",
  };
  const module = { exports: {} };
  const filename = path.join(__dirname, "../src/controller/settingsController.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, console,
    require(name) {
      if (name === "../models/Room") return Room;
      if (name === "../models/auditLog") return { createLog: async () => {} };
      return {};
    },
  });
  return { api: module.exports, reads, writes, checks };
}
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const request = (roomId, cameraStatus = true) => ({ query: { roomId }, body: { cameraStatus }, user: { id: "user-1", userId: "user-1", roomId: 7 } });

test("camera reads and writes use the selected room rather than the user's default room", async () => {
  const { api, reads, writes, checks } = controller();
  const res = response();
  await api.getCameraStatus(request("8"), res);
  assert.equal(res.body.roomId, 8);
  await api.updateCameraStatus(request("8"), response());
  assert.deepEqual(reads, [8, 8]);
  assert.deepEqual(writes, [[true, 8]]);
  assert.deepEqual(checks, [[8, "user-1"], [8, "user-1"]]);
});

test("camera endpoints reject invalid and other-household room IDs before reading or writing settings", async () => {
  for (const method of ["getCameraStatus", "updateCameraStatus"]) {
    for (const roomId of [undefined, "invalid", "0", "-1", "1.5"]) {
      const { api, reads, writes } = controller();
      const res = response();
      await api[method](request(roomId), res);
      assert.equal(res.code, 400);
      assert.equal(reads.length + writes.length, 0);
    }
    const { api, reads, writes } = controller(false);
    const res = response();
    await api[method](request("8"), res);
    assert.equal(res.code, 403);
    assert.equal(reads.length + writes.length, 0);
  }
});

test("camera updates require booleans and accept an already-saved setting", async () => {
  const { api, writes } = controller();
  for (const value of [1, "false", null]) {
    const res = response();
    await api.updateCameraStatus(request("8", value), res);
    assert.equal(res.code, 400);
  }
  const res = response();
  await api.updateCameraStatus(request("8", false), res);
  assert.equal(res.code, 200);
  assert.equal(res.body.cameraStatus, false);
  assert.equal(writes.length, 0);
});
