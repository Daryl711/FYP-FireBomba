const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { create, act } = require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderApp(getRoomsByBilik) {
  const noop = async () => {};
  const api = {
    getStoredSession: async () => ({}),
    getBiometricPreference: async () => false,
    setOnSessionExpired: () => {},
    saveSession: noop, getRefreshToken: noop, logoutUser: noop,
    getAlerts: async () => [], getSystemHealth: noop, getAvatar: noop,
    getBilikData: async () => ({ bilikId: 2, number: "BILIK-02" }),
    getRoomsByBilik,
  };
  const sound = { unloadAsync: noop };
  const imports = {
    react: React,
    "react-native": { Platform: { OS: "android" } },
    "expo-av": { Audio: { setAudioModeAsync: noop, Sound: { createAsync: async () => ({ sound }) } } },
    "expo-secure-store": { getItemAsync: async () => "true", setItemAsync: noop },
    "../services/api": api,
    "../services/biometrics": { getBiometricSupport: async () => ({ available: false }) },
    "../services/notifications": {
      registerForPushNotifications: async () => null,
      addNotificationTapListener: () => ({ remove() {} }),
    },
    "../services/alarmSounds": {
      DEFAULT_ALARM_SOUND: "default", getAlarmSound: () => ({ inApp: 1 }),
      getAlarmSoundPreference: async () => "default",
    },
  };
  const { code } = babel.transformSync(fs.readFileSync(path.join(__dirname, "../src/context/AppContext.js"), "utf8"), {
    babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-react-jsx"), require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const exports = {};
  const timers = [];
  vm.runInNewContext(code, {
    exports, console, setInterval: (callback, interval) => { timers.push(interval); return timers.length; }, clearInterval() {},
    require(name) { assert.ok(name in imports, `Unexpected dependency: ${name}`); return imports[name]; },
  });
  let context;
  function Probe() { context = exports.useApp(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(exports.AppProvider, null, React.createElement(Probe))); });
  await act(async () => { await context.login({ userId: "user-1" }, "access-token", "refresh-token"); });
  return { context: () => context, renderer, timers };
}

test("login loads shared rooms using the authenticated bilik and logout clears them", async () => {
  const rooms = [{ roomId: 7, name: "Kitchen" }];
  const calls = [];
  const app = await renderApp(async (bilikId) => { calls.push(bilikId); return rooms; });
  assert.deepEqual(calls, [2]);
  assert.equal(app.context().roomData, rooms);
  assert.equal(app.context().bilik.bilikId, 2);
  assert.equal(app.context().bilikLoading, false);
  assert.ok(!app.timers.includes(5000), "obsolete sensor polling must not call missing functions");
  await act(async () => { await app.context().logout(); });
  assert.equal(app.context().roomData.length, 0);
  assert.equal(app.context().bilik, null);
  act(() => app.renderer.unmount());
});

test("room loading errors can be retried through the same household loading path", async () => {
  let calls = 0;
  const rooms = [{ roomId: 8, name: "Bedroom" }];
  const app = await renderApp(async () => ++calls === 1 ? { error: "Server unavailable" } : rooms);
  assert.equal(app.context().roomData.error, "Server unavailable");
  assert.equal(app.context().bilikError, "Server unavailable");
  assert.equal(app.context().bilikLoading, false);
  await act(async () => { app.context().refreshRoomData(); });
  assert.equal(calls, 2);
  assert.equal(app.context().roomData, rooms);
  assert.equal(app.context().bilikError, null);
  act(() => app.renderer.unmount());
});

test("a household with no rooms loads as an empty list", async () => {
  const app = await renderApp(async () => []);
  assert.equal(app.context().roomData.length, 0);
  assert.equal(app.context().bilik.bilikId, 2);
  assert.equal(app.context().bilikError, null);
  act(() => app.renderer.unmount());
});
