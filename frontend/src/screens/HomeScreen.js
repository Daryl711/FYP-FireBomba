import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import { useNavigation } from "@react-navigation/native";

export default function HomeScreen() {
  const navigation = useNavigation();
  const { roomData, notifications, systemStatus, user, realtimeError, t } =
    useApp();

  // ── Loading gate ───────────────────────────────────────────────────────────
  // roomData is null/undefined while the context is still fetching
  if (!roomData) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t("home.loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Navigation helpers ────────────────────────────────────────────────────
  const parentNavigation = navigation?.getParent?.();

  const navigateTo = (route, params) => {
    if (
      (route === "Rooms" || route === "Notifications") &&
      parentNavigation?.navigate
    ) {
      parentNavigation.navigate(route, params);
      return;
    }
    if (navigation?.navigate) {
      navigation.navigate(route, params);
    }
  };

  const navigateToRoomDetail = (room) => {
    if (!room) return;
    navigation.navigate("HomeRoomDetail", { room });
  };

  // Safe to access now that roomData is guaranteed to be an array
  const recentAlerts = (notifications ?? []).slice(0, 2).map((n) => ({
    id: n.id,
    room: n.room,
    warningTitle: n.warningTitle,
    time: n.time,
    color: COLORS.amber,
  }));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.greet}>{t("home.welcomeBack")}</Text>
              <Text style={styles.name}>
                {user?.name || t("home.userFallback")}
              </Text>
            </View>
            <View style={styles.headerLogo}>
              <Ionicons name="flame" size={22} color={COLORS.white} />
            </View>
          </View>

          {/* Stat cards */}
          <View style={styles.statGrid}>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigateTo("Rooms", { screen: "RoomsList" })}
              activeOpacity={0.8}
            >
              <View style={styles.statCardTop}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={14}
                  color={COLORS.white}
                />
                <Text style={styles.statCardTitle}>
                  {" "}
                  {t("home.activeRooms")}
                </Text>
              </View>
              <Text style={styles.statCardVal}>{roomData.length}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.statCard}
              onPress={() => navigateTo("Notifications")}
              activeOpacity={0.8}
            >
              <View style={styles.statCardTop}>
                <Ionicons
                  name="warning-outline"
                  size={14}
                  color={COLORS.white}
                />
                <Text style={styles.statCardTitle}> {t("home.warnings")}</Text>
              </View>
              <Text style={styles.statCardVal}>2</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* System Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusCardTop}>
            <Text style={styles.sectionTitle}>{t("home.systemStatus")}</Text>
            <View style={styles.operationalBadge}>
              <Text style={styles.operationalText}>
                {systemStatus.allOperational
                  ? t("home.allOperational")
                  : t("home.warningDetected")}
              </Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusItem}>
              <Text style={[styles.statusVal, { color: COLORS.blue }]}>
                {systemStatus.sensorsOnline}
              </Text>
              <Text style={styles.statusLbl}>{t("home.sensorsOnline")}</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={[styles.statusVal, { color: COLORS.green }]}>
                {systemStatus.uptime}%
              </Text>
              <Text style={styles.statusLbl}>{t("home.uptime")}</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={[styles.statusVal, { color: COLORS.primary }]}>
                {systemStatus.fireEvents}
              </Text>
              <Text style={styles.statusLbl}>{t("home.fireEvents")}</Text>
            </View>
          </View>
        </View>

        {realtimeError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              {t("home.realtimeUnavailable", { error: realtimeError })}
            </Text>
          </View>
        ) : null}

        {/* Recent Alerts */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{t("home.recentAlerts")}</Text>
            <TouchableOpacity onPress={() => navigateTo("Notifications")}>
              <Text style={styles.sectionLink}>{t("home.viewAll")}</Text>
            </TouchableOpacity>
          </View>
          {recentAlerts.map((alert) => (
            <TouchableOpacity
              key={alert.id}
              onPress={() => navigateTo("Notifications")}
              activeOpacity={0.75}
            >
              <View style={styles.alertCard}>
                <View
                  style={[styles.alertDot, { backgroundColor: alert.color }]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertName}>{alert.room}</Text>
                  <Text style={styles.alertDesc}>{alert.warningTitle}</Text>
                </View>
                <Text style={styles.alertTime}>{alert.time}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {recentAlerts.length === 0 ? (
            <Text style={styles.emptyText}>{t("home.noAlerts")}</Text>
          ) : null}
        </View>

        {/* Room Overview */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{t("home.roomOverview")}</Text>
            <TouchableOpacity onPress={() => navigateTo("Rooms")}>
              <Text style={styles.sectionLink}>{t("home.viewAll")}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.roomGrid}>
            {roomData.map((room) => (
              <TouchableOpacity
                key={room.roomId}
                style={styles.roomMini}
                onPress={() => navigateToRoomDetail(room)}
                activeOpacity={0.75}
              >
                <View style={styles.roomMiniTop}>
                  <Text style={styles.roomMiniName}>{room.name}</Text>
                  <Ionicons
                    name={
                      room.status === "warning"
                        ? "warning"
                        : "checkmark-circle"
                    }
                    size={20}
                    color={
                      room.status === "warning" ? COLORS.amber : COLORS.green
                    }
                  />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

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

  // ── Loading ──────────────────────────────────────────────────────────────
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.text2,
    fontWeight: "500",
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTextWrap: {
    flex: 1,
  },
  greet: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.white,
    marginTop: 2,
  },
  headerLogo: {
    width: 38,
    height: 38,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  statGrid: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  statCardTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  statCardTitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
  },
  statCardVal: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.white,
    marginTop: 6,
  },

  // ── Status card ──────────────────────────────────────────────────────────
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    margin: SPACING.lg,
    ...SHADOW.small,
  },
  statusCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  operationalBadge: {
    backgroundColor: COLORS.greenLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  operationalText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.green,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statusItem: {
    alignItems: "center",
  },
  statusVal: {
    fontSize: 18,
    fontWeight: "700",
  },
  statusLbl: {
    fontSize: 11,
    color: COLORS.text2,
    marginTop: 3,
  },

  // ── Error ────────────────────────────────────────────────────────────────
  errorCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: "#FFF3F2",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  errorText: {
    color: COLORS.primary,
    fontSize: 12,
  },

  // ── Sections ─────────────────────────────────────────────────────────────
  section: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
  },
  sectionLink: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "600",
  },

  // ── Alerts ───────────────────────────────────────────────────────────────
  alertCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOW.small,
  },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
    flexShrink: 0,
  },
  alertName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  alertDesc: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 2,
  },
  alertTime: {
    fontSize: 11,
    color: COLORS.text3,
    flexShrink: 0,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.text2,
  },

  // ── Room grid ────────────────────────────────────────────────────────────
  roomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.md,
  },
  roomMini: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    width: "47.5%",
    ...SHADOW.small,
  },
  roomMiniTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  roomMiniName: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    flex: 1,
    marginRight: 4,
  },
  roomMiniTemp: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 6,
  },
});
