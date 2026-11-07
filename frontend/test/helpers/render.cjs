// Shared helpers for the frontend screen tests.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");
const React = require("react");
const { act } = require("react-test-renderer");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Plain stand-ins for React Native: each component becomes a named element
// (e.g. "TouchableOpacity") so tests can find it and read its props.
function reactNative(extra = {}) {
  const names = ["View", "Text", "TextInput", "TouchableOpacity", "ScrollView", "KeyboardAvoidingView", "ActivityIndicator", "Modal"];
  return {
    ...Object.fromEntries(names.map((name) => [name, name])),
    StyleSheet: { create: (styles) => styles },
    Platform: { OS: "ios", select: (options) => options.ios ?? options.default },
    Alert: { alert() {} },
    Linking: { openSettings() {}, openURL() {} },
    ...extra,
  };
}

// Compiles a screen's JSX and runs it with fakes for its imports. Anything
// in `overrides` replaces the matching import (e.g. "../services/api").
function loadScreen(relativePath, overrides = {}, globals = {}) {
  const filename = path.join(__dirname, "../..", relativePath);
  const { code } = babel.transformSync(fs.readFileSync(filename, "utf8"), {
    babelrc: false, configFile: false, filename,
    plugins: [require.resolve("@babel/plugin-transform-react-jsx"), require.resolve("@babel/plugin-transform-modules-commonjs")],
  });
  const exports = {};
  vm.runInNewContext(code, {
    exports, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, ...globals,
    require(name) {
      if (name in overrides) return overrides[name];
      if (name === "react") return React;
      if (name === "react-native") return reactNative();
      if (name.includes("theme")) return { COLORS: {}, SPACING: {}, RADIUS: {}, SHADOW: {} };
      if (name.includes("safe-area")) return { SafeAreaView: "SafeAreaView" };
      if (name.includes("vector-icons")) return { Ionicons: "Ionicons" };
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename });
  return exports.default;
}

// All text inside a rendered element, joined together.
const textOf = (node) => (typeof node === "string" ? node : node.children.map(textOf).join(""));

// The innermost button whose text contains `text`.
function button(root, text) {
  const matches = root.findAllByType("TouchableOpacity").filter((node) => textOf(node).includes(text));
  if (matches.length === 0) throw new Error(`No button with text: ${text}`);
  return matches[matches.length - 1];
}

const hasText = (root, text) => root.findAllByType("Text").some((node) => textOf(node).includes(text));

// Presses a button and waits for any async work it starts.
const press = (node) => act(async () => { await node.props.onPress(); });
const type = (input, value) => act(() => { input.props.onChangeText(value); });

module.exports = { React, reactNative, loadScreen, textOf, button, hasText, press, type };
