import React, { useRef, useState } from "react";
import {
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";

export default function EmergencyCallButton({ t }) {
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);

  const close = () => {
    if (!openingRef.current) setVisible(false);
  };

  const callEmergencyServices = async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setOpening(true);
    setError(false);
    try {
      // Hand off to the system phone app only after explicit confirmation.
      await Linking.openURL("tel:999");
      setVisible(false);
    } catch {
      setError(true);
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  return (
    <View style={styles.buttonWrap}>
      <TouchableOpacity
        style={styles.circle}
        accessibilityRole="button"
        accessibilityLabel={t("home.emergencyCallLabel")}
        accessibilityHint={t("home.emergencyCallHint")}
        activeOpacity={0.75}
        onPress={() => {
          setError(false);
          setVisible(true);
        }}
      >
        <Ionicons name="call" size={24} color={COLORS.white} />
        <Text style={styles.number}>999</Text>
      </TouchableOpacity>
      <Modal
        transparent
        animationType="fade"
        visible={visible}
        onRequestClose={close}
      >
        <SafeAreaView style={styles.backdrop}>
          <View style={styles.dialog} accessibilityViewIsModal>
            <ScrollView bounces={false}>
              <Text style={styles.dialogTitle} accessibilityRole="header">
                {t("home.emergencyConfirmTitle")}
              </Text>
              <Text style={styles.message}>
                {t("home.emergencyConfirmMessage")}
              </Text>
              {error && (
                <Text
                  style={styles.error}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                >
                  {t("home.emergencyCallError")}
                </Text>
              )}
              <TouchableOpacity
                style={styles.confirm}
                accessibilityRole="button"
                accessibilityState={{ disabled: opening, busy: opening }}
                disabled={opening}
                onPress={callEmergencyServices}
              >
                <Text style={styles.confirmText}>
                  {t(
                    opening
                      ? "home.emergencyOpening"
                      : "home.emergencyConfirmCall",
                  )}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancel}
                accessibilityRole="button"
                accessibilityState={{ disabled: opening }}
                disabled={opening}
                onPress={close}
              >
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Reserve space instead of overlaying home content.
  buttonWrap: {
    alignSelf: "flex-end",
    marginRight: SPACING.xl,
    marginVertical: SPACING.sm,
  },
  circle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryDark,
    gap: 2,
  },
  number: { color: COLORS.white, fontWeight: "800", fontSize: 18 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.xl,
  },
  dialog: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "100%",
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    backgroundColor: COLORS.white,
  },
  dialogTitle: { fontSize: 21, fontWeight: "700", color: COLORS.text },
  message: {
    fontSize: 15,
    lineHeight: 23,
    color: COLORS.text2,
    marginVertical: SPACING.lg,
  },
  error: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.primaryDark,
    marginBottom: SPACING.lg,
  },
  confirm: {
    backgroundColor: COLORS.primaryDark,
    padding: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  confirmText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  cancel: { padding: SPACING.lg, marginTop: SPACING.sm },
  cancelText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});
