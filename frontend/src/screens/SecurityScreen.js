import React, { useState, useRef, useEffect, useMemo } from "react";
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

// ── Optimized Room Row (Handles local UI states smoothly) ────────────────────
function RoomCameraRow({ room, globalEnabled, onToggleSuccess, t }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // 1. Local state decouples the UI switch from global context lag
  const [localEnabled, setLocalEnabled] = useState(globalEnabled);

  // Sync with global state only when it completely changes from outside (e.g. initial load)
  useEffect(() => {
    setLocalEnabled(globalEnabled);
  }, [globalEnabled]);

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

  // 2. Perform optimistic state updates inside your UI action handler
  const executionToggle = async (targetValue) => {
    // Instantly flip the UI state locally so it looks perfectly fluid
    setLocalEnabled(targetValue);

    try {
      // Execute the database update API call
      const res = await updateCameraStatus(targetValue);

      if (res && !res.error) {
        // Update context softly only after successful execution
        onToggleSuccess(room.roomId, targetValue);
      } else {
        throw new Error("API Update failure");
      }
    } catch (err) {
      console.error("Failed to commit camera state update:", err);
      Alert.alert("Error", "Could not sync status with backend database.");
      // Rollback local switch visually if database write completely fails
      setLocalEnabled(!targetValue);
    }
  };

  const handleToggle = (value) => {
    if (!value) {
      Alert.alert(t("security.disableTitle"), t("security.disableConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("security.disable"),
          style: "destructive",
          onPress: () => executionToggle(false),
        },
      ]);
    } else {
      Alert.alert(t("security.enableTitle"), t("security.enableConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("security.enable"),
          style: "destructive",
          onPress: () => executionToggle(true),
        },
      ]);
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.roomRow}
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View
          style={[
            styles.roomIcon,
            { backgroundColor: localEnabled ? COLORS.primaryLight : COLORS.bg },
          ]}
        >
          <Ionicons
            name={localEnabled ? "videocam" : "videocam-off-outline"}
            size={20}
            color={localEnabled ? COLORS.primary : COLORS.text3}
          />
        </View>

        <View style={styles.roomInfo}>
          <Text style={styles.roomName}>
            {room.name || `Room ${room.roomId}`}
          </Text>
          <View style={styles.roomStatusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: localEnabled ? COLORS.primary : COLORS.text3,
                },
              ]}
            />
            <Text
              style={[
                styles.roomStatus,
                { color: localEnabled ? COLORS.primary : COLORS.text3 },
              ]}
            >
              {localEnabled
                ? t("security.cameraActive")
                : t("security.cameraOff")}
            </Text>
          </View>
        </View>

        <Switch
          value={localEnabled}
          onValueChange={handleToggle}
          trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
          thumbColor={localEnabled ? COLORS.primary : COLORS.white}
          ios_backgroundColor={COLORS.border}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function SecurityScreen({ navigation }) {
  const { roomData, t, cameraStates, setCameraStates } = useApp();
  const [isLoading, setIsLoading] = useState(true);

  const enabledCount = useMemo(() => {
    if (!cameraStates) return 0;
    return Object.values(cameraStates).filter(Boolean).length;
  }, [cameraStates]);

  useEffect(() => {
    const loadCameraStatuses = async () => {
      try {
        setIsLoading(true);
        const response = await getCameraStatus();

        if (response && !response.error) {
          const normalized = {
            [response.roomId]: Boolean(response.cameraStatus),
          };
          setCameraStates(normalized);
        } else {
          const fallbackStates = Object.fromEntries(
            roomData.map((r) => [r.roomId || r.id, true]),
          );
          setCameraStates(fallbackStates);
        }
      } catch (error) {
        console.error("Failed to fetch camera status:", error);
        setCameraStates(
          Object.fromEntries(roomData.map((r) => [r.roomId || r.id, true])),
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadCameraStatuses();
  }, [roomData]);

  const handleToggleSuccess = (roomId, value) => {
    setCameraStates((prev) => ({ ...prev, [roomId]: value }));
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
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>
              {t("security.cameraDetection")}
            </Text>
            <Text style={styles.sectionCount}>
              {enabledCount}/{roomData.length} {t("security.active")}
            </Text>
          </View>

          <View style={styles.card}>
            {roomData.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="home-outline" size={32} color={COLORS.text3} />
                <Text style={styles.emptyText}>{t("security.noRooms")}</Text>
              </View>
            ) : (
              roomData.map((room, i) => (
                <React.Fragment key={room.roomId}>
                  <RoomCameraRow
                    room={room}
                    globalEnabled={!!cameraStates[room.roomId]}
                    onToggleSuccess={handleToggleSuccess}
                    t={t}
                  />
                  {i < roomData.length - 1 && <View style={styles.divider} />}
                </React.Fragment>
              ))
            )}
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
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
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
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    ...SHADOW.small,
  },
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
  loadingText: {
    fontSize: 13,
    color: COLORS.text3,
    fontWeight: "500",
  },
});
