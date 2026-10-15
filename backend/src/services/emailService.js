require("dotenv").config();
const nodemailer = require("nodemailer");

// Real email delivery over SMTP. Works with Gmail (smtp.gmail.com, port 465,
// an App Password - not the normal Gmail password) or any other SMTP host.
// With EMAIL_ENABLED unset/false, codes are printed to the console instead,
// mirroring smsService.js.
const emailEnabled = process.env.EMAIL_ENABLED === "true";

const SMTP_PORT = Number(process.env.SMTP_PORT || 465);

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: SMTP_PORT,
      // 465 is TLS from the start; 587 upgrades with STARTTLS.
      secure: SMTP_PORT === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

const consoleSend = async (to, subject, text) => {
  console.log("---------------- EMAIL (mock) --------------");
  console.log(`  to      : ${to}`);
  console.log(`  subject : ${subject}`);
  console.log(`  message : ${text}`);
  console.log("--------------------------------------------");
  return { delivered: true, provider: "console" };
};

const sendEmail = async (to, subject, text, html) => {
  if (!emailEnabled) {
    return consoleSend(to, subject, text);
  }

  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || `FireBomba <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });
    return { delivered: true, provider: "smtp" };
  } catch (error) {
    // Callers check `delivered` so a user is never told a code was sent when
    // the mail server rejected it.
    console.error("Email send failed via smtp:", error.message);
    return { delivered: false, provider: "smtp", error: error.message };
  }
};

const sendOtpEmail = async (email, code, purpose, ttlMinutes = 5) => {
  const action = purpose === "reset" ? "reset your password" : "log in";
  const subject =
    purpose === "reset" ? "Your FireBomba password reset code" : "Your FireBomba login code";
  const text = `Your FireBomba code is ${code}. Use it to ${action}. It expires in ${ttlMinutes} minutes. Do not share this code.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#222">
      <h2 style="color:#E53935;margin:0 0 12px">FireBomba</h2>
      <p>Use this code to ${action}:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0">${code}</p>
      <p>It expires in ${ttlMinutes} minutes.</p>
      <p style="color:#888;font-size:12px">Do not share this code. If you did not request it, you can ignore this email.</p>
    </div>`;

  return sendEmail(email, subject, text, html);
};

module.exports = { sendEmail, sendOtpEmail };
