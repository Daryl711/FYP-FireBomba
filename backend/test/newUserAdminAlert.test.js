const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, plain } = require("./helpers/load");

// Loads the real service with a fake database and a fake mailer.
// `roles` are user_roles rows, `profiles` are public.users rows.
function alerts({ roles = [], profiles = [], failFor = [], env = {} } = {}) {
  const sent = [];
  const supabase = {
    from(table) {
      const filters = [];
      const query = {
        select() { return query; },
        eq(column, value) { filters.push((row) => row[column] === value); return query; },
        in(column, values) { filters.push((row) => values.includes(row[column])); return query; },
        then(resolve) {
          const rows = table === "user_roles" ? roles : profiles;
          resolve({ data: rows.filter((row) => filters.every((f) => f(row))), error: null });
        },
      };
      return query;
    },
  };
  const api = load("services/newUserAdminAlert.js", {
    "../config/supabase": supabase,
    "./emailService": {
      sendEmail: async (to, subject, text, html) => {
        sent.push({ to, subject, text, html });
        return { delivered: !failFor.includes(to) };
      },
    },
  }, { env });
  return { notify: async (user) => plain(await api.notifyAdminsOfNewUser(user)), sent };
}

const ROLES = [
  { user_id: "a1", role: "admin" },
  { user_id: "a2", role: "admin" },
  { user_id: "u1", role: "user" },
];
const PROFILES = [
  { user_id: "a1", email: "boss@mail.com" },
  { user_id: "a2", email: "helper@mail.com" },
  { user_id: "u1", email: "resident@mail.com" },
];
const NEW_USER = { fullName: "Ali", email: "ali@mail.com", phone: "+60123456789" };

test("emails every admin, and nobody else, about the new user", async () => {
  const { notify, sent } = alerts({ roles: ROLES, profiles: PROFILES });
  assert.deepEqual(await notify(NEW_USER), { sent: 2, total: 2 });
  assert.deepEqual(sent.map((m) => m.to).sort(), ["boss@mail.com", "helper@mail.com"]);
  const [mail] = sent;
  assert.match(mail.subject, /Ali/);
  assert.match(mail.text, /ali@mail\.com/);
  assert.match(mail.text, /\+60123456789/);
  assert.match(mail.text, /bilik and room/);
});

test("sends nothing when there are no admins", async () => {
  const { notify, sent } = alerts({ roles: [{ user_id: "u1", role: "user" }], profiles: PROFILES });
  assert.deepEqual(await notify(NEW_USER), { sent: 0, total: 0 });
  assert.equal(sent.length, 0);
});

test("one failed address does not stop the other admins being emailed", async () => {
  const { notify, sent } = alerts({ roles: ROLES, profiles: PROFILES, failFor: ["boss@mail.com"] });
  assert.deepEqual(await notify(NEW_USER), { sent: 1, total: 2 });
  assert.equal(sent.length, 2);
});

test("a name typed at signup cannot inject HTML into the admin email", async () => {
  const { notify, sent } = alerts({ roles: ROLES, profiles: PROFILES });
  await notify({ ...NEW_USER, fullName: '<img src=x onerror="alert(1)">' });
  assert.ok(!sent[0].html.includes("<img"));
  assert.match(sent[0].html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});

test("adds a dashboard link only when ADMIN_DASHBOARD_URL is set, and shows a dash for no phone", async () => {
  let { notify, sent } = alerts({ roles: ROLES, profiles: PROFILES });
  await notify({ ...NEW_USER, phone: null });
  assert.ok(!sent[0].html.includes("<a "));
  assert.match(sent[0].text, /Phone: -/);

  ({ notify, sent } = alerts({ roles: ROLES, profiles: PROFILES, env: { ADMIN_DASHBOARD_URL: "https://admin.example.com" } }));
  await notify(NEW_USER);
  assert.match(sent[0].html, /href="https:\/\/admin\.example\.com"/);
  assert.match(sent[0].text, /https:\/\/admin\.example\.com/);
});
