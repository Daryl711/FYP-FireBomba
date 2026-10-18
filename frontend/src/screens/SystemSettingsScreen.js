import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import Constants from "expo-constants";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";

// "2 min ago" style, in the app's language.
const timeAgo = (iso, t) => {
  if (!iso) return t("systemSettings.noReadings");
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return t("systemSettings.justNow");
  if (seconds < 3600) return t("systemSettings.minutesAgo", { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return t("systemSettings.hoursAgo", { n: Math.floor(seconds / 3600) });
  return t("systemSettings.daysAgo", { n: Math.floor(seconds / 86400) });
};

const formatValue = (value, digits = 1) =>
  value === null || value === undefined ? "-" : Number(value).toFixed(digits);

function Reading({ label, value, unit, alert }) {
  return (
    <View style={[styles.reading, alert && styles.readingAlert]}>
      <Text style={styles.readingLabel}>{label}</Text>
      <Text style={[styles.readingValue, alert && { color: COLORS.primary }]}>
        {value}
        {value !== "-" && unit ? <Text style={styles.readingUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function Pill({ on, onText, offText, icon }) {
  return (
    <View style={[styles.pill, on ? styles.pillOn : styles.pillOff]}>
      <Ionicons name={icon} size={13} color={on ? COLORS.green : COLORS.text3} />
      <Text style={[styles.pillText, { color: on ? COLORS.green : COLORS.text3 }]}>
        {on ? onText : offText}
      </Text>
    </View>
  );
}

function RoomCard({ room, thresholds, t }) {
  const r = room.reading;
  // Values from an offline room are stale, so they are not flagged.
  const over = (value, limit) => room.online && value != null && value >= limit;

  return (
    <View style={styles.roomCard}>
      <View style={styles.roomHeader}>
        <View style={styles.roomTitleWrap}>
          <Text style={styles.roomName}>{room.name}</Text>
          <View style={styles.onlineRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: room.online ? COLORS.green : COLORS.primary },
              ]}
            />
            <Text
              style={[
                styles.onlineText,
                { color: room.online ? COLORS.green : COLORS.primary },
              ]}
            >
              {room.online ? t("systemSettings.online") : t("systemSettings.offline")}
            </Text>
            <Text style={styles.lastSeen}> · {timeAgo(room.lastReadingAt, t)}</Text>
          </View>
        </View>
      </View>

      {r ? (
        <View style={styles.readingsGrid}>
          <Reading
            label={t("systemSettings.temperature")}
            value={formatValue(r.temperature)}
            unit="°C"
            alert={over(r.temperature, thresholds.temperature)}
          />
          <Reading
            label={t("systemSettings.humidity")}
            value={formatValue(r.humidity, 0)}
            unit="%"
          />
          <Reading
            label={t("systemSettings.smoke")}
            value={formatValue(r.smoke, 0)}
            unit="ppm"
            alert={over(r.smoke, thresholds.smoke)}
          />
          <Reading
            label={t("systemSettings.gas")}
            value={formatValue(r.gas, 0)}
            unit="ppm"
            alert={over(r.gas, thresholds.gas)}
          />
          <Reading
            label={t("systemSettings.flame")}
            value={r.flame ? t("systemSettings.flameYes") : t("systemSettings.flameNo")}
            alert={room.online && r.flame}
          />
        </View>
      ) : null}

      <View style={styles.pillRow}>
        <Pill
          on={room.cameraEnabled}
          icon={room.cameraEnabled ? "videocam" : "videocam-off-outline"}
          onText={t("systemSettings.cameraOn")}
          offText={t("systemSettings.cameraOff")}
        />
        <Pill
          on={room.pumpOn}
          icon="water-outline"
          onText={t("systemSettings.pumpOn")}
          offText={t("systemSettings.pumpOff")}
        />
      </View>
    </View>
  );
}

export default function SystemSettingsScreen({ navigation }) {
  const { t, systemHealth, refreshSystemHealth } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  // Fresh numbers every time the screen opens, not only on the 60 s poll.
  useFocusEffect(
    useCallback(() => {
      refreshSystemHealth();
    }, []),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSystemHealth();
    setRefreshing(false);
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={22} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t("systemSettings.title")}</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (!systemHealth) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        {header}
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const { summary, server, thresholds, rooms, offlineAfterSeconds } = systemHealth;
  const appVersion = Constants.expoConfig?.version ?? "-";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {header}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("systemSettings.overview")}</Text>
          <View style={[styles.card, styles.cardPadded]}>
            <View
              style={[
                styles.banner,
                summary.allOperational ? styles.bannerOk : styles.bannerWarn,
              ]}
            >
              <Ionicons
                name={summary.allOperational ? "checkmark-circle" : "alert-circle"}
                size={20}
                color={summary.allOperational ? COLORS.green : COLORS.primary}
              />
              <Text
                style={[
                  styles.bannerText,
                  { color: summary.allOperational ? COLORS.green : COLORS.primary },
                ]}
              >
                {summary.allOperational
                  ? t("systemSettings.allOk")
                  : t("systemSettings.attention")}
              </Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statVal}>
                  {summary.roomsOnline}/{summary.roomsTotal}
                </Text>
                <Text style={styles.statLbl}>{t("systemSettings.roomsOnline")}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{summary.camerasOn}</Text>
                <Text style={styles.statLbl}>{t("systemSettings.camerasOn")}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statVal}>{summary.fireEvents}</Text>
                <Text style={styles.statLbl}>
                  {t("systemSettings.fireEvents", { days: summary.fireEventsWindowDays })}
                </Text>
              </View>
            </View>

            <View style={styles.cloudRow}>
              <Ionicons
                name={server.brokerConnected ? "cloud-done-outline" : "cloud-offline-outline"}
                size={18}
                color={server.brokerConnected ? COLORS.green : COLORS.amber}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.cloudTitle}>
                  {server.brokerConnected
                    ? t("systemSettings.cloudOn")
                    : t("systemSettings.cloudOff")}
                </Text>
                {!server.brokerConnected ? (
                  <Text style={styles.hint}>{t("systemSettings.cloudOffHint")}</Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* Rooms */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("systemSettings.rooms")}</Text>
          {rooms.length === 0 ? (
            <View style={[styles.card, styles.emptyState]}>
              <Ionicons name="home-outline" size={32} color={COLORS.text3} />
              <Text style={styles.hint}>{t("systemSettings.noRooms")}</Text>
            </View>
          ) : (
            <View style={{ gap: SPACING.md }}>
              {rooms.map((room) => (
                <RoomCard key={room.roomId} room={room} thresholds={thresholds} t={t} />
              ))}
            </View>
          )}
          <Text style={[styles.hint, styles.sectionNote]}>
            {t("systemSettings.offlineHint", {
              minutes: Math.round(offlineAfterSeconds / 60),
            })}
          </Text>
        </View>

        {/* Thresholds */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("systemSettings.thresholds")}</Text>
          <View style={styles.card}>
            {[
              ["thermometer-outline", t("systemSettings.temperature"), `${thresholds.temperature} °C`],
              ["cloud-outline", t("systemSettings.smoke"), `${thresholds.smoke} ppm`],
              ["warning-outline", t("systemSettings.gas"), `${thresholds.gas} ppm`],
              ["flame-outline", t("systemSettings.flame"), t("systemSettings.anyFlame")],
            ].map(([icon, label, value], i, all) => (
              <React.Fragment key={label}>
                <View style={styles.thresholdRow}>
                  <Ionicons name={icon} size={18} color={COLORS.primary} />
                  <Text style={styles.thresholdLabel}>{label}</Text>
                  <Text style={styles.thresholdValue}>{value}</Text>
                </View>
                {i < all.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
          <View style={styles.noteRow}>
            <Ionicons name="lock-closed-outline" size={14} color={COLORS.text3} />
            <Text style={styles.noteText}>{t("systemSettings.adminOnly")}</Text>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t("systemSettings.about")}</Text>
          <View style={styles.card}>
            <View style={styles.thresholdRow}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.text2} />
              <Text style={styles.thresholdLabel}>{t("systemSettings.appVersion")}</Text>
              <Text style={styles.thresholdValue}>{appVersion}</Text>
            </View>
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
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  sectionNote: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
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
  hint: {
    fontSize: 12,
    color: COLORS.text3,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 50,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },

  // ── Overview ──────────────────────────────────────────────────────────────
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
  },
  bannerOk: { backgroundColor: COLORS.greenLight },
  bannerWarn: { backgroundColor: COLORS.primaryLight },
  bannerText: { fontSize: 14, fontWeight: "700", flex: 1 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  stat: { alignItems: "center", flex: 1 },
  statVal: { fontSize: 20, fontWeight: "700", color: COLORS.text },
  statLbl: { fontSize: 11, color: COLORS.text3, marginTop: 2, textAlign: "center" },
  cloudRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  cloudTitle: { fontSize: 13, fontWeight: "600", color: COLORS.text },

  // ── Room card ─────────────────────────────────────────────────────────────
  roomCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
    ...SHADOW.small,
  },
  roomHeader: { flexDirection: "row", alignItems: "center" },
  roomTitleWrap: { flex: 1, gap: 3 },
  roomName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: "600" },
  lastSeen: { fontSize: 12, color: COLORS.text3 },
  readingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  reading: {
    flexGrow: 1,
    flexBasis: "30%",
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  readingAlert: { backgroundColor: COLORS.primaryLight },
  readingLabel: { fontSize: 11, color: COLORS.text3 },
  readingValue: { fontSize: 15, fontWeight: "700", color: COLORS.text, marginTop: 2 },
  readingUnit: { fontSize: 11, fontWeight: "500", color: COLORS.text3 },
  pillRow: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  pillOn: { backgroundColor: COLORS.greenLight },
  pillOff: { backgroundColor: COLORS.bg },
  pillText: { fontSize: 12, fontWeight: "600" },

  // ── Thresholds / about ────────────────────────────────────────────────────
  thresholdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  thresholdLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  thresholdValue: { fontSize: 14, fontWeight: "600", color: COLORS.text2 },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  noteText: { fontSize: 12, color: COLORS.text3, flex: 1, lineHeight: 17 },
});
