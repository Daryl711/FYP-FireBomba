import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import { verifyLoginOtp, resendLoginOtp } from "../services/api";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function OtpScreen({ navigation, route }) {
  const { t, login } = useApp();
  const { challengeToken, phoneHint } = route.params || {};

  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN);
  const inputRef = useRef(null);

  // Countdown until "Resend" becomes tappable again. The backend enforces the
  // same cooldown, so this only keeps the button honest.
  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const handleVerify = async (submittedCode) => {
    const value = (submittedCode || code).trim();

    if (value.length !== CODE_LENGTH) {
      Alert.alert(t("otp.invalidTitle"), t("otp.enterFullCode"));
      return;
    }

    setIsLoading(true);

    try {
      const result = await verifyLoginOtp(challengeToken, value);

      if (result.error) {
        // The challenge itself can expire, which needs a fresh login.
        if (result.error.indexOf("Challenge expired") !== -1) {
          Alert.alert(t("otp.expiredTitle"), result.error, [
            { text: "OK", onPress: () => navigation.replace("Login") },
          ]);
          return;
        }

        setCode("");
        Alert.alert(t("otp.invalidTitle"), result.error);
        return;
      }

      await login(result.user, result.accessToken, result.refreshToken);
      navigation.replace("Main");
    } catch (error) {
      Alert.alert(t("otp.errorTitle"), t("otp.connectError"));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (secondsLeft > 0 || isResending) {
      return;
    }

    setIsResending(true);

    try {
      const result = await resendLoginOtp(challengeToken);

      if (result.error) {
        Alert.alert(t("otp.invalidTitle"), result.error);
        return;
      }

      setCode("");
      setSecondsLeft(RESEND_COOLDOWN);
      Alert.alert(t("otp.resentTitle"), t("otp.resentMessage"));
    } catch (error) {
      Alert.alert(t("otp.errorTitle"), t("otp.connectError"));
    } finally {
      setIsResending(false);
    }
  };

  // One hidden input backs six visible boxes: simpler than six refs, and it
  // keeps paste and SMS autofill working.
  const handleChange = (text) => {
    const digits = text.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH);
    setCode(digits);

    if (digits.length === CODE_LENGTH) {
      handleVerify(digits);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.replace("Login")}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={34}
                color={COLORS.primary}
              />
            </View>
          </View>

          <Text style={styles.title}>{t("otp.title")}</Text>
          <Text style={styles.subtitle}>
            {t("otp.subtitle", { phone: phoneHint || "" })}
          </Text>

          <View style={styles.card}>
            <TouchableOpacity
              activeOpacity={1}
              style={styles.boxRow}
              onPress={() => inputRef.current && inputRef.current.focus()}
            >
              {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.box,
                    index === code.length && styles.boxActive,
                    code[index] && styles.boxFilled,
                  ]}
                >
                  <Text style={styles.boxText}>{code[index] || ""}</Text>
                </View>
              ))}
            </TouchableOpacity>

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={handleChange}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoFocus
              editable={!isLoading}
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
            />

            <TouchableOpacity
              style={[
                styles.verifyBtn,
                (isLoading || code.length !== CODE_LENGTH) && styles.btnDisabled,
              ]}
              onPress={() => handleVerify()}
              disabled={isLoading || code.length !== CODE_LENGTH}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.verifyText}>{t("otp.verify")}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResend}
              disabled={secondsLeft > 0 || isResending}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.resendText,
                  secondsLeft > 0 && styles.resendDisabled,
                ]}
              >
                {secondsLeft > 0
                  ? t("otp.resendIn", { seconds: secondsLeft })
                  : t("otp.resend")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF9F9" },
  flex: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    gap: SPACING.md,
  },
  backBtn: {
    alignSelf: "flex-start",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  logoWrap: { marginVertical: SPACING.sm },
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
  subtitle: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: "center",
    marginTop: -SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: "100%",
    gap: SPACING.lg,
    ...SHADOW.small,
  },
  boxRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  box: {
    flex: 1,
    aspectRatio: 0.8,
    maxHeight: 58,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: "#F8F8F8",
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: { borderColor: COLORS.primary },
  boxFilled: { borderColor: COLORS.primary, backgroundColor: COLORS.white },
  boxText: { fontSize: 22, fontWeight: "700", color: COLORS.text },
  // Off-screen rather than hidden, so it can still hold keyboard focus.
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
    top: -100,
  },
  verifyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.5 },
  verifyText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  resendText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "600",
    textAlign: "center",
  },
  resendDisabled: { color: COLORS.text3, fontWeight: "500" },
});
