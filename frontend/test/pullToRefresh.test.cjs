const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, act } = require("react-test-renderer");
const { React, loadScreen } = require("./helpers/render.cjs");

// Renders the hook in a probe component; returns its latest state and the
// Alert.alert calls it made.
function renderHook(task) {
  const dialogs = [];
  const usePullToRefresh = loadScreen("src/hooks/usePullToRefresh.js", {
    "react-native": { Alert: { alert: (...args) => dialogs.push(args) } },
  });
  let state;
  function Probe() {
    state = usePullToRefresh(task, (key) => key);
    return null;
  }
  let renderer;
  act(() => { renderer = create(React.createElement(Probe)); });
  return { state: () => state, dialogs, renderer };
}

test("a successful pull refresh shows no error", async () => {
  const hook = renderHook(async () => ({ ok: true }));
  await act(async () => { await hook.state().onRefresh(); });
  assert.equal(hook.dialogs.length, 0);
  assert.equal(hook.state().refreshing, false);
  act(() => hook.renderer.unmount());
});

test("a failed or timed-out pull refresh asks the user to check their connection", async () => {
  for (const task of [async () => ({ ok: false }), async () => { throw new Error("Request timed out."); }]) {
    const hook = renderHook(task);
    await act(async () => { await hook.state().onRefresh(); });
    assert.deepEqual(hook.dialogs, [["common.refreshFailedTitle", "common.refreshFailedBody"]]);
    assert.equal(hook.state().refreshing, false);
    act(() => hook.renderer.unmount());
  }
});

test("pulling again while a refresh is running does not start a second one", async () => {
  let calls = 0;
  let release;
  const hook = renderHook(() => { calls += 1; return new Promise((resolve) => { release = resolve; }); });
  let first;
  await act(async () => { first = hook.state().onRefresh(); });
  assert.equal(hook.state().refreshing, true);
  await act(async () => { await hook.state().onRefresh(); });
  assert.equal(calls, 1);
  await act(async () => { release({ ok: true }); await first; });
  assert.equal(hook.state().refreshing, false);
  act(() => hook.renderer.unmount());
});
