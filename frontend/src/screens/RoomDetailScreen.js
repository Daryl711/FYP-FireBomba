import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import SensorChart from "../../components/SensorChart";
import {
  getSensorReading,
  getPumpStatus,
  controlWaterPumpStatus,
} from "../services/api";

function SensorCard({ icon, label, value, unit, fillPct, fillColor }) {
  return (
    <View style={sStyles.card}>
      <View style={sStyles.iconWrap}>
        <Ionicons name={icon} size={20} color={COLORS.green} />
      </View>
      <Text style={sStyles.label}>{label}</Text>
      <Text style={sStyles.value}>
        {value} {unit ? <Text style={sStyles.unit}>{unit}</Text> : null}
      </Text>
      {fillPct !== undefined && (
        <View style={sStyles.bar}>
          <View
            style={[
              sStyles.fill,
              {
                width: `${fillPct}%`,
                backgroundColor: fillColor || COLORS.green,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const sStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flex: 1,
    ...SHADOW.small,
  },
  iconWrap: {
    width: 36,
    height: 36,
    backgroundColor: COLORS.greenLight,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.green,
    marginTop: 3,
  },
  unit: {
    fontSize: 13,
    fontWeight: "400",
    color: COLORS.text2,
  },
  bar: {
    height: 4,
    backgroundColor: "#F0F0F0",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});

export default function RoomDetailScreen({ route, navigation }) {
  const { rooms, t, sensorReading, token } = useApp();
  const { room: initialRoom, roomId } = route?.params || {};

  const resolvedRoomId =
    roomId != null
      ? String(roomId)
      : initialRoom?.id != null
        ? String(initialRoom.id)
        : undefined;

  const room =
    (resolvedRoomId
      ? rooms.find((item) => String(item.id) === resolvedRoomId)
      : undefined) || initialRoom;

  const name = room?.name || "Room";

  const [sensorLoading, setSensorLoading] = useState(false);
  const [sensorError, setSensorError] = useState(null);
  const [pumpActive, setPumpActive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [camTime, setCamTime] = useState(new Date());

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pumpPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!room) {
      return;
    }
  }, [room]);

  useEffect(() => {
    const fetchPumpStatus = async () => {
      try {
        const status = await getPumpStatus(token);
        setPumpActive(status);
      } catch (err) {
        console.error("Failed to fetch pump status:", err);
      }
    };
    fetchPumpStatus();
  }, [token]);

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    ).start();
  }, [spinAnim]);

  useEffect(() => {
    const timer = setInterval(() => setCamTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pumpActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pumpPulse, {
            toValue: 1.03,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pumpPulse, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      pumpPulse.stopAnimation();
      pumpPulse.setValue(1);
    }
  }, [pumpActive, pumpPulse]);

  useEffect(() => {
    if (sensorReading) {
      setLastUpdated(new Date());
    }
  }, [sensorReading]);

  const sensors = sensorReading ||
    room?.sensors || {
      temperature: room?.temperature ?? 0,
      smoke: 0,
      flame: false,
      co: 0,
      humidity: 0,
    };

  const sensorHistory = Array.isArray(room?.sensorHistory)
    ? room.sensorHistory
    : [];

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const formatTime = (d) =>
    d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  const handlePumpToggle = async () => {
    if (!pumpActive) {
      Alert.alert(
        t("roomDetail.activateTitle"),
        t("roomDetail.activateConfirm", { room: name }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("roomDetail.activate"),
            style: "destructive",
            onPress: async () => {
              await controlWaterPumpStatus(token, 1);
              setPumpActive(true);
              setLastUpdated(new Date());
            },
          },
        ],
      );
    } else {
      await controlWaterPumpStatus(token, 0);
      setPumpActive(false);
      setLastUpdated(new Date());
    }
  };

  const tempPct = Math.min((sensors.temperature / 60) * 100, 100);
  const smokePct = Math.min(sensors.smoke, 100);
  const coPct = Math.min((sensors.co / 100) * 100, 100);
  const humidityPct = Math.min(sensors.humidity ?? 0, 100);

  if (!room) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.unavailableWrap}>
          <Text style={styles.unavailableText}>
            {t("roomDetail.unavailable")}
          </Text>
          <TouchableOpacity
            style={styles.unavailableBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.unavailableBtnText}>
              {t("roomDetail.goBack")}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{name}</Text>
          <Text style={styles.headerSub}>
            {t("roomDetail.realtimeMonitoring")}
          </Text>
        </View>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                room.status === "warning" ? COLORS.amber : COLORS.green,
            },
          ]}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.cameraBlock}>
          <View style={styles.cameraInner}>
            <Animated.View
              style={[styles.spinner, { transform: [{ rotate: spin }] }]}
            />
            <Text style={styles.camLabel}>
              {t("roomDetail.liveCameraFeed")}
            </Text>
            <Text style={styles.camRoom}>{name}</Text>
          </View>
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>REC</Text>
          </View>
          <Text style={styles.camTime}>{formatTime(camTime)}</Text>
        </View>

        {sensorLoading && !sensorData && (
          <View
            style={{
              paddingHorizontal: SPACING.lg,
              marginBottom: SPACING.sm,
            }}
          >
            <Text style={{ fontSize: 12, color: COLORS.text2 }}>
              Loading sensor data...
            </Text>
          </View>
        )}

        {sensorError && (
          <View
            style={{
              paddingHorizontal: SPACING.lg,
              marginBottom: SPACING.sm,
            }}
          >
            <Text style={{ fontSize: 12, color: COLORS.primary }}>
              {sensorError}
            </Text>
          </View>
        )}

        <View style={styles.sensorGrid}>
          <View style={styles.sensorRow}>
            <SensorCard
              icon="thermometer-outline"
              label={t("roomDetail.temperature")}
              value={sensors.temperature}
              unit="°C"
              fillPct={tempPct}
              fillColor={
                sensors.temperature > 30 ? COLORS.primary : COLORS.green
              }
            />
            <SensorCard
              icon="cloud-outline"
              label={t("roomDetail.smoke")}
              value={sensors.smoke}
              unit="%"
              fillPct={smokePct}
              fillColor={COLORS.blue}
            />
          </View>

          <View style={styles.sensorRow}>
            <SensorCard
              icon="flask-outline"
              label={t("roomDetail.co")}
              value={sensors.co}
              unit="ppm"
              fillPct={coPct}
              fillColor={COLORS.amber}
            />
            <View style={[sStyles.card, { justifyContent: "center" }]}>
              <View style={sStyles.iconWrap}>
                <Ionicons name="flame-outline" size={20} color={COLORS.green} />
              </View>
              <Text style={sStyles.label}>{t("roomDetail.flame")}</Text>
              <Text
                style={[
                  sStyles.value,
                  {
                    color: sensors.flame ? COLORS.primary : COLORS.green,
                    fontSize: 18,
                  },
                ]}
              >
                {sensors.flame
                  ? t("roomDetail.detected")
                  : t("roomDetail.clear")}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: sensors.flame ? COLORS.primary : COLORS.green,
                  marginTop: 8,
                }}
              >
                {sensors.flame
                  ? `WARNING: ${t("roomDetail.flameDetected")}`
                  : t("roomDetail.noFlameDetected")}
              </Text>
            </View>
          </View>

          <View style={{ alignItems: "center" }}>
            <View style={{ width: "47.5%" }}>
              <SensorCard
                icon="water-outline"
                label="Humidity"
                value={sensors.humidity ?? 0}
                unit="%"
                fillPct={humidityPct}
                fillColor={COLORS.blue}
              />
            </View>
          </View>
        </View>

        <View style={styles.historyCard}>
          <Text style={styles.cardTitle}>{t("roomDetail.sensorHistory")}</Text>
          {sensorHistory.length > 0 ? (
            <SensorChart data={sensorHistory} />
          ) : (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>
                {t("roomDetail.noSensorData")}
              </Text>
            </View>
          )}
        </View>

        <Animated.View
          style={[styles.pumpCard, { transform: [{ scale: pumpPulse }] }]}
        >
          <View style={styles.pumpTop}>
            <View>
              <Text style={styles.cardTitle}>
                {t("roomDetail.waterPumpSystem")}
              </Text>
              <Text style={styles.pumpSub}>
                {t("roomDetail.manualSuppression")}
              </Text>
            </View>
            <Ionicons name="water-outline" size={24} color={COLORS.text3} />
          </View>

          <View style={styles.pumpStatusRow}>
            <Text style={styles.pumpStatusLbl}>{t("roomDetail.status")}</Text>
            <View
              style={[
                styles.pumpBadge,
                pumpActive ? styles.badgeActive : styles.badgeStandby,
              ]}
            >
              <Text
                style={[
                  styles.pumpBadgeText,
                  { color: pumpActive ? COLORS.green : COLORS.text2 },
                ]}
              >
                {pumpActive ? t("roomDetail.active") : t("roomDetail.standby")}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.pumpBtn, pumpActive && styles.pumpBtnActive]}
            onPress={handlePumpToggle}
            activeOpacity={0.85}
          >
            <Ionicons name="power" size={18} color={COLORS.white} />
            <Text style={styles.pumpBtnText}>
              {pumpActive
                ? t("roomDetail.deactivatePump")
                : t("roomDetail.activatePump")}
            </Text>
          </TouchableOpacity>

          <View style={styles.pumpMeta}>
            <View>
              <Text style={styles.pumpMetaLbl}>
                {t("roomDetail.lastUpdate")}
              </Text>
              <Text style={styles.pumpMetaVal}>{formatTime(lastUpdated)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.pumpMetaLbl}>
                {t("roomDetail.connection")}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 2,
                }}
              >
                <View style={styles.onlineDot} />
                <Text style={styles.pumpMetaVal}>{t("roomDetail.online")}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

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
  unavailableWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
  },
  unavailableText: {
    fontSize: 15,
    color: COLORS.text2,
    textAlign: "center",
  },
  unavailableBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  unavailableBtnText: {
    color: COLORS.white,
    fontWeight: "700",
  },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 34,
    height: 34,
    backgroundColor: COLORS.bg,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: "auto",
  },
  cameraBlock: {
    margin: SPACING.lg,
    backgroundColor: "#0D0D0D",
    borderRadius: RADIUS.xl,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  cameraInner: {
    alignItems: "center",
  },
  spinner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.1)",
    borderTopColor: COLORS.primary,
    marginBottom: 12,
  },
  camLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "500",
  },
  camRoom: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    marginTop: 3,
  },
  recBadge: {
    position: "absolute",
    top: 12,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  recText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "700",
  },
  camTime: {
    position: "absolute",
    bottom: 10,
    right: 12,
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  sensorGrid: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  sensorRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  historyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.small,
  },
  chartEmpty: {
    height: 140,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  chartEmptyText: {
    fontSize: 12,
    color: COLORS.text2,
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  pumpCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    ...SHADOW.small,
  },
  pumpTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: SPACING.md,
  },
  pumpSub: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 2,
  },
  pumpStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  pumpStatusLbl: {
    fontSize: 13,
    color: COLORS.text2,
  },
  pumpBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  badgeStandby: {
    backgroundColor: "#F0F0F0",
  },
  badgeActive: {
    backgroundColor: COLORS.greenLight,
  },
  pumpBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  pumpBtn: {
    backgroundColor: COLORS.blue,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  pumpBtnActive: {
    backgroundColor: COLORS.primary,
  },
  pumpBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "700",
  },
  pumpMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  pumpMetaLbl: {
    fontSize: 12,
    color: COLORS.text2,
  },
  pumpMetaVal: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.green,
  },
});
