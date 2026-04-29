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
import { useApp } from "../context/AppContext";



export default function AlertsScreen() {
  const { notifications, unreadCount, markAllRead, markNotificationRead, t } =
    useApp();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t("alerts.title")}</Text>
          <Text style={styles.subtitle}>
            {unreadCount > 0
              ? t("alerts.unreadSubtitle", {
                  count: unreadCount,
                  suffix: unreadCount > 1 ? "s" : "",
                })
              : t("alerts.allCaughtUp")}
          </Text>
        </View>
        <TouchableOpacity style={styles.bellWrap} onPress={markAllRead}>
          <Ionicons name="notifications" size={24} color={COLORS.text} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {unreadCount > 0 && (
        <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
          <Text style={styles.markAllText}>{t("alerts.markAllRead")}</Text>
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {notifications.map((notif) => {
            return (
              <TouchableOpacity
                key={notif.id}
                style={[styles.notifCard, notif.unread && styles.unreadCard]}
                activeOpacity={0.75}
                onPress={() => markNotificationRead(notif.id)}
              >
                {notif.unread && <View style={styles.unreadStripe} />}
                
                <View style={styles.notifContent}>
                  <Text style={styles.notifTitle}>
                    {t("alerts.warningTitle")}
                  </Text>
                  <Text style={styles.notifDesc}>{notif.warningTitle}</Text>
                  <View style={styles.notifMeta}>
                    <View style={styles.notifTag}>
                      <Text style={styles.notifTagText}>{notif.room}</Text>
                    </View>
                    <View style={styles.notifTimeRow}>
                      <Ionicons
                        name="time-outline"
                        size={11}
                        color={COLORS.text3}
                      />
                      <Text style={styles.notifTime}>{notif.time}</Text>
                    </View>
                  </View>
                </View>
                {notif.unread && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          })}
          {notifications.length === 0 ? (
            <Text style={styles.emptyText}>{t("alerts.empty")}</Text>
          ) : null}
        </View>
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  warning: {
    icon: "warning",
    iconColor: COLORS.amber,
    bgColor: "#FFF7ED",
  },
  notifContent: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
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
  bellWrap: {
    position: "relative",
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: COLORS.primary,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: "700",
  },
  markAllBtn: {
    alignSelf: "flex-end",
    marginRight: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: -SPACING.xs,
  },
  markAllText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: "600",
  },
  list: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  notifCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    overflow: "hidden",
    position: "relative",
    ...SHADOW.small,
  },
  unreadCard: {
    backgroundColor: "#FFFAFA",
  },
  unreadStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.lg,
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
  },
  notifDesc: {
    fontSize: 12,
    color: COLORS.text2,
    marginTop: 3,
  },
  notifMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: 7,
  },
  notifTag: {
    backgroundColor: COLORS.bg,
    borderRadius: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  notifTagText: {
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.text2,
  },
  notifTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  notifTime: {
    fontSize: 11,
    color: COLORS.text3,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    flexShrink: 0,
    marginTop: 4,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.text2,
  },
});
