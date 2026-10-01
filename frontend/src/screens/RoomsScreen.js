import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import { getRoomsByBilik } from "../services/api";

export default function RoomsScreen({ navigation }) {
  const { bilik, bilikLoading, bilikError, refreshBilik, t } = useApp();
  const [roomData, setRoomData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const loadRooms = async () => {
      setLoading(true);
      setLoadError(null);
      if (bilikLoading) return;
      if (!bilik?.bilikId) {
        setLoadError(bilikError || "Bilik information is unavailable.");
        setLoading(false);
        return;
      }
      try {
        const result = await getRoomsByBilik(bilik.bilikId);
        if (result?.error) throw new Error(result.error);
        if (!Array.isArray(result)) throw new Error("Invalid rooms response.");
        if (mounted) setRoomData(result);
      } catch (error) {
        if (mounted) {
          setRoomData([]);
          setLoadError(error.message || "Could not load rooms.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadRooms();

    return () => {
      mounted = false;
    };
  }, [bilik?.bilikId, bilikLoading, bilikError, reloadKey]);
  // const safeCount = rooms.filter((r) => r.status === 'safe').length;
  // const warnCount = rooms.filter((r) => r.status === 'warning').length;

  const safeCount = 1;
  const warnCount = 2;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("rooms.title")}</Text>
        <Text style={styles.subtitle}>{t("rooms.subtitle")}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {loading && <Text>Loading rooms...</Text>}
          {!loading && loadError && (
            <View>
              <Text>{loadError}</Text>
              <TouchableOpacity
                onPress={() => {
                  if (bilikError) refreshBilik();
                  else setReloadKey((key) => key + 1);
                }}
              >
                <Text>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
          {roomData.map((room) => {
            return (
              <TouchableOpacity
                key={room.roomId}
                style={styles.roomRow}
                onPress={() =>
                  navigation.navigate("ListRoomDetail", {
                    room,
                  })
                }
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <View style={styles.roomBottom}></View>
                </View>
                <Ionicons
                  name={
                    room.status === "warning" ? "warning" : "checkmark-circle"
                  }
                  size={24}
                  color={
                    room.status === "warning" ? COLORS.amber : COLORS.green
                  }
                />
              </TouchableOpacity>
            );
          })}
          {!loading && !loadError && roomData.length === 0 && (
            <Text>No rooms found.</Text>
          )}
        </View>

        {/* Summary Footer */}
        <View style={styles.footer}>
          <View style={styles.footerStat}>
            <Text style={[styles.footerVal, { color: COLORS.blue }]}>
              {roomData.length}
            </Text>
            <Text style={styles.footerLbl}>{t("rooms.totalRooms")}</Text>
          </View>
          <View style={styles.footerDivider} />
          <View style={styles.footerStat}>
            <Text style={[styles.footerVal, { color: COLORS.green }]}>
              {safeCount}
            </Text>
            <Text style={styles.footerLbl}>{t("rooms.safe")}</Text>
          </View>
          <View style={styles.footerDivider} />
          <View style={styles.footerStat}>
            <Text style={[styles.footerVal, { color: COLORS.amber }]}>
              {warnCount}
            </Text>
            <Text style={styles.footerLbl}>{t("rooms.warnings")}</Text>
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
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.text2,
    marginTop: 3,
  },
  list: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  roomRow: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    ...SHADOW.small,
  },
  roomName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  roomBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: 4,
  },
  roomTemp: {
    fontSize: 13,
    color: COLORS.text2,
  },
  roomAlert: {
    fontSize: 12,
    color: COLORS.amber,
    fontWeight: "600",
  },
  footer: {
    marginHorizontal: SPACING.lg,
    backgroundColor: "#EEF6FF",
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  footerStat: {
    alignItems: "center",
    flex: 1,
  },
  footerVal: {
    fontSize: 22,
    fontWeight: "700",
  },
  footerLbl: {
    fontSize: 11,
    color: COLORS.text2,
    marginTop: 3,
  },
  footerDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },
});
