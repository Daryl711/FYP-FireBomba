import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { ALARM_SOUNDS } from "./alarmSounds";

// Android locks a channel's sound and importance the first time it is
// created, so changing either means shipping a new channel id. Each alarm
// tone has its own channel (see alarmSounds.js); the backend sends a fire
// push on the channel of the tone that device picked.

// While the app is open, AppContext already loops alarm.wav through expo-av,
// so the banner is shown but the notification's own sound is skipped. A test
// alarm is the exception: it has no in-app alarm, and it is always sent from
// inside the app, so it would otherwise never make a sound.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: notification.request.content.data?.type === "test",
    shouldSetBadge: true,
  }),
});

const ensureFireChannels = async () => {
  if (Platform.OS !== "android") return;
  for (const { id, pushSound, channelId } of ALARM_SOUNDS) {
    await Notifications.setNotificationChannelAsync(channelId, {
      name: id === "classic" ? "Fire alarm" : `Fire alarm (${id})`,
      description: "Fire detected in one of your rooms",
      importance: Notifications.AndroidImportance.MAX,
      sound: pushSound,
      // Routed through the alarm stream so it still rings with the ringer silenced.
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
      vibrationPattern: [0, 1000, 500, 1000, 500, 1000, 500, 1000],
      enableVibrate: true,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      lightColor: "#FF3B30",
    });
  }
};

// Asks for permission and returns this device's Expo push token, or null
// when push is unavailable (simulator, permission denied, no EAS project id).
export const registerForPushNotifications = async () => {
  try {
    await ensureFireChannels();

    if (!Device.isDevice) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true },
      }));
    }
    if (status !== "granted") return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn(
        "Push notifications disabled: no EAS projectId. Run `npx eas init` in frontend/.",
      );
      return null;
    }

    // FCM often answers SERVICE_NOT_AVAILABLE right after launch or on a
    // flaky network; it usually succeeds a few seconds later.
    const delays = [0, 3000, 10000];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      try {
        const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
        return data;
      } catch (e) {
        if (attempt === delays.length - 1) throw e;
        console.log(`Push token attempt ${attempt + 1} failed, retrying...`);
      }
    }
    return null;
  } catch (e) {
    console.warn("Push registration failed:", e?.message ?? e);
    return null;
  }
};

// Fires when the user taps a notification (app in background or killed).
export const addNotificationTapListener = (handler) =>
  Notifications.addNotificationResponseReceivedListener((response) =>
    handler(response.notification.request.content.data ?? {}),
  );

// Tap that cold-started the app, if any.
export const getLaunchNotificationData = async () => {
  const response = await Notifications.getLastNotificationResponseAsync();
  return response?.notification.request.content.data ?? null;
};

// "granted", "denied" or "undetermined" - what the phone currently allows.
export const getNotificationPermission = async () => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch {
    return "undetermined";
  }
};
