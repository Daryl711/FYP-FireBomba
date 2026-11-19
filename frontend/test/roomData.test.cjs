const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { create, act } = require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function renderApp(getRoomsByBilik, { getAlerts = async () => [] } = {}) {
  const noop = async () => {};
  const api = {
    getStoredSession: async () => ({}),
    getBiometricPreference: async () => false,
    setOnSessionExpired: () => {},
    saveSession: noop, getRefreshToken: noop, logoutUser: noop,
    getAlerts, getSystemHealth: noop, getAvatar: noop,
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
    "../services/network": {
      subscribeToNetwork: (listener) => { network.listener = listener; return () => {}; },
    },
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
  const network = { listener: null };
  // Polling timers are recorded, not run; tests fire them by hand.
  const scheduled = [];
  vm.runInNewContext(code, {
    exports, console, setTimeout: (callback, interval) => { timers.push(interval); scheduled.push({ callback, interval }); return scheduled.length; }, clearTimeout() {},
    require(name) { assert.ok(name in imports, `Unexpected dependency: ${name}`); return imports[name]; },
  });
  let context;
  function Probe() { context = exports.useApp(); return null; }
  let renderer;
  await act(async () => { renderer = create(React.createElement(exports.AppProvider, null, React.createElement(Probe))); });
  await act(async () => { await context.login({ userId: "user-1" }, "access-token", "refresh-token"); });
  return { context: () => context, renderer, timers, scheduled, network };
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

test("a failed reload keeps the rooms that were already loaded", async () => {
  const rooms = [{ roomId: 7, name: "Kitchen" }];
  let calls = 0;
  const app = await renderApp(async () => ++calls === 1 ? rooms : { error: "Request timed out." });
  assert.equal(app.context().roomData, rooms);
  await act(async () => { app.context().refreshRoomData(); });
  assert.equal(calls, 2);
  assert.equal(app.context().roomData, rooms, "rooms must not be blanked by a failed reload");
  assert.equal(app.context().bilik.bilikId, 2);
  assert.equal(app.context().bilikError, "Request timed out.");
  act(() => app.renderer.unmount());
});

test("alert polling schedules the next request only after the current one finishes", async () => {
  let release;
  let started = 0;
  const app = await renderApp(async () => [], {
    getAlerts: () => { started += 1; return started === 1 ? Promise.resolve([]) : new Promise((resolve) => { release = resolve; }); },
  });
  const alertTimers = () => app.scheduled.filter((timer) => timer.interval === 10000);
  assert.equal(alertTimers().length, 1);
  await act(async () => { alertTimers()[0].callback(); });
  assert.equal(started, 2);
  assert.equal(alertTimers().length, 1, "no new poll while a request is still in flight");
  await act(async () => { release([]); });
  assert.equal(alertTimers().length, 2);
  act(() => app.renderer.unmount());
});

test("polling is skipped offline and everything refreshes on reconnect", async () => {
  let alertCalls = 0;
  let roomCalls = 0;
  const app = await renderApp(async () => { roomCalls += 1; return []; }, {
    getAlerts: async () => { alertCalls += 1; return []; },
  });
  const before = { alertCalls, roomCalls };
  await act(async () => { app.network.listener(false); });
  assert.equal(app.context().isOnline, false);
  const tick = app.scheduled.filter((timer) => timer.interval === 10000).at(-1);
  await act(async () => { tick.callback(); });
  assert.equal(alertCalls, before.alertCalls, "no request while offline");
  await act(async () => { app.network.listener(true); });
  assert.equal(app.context().isOnline, true);
  assert.equal(alertCalls, before.alertCalls + 1);
  assert.equal(roomCalls, before.roomCalls + 1);
  act(() => app.renderer.unmount());
});

test("refreshRoomData resolves with whether the reload it started worked", async () => {
  let calls = 0;
  const app = await renderApp(async () => ++calls === 2 ? { error: "Request timed out." } : []);
  // Start inside act (so the reload effect runs), await outside it.
  let pending;
  await act(async () => { pending = app.context().refreshRoomData(); });
  let result = await pending;
  assert.equal(result.ok, false);
  await act(async () => { pending = app.context().refreshRoomData(); });
  result = await pending;
  assert.equal(result.ok, true);
  act(() => app.renderer.unmount());
});

test("alerts that fail twice in a row mark the data stale until the next success", async () => {
  let fail = false;
  const app = await renderApp(async () => [], {
    getAlerts: async () => (fail ? { error: "Request timed out." } : []),
  });
  const pollAlerts = async () => {
    const tick = app.scheduled.filter((timer) => timer.interval === 10000).at(-1);
    await act(async () => { tick.callback(); });
  };
  assert.equal(app.context().dataStale, null);
  fail = true;
  await pollAlerts();
  assert.equal(app.context().dataStale, null, "one dropped request is not enough");
  await pollAlerts();
  const stale = app.context().dataStale;
  assert.ok(stale, "two failures in a row mark the data stale");
  assert.equal(typeof stale.lastUpdatedAt, "number", "the time of the last good update is shown");
  fail = false;
  await pollAlerts();
  assert.equal(app.context().dataStale, null);
  act(() => app.renderer.unmount());
});

test("a failed room reload with older rooms on screen is flagged stale at once", async () => {
  let calls = 0;
  const app = await renderApp(async () => ++calls === 2 ? { error: "Request timed out." } : []);
  assert.equal(app.context().dataStale, null);
  let pending;
  await act(async () => { pending = app.context().refreshRoomData(); });
  await pending;
  assert.ok(app.context().dataStale);
  await act(async () => { await app.context().logout(); });
  assert.equal(app.context().dataStale, null, "logging out clears the banner");
  act(() => app.renderer.unmount());
});
