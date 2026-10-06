const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseSensorTimestamp } = require("../src/utils/sensorTimestamp");

test("Pi local times resolve to the same instant regardless of server timezone", () => {
  assert.equal(
    parseSensorTimestamp("2026-10-07T14:05:00").toISOString(),
    "2026-10-07T06:05:00.000Z",
  );
  assert.equal(
    parseSensorTimestamp("2026-10-07 14:05:00.123456").toISOString(),
    "2026-10-07T06:05:00.123Z",
  );
});

test("explicit timezone offsets are preserved", () => {
  for (const value of ["2026-10-07T06:05:00Z", "2026-10-07T14:05:00+08:00"]) {
    assert.equal(parseSensorTimestamp(value).toISOString(), "2026-10-07T06:05:00.000Z");
  }
});

test("missing or invalid timestamps remain invalid", () => {
  for (const value of [null, undefined, "", "invalid"]) {
    assert.ok(Number.isNaN(parseSensorTimestamp(value).getTime()));
  }
});
