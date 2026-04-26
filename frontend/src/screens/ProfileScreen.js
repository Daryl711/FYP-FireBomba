import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";

const ACCOUNT_ITEMS = [
  {
    id: "personal",
    icon: "person-outline",
    iconBg: COLORS.blueLight,
    iconColor: COLORS.blue,
    screen: "PersonalInfo",
  },
  {
    id: "email",
    icon: "mail-outline",
    iconBg: COLORS.greenLight,
    iconColor: COLORS.green,
    screen: null,
  },
  {
    id: "security",
    icon: "shield-outline",
    iconBg: "#F3F0FF",
    iconColor: "#7C3AED",
    screen: "Security",
  },
];

const PREF_ITEMS = [
  {
    id: "notif",
    icon: "notifications-outline",
    iconBg: "#FFFBEB",
    iconColor: COLORS.amber,
    screen: "NotificationSettings",
  },
  {
    id: "settings",
    icon: "settings-outline",
    iconBg: COLORS.bg,
    iconColor: COLORS.text2,
    screen: "SystemSettings",
  },
];

function PrefRow({ item, onPress }) {
  return (
    <TouchableOpacity
      style={styles.prefRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.prefIcon, { backgroundColor: item.iconBg }]}>
        <Ionicons name={item.icon} size={20} color={item.iconColor} />
      </View>
      <View style={styles.prefText}>
        <Text style={styles.prefName}>{item.title}</Text>
        <Text style={styles.prefDesc}>{item.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.text3} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }) {
  const { user, logout, unreadCount, rooms, systemStatus, language, setLanguage, t } = useApp();

  const handleLogout = () => {
    Alert.alert(t("profile.signOutTitle"), t("profile.signOutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.signOut"),
        style: "destructive",
        onPress: () => {
          logout();
          navigation.replace("Login");
        },
      },
    ]);
  };

  const handleNav = (screen) => {
    if (screen) navigation.navigate(screen);
    else
      Alert.alert(
        t("common.comingSoon"),
        t("profile.comingSoonMessage"),
      );
  };

  const displayName = user?.name || t("profile.userFallback");
  const displayEmail = user?.email || "user@example.com";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={34} color="rgba(255,255,255,0.9)" />
            </View>
            <TouchableOpacity style={styles.avatarCam}>
              <Ionicons name="camera" size={13} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{displayEmail}</Text>

          <View style={styles.quickStats}>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatVal}>{rooms.length}</Text>
              <Text style={styles.quickStatLbl}>{t("profile.rooms")}</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatVal}>
                {systemStatus.sensorsOnline}
              </Text>
              <Text style={styles.quickStatLbl}>{t("profile.sensors")}</Text>
            </View>
            <View style={styles.quickStatDivider} />
            <View style={styles.quickStat}>
              <Text
                style={[
                  styles.quickStatVal,
                  unreadCount > 0 && { color: "#FFD0CE" },
                ]}
              >
                {unreadCount}
              </Text>
              <Text style={styles.quickStatLbl}>{t("profile.alerts")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("profile.account")}</Text>
          <View style={styles.prefCard}>
            {ACCOUNT_ITEMS.map((item, i) => (
              <React.Fragment key={item.id}>
                <PrefRow
                  item={{
                    ...item,
                    title: t(`profile.accountItems.${item.id}.title`),
                    subtitle: t(`profile.accountItems.${item.id}.subtitle`),
                  }}
                  onPress={() => handleNav(item.screen)}
                />
                {i < ACCOUNT_ITEMS.length - 1 && (
                  <View style={styles.divider} />
                )}
              </React.Fragment>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("profile.preferences")}</Text>
          <View style={styles.prefCard}>
            {PREF_ITEMS.map((item, i) => (
              <React.Fragment key={item.id}>
                <PrefRow
                  item={{
                    ...item,
                    title: t(`profile.prefItems.${item.id}.title`),
                    subtitle: t(`profile.prefItems.${item.id}.subtitle`),
                  }}
                  onPress={() => handleNav(item.screen)}
                />
                <View style={styles.divider} />
              </React.Fragment>
            ))}
            <View style={styles.prefRow}>
              <View style={[styles.prefIcon, { backgroundColor: "#EAF8F4" }]}>
                <Ionicons name="language-outline" size={20} color={COLORS.green} />
              </View>
              <View style={styles.prefText}>
                <Text style={styles.prefName}>{t("profile.language")}</Text>
                <Text style={styles.prefDesc}>{t("profile.languageSubtitle")}</Text>
              </View>
              <View style={styles.languageSwitch}>
                <TouchableOpacity
                  style={[
                    styles.languageOption,
                    language === "en" && styles.languageOptionActive,
                  ]}
                  onPress={() => setLanguage("en")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.languageOptionText,
                      language === "en" && styles.languageOptionTextActive,
                    ]}
                  >
                    {t("profile.english")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.languageOption,
                    language === "ms" && styles.languageOptionActive,
                  ]}
                  onPress={() => setLanguage("ms")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.languageOptionText,
                      language === "ms" && styles.languageOptionTextActive,
                    ]}
                  >
                    {t("profile.bahasaMalaysia")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("profile.about")}</Text>
          <View style={styles.prefCard}>
            <View style={styles.prefRow}>
              <View
                style={[
                  styles.prefIcon,
                  { backgroundColor: COLORS.primaryLight },
                ]}
              >
                <Ionicons name="flame" size={20} color={COLORS.primary} />
              </View>
              <View style={styles.prefText}>
                <Text style={styles.prefName}>FireBomba</Text>
                <Text style={styles.prefDesc}>Version 1.0.0</Text>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color={COLORS.primary} />
          <Text style={styles.logoutText}>{t("profile.signOut")}</Text>
        </TouchableOpacity>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  profileHeader: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
    alignItems: "flex-start",
  },
  avatarWrap: {
    position: "relative",
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 70,
    height: 70,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarCam: {
    position: "absolute",
    bottom: 0,
    right: -2,
    backgroundColor: COLORS.white,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.white,
  },
  profileEmail: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    marginTop: 3,
  },

  quickStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: RADIUS.lg,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    width: "100%",
  },
  quickStat: {
    flex: 1,
    alignItems: "center",
  },
  quickStatVal: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.white,
  },
  quickStatLbl: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text3,
    letterSpacing: 0.8,
    marginBottom: SPACING.sm,
    textTransform: "uppercase",
  },
  prefCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    ...SHADOW.small,
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
  },
  prefIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  prefText: {
    flex: 1,
  },
  prefName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  prefDesc: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 68,
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
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  languageOptionActive: {
    backgroundColor: COLORS.primary,
  },
  languageOptionText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text2,
  },
  languageOptionTextActive: {
    color: COLORS.white,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingVertical: 14,
  },
  logoutText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700",
  },
});
