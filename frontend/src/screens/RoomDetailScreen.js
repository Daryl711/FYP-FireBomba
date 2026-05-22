import React, { useState, useEffect, useRef } from "react";
import { Video } from "expo-av";
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
import {
  getSensorReading,
  getPumpStatus,
  controlWaterPumpStatus,
  getCameraStatus,
  getSensorAggregates,
} from "../services/api";

const THRESHOLDS = {
  temperature: 60,
  smoke: 1000,
  co: 50,
  humidity: 100,
};

const PI_IP = process.env.EXPO_PUBLIC_RASPBERRY_PI_URL;

function SensorCard({ icon, label, value, unit, fillPct, fillColor }) {
  return (
    <View style={sStyles.card}>
      <View style={sStyles.iconWrap}>
        <Ionicons name={icon} size={20} color={COLORS.green} />
      </View>
      <Text style={sStyles.label}>{label}</Text>
      <Text style={sStyles.value}>
        {value}
        {unit ? <Text style={sStyles.unit}> {unit}</Text> : null}
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

function HistoryStatCard({ label, unit, values }) {
  return (
    <View style={hStyles.card}>
      <Text style={hStyles.label}>{label}</Text>
      <View style={hStyles.list}>
        {values.map((item, idx) => (
          <View key={`${label}-${idx}`} style={hStyles.listRow}>
            <Text style={hStyles.listIndex}>{idx + 1}</Text>
            <Text style={hStyles.listValue}>
              {item.value}
              {unit ? <Text style={hStyles.unit}> {unit}</Text> : null}
            </Text>
            <Text style={hStyles.listTime}>{item.time}</Text>
          </View>
        ))}
      </View>
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

const hStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    width: "47.5%",
    minHeight: 260,
    ...SHADOW.small,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  unit: {
    fontSize: 12,
    fontWeight: "400",
    color: COLORS.text2,
  },
  list: {
    marginTop: 8,
    gap: 4,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  listIndex: {
    width: 18,
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.text3,
  },
  listValue: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.text,
  },
  listTime: {
    fontSize: 9,
    color: COLORS.text3,
    marginLeft: 6,
  },
});

export default function RoomDetailScreen({ route, navigation }) {
  const { roomData, t, sensorReading, token } = useApp();
  const { room } = route?.params || {};

  const name = room?.name || "Room";

  const [sensorLoading, setSensorLoading] = useState(false);
  const [sensorError, setSensorError] = useState(null);
  const [sensorHistory, setSensorHistory] = useState([]);
  const [pumpActive, setPumpActive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [camTime, setCamTime] = useState(new Date());
  const [stream, setStream] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);

  const spinAnim = useRef(new Animated.Value(0)).current;
  const pumpPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const fetchPumpStatus = async () => {
      try {
        const status = await getPumpStatus(token);
        setPumpActive(status);
      } catch (err) {
        console.error("Failed to fetch pump status:", err);
      }
    };

    const fetchCameraStatus = async () => {
      try {
        const data = await getCameraStatus();
        setCameraActive(data.cameraStatus);
      } catch (err) {
        console.error("Failed to fetch camera status:", err);
      }
    };

    fetchPumpStatus();
    fetchCameraStatus();
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

  const sensors = sensorReading || {
    temperature: 0,
    smoke: 0,
    flame: false,
    co: 0,
    humidity: 0,
  };

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      setSensorLoading(true);
      setSensorError(null);

      const data = await getSensorAggregates(10);

      if (!isMounted) return;

      if (Array.isArray(data)) {
        setSensorHistory(data.slice().reverse());
      } else {
        setSensorHistory([]);
        setSensorError("Failed to load sensor history.");
      }

      setSensorLoading(false);
    };

    loadHistory();
    const interval = setInterval(loadHistory, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);
  const formatNumber = (value, digits = 1) =>
    Number.isFinite(value) ? Number(value).toFixed(digits) : "--";
  const displayHistory = sensorHistory.slice(-10);
  const now = new Date();
  const formatTimeShort = (d) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const logTimes = displayHistory.map((_, idx) => {
    const minutesBack = displayHistory.length - 1 - idx;
    return formatTimeShort(new Date(now.getTime() - minutesBack * 60000));
  });
  const toLogList = (items, key, digits, times) =>
    items.map((row, idx) => ({
      value: formatNumber(row[key], digits),
      time: times[idx] || "--",
    }));
  const tempLogs = toLogList(displayHistory, "avg_temperature", 1, logTimes);
  const humidityLogs = toLogList(displayHistory, "avg_humidity", 1, logTimes);
  const smokeLogs = toLogList(displayHistory, "avg_smoke", 0, logTimes);
  const coLogs = toLogList(displayHistory, "avg_co", 0, logTimes);
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

  const tempPct = Math.min(
    (sensors.temperature / THRESHOLDS.temperature) * 100,
    100,
  );
  const smokePct = Math.min((sensors.smoke / THRESHOLDS.smoke) * 100, 100);
  const coPct = Math.min((sensors.co / THRESHOLDS.co) * 100, 100);
  const humidityPct = Math.min(sensors.humidity ?? 0, 100);

  if (!roomData) {
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
                roomData.status === "warning" ? COLORS.amber : COLORS.green,
            },
          ]}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {cameraActive && (
          <View style={styles.cameraBlock}>
            <Video
              source={{
                uri: `http://${PI_IP}/hls/mystream.m3u8`,
              }}
              style={styles.rtcView}
              resizeMode="cover"
              shouldPlay
              isLooping={false}
              useNativeControls={false}
              progressUpdateIntervalMillis={500}
              onLoad={() => console.log("VIDEO LOADED")}
              onError={(e) => console.log("VIDEO ERROR", e)}
            />
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>REC</Text>
            </View>
            <Text style={styles.camTime}>{formatTime(camTime)}</Text>
          </View>
        )}

        {sensorLoading && (
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

        <View
          style={[
            styles.sensorGrid,
            !cameraActive && { marginTop: SPACING.lg },
          ]}
        >
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
              unit="ppm"
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
          <View style={styles.historyGrid}>
            <HistoryStatCard label="AVG TEMP" unit="°C" values={tempLogs} />
            <HistoryStatCard
              label="AVG HUMIDITY"
              unit="%"
              values={humidityLogs}
            />
            <HistoryStatCard label="AVG SMOKE" unit="ppm" values={smokeLogs} />
            <HistoryStatCard label="AVG CO" unit="ppm" values={coLogs} />
          </View>
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
    marginTop: 0, // default
  },
  sensorRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },

  rtcView: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  historyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.small,
  },
  historyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: SPACING.md,
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
