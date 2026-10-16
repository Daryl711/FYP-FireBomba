const PushToken = require("../models/PushToken");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Must match FIRE_CHANNEL_ID in frontend/src/services/notifications.js. The
// channel carries the alarm sound, max importance and DND bypass on Android.
const FIRE_CHANNEL_ID = "fire-alarm-v1";
const ALARM_SOUND = "fire_alarm.wav";
const BATCH_SIZE = 100; // Expo's per-request limit

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

// Sends a fire alarm to every registered device of the given users. Never
// throws: a push failure must not stop the alert from being stored.
exports.sendFireAlarm = async (userIds, { title, body, data = {} }) => {
  try {
    const tokens = await PushToken.getTokensForUsers(userIds);
    if (tokens.length === 0) return;

    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }

    const deadTokens = [];

    for (const batch of chunk(tokens, BATCH_SIZE)) {
      const messages = batch.map((to) => ({
        to,
        title,
        body,
        data,
        sound: ALARM_SOUND,
        channelId: FIRE_CHANNEL_ID,
        priority: "high",
        // iOS: break through Focus modes like an alarm would.
        interruptionLevel: "time-sensitive",
        ttl: 60 * 10,
      }));

      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(messages),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !Array.isArray(result?.data)) {
        console.error("Expo push failed:", response.status, result);
        continue;
      }

      // Tickets come back in the same order as the messages.
      result.data.forEach((ticket, i) => {
        if (ticket.status !== "error") return;
        if (ticket.details?.error === "DeviceNotRegistered") {
          deadTokens.push(batch[i]);
        } else {
          console.error("Expo push ticket error:", ticket.message);
        }
      });
    }

    await PushToken.deleteTokens(deadTokens);
  } catch (error) {
    console.error("Fire alarm push failed:", error);
  }
};
