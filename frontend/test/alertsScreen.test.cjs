const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, act } = require("react-test-renderer");
const { React, loadScreen, button, hasText } = require("./helpers/render.cjs");

const t = (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key);
const NOTIFICATIONS = [
  { id: 1, unread: true, warningTitle: "Smoke detected", room: "Kitchen", time: "2m ago" },
  { id: 2, unread: false, warningTitle: "High temperature", room: "Bedroom", time: "1h ago" },
];

function renderAlerts(notifications, unreadCount) {
  const calls = [];
  const Alerts = loadScreen("src/screens/AlertsScreen.js", {
    "../context/AppContext": { useApp: () => ({
      t, notifications, unreadCount,
      markAllRead: () => calls.push(["markAllRead"]),
      markNotificationRead: (id) => calls.push(["read", id]),
      clearNotification: (id) => calls.push(["clear", id]),
      clearAllNotifications: () => calls.push(["clearAll"]),
    }) },
  });
  let renderer;
  act(() => { renderer = create(React.createElement(Alerts)); });
  return { root: renderer.root, renderer, calls };
}

test("each alert shows its warning, room and time", () => {
  const { root, renderer } = renderAlerts(NOTIFICATIONS, 1);
  for (const text of ["Smoke detected", "Kitchen", "2m ago", "High temperature", "Bedroom", "1h ago"]) {
    assert.ok(hasText(root, text), text);
  }
  act(() => renderer.unmount());
});

test("the header shows the unread count, with 's' only for more than one", () => {
  let { root, renderer } = renderAlerts(NOTIFICATIONS, 1);
  assert.ok(hasText(root, 'alerts.unreadSubtitle {"count":1,"suffix":""}'));
  act(() => renderer.unmount());
  ({ root, renderer } = renderAlerts(NOTIFICATIONS, 2));
  assert.ok(hasText(root, 'alerts.unreadSubtitle {"count":2,"suffix":"s"}'));
  act(() => renderer.unmount());
  ({ root, renderer } = renderAlerts(NOTIFICATIONS, 0));
  assert.ok(hasText(root, "alerts.allCaughtUp"));
  act(() => renderer.unmount());
});

test("tapping an alert marks that alert read; Clear removes that alert", () => {
  const { root, renderer, calls } = renderAlerts(NOTIFICATIONS, 1);
  act(() => button(root, "High temperature").props.onPress());
  const clearButtons = root.findAllByType("TouchableOpacity").filter((b) => b.findAllByType("Text").some((x) => x.props.children === "alerts.clear"));
  act(() => clearButtons[0].props.onPress());
  assert.deepEqual(calls, [["read", 2], ["clear", 1]]);
  act(() => renderer.unmount());
});

test("mark all read and clear all only appear when they would do something", () => {
  let { root, renderer, calls } = renderAlerts(NOTIFICATIONS, 1);
  act(() => button(root, "alerts.markAllRead").props.onPress());
  act(() => button(root, "alerts.clearAll").props.onPress());
  assert.deepEqual(calls, [["markAllRead"], ["clearAll"]]);
  act(() => renderer.unmount());
  ({ root, renderer } = renderAlerts(NOTIFICATIONS, 0));
  assert.ok(!hasText(root, "alerts.markAllRead"));
  assert.ok(hasText(root, "alerts.clearAll"));
  act(() => renderer.unmount());
});

test("an empty list shows the empty message and no action buttons", () => {
  const { root, renderer } = renderAlerts([], 0);
  assert.ok(hasText(root, "alerts.empty"));
  assert.ok(!hasText(root, "alerts.clearAll"));
  assert.ok(!hasText(root, "alerts.markAllRead"));
  act(() => renderer.unmount());
});
