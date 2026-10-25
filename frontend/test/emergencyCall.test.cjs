const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { create, act } = require("react-test-renderer");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function loadComponent(relativePath, overrides = {}) {
  const { code } = babel.transformSync(fs.readFileSync(path.join(__dirname, relativePath), "utf8"), {
    babelrc: false,
    configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-react-jsx"), require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    require(name) {
      if (name in overrides) return overrides[name];
      if (name === "react") return React;
      if (name === "react-native") return {
        ...Object.fromEntries(["View", "Text", "ScrollView", "TouchableOpacity", "ActivityIndicator", "Modal"].map((name) => [name, name])),
        StyleSheet: { create: (styles) => styles },
      };
      if (name.includes("theme")) return { COLORS: {}, SPACING: {}, RADIUS: {}, SHADOW: {} };
      if (name.includes("safe-area")) return { SafeAreaView: "SafeAreaView" };
      if (name.includes("vector-icons")) return { Ionicons: "Ionicons" };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return exports.default;
}

function renderEmergency(openURL) {
  const Component = loadComponent("../src/components/EmergencyCallButton.js", {
    "react-native": {
      Linking: { openURL }, Modal: "Modal", ScrollView: "ScrollView", Text: "Text",
      TouchableOpacity: "TouchableOpacity", View: "View", StyleSheet: { create: (styles) => styles },
    },
  });
  let renderer;
  act(() => { renderer = create(React.createElement(Component, { t: (key) => key })); });
  const buttons = () => renderer.root.findAllByType("TouchableOpacity");
  return { renderer, buttons, modal: () => renderer.root.findByType("Modal") };
}

test("opening, cancelling, and dismissing confirmation never dial", () => {
  const calls = [];
  const { renderer, buttons, modal } = renderEmergency((url) => calls.push(url));
  assert.equal(modal().props.visible, false);
  act(() => buttons()[0].props.onPress());
  assert.equal(modal().props.visible, true);
  assert.equal(calls.length, 0);
  act(() => buttons()[2].props.onPress());
  assert.equal(modal().props.visible, false);
  act(() => buttons()[0].props.onPress());
  act(() => modal().props.onRequestClose());
  assert.equal(modal().props.visible, false);
  assert.equal(calls.length, 0);
  act(() => renderer.unmount());
});

test("explicit confirmation opens tel:999 once even with rapid repeated presses", async () => {
  const calls = [];
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { renderer, buttons, modal } = renderEmergency((url) => { calls.push(url); return pending; });
  act(() => buttons()[0].props.onPress());
  const confirm = buttons()[1].props.onPress;
  let first;
  act(() => { first = confirm(); confirm(); });
  assert.deepEqual(calls, ["tel:999"]);
  assert.equal(buttons()[1].props.disabled, true);
  await act(async () => { resolve(); await first; });
  assert.equal(modal().props.visible, false);
  assert.equal(buttons()[1].props.disabled, false);
  act(() => renderer.unmount());
});

test("phone handoff failure leaves manual dialing guidance and allows cancellation", async () => {
  const { renderer, buttons, modal } = renderEmergency(async () => { throw new Error("No phone app"); });
  act(() => buttons()[0].props.onPress());
  await act(async () => { await buttons()[1].props.onPress(); });
  assert.equal(modal().props.visible, true);
  const error = renderer.root.findByProps({ accessibilityRole: "alert" });
  assert.equal(error.props.children, "home.emergencyCallError");
  assert.equal(buttons()[1].props.disabled, false);
  act(() => buttons()[2].props.onPress());
  assert.equal(modal().props.visible, false);
  act(() => buttons()[0].props.onPress());
  assert.equal(renderer.root.findAllByProps({ accessibilityRole: "alert" }).length, 0);
  act(() => renderer.unmount());
});

test("home reserves a separate emergency row during normal, loading, and error states", () => {
  let context;
  const Home = loadComponent("../src/screens/HomeScreen.js", {
    "../context/AppContext": { useApp: () => context },
    "@react-navigation/native": { useNavigation: () => ({}) },
    "../components/EmergencyCallButton": { __esModule: true, default: "EmergencyCallButton" },
  });
  for (const state of [
    { roomData: [], bilik: { number: "Home" } },
    { roomData: null, bilik: null },
    { roomData: { error: "Offline" }, bilik: null },
  ]) {
    context = { ...state, t: (key) => key, systemStatus: {}, notifications: [] };
    let renderer;
    act(() => { renderer = create(React.createElement(Home)); });
    const emergency = renderer.root.findByType("EmergencyCallButton");
    assert.equal(emergency.parent.type, "SafeAreaView", "emergency control must be outside scrollable content");
    assert.equal(emergency.parent.props.style.flex, 1);
    if (state.bilik) {
      assert.equal(renderer.root.findByType("ScrollView").props.style.flex, 1);
    }
    act(() => renderer.unmount());
  }
});
