import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Audio } from "expo-av";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import { getNotificationPermission } from "../services/notifications";
import { ALARM_SOUNDS } from "../services/alarmSounds";

const PREVIEW_MS = 4000;

// Mirrors THRESHOLDS in backend/src/controller/alertController.js.
const TRIGGERS = [
  { key: "triggerFlame", icon: "flame-outline" },
  { key: "triggerTemp", icon: "thermometer-outline" },
  { key: "triggerSmoke", icon: "cloud-outline" },
  { key: "triggerGas", icon: "warning-outline" },
];

function StatusRow({ icon, title, ok, text, action }) {
  const color = ok === null ? COLORS.text3 : ok ? COLORS.green : COLORS.primary;
  const background =
    ok === null ? COLORS.bg : ok ? COLORS.greenLight : COLORS.primaryLight;
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.statusCopy}>
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={[styles.statusText, { color }]}>{text}</Text>
        {action}
      </View>
    </View>
  );
}

export default function NotificationSettingsScreen({ navigation }) {
  const {
    t,
    pushRegistered,
    registerPush,
    sendTestAlarm,
    alarmSound,
    changeAlarmSound,
  } = useApp();

  const [permission, setPermission] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [testing, setTesting] = useState(false);

  // One preview at a time; it stops by itself after a few seconds, when
  // another starts, or when the screen closes.
  const [previewing, setPreviewing] = useState(null);
  const previewRef = useRef({ sound: null, timer: null });

  const stopPreview = useCallback(async () => {
    const { sound, timer } = previewRef.current;
    previewRef.current = { sound: null, timer: null };
    clearTimeout(timer);
    setPreviewing(null);
    if (sound) {
      await sound.stopAsync().catch(() => {});
      await sound.unloadAsync().catch(() => {});
    }
  }, []);

  useEffect(() => () => {
    stopPreview();
  }, [stopPreview]);

  const handlePreview = async (option) => {
    const wasPlaying = previewing === option.id;
    await stopPreview();
    if (wasPlaying) return;

    try {
      const { sound } = await Audio.Sound.createAsync(option.inApp, {
        shouldPlay: true,
        isLooping: true,
      });
      previewRef.current = {
        sound,
        timer: setTimeout(stopPreview, PREVIEW_MS),
      };
      setPreviewing(option.id);
    } catch (e) {
      console.warn("Preview failed:", e);
    }
  };

  const handleSelect = (option) => {
    if (option.id !== alarmSound) changeAlarmSound(option.id);
  };

  // Re-checked whenever the screen comes back into view, e.g. after the user
  // returns from the phone's settings app.
  useFocusEffect(
    useCallback(() => {
      getNotificationPermission().then(setPermission);
    }, []),
  );

  const pushAllowed = permission === null ? null : permission === "granted";

  const handleRetry = async () => {
    setRetrying(true);
    await registerPush();
    setPermission(await getNotificationPermission());
    setRetrying(false);
  };

  const handleTest = async () => {
    setTesting(true);
    const result = await sendTestAlarm();
    setTesting(false);

    if (result.ok) {
      Alert.alert(t("notificationSettings.testSentTitle"), t("notificationSettings.testSent"));
    } else {
      Alert.alert(
        t("notificationSettings.testFailedTitle"),
        result.error || t("notificationSettings.testNotRegistered"),
      );
    }
  };

  const deviceText =
    pushRegistered === null
      ? t("notificationSettings.deviceChecking")
      : pushRegistered
        ? t("notificationSettings.deviceOn")
        : t("notificationSettings.deviceOff");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("notificationSettings.title")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("notificationSettings.status")}</Text>
          <View style={styles.card}>
            <StatusRow
              icon={pushAllowed === false ? "notifications-off-outline" : "notifications-outline"}
              title={t("notificationSettings.push")}
              ok={pushAllowed}
              text={
                pushAllowed === null
                  ? t("notificationSettings.deviceChecking")
                  : pushAllowed
                    ? t("notificationSettings.pushOn")
                    : t("notificationSettings.pushOff")
              }
              action={
                pushAllowed === false ? (
                  <TouchableOpacity
                    style={styles.inlineBtn}
                    onPress={() => Linking.openSettings()}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.inlineBtnText}>
                      {t("notificationSettings.openSettings")}
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
            />
            <View style={styles.divider} />
            <StatusRow
              icon="phone-portrait-outline"
              title={t("notificationSettings.device")}
              ok={pushRegistered}
              text={deviceText}
              action={
                pushRegistered === false ? (
                  <TouchableOpacity
                    style={styles.inlineBtn}
                    onPress={handleRetry}
                    disabled={retrying}
                    activeOpacity={0.7}
                  >
                    {retrying ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Text style={styles.inlineBtnText}>
                        {t("notificationSettings.retry")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null
              }
            />
          </View>
        </View>

        {/* Alarm sound */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("notificationSettings.alarmSound")}</Text>
          <View style={styles.card}>
            {ALARM_SOUNDS.map((option, i) => {
              const selected = option.id === alarmSound;
              const playing = previewing === option.id;
              return (
                <React.Fragment key={option.id}>
                  <TouchableOpacity
                    style={styles.soundRow}
                    onPress={() => handleSelect(option)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.statusCopy}>
                      <Text style={styles.statusTitle}>
                        {t(`notificationSettings.sounds.${option.id}.name`)}
                      </Text>
                      <Text style={styles.hint}>
                        {t(`notificationSettings.sounds.${option.id}.desc`)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.playBtn, playing && styles.playBtnActive]}
                      onPress={() => handlePreview(option)}
                      accessibilityLabel={
                        playing
                          ? t("notificationSettings.stop")
                          : t("notificationSettings.preview")
                      }
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={playing ? "stop" : "play"}
                        size={16}
                        color={playing ? COLORS.white : COLORS.primary}
                      />
                    </TouchableOpacity>
                  </TouchableOpacity>
                  {i < ALARM_SOUNDS.length - 1 && <View style={styles.soundDivider} />}
                </React.Fragment>
              );
            })}
          </View>
          <Text style={[styles.hint, styles.sectionNote]}>
            {t("notificationSettings.alarmSoundHint")}
          </Text>
        </View>

        {/* Test alarm */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("notificationSettings.test")}</Text>
          <View style={[styles.card, styles.cardPadded]}>
            <Text style={styles.hint}>{t("notificationSettings.testHint")}</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, testing && styles.btnDisabled]}
              onPress={handleTest}
              disabled={testing}
              activeOpacity={0.85}
            >
              {testing ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="alarm-outline" size={18} color={COLORS.white} />
                  <Text style={styles.primaryBtnText}>
                    {t("notificationSettings.testAlarm")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* What triggers an alarm */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("notificationSettings.triggers")}</Text>
          <View style={styles.card}>
            {TRIGGERS.map((trigger, i) => (
              <React.Fragment key={trigger.key}>
                <View style={styles.triggerRow}>
                  <Ionicons name={trigger.icon} size={18} color={COLORS.primary} />
                  <Text style={styles.triggerText}>
                    {t(`notificationSettings.${trigger.key}`)}
                  </Text>
                </View>
                {i < TRIGGERS.length - 1 && <View style={styles.triggerDivider} />}
              </React.Fragment>
            ))}
          </View>
          <View style={styles.noteRow}>
            <Ionicons name="lock-closed-outline" size={14} color={COLORS.text3} />
            <Text style={styles.noteText}>{t("notificationSettings.alwaysOn")}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    paddingBottom: SPACING.xxl,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
  },

  // ── Section ───────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text3,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    ...SHADOW.small,
  },
  cardPadded: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 68,
  },

  // ── Status rows ───────────────────────────────────────────────────────────
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    padding: SPACING.md,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  statusCopy: { flex: 1, gap: 2 },
  statusTitle: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  statusText: { fontSize: 12, lineHeight: 17 },
  inlineBtn: {
    alignSelf: "flex-start",
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    minWidth: 80,
    alignItems: "center",
  },
  inlineBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: "700" },

  // ── Alarm sound ───────────────────────────────────────────────────────────
  soundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: COLORS.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnActive: { backgroundColor: COLORS.primary },
  soundDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 52,
  },
  sectionNote: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },

  // ── Test ──────────────────────────────────────────────────────────────────
  hint: {
    fontSize: 12,
    color: COLORS.text3,
    lineHeight: 17,
  },
  primaryBtn: {
    flexDirection: "row",
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },

  // ── Triggers ──────────────────────────────────────────────────────────────
  triggerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  triggerText: { fontSize: 14, color: COLORS.text, flex: 1 },
  triggerDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 50,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  noteText: { fontSize: 12, color: COLORS.text3, flex: 1, lineHeight: 17 },
});
