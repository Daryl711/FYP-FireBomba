const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { create, act } = require("react-test-renderer");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Render the actual graph with host components so its SVG coordinates can be
// checked without an Android emulator or a connection to the live backend.
const filename = path.join(__dirname, "../src/screens/SensorHistoryScreen.js");
const source = fs.readFileSync(filename, "utf8") + "\nexports.AggregateGraph = AggregateGraph;";
const { code } = babel.transformSync(source, {
  babelrc: false,
  configFile: false,
  plugins: [
    require.resolve("@babel/plugin-transform-react-jsx"),
    require.resolve("@babel/plugin-transform-modules-commonjs"),
  ],
});
const theme = {
  COLORS: { primary: "red", amber: "orange", green: "green", blue: "blue", border: "grey", text3: "grey" },
  RADIUS: {}, SHADOW: {}, SPACING: {},
};
const moduleExports = {};
vm.runInNewContext(code, {
  exports: moduleExports,
  require(name) {
    if (name === "react") return React;
    if (name === "react-native") return {
      ActivityIndicator: "ActivityIndicator", ScrollView: "ScrollView", View: "View",
      Text: "Text", TouchableOpacity: "TouchableOpacity", StyleSheet: { create: (styles) => styles },
    };
    if (name === "react-native-svg") return {
      __esModule: true, default: "Svg", Circle: "Circle", Line: "Line", Polyline: "Polyline", Text: "SvgText",
    };
    if (name.includes("theme")) return theme;
    if (name.includes("safe-area")) return { SafeAreaView: "SafeAreaView" };
    if (name.includes("vector-icons")) return { Ionicons: "Ionicons" };
    if (name.includes("services/api")) return {};
    throw new Error(`Unexpected import: ${name}`);
  },
});

test("history and forecasts stay within the SVG even with future synced times", () => {
  const future = Date.now() + 8 * 60 * 60 * 1000;
  let renderer;
  act(() => {
    renderer = create(React.createElement(moduleExports.AggregateGraph, {
      metric: { key: "avg_temperature", title: "Temperature", unit: "°C", color: "red" },
      data: {
        aggregates: [
          { window_end: new Date(future).toISOString(), avg_temperature: 29 },
          { window_end: new Date(future - 300000).toISOString(), avg_temperature: 28 },
          { window_end: new Date(future - 600000).toISOString(), avg_temperature: null },
        ],
        predictions: Array.from({ length: 8 }, (_, index) => ({ avg_temperature: 30 + index })),
      },
    }));
  });
  const svg = renderer.root.findByType("Svg");
  const lines = renderer.root.findAllByType("Polyline");
  assert.equal(lines.length, 2);
  const actual = lines[0].props.points.split(" ");
  assert.equal(actual.length, 2, "missing averages must not become zero readings");
  assert.ok(Number(actual[0].split(",")[0]) < Number(actual[1].split(",")[0]), "readings must be chronological");
  for (const line of lines) {
    for (const coordinate of line.props.points.split(" ")) {
      const [x, y] = coordinate.split(",").map(Number);
      assert.ok(Number.isFinite(x) && x >= 46 && x <= svg.props.width - 10);
      assert.ok(Number.isFinite(y) && y >= 12 && y <= svg.props.height - 24);
    }
  }
  assert.equal(renderer.root.findAllByType("SvgText").length, 5, "value and time axes must be labeled");
  act(() => renderer.unmount());
});
