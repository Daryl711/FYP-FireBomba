const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { create, act } = require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function loadScreen(file, api, context) {
  const navigation = { focused: true };
  const dialogs = [];
  const animation = { start() {} };
  const imports = {
    react: React,
    "@react-navigation/native": {
      useFocusEffect: (callback) => React.useEffect(() => navigation.focused ? callback() : undefined, [callback, navigation.focused]),
    },
    "react-native": {
      ...Object.fromEntries(["View", "Text", "TouchableOpacity", "Switch", "ActivityIndicator"].map((key) => [key, key])),
      StyleSheet: { create: (styles) => styles },
      Animated: {
        View: "AnimatedView", Value: class { interpolate() { return 0; } stopAnimation() {} setValue() {} },
        loop: () => animation, timing: () => animation, sequence: () => animation, spring: () => animation,
      },
      Alert: { alert: (...args) => dialogs.push(args) },
    },
    "expo-av": { Video: "Video" },
    "react-native-safe-area-context": { SafeAreaView: "SafeAreaView" },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "../../constants/theme": { COLORS: {}, SPACING: {}, RADIUS: {}, SHADOW: {} },
    "../components/TutorialTarget": { __esModule: true, default: "TutorialTarget", TutorialScrollView: "ScrollView" },
    "../components/SensorReadingsChart": { __esModule: true, default: "SensorReadingsChart" },
    "../context/AppContext": { useApp: () => context },
    "../services/api": api,
  };
  const { code } = babel.transformSync(fs.readFileSync(path.join(__dirname, "../src/screens", file), "utf8"), {
    babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-react-jsx"), require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports, console, process: { env: { EXPO_PUBLIC_API_URL: "https://example.test" } },
    setInterval: () => 1, clearInterval() {},
    require(name) { assert.ok(name in imports, `Unexpected dependency: ${name}`); return imports[name]; },
  });
  return { Component: exports.default, navigation, dialogs };
}

test("camera-enabled rooms show the video; disabling and refocusing removes the whole feed section", async () => {
  let enabled = true;
  const calls = [];
  const { Component, navigation } = loadScreen("RoomDetailScreen.js", {
    getCameraStatus: async (roomId) => { calls.push(roomId); return { cameraStatus: enabled }; },
    getPumpStatus: async () => ({ waterPumpStatus: false }),
    subscribeToSensorReadings: async () => () => {},
  }, { t: (key) => key });
  const props = { route: { params: { room: { roomId: 8, name: "Bedroom" } } }, navigation: {} };
  let renderer;
  await act(async () => { renderer = create(React.createElement(Component, props)); });
  assert.deepEqual(calls, [8]);
  assert.equal(renderer.root.findAllByType("Video").length, 1);
  navigation.focused = false;
  await act(async () => { renderer.update(React.createElement(Component, props)); });
  assert.equal(renderer.root.findAllByType("Video").length, 0);
  enabled = false;
  navigation.focused = true;
  await act(async () => { renderer.update(React.createElement(Component, props)); });
  assert.equal(renderer.root.findAllByType("Video").length, 0);
  assert.equal(renderer.root.findAllByType("Text").filter((node) => node.props.children === "REC").length, 0);
  assert.deepEqual(calls, [8, 8]);
  act(() => renderer.unmount());
});

test("Security loads each room and saves only the confirmed room's switch", async () => {
  const reads = [], writes = [];
  const { Component, dialogs } = loadScreen("SecurityScreen.js", {
    getCameraStatus: async (roomId) => { reads.push(roomId); return { cameraStatus: roomId === 7 }; },
    updateCameraStatus: async (value, roomId) => { writes.push([value, roomId]); return { cameraStatus: value }; },
  }, {
    t: (key) => key, roomData: [{ roomId: 7 }, { roomId: 8 }], biometricSupport: { available: false },
  });
  let renderer;
  await act(async () => { renderer = create(React.createElement(Component, { navigation: {} })); });
  assert.deepEqual(reads, [7, 8]);
  const cameraSwitches = () => renderer.root.findAllByType("Switch").slice(1);
  assert.equal(cameraSwitches()[0].props.value, true);
  assert.equal(cameraSwitches()[1].props.value, false);
  act(() => cameraSwitches()[1].props.onValueChange(true));
  assert.equal(writes.length, 0, "opening or cancelling confirmation must not save");
  await act(async () => { await dialogs[0][2][1].onPress(); });
  assert.deepEqual(writes, [[true, 8]]);
  assert.equal(cameraSwitches()[1].props.value, true);
  assert.equal(cameraSwitches()[0].props.value, true);
  act(() => renderer.unmount());
});
