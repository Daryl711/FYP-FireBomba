import React from "react";
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

export default function BilikRoomsScreen({ route, navigation }) {
  const { bilik, rooms = [] } = route?.params || {};

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{bilik?.number || "Bilik"}</Text>
          <Text style={styles.subtitle}>
            {bilik?.householdName || `${rooms.length} rooms`}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Rooms</Text>
        <View style={styles.roomCard}>
          {rooms.map((room, index) => (
            <React.Fragment key={room.roomId}>
              <TouchableOpacity
                style={styles.roomRow}
                onPress={() => navigation.navigate("HomeRoomDetail", { room })}
                activeOpacity={0.75}
              >
                <View style={styles.roomIcon}>
                  <Ionicons name="grid-outline" size={20} color={COLORS.blue} />
                </View>
                <View style={styles.roomInfo}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.roomType}>
                    {room.spaceType || "Room"}
                  </Text>
                </View>
                <View style={styles.roomEnd}>
                  <Ionicons
                    name={
                      room.status === "warning" ? "warning" : "checkmark-circle"
                    }
                    size={20}
                    color={
                      room.status === "warning" ? COLORS.amber : COLORS.green
                    }
                  />
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={COLORS.text3}
                  />
                </View>
              </TouchableOpacity>
              {index < rooms.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
          {rooms.length === 0 && (
            <Text style={styles.emptyText}>No rooms found.</Text>
          )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 2,
  },
  content: {
    padding: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.text3,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: SPACING.sm,
  },
  roomCard: {
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
    borderRadius: 11,
    backgroundColor: COLORS.blueLight,
    alignItems: "center",
    justifyContent: "center",
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  roomType: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 2,
  },
  roomEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 68,
  },
  emptyText: {
    padding: SPACING.lg,
    color: COLORS.text2,
    fontSize: 13,
  },
});
