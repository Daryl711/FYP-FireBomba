import React, { useState, useRef, useEffect } from "react";
import { LogBox } from "react-native";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Animated,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import { updateCameraStatus, getCameraStatus } from "../services/api";

// ── Animated room row ─────────────────────────────────────────────────────────
function RoomCameraRow({ room, enabled, onToggle, t }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 30,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  const handleToggle = async (value) => {
    if (!value) {
      // Warn user before disabling
      Alert.alert(t("security.disableTitle"), t("security.disableConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("security.disable"),
          style: "destructive",
          onPress: () => onToggle(room.roomId, false),
        },
      ]);
    } else {
      Alert.alert(t("security.enableTitle"), t("security.enableConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("security.enable"),
          style: "destructive",
          onPress: () => onToggle(room.roomId, true),
        },
      ]);
    }

    await updateCameraStatus(value);
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.roomRow}
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Room icon */}
        <View
          style={[
            styles.roomIcon,
            { backgroundColor: enabled ? COLORS.primaryLight : COLORS.bg },
          ]}
        >
          <Ionicons
            name={enabled ? "videocam" : "videocam-off-outline"}
            size={20}
            color={enabled ? COLORS.primary : COLORS.text3}
          />
        </View>

        {/* Room info */}
        <View style={styles.roomInfo}>
          <Text style={styles.roomName}>
            {room.name || `Room ${room.roomId}`}
          </Text>
          <View style={styles.roomStatusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: enabled ? COLORS.primary : COLORS.text3 },
              ]}
            />
            <Text
              style={[
                styles.roomStatus,
                { color: enabled ? COLORS.primary : COLORS.text3 },
              ]}
            >
              {enabled ? t("security.cameraActive") : t("security.cameraOff")}
            </Text>
          </View>
        </View>

        {/* Toggle */}
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
          thumbColor={enabled ? COLORS.primary : COLORS.white}
          ios_backgroundColor={COLORS.border}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SecurityScreen({ navigation }) {
  const { roomData, t, biometricSupport, biometricEnabled, updateBiometricEnabled } =
    useApp();
  // Null while the first fetch is in flight, so never used directly.
  const rooms = Array.isArray(roomData) ? roomData : [];


  const [cameraStates, setCameraStates] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const enabledCount = Object.values(cameraStates || {}).filter(Boolean).length;

  useEffect(() => {
    const loadCameraStatuses = async () => {
      try {
        setIsLoading(true);

        // Call your Express backend API endpoint
        const response = await getCameraStatus();

        if (response && !response.error) {
          const normalized = {
            [response.roomId]: Boolean(response.cameraStatus),
          };

          setCameraStates(normalized);
        } else {
          const fallbackStates = Object.fromEntries(
            rooms.map((r) => [r.id, true]),
          );
          setCameraStates(fallbackStates);
        }
      } catch (error) {
        console.error("Failed to fetch camera status:", error);
        setCameraStates(Object.fromEntries(rooms.map((r) => [r.id, true])));
      } finally {
        setIsLoading(false);
      }
    };

    loadCameraStatuses();
  }, [roomData]);

  const handleToggle = (roomId, value) => {
    setCameraStates((prev) => ({ ...prev, [roomId]: value }));
  };

  const handleEnableAll = () => {
    Alert.alert(t("security.enableAllTitle"), t("security.enableConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("security.enableAll"),
        style: "destructive",
        onPress: () => {
          const allOn = Object.fromEntries(rooms.map((r) => [r.id, true]));
          setCameraStates(allOn);
        },
      },
    ]);
  };

  const handleDisableAll = () => {
    Alert.alert(t("security.disableAllTitle"), t("security.disableConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("security.disableAll"),
        style: "destructive",
        onPress: () => {
          const allOff = Object.fromEntries(rooms.map((r) => [r.id, false]));
          setCameraStates(allOff);
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, styles.centerContent]}
        edges={["top", "bottom"]}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>
          {t("common.loading") || "Loading camera states..."}
        </Text>
      </SafeAreaView>
    );
  }

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
        <Text style={styles.headerTitle}>{t("security.title")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Biometric login */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>
              {t("security.biometricSection")}
            </Text>
          </View>

          <View style={styles.biometricRow}>
            <View style={styles.biometricIcon}>
              <Ionicons
                name={
                  biometricSupport.type === "face"
                    ? "scan-outline"
                    : "finger-print"
                }
                size={20}
                color={COLORS.primary}
              />
            </View>

            <View style={styles.biometricCopy}>
              <Text style={styles.biometricTitle}>
                {t("security.biometricLabel")}
              </Text>
              <Text style={styles.biometricHint}>
                {biometricSupport.available
                  ? t("security.biometricHint")
                  : t("security.biometricUnavailable")}
              </Text>
            </View>

            <Switch
              value={biometricSupport.available && biometricEnabled}
              onValueChange={updateBiometricEnabled}
              disabled={!biometricSupport.available}
              trackColor={{ false: "#E5E5E5", true: COLORS.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Camera Detection Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>
              {t("security.cameraDetection")}
            </Text>
            <Text style={styles.sectionCount}>
              {enabledCount}/{rooms.length} {t("security.active")}
            </Text>
          </View>
          {rooms.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="home-outline" size={32} color={COLORS.text3} />
              <Text style={styles.emptyText}>{t("security.noRooms")}</Text>
            </View>
          ) : (
            rooms.map((room, i) => (
              <React.Fragment key={room.roomId}>
                <RoomCameraRow
                  room={room}
                  enabled={!!cameraStates[room.roomId]}
                  onToggle={handleToggle}
                  t={t}
                />
                {i < rooms.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))
          )}
          {/* Bulk actions
          {rooms.length > 1 && (
            <View style={styles.bulkActions}>
              <TouchableOpacity
                style={styles.bulkBtn}
                onPress={handleEnableAll}
                activeOpacity={0.7}
              >
                <Ionicons name="videocam" size={14} color={COLORS.primary} />
                <Text style={styles.bulkBtnText}>
                  {t("security.enableAll")}
                </Text>
              </TouchableOpacity>
              <View style={styles.bulkDivider} />
              <TouchableOpacity
                style={styles.bulkBtn}
                onPress={handleDisableAll}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="videocam-off-outline"
                  size={14}
                  color={COLORS.text2}
                />
                <Text style={[styles.bulkBtnText, { color: COLORS.text2 }]}>
                  {t("security.disableAll")}
                </Text>
              </TouchableOpacity>
            </View>
          )} */}
        </View>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  biometricRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  biometricIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF1F1",
    alignItems: "center",
    justifyContent: "center",
  },
  biometricCopy: { flex: 1, gap: 2 },
  biometricTitle: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  biometricHint: { fontSize: 12, color: COLORS.text3 },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.text3,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primary,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    ...SHADOW.small,
  },

  // ── Room row ──────────────────────────────────────────────────────────────
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
  },
  roomIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  roomStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  roomStatus: {
    fontSize: 12,
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 68,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.text3,
  },

  // ── Bulk actions ──────────────────────────────────────────────────────────
  bulkActions: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.sm,
    overflow: "hidden",
    ...SHADOW.small,
  },
  bulkBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: SPACING.md,
  },
  bulkDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  bulkBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },

  loadingContainer: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.text3,
    fontWeight: "500",
  },
});
