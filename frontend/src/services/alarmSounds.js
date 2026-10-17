import * as SecureStore from "expo-secure-store";

// The fire alarm tones a user can pick in Profile > Notifications.
//
// - inApp:     what AppContext loops through expo-av while the app is open
// - pushSound: the bundled file a push plays when the app is closed; it must
//              be listed under expo-notifications "sounds" in app.json
// - channelId: Android locks a channel's sound the first time it is created,
//              so every tone has its own channel
//
// Must match ALARM_SOUNDS in backend/src/services/pushService.js.
export const ALARM_SOUNDS = [
  {
    id: "classic",
    icon: "alarm-outline",
    inApp: require("../../assets/sounds/alarm.wav"),
    pushSound: "fire_alarm.wav",
    channelId: "fire-alarm-v1",
  },
  {
    id: "siren",
    icon: "megaphone-outline",
    inApp: require("../../assets/sounds/fire_alarm_siren.wav"),
    pushSound: "fire_alarm_siren.wav",
    channelId: "fire-alarm-siren-v1",
  },
  {
    id: "beep",
    icon: "pulse-outline",
    inApp: require("../../assets/sounds/fire_alarm_beep.wav"),
    pushSound: "fire_alarm_beep.wav",
    channelId: "fire-alarm-beep-v1",
  },
  {
    id: "bell",
    icon: "notifications-outline",
    inApp: require("../../assets/sounds/fire_alarm_bell.wav"),
    pushSound: "fire_alarm_bell.wav",
    channelId: "fire-alarm-bell-v1",
  },
];

export const DEFAULT_ALARM_SOUND = "classic";

export const getAlarmSound = (id) =>
  ALARM_SOUNDS.find((sound) => sound.id === id) ??
  ALARM_SOUNDS.find((sound) => sound.id === DEFAULT_ALARM_SOUND);

// A device preference like biometrics: kept on this phone, not cleared on
// logout.
const ALARM_SOUND_KEY = "alarm_sound";

export const getAlarmSoundPreference = async () => {
  try {
    const stored = await SecureStore.getItemAsync(ALARM_SOUND_KEY);
    return getAlarmSound(stored).id;
  } catch {
    return DEFAULT_ALARM_SOUND;
  }
};

export const setAlarmSoundPreference = async (id) => {
  try {
    await SecureStore.setItemAsync(ALARM_SOUND_KEY, id);
  } catch {
    // Best-effort; a failed write just means the default comes back next launch.
  }
};
