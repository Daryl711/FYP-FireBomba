const supabase = require("../config/supabase");
const { sendEmail } = require("./emailService");

// Emails every admin when someone signs up, so an admin can assign the new
// user to their bilik and room from the admin dashboard. Uses the same SMTP
// setup as OTP emails (EMAIL_ENABLED, SMTP_*); with email off it only logs.
// Set ADMIN_DASHBOARD_URL to put a link to the dashboard in the email.

// The name comes from the signup form, so it must not be able to inject HTML.
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);

// Admin accounts are the user_roles rows with role "admin"; their email
// addresses live on the matching public.users profile.
const getAdminEmails = async () => {
  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (roleError) throw roleError;
  if (!roles.length) return [];

  const { data: admins, error } = await supabase
    .from("users")
    .select("email")
    .in("user_id", roles.map((r) => r.user_id));
  if (error) throw error;

  return [...new Set(admins.map((a) => a.email).filter(Boolean))];
};

const buildMessage = ({ fullName, email, phone }, dashboardUrl) => {
  const subject = `New FireBomba user needs a bilik and room: ${fullName}`;
  const lines = [
    `${fullName} has just created a FireBomba account and has not been assigned to a room yet.`,
    "",
    `Name:  ${fullName}`,
    `Email: ${email}`,
    `Phone: ${phone || "-"}`,
    "",
    "Please open the admin dashboard, go to Users, and assign them to their bilik and room.",
  ];
  if (dashboardUrl) lines.push(dashboardUrl);

  const row = (label, value) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#888">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#222">
      <h2 style="color:#E53935;margin:0 0 12px">FireBomba</h2>
      <p><strong>${escapeHtml(fullName)}</strong> has just created an account and has not been assigned to a room yet.</p>
      <table style="border-collapse:collapse;margin:12px 0">
        ${row("Name", fullName)}
        ${row("Email", email)}
        ${row("Phone", phone || "-")}
      </table>
      <p>Please open the admin dashboard, go to <strong>Users</strong>, and assign them to their bilik and room.</p>
      ${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}" style="color:#E53935">Open admin dashboard</a></p>` : ""}
    </div>`;

  return { subject, text: lines.join("\n"), html };
};

// Sends one email per admin. Resolves to how many were delivered; never
// throws for a single bad address, so one failure doesn't stop the rest.
const notifyAdminsOfNewUser = async (newUser) => {
  const recipients = await getAdminEmails();
  if (!recipients.length) {
    console.warn("New user signed up but no admin email to notify:", newUser.email);
    return { sent: 0, total: 0 };
  }

  const { subject, text, html } = buildMessage(newUser, process.env.ADMIN_DASHBOARD_URL);
  const results = await Promise.all(
    recipients.map((to) => sendEmail(to, subject, text, html)),
  );
  const sent = results.filter((r) => r.delivered).length;
  if (sent < recipients.length) {
    console.error(`New-user admin email reached ${sent}/${recipients.length} admins`);
  }
  return { sent, total: recipients.length };
};

module.exports = { notifyAdminsOfNewUser };
