// Shared helpers for the backend unit tests.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const quietConsole = { log() {}, warn() {}, error() {}, info() {} };

// Runs one source file in a sandbox where every require() is answered by a
// fake from `mocks`, so the test controls the database, SMS, email, etc.
// Asking for anything not in `mocks` fails the test straight away.
function load(relativePath, mocks = {}, { env = {}, globals = {} } = {}) {
  const filename = path.join(__dirname, "../../src", relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, exports: module.exports, console: quietConsole,
    process: { env }, Buffer, setTimeout, clearTimeout,
    ...globals,
    require(name) {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    },
  }, { filename });
  return module.exports;
}

// Objects made inside the sandbox fail strict deep equality against normal
// objects, so tests compare plain copies.
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// A fake Express response that remembers the status code and JSON body.
const response = () => ({
  code: 200,
  status(code) { this.code = code; return this; },
  json(body) { this.body = plain(body); return this; },
});

module.exports = { load, plain, response };
