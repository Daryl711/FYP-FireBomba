import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";

// Shown on a cold start when a stored session is still inside its 30/7-day
// window. The password screen only comes back once that window closes.
export default function UnlockScreen() {
  const { t, lockedUser, biometricSupport, unlockWithBiometrics, usePasswordInstead } =
    useApp();

  const [isUnlocking, setIsUnlocking] = useState(false);
  const [message, setMessage] = useState(null);
  // The prompt is fired once automatically; without this guard a re-render
  // while the system dialog is open would stack a second prompt on top.
  const hasAutoPrompted = useRef(false);

  const iconName =
    biometricSupport.type === "face" ? "scan-outline" : "finger-print";

  const subtitle =
    biometricSupport.type === "face"
      ? t("unlock.subtitleFace")
      : biometricSupport.type === "fingerprint"
        ? t("unlock.subtitleFingerprint")
        : t("unlock.subtitleGeneric");

  const runUnlock = useCallback(async () => {
    setIsUnlocking(true);
    setMessage(null);

    const result = await unlockWithBiometrics({
      promptMessage: t("unlock.prompt"),
      cancelLabel: t("common.cancel"),
      fallbackLabel: t("unlock.usePasscode"),
    });

    setIsUnlocking(false);

    if (result.ok) return; // the navigator swaps to the app on its own

    if (result.reason === "CANCELLED") {
      setMessage(t("unlock.cancelled"));
    } else if (result.reason === "NETWORK") {
      setMessage(t("unlock.networkError"));
    } else if (result.reason === "SESSION_EXPIRED") {
      // Deadline passed while the app was closed - context has already dropped
      // the session, so this is the last thing shown before the login screen.
      Alert.alert(t("unlock.expiredTitle"), t("unlock.sessionExpired"));
    } else if (result.reason === "UNAVAILABLE") {
      setMessage(t("security.biometricUnavailable"));
    } else {
      setMessage(t("unlock.failed"));
    }
  }, [t, unlockWithBiometrics]);

  useEffect(() => {
    if (hasAutoPrompted.current) return;
    hasAutoPrompted.current = true;
    runUnlock();
  }, [runUnlock]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoCircle}>
          <Ionicons name="flame" size={44} color={COLORS.primary} />
        </View>

        <Text style={styles.title}>{t("unlock.title")}</Text>

        {lockedUser?.email ? (
          <Text style={styles.email}>
            {t("unlock.signedInAs")} {lockedUser.email}
          </Text>
        ) : null}

        <View style={styles.card}>
          <View style={styles.biometricCircle}>
            <Ionicons name={iconName} size={40} color={COLORS.primary} />
          </View>

          <Text style={styles.subtitle}>{subtitle}</Text>

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TouchableOpacity
            style={[styles.unlockBtn, isUnlocking && { opacity: 0.7 }]}
            onPress={runUnlock}
            activeOpacity={0.85}
            disabled={isUnlocking}
          >
            {isUnlocking ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.unlockText}>
                {message ? t("unlock.retry") : t("unlock.unlockButton")}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={usePasswordInstead}
            disabled={isUnlocking}
            activeOpacity={0.7}
          >
            <Text style={styles.passwordLink}>{t("unlock.usePassword")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF9F9",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  logoCircle: {
    width: 72,
    height: 72,
    backgroundColor: COLORS.white,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.medium,
    shadowColor: COLORS.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: COLORS.text,
    textAlign: "center",
  },
  email: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: "center",
    marginTop: -SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: "100%",
    alignItems: "center",
    gap: SPACING.lg,
    marginTop: SPACING.md,
    ...SHADOW.small,
  },
  biometricCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FFF1F1",
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.text2,
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    color: COLORS.primary,
    textAlign: "center",
    marginTop: -SPACING.sm,
  },
  unlockBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    alignItems: "center",
    width: "100%",
  },
  unlockText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },
  passwordLink: {
    fontSize: 14,
    color: COLORS.text2,
    fontWeight: "600",
    textAlign: "center",
  },
});
