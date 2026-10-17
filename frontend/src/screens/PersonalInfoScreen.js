import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import {
  getProfile,
  updateProfile,
  sendPhoneVerificationCode,
  verifyPhoneCode,
} from "../services/api";

// Same rule as sign-up: optional, 8-15 digits once spaces and dashes go.
const isValidPhone = (phoneText) =>
  /^\+?\d{8,15}$/.test(phoneText.replace(/[\s-]/g, ""));

// Phones come back from the server as +60123456789; show them the way
// Malaysians type them.
const displayPhone = (phone) =>
  phone?.startsWith("+60") ? "0" + phone.slice(3) : phone || "";

function InfoRow({ icon, label, value, hint }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={COLORS.text2} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

export default function PersonalInfoScreen({ navigation }) {
  const { t, language, bilik, updateUserName } = useApp();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Phone verification: hidden until a code has been sent.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  const applyProfile = (data) => {
    setProfile(data);
    setFullName(data.fullName || "");
    setPhone(displayPhone(data.phone));
  };

  const loadProfile = async () => {
    setLoadError(false);
    const result = await getProfile();
    if (result?.error) {
      setLoadError(true);
      return;
    }
    applyProfile(result);
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const nameChanged = profile && fullName.trim() !== (profile.fullName || "");
  const phoneChanged = profile && phone.trim() !== displayPhone(profile.phone);
  const hasChanges = nameChanged || phoneChanged;

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert(t("personalInfo.errorTitle"), t("personalInfo.enterFullName"));
      return;
    }
    if (phone.trim() && !isValidPhone(phone.trim())) {
      Alert.alert(t("personalInfo.errorTitle"), t("personalInfo.invalidPhone"));
      return;
    }

    const fields = {};
    if (nameChanged) fields.fullName = fullName.trim();
    if (phoneChanged) fields.phone = phone.trim();

    setSaving(true);
    const result = await updateProfile(fields);
    setSaving(false);

    if (result?.error) {
      Alert.alert(t("personalInfo.errorTitle"), result.error);
      return;
    }

    applyProfile(result);
    if (nameChanged) await updateUserName(result.fullName);
    // A code sent to the old number is no longer valid.
    if (phoneChanged) {
      setCodeSent(false);
      setCode("");
    }
    Alert.alert(t("personalInfo.savedTitle"), t("personalInfo.saved"));
  };

  const handleSendCode = async () => {
    if (phoneChanged) {
      Alert.alert(t("personalInfo.errorTitle"), t("personalInfo.unsavedPhone"));
      return;
    }

    setSendingCode(true);
    const result = await sendPhoneVerificationCode();
    setSendingCode(false);

    if (result?.error) {
      Alert.alert(t("personalInfo.errorTitle"), result.error);
      return;
    }
    setCodeSent(true);
    setCode("");
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert(t("personalInfo.errorTitle"), t("personalInfo.enterFullCode"));
      return;
    }

    setVerifying(true);
    const result = await verifyPhoneCode(code);
    setVerifying(false);

    if (result?.error) {
      Alert.alert(t("personalInfo.errorTitle"), result.error);
      return;
    }

    applyProfile(result);
    setCodeSent(false);
    setCode("");
    Alert.alert(t("personalInfo.savedTitle"), t("personalInfo.phoneVerified"));
  };

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(
        language === "ms" ? "ms-MY" : "en-MY",
        { day: "numeric", month: "long", year: "numeric" },
      )
    : "-";

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={22} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t("personalInfo.title")}</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (!profile) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {header}
        <View style={styles.centerContent}>
          {loadError ? (
            <>
              <Text style={styles.hint}>{t("personalInfo.loadError")}</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={loadProfile}>
                <Text style={styles.secondaryBtnText}>
                  {t("personalInfo.retry")}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator size="large" color={COLORS.primary} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const showVerify = profile.phone && !profile.phoneVerified;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {header}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Editable details */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("personalInfo.details")}</Text>
            <View style={[styles.card, styles.cardPadded]}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>
                  {t("personalInfo.fullName")}
                </Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="person-outline"
                    size={18}
                    color={COLORS.text3}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={t("personalInfo.fullNamePlaceholder")}
                    placeholderTextColor={COLORS.text3}
                    autoCapitalize="words"
                    maxLength={100}
                    value={fullName}
                    onChangeText={setFullName}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.fieldLabel}>
                    {t("personalInfo.phone")}
                  </Text>
                  {profile.phone && !phoneChanged ? (
                    <View
                      style={[
                        styles.badge,
                        profile.phoneVerified
                          ? styles.badgeVerified
                          : styles.badgePending,
                      ]}
                    >
                      <Ionicons
                        name={
                          profile.phoneVerified
                            ? "checkmark-circle"
                            : "alert-circle-outline"
                        }
                        size={12}
                        color={profile.phoneVerified ? COLORS.green : COLORS.amber}
                      />
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color: profile.phoneVerified
                              ? COLORS.green
                              : COLORS.amber,
                          },
                        ]}
                      >
                        {profile.phoneVerified
                          ? t("personalInfo.verified")
                          : t("personalInfo.notVerified")}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="call-outline"
                    size={18}
                    color={COLORS.text3}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder={t("personalInfo.phonePlaceholder")}
                    placeholderTextColor={COLORS.text3}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>
                <Text style={styles.hint}>{t("personalInfo.phoneHint")}</Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (!hasChanges || saving) && styles.btnDisabled,
                ]}
                onPress={handleSave}
                disabled={!hasChanges || saving}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>
                  {saving ? t("personalInfo.saving") : t("personalInfo.save")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Phone verification */}
          {showVerify ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {t("personalInfo.verifyTitle")}
              </Text>
              <View style={[styles.card, styles.cardPadded]}>
                {codeSent ? (
                  <>
                    <Text style={styles.hint}>
                      {t("personalInfo.codeSent", {
                        phone: displayPhone(profile.phone),
                      })}
                    </Text>
                    <View style={styles.inputWrap}>
                      <Ionicons
                        name="keypad-outline"
                        size={18}
                        color={COLORS.text3}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={[styles.input, styles.codeInput]}
                        placeholder={t("personalInfo.codePlaceholder")}
                        placeholderTextColor={COLORS.text3}
                        keyboardType="number-pad"
                        autoComplete="sms-otp"
                        textContentType="oneTimeCode"
                        maxLength={6}
                        value={code}
                        onChangeText={(text) => setCode(text.replace(/\D/g, ""))}
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.primaryBtn, verifying && styles.btnDisabled]}
                      onPress={handleVerify}
                      disabled={verifying}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.primaryBtnText}>
                        {t("personalInfo.verifyCode")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSendCode}
                      disabled={sendingCode}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.linkText}>
                        {t("personalInfo.resend")}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, sendingCode && styles.btnDisabled]}
                    onPress={handleSendCode}
                    disabled={sendingCode}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={16}
                      color={COLORS.primary}
                    />
                    <Text style={styles.secondaryBtnText}>
                      {t("personalInfo.verifyPhone")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : null}

          {/* Read-only account details */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("personalInfo.account")}</Text>
            <View style={styles.card}>
              <InfoRow
                icon="mail-outline"
                label={t("personalInfo.email")}
                value={profile.email}
                hint={t("personalInfo.emailHint")}
              />
              <View style={styles.divider} />
              <InfoRow
                icon="home-outline"
                label={t("personalInfo.room")}
                value={
                  [bilik?.number, bilik?.householdName]
                    .filter(Boolean)
                    .join(" · ") || "-"
                }
              />
              <View style={styles.divider} />
              <InfoRow
                icon="calendar-outline"
                label={t("personalInfo.memberSince")}
                value={memberSince}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
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
    gap: SPACING.lg,
  },

  // ── Form ──────────────────────────────────────────────────────────────────
  fieldGroup: { gap: SPACING.xs },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
  },
  codeInput: {
    letterSpacing: 4,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
    color: COLORS.text3,
    lineHeight: 17,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  badgeVerified: { backgroundColor: COLORS.greenLight },
  badgePending: { backgroundColor: "#FFFBEB" },
  badgeText: { fontSize: 11, fontWeight: "600" },

  // ── Buttons ───────────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 12,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
  linkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },

  // ── Read-only rows ────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    padding: SPACING.md,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12, color: COLORS.text3 },
  infoValue: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 64,
  },
});
