import React, { useState } from "react";
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../constants/theme";
import { useApp } from "../context/AppContext";

const { width } = Dimensions.get("window");

// Each step maps a section of the app to the category it belongs to.
// `key` resolves against translations at tutorial.steps.<key> (title + desc).
const STEPS = [
  {
    key: "welcome",
    icon: "flame",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    category: null,
  },
  {
    key: "home",
    icon: "home",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    category: "monitoring",
  },
  {
    key: "systemStatus",
    icon: "pulse",
    iconBg: COLORS.greenLight,
    iconColor: COLORS.green,
    category: "monitoring",
  },
  {
    key: "recentAlerts",
    icon: "notifications",
    iconBg: COLORS.amberLight,
    iconColor: COLORS.amber,
    category: "monitoring",
  },
  {
    key: "rooms",
    icon: "grid",
    iconBg: COLORS.blueLight,
    iconColor: COLORS.blue,
    category: "monitoring",
  },
  {
    key: "roomDetail",
    icon: "videocam",
    iconBg: COLORS.blueLight,
    iconColor: COLORS.blue,
    category: "monitoring",
  },
  {
    key: "waterPump",
    icon: "water",
    iconBg: COLORS.primaryLight,
    iconColor: COLORS.primary,
    category: "control",
  },
  {
    key: "alerts",
    icon: "notifications-circle",
    iconBg: COLORS.amberLight,
    iconColor: COLORS.amber,
    category: "alerts",
  },
  {
    key: "profile",
    icon: "person",
    iconBg: "#F3F0FF",
    iconColor: COLORS.purple,
    category: "account",
  },
  {
    key: "security",
    icon: "shield-checkmark",
    iconBg: "#F3F0FF",
    iconColor: COLORS.purple,
    category: "account",
  },
];

export default function TutorialOverlay({ visible, onClose }) {
  const { t } = useApp();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

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

  const handleClose = () => {
    setStep(0);
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
          {/* Skip button top-right */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.skipText}>{t("tutorial.skip")}</Text>
          </TouchableOpacity>

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
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
    ...SHADOW.medium,
  },
  skipBtn: {
    position: "absolute",
    top: SPACING.lg,
    right: SPACING.xl,
    zIndex: 2,
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