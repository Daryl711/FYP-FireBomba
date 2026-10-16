import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

// Android locks a channel's sound and importance the first time it is
// created, so changing either means shipping a new channel id. The backend
// sends fire pushes on this id (FIRE_CHANNEL_ID in backend pushService.js).
export const FIRE_CHANNEL_ID = "fire-alarm-v1";

// While the app is open, AppContext already loops alarm.wav through expo-av,
// so the banner is shown but the notification's own sound is skipped.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

const ensureFireChannel = async () => {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(FIRE_CHANNEL_ID, {
    name: "Fire alarm",
    description: "Fire detected in one of your rooms",
    importance: Notifications.AndroidImportance.MAX,
    sound: "fire_alarm.wav",
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
};

// Asks for permission and returns this device's Expo push token, or null
// when push is unavailable (simulator, permission denied, no EAS project id).
export const registerForPushNotifications = async () => {
  try {
    await ensureFireChannel();

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
