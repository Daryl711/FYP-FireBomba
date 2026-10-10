import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import { forgotPassword, verifyResetOtp, resetPassword } from "../services/api";

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;
// Matches the backend check in resetPassword.
const MIN_PASSWORD_LENGTH = 8;

// Three steps on one screen:
//   "request"  - email or phone, sends the code
//   "code"     - the 6-digit code, checked on its own
//   "password" - the new password, only reachable once the code was right
export default function ForgotPasswordScreen({ navigation }) {
  const { t } = useApp();

  const [step, setStep] = useState("request");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  // Proof from the server that the code was right; step 3 must present it.
  const [resetToken, setResetToken] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeInputRef = useRef(null);

  // Same reading the backend uses: anything with "@" is an email.
  const isEmail = identifier.includes("@");

  // The backend allows one code per 60s; this keeps "Resend" honest.
  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // Step 1. The server replies the same whether or not the account exists,
  // so a success only means "a code was sent if the account is real".
  const sendCode = async ({ isResend = false } = {}) => {
    if (!identifier.trim()) {
      Alert.alert(t("forgot.errorTitle"), t("forgot.missingIdentifier"));
      return;
    }

    setIsLoading(true);

    try {
      const result = await forgotPassword(identifier.trim());

      if (result.error) {
        Alert.alert(t("forgot.errorTitle"), result.error);
        return;
      }

      setCode("");
      setSecondsLeft(RESEND_COOLDOWN);
      setStep("code");

      if (isResend) {
        Alert.alert(t("forgot.resentTitle"), t("forgot.resentMessage"));
      }
    } catch (error) {
      Alert.alert(t("forgot.errorTitle"), t("forgot.connectError"));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2.
  const handleVerify = async (submittedCode) => {
    const value = (submittedCode || code).trim();

    if (value.length !== CODE_LENGTH) {
      Alert.alert(t("forgot.failedTitle"), t("forgot.enterFullCode"));
      return;
    }

    setIsLoading(true);

    try {
      const result = await verifyResetOtp(identifier.trim(), value);

      if (result.error || !result.resetToken) {
        setCode("");
        Alert.alert(t("forgot.failedTitle"), result.error || t("forgot.connectError"));
        return;
      }

      setResetToken(result.resetToken);
      setStep("password");
    } catch (error) {
      Alert.alert(t("forgot.errorTitle"), t("forgot.connectError"));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // One hidden input backs six visible boxes, as on the login OTP screen.
  const handleCodeChange = (text) => {
    const digits = text.replace(/[^0-9]/g, "").slice(0, CODE_LENGTH);
    setCode(digits);

    if (digits.length === CODE_LENGTH) {
      handleVerify(digits);
    }
  };

  // Step 3.
  const handleReset = async () => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(t("forgot.failedTitle"), t("forgot.passwordMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t("forgot.failedTitle"), t("forgot.passwordMismatch"));
      return;
    }

    setIsLoading(true);

    try {
      const result = await resetPassword(resetToken, newPassword);

      if (result.error) {
        // The token lasts 10 minutes; after that the code must be redone.
        if (result.error.indexOf("Reset expired") !== -1) {
          Alert.alert(t("forgot.expiredTitle"), result.error, [
            { text: "OK", onPress: restart },
          ]);
          return;
        }

        Alert.alert(t("forgot.failedTitle"), result.error);
        return;
      }

      Alert.alert(t("forgot.successTitle"), t("forgot.successMessage"), [
        { text: "OK", onPress: () => navigation.replace("Login") },
      ]);
    } catch (error) {
      Alert.alert(t("forgot.errorTitle"), t("forgot.connectError"));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const restart = () => {
    setStep("request");
    setCode("");
    setResetToken(null);
    setNewPassword("");
    setConfirmPassword("");
  };

  const goBack = () => {
    if (step === "request") {
      navigation.goBack();
      return;
    }
    // From the password step, going back means starting over: the code has
    // already been used up.
    restart();
  };

  const icon =
    step === "request" ? "key-outline" : step === "code" ? "mail-outline" : "lock-open-outline";

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={isLoading}>
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <View style={styles.logoCircle}>
              <Ionicons
                name={step === "code" && !isEmail ? "chatbubble-ellipses-outline" : icon}
                size={34}
                color={COLORS.primary}
              />
            </View>
          </View>

          {step === "request" && (
            <>
              <Text style={styles.title}>{t("forgot.title")}</Text>
              <Text style={styles.subtitle}>{t("forgot.subtitle")}</Text>

              <View style={styles.card}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t("forgot.identifier")}</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={COLORS.text3}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t("forgot.identifierPlaceholder")}
                      placeholderTextColor={COLORS.text3}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={identifier}
                      onChangeText={setIdentifier}
                      editable={!isLoading}
                      onSubmitEditing={() => sendCode()}
                      returnKeyType="send"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                  onPress={() => sendCode()}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.primaryText}>{t("forgot.sendCode")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === "code" && (
            <>
              <Text style={styles.title}>{t("forgot.codeTitle")}</Text>
              <Text style={styles.subtitle}>
                {t(isEmail ? "forgot.codeSubtitleEmail" : "forgot.codeSubtitleSms", {
                  identifier: identifier.trim(),
                })}
              </Text>

              <View style={styles.card}>
                <TouchableOpacity
                  activeOpacity={1}
                  style={styles.boxRow}
                  onPress={() => codeInputRef.current && codeInputRef.current.focus()}
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
                  ref={codeInputRef}
                  style={styles.hiddenInput}
                  value={code}
                  onChangeText={handleCodeChange}
                  keyboardType="number-pad"
                  maxLength={CODE_LENGTH}
                  autoFocus
                  editable={!isLoading}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                />

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (isLoading || code.length !== CODE_LENGTH) && styles.btnDisabled,
                  ]}
                  onPress={() => handleVerify()}
                  disabled={isLoading || code.length !== CODE_LENGTH}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.primaryText}>{t("forgot.verify")}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => sendCode({ isResend: true })}
                  disabled={secondsLeft > 0 || isLoading}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.linkText, secondsLeft > 0 && styles.linkDisabled]}>
                    {secondsLeft > 0
                      ? t("forgot.resendIn", { seconds: secondsLeft })
                      : t("forgot.resend")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={restart} disabled={isLoading} activeOpacity={0.7}>
                  <Text style={styles.linkText}>{t("forgot.changeAccount")}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {step === "password" && (
            <>
              <Text style={styles.title}>{t("forgot.resetTitle")}</Text>
              <Text style={styles.subtitle}>{t("forgot.resetSubtitle")}</Text>

              <View style={styles.card}>
                {/* New password */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t("forgot.newPassword")}</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={COLORS.text3}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={[styles.input, { paddingRight: 44 }]}
                      placeholder={t("forgot.newPasswordPlaceholder")}
                      placeholderTextColor={COLORS.text3}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoFocus
                      value={newPassword}
                      onChangeText={setNewPassword}
                      editable={!isLoading}
                      textContentType="newPassword"
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color={COLORS.text3}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm password */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t("forgot.confirmPassword")}</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={COLORS.text3}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t("forgot.confirmPasswordPlaceholder")}
                      placeholderTextColor={COLORS.text3}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      editable={!isLoading}
                      onSubmitEditing={handleReset}
                      returnKeyType="done"
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
                  onPress={handleReset}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.primaryText}>{t("forgot.resetButton")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          <Text
            style={styles.backToLogin}
            onPress={() => !isLoading && navigation.replace("Login")}
          >
            {t("forgot.backToLogin")}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFF9F9" },
  flex: { flex: 1 },
  scrollContainer: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl,
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
  fieldGroup: { gap: SPACING.xs },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F8F8",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputIcon: { marginLeft: 12, marginRight: 4 },
  input: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 8,
    fontSize: 14,
    color: COLORS.text,
    fontFamily: Platform.OS === "ios" ? "System" : "sans-serif",
  },
  eyeBtn: { padding: 12, position: "absolute", right: 0 },
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
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.6 },
  primaryText: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  linkText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "600",
    textAlign: "center",
  },
  linkDisabled: { color: COLORS.text3, fontWeight: "500" },
  backToLogin: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: "700",
    textAlign: "center",
    marginTop: SPACING.sm,
  },
});
