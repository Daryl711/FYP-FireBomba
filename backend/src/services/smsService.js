require("dotenv").config();

// Codes are printed to the backend console. When the AWS server is ready, add
// a provider here (an object with a send(phone, message) function), register it
// in `providers` below, and set SMS_ENABLED=true plus SMS_PROVIDER=<its key>.
// Nothing outside this file needs to change - callers only use sendOtpSms().
const smsEnabled = process.env.SMS_ENABLED === "true";
const smsProvider = process.env.SMS_PROVIDER || "console";

const consoleProvider = {
  name: "console",
  send: async (phone, message) => {
    console.log("---------------- SMS (mock) ----------------");
    console.log(`  to      : ${phone}`);
    console.log(`  message : ${message}`);
    console.log("--------------------------------------------");
    return { delivered: true, provider: "console" };
  },
};

const providers = {
  console: consoleProvider,
};

const resolveProvider = () => {
  if (!smsEnabled) {
    return consoleProvider;
  }

  const provider = providers[smsProvider];
  if (!provider) {
    console.error(`Unknown SMS_PROVIDER "${smsProvider}", falling back to console`);
    return consoleProvider;
  }

  return provider;
};

const sendSms = async (phone, message) => {
  const provider = resolveProvider();

  try {
    return await provider.send(phone, message);
  } catch (error) {
    // Callers check `delivered` so a user is never told a code was sent when
    // the gateway rejected it.
    console.error(`SMS send failed via ${provider.name}:`, error.message);
    return { delivered: false, provider: provider.name, error: error.message };
  }
};

const sendOtpSms = async (phone, code, purpose) => {
  const action = purpose === "reset" ? "reset your password" : "log in";
  const message = `Your FireBomba code is ${code}. Use it to ${action}. It expires in 5 minutes. Do not share this code.`;

  return sendSms(phone, message);
};

module.exports = { sendSms, sendOtpSms };
