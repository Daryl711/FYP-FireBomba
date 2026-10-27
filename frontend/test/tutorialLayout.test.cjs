const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const babel = require("@babel/core");

const { code } = babel.transformSync(fs.readFileSync(path.join(__dirname, "../src/components/tutorialLayout.js"), "utf8"), {
  babelrc: false, configFile: false,
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
});
const exportsObject = {};
vm.runInNewContext(code, { exports: exportsObject });
const layout = exportsObject.getTutorialLayout;

function checkBounds(viewport, result, height) {
  const b = result.bubble;
  const actualHeight = Math.min(height, b.maxHeight);
  assert.ok(b.x >= 0 && b.x + b.width <= viewport.width);
  assert.ok(b.y >= 48 && b.y + actualHeight <= viewport.height - 32);
  const h = result.highlight;
  if (h) {
    assert.ok(b.y + actualHeight <= h.y || b.y >= h.y + h.height, "bubble must leave feature visible");
    assert.ok(result.arrowX >= 16 && result.arrowX <= b.width - 28);
  }
}

test("bubble follows upper features and sits above bottom tabs and emergency button", () => {
  const viewport = { width: 390, height: 844 };
  for (const [frame, below] of [
    [{ x: 16, y: 60, width: 358, height: 180 }, true],
    [{ x: 0, y: 772, width: 98, height: 56 }, false],
    [{ x: 302, y: 680, width: 64, height: 64 }, false],
  ]) {
    const result = layout(viewport, frame, 190);
    assert.equal(result.below, below);
    checkBounds(viewport, result, 190);
  }
});

test("small screens and larger translated bubbles stay within the viewport", () => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    for (const height of [160, 220, 300]) {
      for (const frame of [
        { x: 16, y: 64, width: viewport.width - 32, height: 120 },
        { x: viewport.width - 80, y: viewport.height - 120, width: 64, height: 56 },
      ]) checkBounds(viewport, layout(viewport, frame, height), height);
    }
  }
});

test("unavailable or fully offscreen features use a bounded bubble without a false spotlight", () => {
  const viewport = { width: 320, height: 568 };
  for (const frame of [null, { x: 0, y: 900, width: 200, height: 100 }]) {
    const result = layout(viewport, frame, 190);
    assert.equal(result.highlight, null);
    checkBounds(viewport, result, 190);
  }
});
