const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, act } = require("react-test-renderer");
const { React, reactNative, loadScreen, button, hasText, press } = require("./helpers/render.cjs");

const t = (key) => key;
const SOUNDS = [{ id: "classic", inApp: "classic.wav" }, { id: "siren", inApp: "siren.wav" }];

async function renderSettings({ permission = "granted", pushRegistered = true, alarmSound = "classic", testResult = { ok: true } } = {}) {
  const log = [];
  const timers = [];
  let currentPermission = permission;
  const Settings = loadScreen("src/screens/NotificationSettingsScreen.js", {
    "react-native": reactNative({
      Alert: { alert: (title, message) => log.push(["alert", title, message]) },
      Linking: { openSettings: () => log.push(["openSettings"]) },
    }),
    "@react-navigation/native": { useFocusEffect: (callback) => React.useEffect(callback, []) },
    "expo-av": { Audio: { Sound: { createAsync: async (file, options) => {
      log.push(["play", file, options.isLooping]);
      return { sound: { stopAsync: async () => log.push(["stop", file]), unloadAsync: async () => log.push(["unload", file]) } };
    } } } },
    "../services/notifications": { getNotificationPermission: async () => currentPermission },
    "../services/alarmSounds": { ALARM_SOUNDS: SOUNDS },
    "../context/AppContext": { useApp: () => ({
      t, pushRegistered, alarmSound,
      registerPush: async () => { log.push(["registerPush"]); currentPermission = "granted"; },
      sendTestAlarm: async () => { log.push(["testAlarm"]); return testResult; },
      changeAlarmSound: (id) => log.push(["changeSound", id]),
    }) },
  }, {
    // Preview timers are captured so tests can fire them on demand.
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    clearTimeout: () => {},
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Settings, { navigation: { goBack() {} } })); });
  const root = renderer.root;
  const did = (kind) => log.filter((entry) => entry[0] === kind);
  return { root, renderer, log, did, timers };
}

test("the push status follows the phone's permission, with a shortcut to settings when off", async () => {
  let s = await renderSettings({ permission: "granted" });
  assert.ok(hasText(s.root, "notificationSettings.pushOn"));
  assert.ok(!hasText(s.root, "notificationSettings.openSettings"));
  act(() => s.renderer.unmount());
  s = await renderSettings({ permission: "denied" });
  assert.ok(hasText(s.root, "notificationSettings.pushOff"));
  act(() => button(s.root, "notificationSettings.openSettings").props.onPress());
  assert.deepEqual(s.did("openSettings"), [["openSettings"]]);
  act(() => s.renderer.unmount());
});

test("the device status shows checking, on, or off with a retry button", async () => {
  for (const [pushRegistered, text] of [[null, "notificationSettings.deviceChecking"], [true, "notificationSettings.deviceOn"], [false, "notificationSettings.deviceOff"]]) {
    const s = await renderSettings({ pushRegistered });
    assert.ok(hasText(s.root, text));
    assert.equal(hasText(s.root, "notificationSettings.retry"), pushRegistered === false);
    act(() => s.renderer.unmount());
  }
});

test("retry registers the device again and re-checks the permission", async () => {
  const s = await renderSettings({ permission: "denied", pushRegistered: false });
  await press(button(s.root, "notificationSettings.retry"));
  assert.deepEqual(s.did("registerPush"), [["registerPush"]]);
  assert.ok(hasText(s.root, "notificationSettings.pushOn"));
  act(() => s.renderer.unmount());
});

test("choosing a different alarm sound saves it; choosing the current one does nothing", async () => {
  const s = await renderSettings({ alarmSound: "classic" });
  act(() => button(s.root, "notificationSettings.sounds.classic.name").props.onPress());
  act(() => button(s.root, "notificationSettings.sounds.siren.name").props.onPress());
  assert.deepEqual(s.did("changeSound"), [["changeSound", "siren"]]);
  act(() => s.renderer.unmount());
});

test("preview plays one looping sound at a time, and pressing again stops it", async () => {
  const s = await renderSettings();
  const play = (id) => s.root.findAllByProps({ accessibilityLabel: "notificationSettings.preview" })
    .find((b) => b.parent.findAllByType("Text").some((x) => x.props.children === `notificationSettings.sounds.${id}.name`));
  await press(play("classic"));
  assert.deepEqual(s.did("play"), [["play", "classic.wav", true]]);
  assert.equal(s.root.findAllByProps({ accessibilityLabel: "notificationSettings.stop" }).length, 1);
  await press(play("siren"));
  assert.deepEqual(s.did("stop"), [["stop", "classic.wav"]], "starting another stops the first");
  await press(s.root.findByProps({ accessibilityLabel: "notificationSettings.stop" }));
  assert.deepEqual(s.did("stop"), [["stop", "classic.wav"], ["stop", "siren.wav"]]);
  assert.equal(s.did("play").length, 2, "pressing stop does not start it again");
  act(() => s.renderer.unmount());
});

test("a preview stops by itself after 4 seconds and when the screen closes", async () => {
  let s = await renderSettings();
  await press(s.root.findAllByProps({ accessibilityLabel: "notificationSettings.preview" })[0]);
  const timer = s.timers.at(-1);
  assert.equal(timer.ms, 4000);
  await act(async () => { await timer.callback(); });
  assert.deepEqual(s.did("stop"), [["stop", "classic.wav"]]);
  act(() => s.renderer.unmount());
  s = await renderSettings();
  await press(s.root.findAllByProps({ accessibilityLabel: "notificationSettings.preview" })[0]);
  await act(async () => { s.renderer.unmount(); });
  assert.deepEqual(s.did("stop"), [["stop", "classic.wav"]]);
});

test("the test alarm reports success, the server's error, or that the device is not registered", async () => {
  for (const [testResult, expected] of [
    [{ ok: true }, ["notificationSettings.testSentTitle", "notificationSettings.testSent"]],
    [{ ok: false, error: "Push service down" }, ["notificationSettings.testFailedTitle", "Push service down"]],
    [{ ok: false }, ["notificationSettings.testFailedTitle", "notificationSettings.testNotRegistered"]],
  ]) {
    const s = await renderSettings({ testResult });
    await press(button(s.root, "notificationSettings.testAlarm"));
    assert.deepEqual(s.did("alert"), [["alert", ...expected]]);
    act(() => s.renderer.unmount());
  }
});

test("the test alarm button is disabled while sending so it cannot be sent twice", async () => {
  let finish;
  const slow = await renderSettings({ testResult: new Promise((resolve) => { finish = resolve; }) });
  let pending;
  act(() => { pending = button(slow.root, "notificationSettings.testAlarm").props.onPress(); });
  const busy = slow.root.findAllByType("TouchableOpacity").find((b) => b.props.disabled === true);
  assert.ok(busy, "button is disabled while sending");
  assert.equal(busy.findAllByType("ActivityIndicator").length, 1);
  await act(async () => { finish({ ok: true }); await pending; });
  assert.equal(slow.root.findAllByType("TouchableOpacity").some((b) => b.props.disabled === true), false);
  act(() => slow.renderer.unmount());
});
