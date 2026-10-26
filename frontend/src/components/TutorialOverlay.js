import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import { getRoomsByBilik } from "../services/api";
import { navigateInMain } from "../navigation/navigationRef";

// Where each step takes the user, as params for navigating inside "Main".
// `room` is the first room of the user's bilik, when one has loaded.
const HOME = { screen: "Home", params: { screen: "HomeMain" } };
const ROOMS = { screen: "Rooms", params: { screen: "RoomsList" } };
const roomDetail = (room) =>
  room
    ? { screen: "Rooms", params: { screen: "ListRoomDetail", params: { room } } }
    : ROOMS;

// Short labels for the language switch; the full names are read out by
// screen readers.
const LANGUAGES = [
  { code: "en", label: "EN", nameKey: "profile.english" },
  { code: "ms", label: "BM", nameKey: "profile.bahasaMalaysia" },
];

// Each step maps a section of the app to the category it belongs to.
// `key` resolves against translations at tutorial.steps.<key> (title + desc).
// `target` returns the screen to show behind the card for that step.
const STEPS = [
  {
    key: "welcome",
    icon: "flame",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    category: null,
    target: () => HOME,
  },
  {
    key: "home",
    icon: "home",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    category: "monitoring",
    target: () => HOME,
  },
  {
    key: "systemStatus",
    icon: "pulse",
    iconBg: COLORS.greenLight,
    iconColor: COLORS.green,
    category: "monitoring",
    target: () => HOME,
  },
  {
    key: "recentAlerts",
    icon: "notifications",
    iconBg: COLORS.amberLight,
    iconColor: COLORS.amber,
    category: "monitoring",
    target: () => HOME,
  },
  {
    key: "callBomba",
    icon: "call",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primaryDark,
    category: "emergency",
    target: () => HOME,
  },
  {
    key: "rooms",
    icon: "grid",
    iconBg: COLORS.blueLight,
    iconColor: COLORS.blue,
    category: "monitoring",
    target: () => ROOMS,
  },
  {
    key: "roomDetail",
    icon: "videocam",
    iconBg: COLORS.blueLight,
    iconColor: COLORS.blue,
    category: "monitoring",
    target: roomDetail,
  },
  {
    key: "waterPump",
    icon: "water",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    category: "control",
    target: roomDetail,
  },
  {
    key: "alerts",
    icon: "notifications-circle",
    iconBg: COLORS.amberLight,
    iconColor: COLORS.amber,
    category: "alerts",
    target: () => ({ screen: "Notifications" }),
  },
  {
    key: "profile",
    icon: "person",
    iconBg: "#F3F0FF",
    iconColor: COLORS.purple,
    category: "account",
    target: () => ({ screen: "Profile", params: { screen: "ProfileMain" } }),
  },
  {
    key: "security",
    icon: "shield-checkmark",
    iconBg: "#F3F0FF",
    iconColor: COLORS.purple,
    category: "account",
    target: () => ({ screen: "Profile", params: { screen: "Security" } }),
  },
];

export default function TutorialOverlay({ visible, onClose }) {
  const { t, bilik, language, setLanguage } = useApp();
  const [step, setStep] = useState(0);
  const [sampleRoom, setSampleRoom] = useState(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Load one room so the room detail and water pump steps can open a real
  // room. Without one, those steps fall back to the Rooms list.
  useEffect(() => {
    if (!visible || !bilik?.bilikId) return;
    let mounted = true;
    getRoomsByBilik(bilik.bilikId)
      .then((rooms) => {
        if (mounted && Array.isArray(rooms) && rooms.length > 0) {
          setSampleRoom(rooms[0]);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [visible, bilik?.bilikId]);

  // Show the screen this step is about behind the card.
  useEffect(() => {
    if (!visible) return;
    return navigateInMain(current.target(sampleRoom));
  }, [visible, step, sampleRoom]);

  const handleNext = () => {
    if (isLast) {
      handleClose();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  // Finishing or skipping lands the user back on Home.
  const handleClose = () => {
    setStep(0);
    navigateInMain(HOME);
    onClose();
  };

  const categoryLabel = current.category
    ? t(`tutorial.categories.${current.category}`)
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Language switch (changes the whole app) + Skip */}
          <View style={styles.topRow}>
            <View style={styles.languageSwitch}>
              {LANGUAGES.map(({ code, label, nameKey }) => {
                const active = language === code;
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.languageOption, active && styles.languageOptionActive]}
                    onPress={() => setLanguage(code)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t(nameKey)}
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.languageOptionText,
                        active && styles.languageOptionTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.skipText}>{t("tutorial.skip")}</Text>
            </TouchableOpacity>
          </View>

          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: current.iconBg }]}>
            <Ionicons name={current.icon} size={30} color={current.iconColor} />
          </View>

          {/* Category pill (which category this section belongs to) */}
          {categoryLabel && (
            <View style={styles.categoryPill}>
              <Text style={styles.categoryText}>{categoryLabel}</Text>
            </View>
          )}

          {/* Title + description */}
          <Text style={styles.title}>{t(`tutorial.steps.${current.key}.title`)}</Text>
          <Text style={styles.desc}>{t(`tutorial.steps.${current.key}.desc`)}</Text>

          {/* Progress dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === step && styles.dotActive]}
              />
            ))}
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            {step > 0 ? (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={handleBack}
                activeOpacity={0.8}
              >
                <Text style={styles.backText}>{t("tutorial.back")}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backSpacer} />
            )}

            <TouchableOpacity
              style={styles.nextBtn}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={styles.nextText}>
                {isLast ? t("tutorial.done") : t("tutorial.next")}
              </Text>
              {!isLast && (
                <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
              )}
            </TouchableOpacity>
          </View>

          {/* Step counter */}
          <Text style={styles.counter}>
            {t("tutorial.stepCounter", {
              current: step + 1,
              total: STEPS.length,
            })}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    ...SHADOW.medium,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  languageSwitch: {
    flexDirection: "row",
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.full,
    padding: 3,
    gap: 4,
  },
  languageOption: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  languageOptionActive: {
    backgroundColor: COLORS.primary,
  },
  languageOptionText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text2,
  },
  languageOptionTextActive: {
    color: COLORS.white,
  },
  skipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text3,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  categoryPill: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    marginBottom: SPACING.sm,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text2,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  desc: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.text2,
    marginBottom: SPACING.lg,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginBottom: SPACING.lg,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: COLORS.primary,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  backSpacer: {
    flex: 1,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text2,
  },
  nextBtn: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  nextText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
  },
  counter: {
    textAlign: "center",
    fontSize: 12,
    color: COLORS.text3,
    marginTop: SPACING.md,
  },
});