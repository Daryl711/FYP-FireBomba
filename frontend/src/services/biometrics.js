import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

// Thin wrapper around expo-local-authentication. Every call is guarded: on a
// device with no sensor, no enrolled finger/face, or on web, we report
// "unavailable" rather than throwing, so the app can fall back to a password.

export async function getBiometricSupport() {
  if (Platform.OS === "web") {
    return { available: false, type: null };
  }

  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { available: false, type: null };

    // Hardware can exist with nothing enrolled - prompting then always fails.
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return { available: false, type: null };

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    let type = "biometric";
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      type = "face";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      type = "fingerprint";
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      type = "iris";
    }

    return { available: true, type };
  } catch {
    return { available: false, type: null };
  }
}

// Returns { success, cancelled }. The device passcode stays available as a
// fallback so a failing fingerprint doesn't strand the user.
export async function promptBiometrics({ promptMessage, cancelLabel, fallbackLabel }) {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      fallbackLabel,
      disableDeviceFallback: false,
    });

    return {
      success: result.success === true,
      cancelled:
        result.error === "user_cancel" ||
        result.error === "app_cancel" ||
        result.error === "system_cancel",
    };
  } catch {
    return { success: false, cancelled: false };
  }
}
