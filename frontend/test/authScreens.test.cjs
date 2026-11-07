const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, act } = require("react-test-renderer");
const { React, reactNative, loadScreen, button, press, type } = require("./helpers/render.cjs");

// Translation keys come back as-is, with any values attached, so tests can
// check exactly which message was shown.
const t = (key, values) => {
  if (values?.returnObjects) return [`${key}.1`, `${key}.2`];
  return values ? `${key} ${JSON.stringify(values)}` : key;
};

// ---------- Login screen ----------

function renderLogin(apiResult) {
  const alerts = [], logins = [], apiCalls = [], navigations = [];
  let finish;
  const Login = loadScreen("src/screens/LoginScreen.js", {
    "react-native": reactNative({ Alert: { alert: (title, message) => alerts.push([title, message]) } }),
    "../context/AppContext": { useApp: () => ({ t, login: async (...args) => logins.push(args) }) },
    "../services/api": { loginUser: (...args) => {
      apiCalls.push(args);
      if (apiResult === "slow") return new Promise((resolve) => { finish = resolve; });
      return typeof apiResult === "function" ? apiResult() : Promise.resolve(apiResult);
    } },
  });
  let renderer;
  act(() => { renderer = create(React.createElement(Login, { navigation: { navigate: (...args) => navigations.push(args) } })); });
  const root = renderer.root;
  const [email, password] = root.findAllByType("TextInput");
  const fill = (e, p) => { type(email, e); type(password, p); };
  const signIn = () => root.findAllByType("TouchableOpacity").find((b) => b.findAllByType("ActivityIndicator").length || b.findAllByType("Text").some((x) => x.props.children === "login.signIn"));
  return { root, renderer, fill, signIn, alerts, logins, apiCalls, navigations, finish: (value) => finish(value) };
}
const SUCCESS = { user: { userId: "u1" }, session: { access_token: "a", refresh_token: "r" }, sessionExpiresAt: "2026-12-01T00:00:00.000Z", rememberMe: false };

test("login with an empty or blank field shows a message and never calls the server", async () => {
  for (const [e, p] of [["", ""], ["a@b.com", ""], ["", "pw"], ["   ", "pw"], ["a@b.com", "   "]]) {
    const s = renderLogin(SUCCESS);
    s.fill(e, p);
    await press(s.signIn());
    assert.deepEqual(s.alerts, [["login.missingFieldsTitle", "login.missingFieldsMessage"]]);
    assert.equal(s.apiCalls.length, 0);
    act(() => s.renderer.unmount());
  }
});

test("login sends the trimmed email, the password as typed, and the remember-me choice", async () => {
  for (const tick of [false, true]) {
    const s = renderLogin(SUCCESS);
    s.fill("  a@b.com ", " pw ");
    if (tick) act(() => button(s.root, "login.rememberMe").props.onPress());
    await press(s.signIn());
    assert.deepEqual(s.apiCalls, [["a@b.com", " pw ", tick]]);
    act(() => s.renderer.unmount());
  }
});

test("a successful login stores the user and both tokens", async () => {
  const s = renderLogin({ ...SUCCESS, rememberMe: true });
  s.fill("a@b.com", "pw");
  await press(s.signIn());
  assert.deepEqual(JSON.parse(JSON.stringify(s.logins)), [[{ userId: "u1" }, "a", "r", { sessionExpiresAt: "2026-12-01T00:00:00.000Z", rememberMe: true }]]);
  assert.equal(s.alerts.length, 0);
  act(() => s.renderer.unmount());
});

test("when a code is needed, login opens the OTP screen instead of logging in", async () => {
  const s = renderLogin({ otpRequired: true, challengeToken: "c", channel: "sms", destinationHint: "**89", availableChannels: ["email", "sms"] });
  s.fill("a@b.com", "pw");
  await press(s.signIn());
  assert.deepEqual(JSON.parse(JSON.stringify(s.navigations)), [["Otp", { challengeToken: "c", channel: "sms", destinationHint: "**89", availableChannels: ["email", "sms"] }]]);
  assert.equal(s.logins.length, 0);
  act(() => s.renderer.unmount());
});

test("server errors, missing tokens and lost connections each show a message and do not log in", async () => {
  for (const [apiResult, expected] of [
    [{ error: "Invalid email or password" }, ["login.loginFailed", "Invalid email or password"]],
    [{ user: {}, session: { access_token: "a" } }, ["login.loginFailed", "Login session was not returned by the server."]],
    [() => Promise.reject(new Error("offline")), ["login.errorTitle", "login.connectError"]],
  ]) {
    const s = renderLogin(apiResult);
    s.fill("a@b.com", "pw");
    await press(s.signIn());
    assert.deepEqual(s.alerts, [expected]);
    assert.equal(s.logins.length, 0);
    act(() => s.renderer.unmount());
  }
});

test("the sign-in button shows a spinner and is disabled while waiting", async () => {
  const s = renderLogin("slow");
  s.fill("a@b.com", "pw");
  let pending;
  act(() => { pending = s.signIn().props.onPress(); });
  assert.equal(s.signIn().props.disabled, true);
  assert.equal(s.signIn().findAllByType("ActivityIndicator").length, 1);
  await act(async () => { s.finish(SUCCESS); await pending; });
  assert.equal(s.signIn().props.disabled, false);
  act(() => s.renderer.unmount());
});

// ---------- Sign-up screen ----------

function renderSignUp(apiResult = { userId: "new" }) {
  const popups = [], alerts = [], apiCalls = [];
  let wentBack = 0;
  const SignUp = loadScreen("src/screens/SignUpScreen.js", {
    "react-native": reactNative({ Alert: { alert: (title, message) => alerts.push([title, message]) } }),
    "../context/AppContext": { useApp: () => ({ t }) },
    "../services/api": { registerUser: async (...args) => { apiCalls.push(args); if (apiResult instanceof Error) throw apiResult; return apiResult; } },
  }, { alert: (message) => popups.push(message) });
  let renderer;
  act(() => { renderer = create(React.createElement(SignUp, { navigation: { goBack: () => { wentBack += 1; } } })); });
  const root = renderer.root;
  const fill = ({ name = "Ali", email = "ali@mail.com", phone = "", password = "secret1", confirm = password, terms = true } = {}) => {
    const [n, e, ph, p, c] = root.findAllByType("TextInput");
    type(n, name); type(e, email); type(ph, phone); type(p, password); type(c, confirm);
    if (terms) {
      act(() => button(root, "signup.termsAndService").props.onPress());
      act(() => button(root, "Accept").props.onPress());
    }
  };
  const submit = () => press(button(root, "signup.createAccount"));
  return { root, renderer, fill, submit, popups, alerts, apiCalls, wentBack: () => wentBack };
}

test("each sign-up mistake shows its own message and nothing is sent", async () => {
  for (const [form, message] of [
    [{ name: "  " }, "signup.enterFullName"],
    [{ email: "" }, "signup.enterEmail"],
    [{ email: "ali@mail" }, "signup.invalidEmail"],
    [{ email: "ali mail.com" }, "signup.invalidEmail"],
    [{ phone: "12345" }, "signup.invalidPhone"],
    [{ phone: "012-34a-6789" }, "signup.invalidPhone"],
    [{ password: "   ", confirm: "   " }, "signup.enterPassword"],
    [{ password: "12345", confirm: "12345" }, "signup.passwordMin"],
    [{ confirm: "different" }, "signup.passwordMismatch"],
    [{ terms: false }, "signup.mustAgreeTerms"],
  ]) {
    const s = renderSignUp();
    s.fill(form);
    await s.submit();
    assert.deepEqual(s.popups, [message], JSON.stringify(form));
    assert.equal(s.apiCalls.length, 0);
    act(() => s.renderer.unmount());
  }
});

test("phone is optional, and common phone formats are accepted", async () => {
  for (const phone of ["", "012-345 6789", "+60123456789"]) {
    const s = renderSignUp();
    s.fill({ phone });
    await s.submit();
    assert.deepEqual(s.popups, []);
    assert.equal(s.apiCalls.length, 1);
    act(() => s.renderer.unmount());
  }
});

test("declining the terms after accepting them blocks sign-up again", async () => {
  const s = renderSignUp();
  s.fill();
  act(() => button(s.root, "signup.termsAndService").props.onPress());
  act(() => button(s.root, "Decline").props.onPress());
  await s.submit();
  assert.deepEqual(s.popups, ["signup.mustAgreeTerms"]);
  act(() => s.renderer.unmount());
});

test("a valid sign-up sends trimmed details, shows success and goes back to login", async () => {
  const s = renderSignUp();
  s.fill({ name: "  Ali  ", email: " ali@mail.com ", phone: " 0123456789 ", password: "secret1" });
  await s.submit();
  assert.deepEqual(s.apiCalls, [["Ali", "ali@mail.com", "secret1", "0123456789"]]);
  assert.deepEqual(s.alerts, [["Success", "signup.signupSuccess"]]);
  assert.equal(s.wentBack(), 1);
  act(() => s.renderer.unmount());
});

test("server errors and lost connections show a message and stay on the form", async () => {
  for (const [result, message] of [
    [{ error: "Email already registered" }, 'signup.signupFailed {"error":"Email already registered"}'],
    [new Error("offline"), "signup.connectError"],
  ]) {
    const s = renderSignUp(result);
    s.fill();
    await s.submit();
    assert.deepEqual(s.popups, [message]);
    assert.equal(s.wentBack(), 0);
    act(() => s.renderer.unmount());
  }
});
