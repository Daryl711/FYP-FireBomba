const PushToken = require("../models/PushToken");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Must match ALARM_SOUNDS in frontend/src/services/alarmSounds.js. On Android
// the channel carries the sound, max importance and DND bypass, and a
// channel's sound can never change - so every tone has its own channel.
const ALARM_SOUNDS = {
  classic: { sound: "fire_alarm.wav", channelId: "fire-alarm-v1" },
  siren: { sound: "fire_alarm_siren.wav", channelId: "fire-alarm-siren-v1" },
  beep: { sound: "fire_alarm_beep.wav", channelId: "fire-alarm-beep-v1" },
  bell: { sound: "fire_alarm_bell.wav", channelId: "fire-alarm-bell-v1" },
};
const DEFAULT_ALARM_SOUND = "classic";

const alarmSoundFor = (id) => ALARM_SOUNDS[id] ?? ALARM_SOUNDS[DEFAULT_ALARM_SOUND];
exports.isAlarmSound = (id) => Object.prototype.hasOwnProperty.call(ALARM_SOUNDS, id);
const BATCH_SIZE = 100; // Expo's per-request limit

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

// Sends the alarm-style push to the given devices ([{ token, alarmSound }]),
// each with the tone it picked. Returns how many Expo accepted; tokens Expo
// says are uninstalled are removed along the way.
const sendAlarmToTokens = async (devices, { title, body, data = {} }) => {
  let accepted = 0;
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  const deadTokens = [];

  // Expo refuses a request mixing tokens from different projects (e.g. an old
  // Expo Go install next to the APK). It names each project's tokens, so the
  // batch is split up and sent again one project at a time.
  const queue = chunk(devices, BATCH_SIZE);
  while (queue.length > 0) {
    const batch = queue.shift();
    const messages = batch.map(({ token, alarmSound }) => ({
      to: token,
      title,
      body,
      data,
      sound: alarmSoundFor(alarmSound).sound,
      channelId: alarmSoundFor(alarmSound).channelId,
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

    const mixed = result?.errors?.find((e) => e.code === "PUSH_TOO_MANY_EXPERIENCE_IDS");
    if (mixed?.details) {
      for (const tokens of Object.values(mixed.details)) {
        const group = batch.filter((device) => tokens.includes(device.token));
        if (group.length > 0) queue.push(group);
      }
      continue;
    }

    if (!response.ok || !Array.isArray(result?.data)) {
      console.error("Expo push failed:", response.status, result);
      continue;
    }

    // Tickets come back in the same order as the messages.
    result.data.forEach((ticket, i) => {
      if (ticket.status !== "error") {
        accepted += 1;
        return;
      }
      if (ticket.details?.error === "DeviceNotRegistered") {
        deadTokens.push(batch[i].token);
      } else {
        console.error("Expo push ticket error:", ticket.message);
      }
    });
  }

  await PushToken.deleteTokens(deadTokens);
  return accepted;
};

// Sends a fire alarm to every registered device of the given users. Never
// throws: a push failure must not stop the alert from being stored.
exports.sendFireAlarm = async (userIds, message) => {
  try {
    const devices = await PushToken.getTokensForUsers(userIds);
    if (devices.length === 0) return;
    await sendAlarmToTokens(devices, message);
  } catch (error) {
    console.error("Fire alarm push failed:", error);
  }
};

// Rings one device ({ token, alarmSound }) with its chosen alarm so the user
// can check it works. Resolves to true when Expo accepted the push.
exports.sendTestAlarm = async (device) => {
  const accepted = await sendAlarmToTokens([device], {
    title: "🔔 FireBomba test alarm",
    body: "This is only a test. Your phone will ring like this if a fire is detected.",
    data: { type: "test" },
  });
  return accepted > 0;
};
