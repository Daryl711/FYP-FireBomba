const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { create, act } = require("react-test-renderer");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function load(relativePath, imports) {
  const { code } = babel.transformSync(fs.readFileSync(path.join(__dirname, relativePath), "utf8"), {
    babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-react-jsx"), require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, setInterval: () => 1, clearInterval: () => {} });
  return exports;
}

async function renderTour(rooms) {
  const navigations = [];
  let closed = 0;
  const context = { t: (key) => key, bilik: { bilikId: 1 }, language: "en", setLanguage: () => {} };
  const Component = load("../src/components/TutorialOverlay.js", {
    react: React,
    "react-native": {
      ...Object.fromEntries(["View", "Text", "Modal", "TouchableOpacity", "ScrollView"].map((key) => [key, key])),
      StyleSheet: { create: (styles) => styles }, useWindowDimensions: () => ({ width: 390, height: 844 }),
    },
    "react-native-svg": { __esModule: true, default: "Svg", Path: "Path" },
    "../../constants/theme": { COLORS: {}, RADIUS: {}, SHADOW: {} },
    "../context/AppContext": { useApp: () => context },
    "../services/api": { getRoomsByBilik: async () => rooms },
    "../navigation/navigationRef": { navigateInMain: (target) => { navigations.push(target); return () => {}; } },
    "./TutorialTarget": { useTutorialTargets: () => null },
    "./tutorialLayout": load("../src/components/tutorialLayout.js", {}),
  }).default;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Component, { visible: true, onClose: () => { closed++; } }));
  });
  const press = (key) => act(() => {
    const text = renderer.root.findAllByType("Text").find((node) => node.props.children === key);
    assert.ok(text, `Missing control ${key}`);
    text.parent.props.onPress();
  });
  return { renderer, navigations, press, closed: () => closed };
}

test("tour skips unavailable room controls, supports Back, and finishes on Home", async () => {
  const tour = await renderTour([]);
  for (let i = 0; i < 5; i++) tour.press("tutorial.next");
  assert.equal(tour.navigations.at(-1).params.screen, "RoomsList");
  tour.press("tutorial.next");
  assert.equal(tour.navigations.at(-1).screen, "Notifications");
  tour.press("tutorial.back");
  assert.equal(tour.navigations.at(-1).params.screen, "RoomsList");
  for (let i = 0; i < 3; i++) tour.press("tutorial.next");
  assert.equal(tour.navigations.at(-1).params.screen, "Security");
  tour.press("tutorial.done");
  assert.equal(tour.closed(), 1);
  assert.equal(tour.navigations.at(-1).params.screen, "HomeMain");
  act(() => tour.renderer.unmount());
});

test("room steps open an actual room and Skip closes the guide on Home", async () => {
  const room = { roomId: 7, name: "Kitchen" };
  const tour = await renderTour([room]);
  for (let i = 0; i < 6; i++) tour.press("tutorial.next");
  assert.equal(tour.navigations.at(-1).params.screen, "ListRoomDetail");
  assert.equal(tour.navigations.at(-1).params.params.room, room);
  tour.press("tutorial.next");
  assert.ok(tour.renderer.root.findAllByType("Text").some((node) => node.props.children === "tutorial.steps.waterPump.title"));
  tour.press("tutorial.skip");
  assert.equal(tour.closed(), 1);
  assert.equal(tour.navigations.at(-1).params.screen, "HomeMain");
  act(() => tour.renderer.unmount());
});
