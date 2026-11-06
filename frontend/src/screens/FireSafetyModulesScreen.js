import React from "react";
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";

export default function FireSafetyModulesScreen({ navigation }) {
  const { fireSafetyContent: content, fireSafetyProgress } = useApp();
  const openScreen = (name, params) => navigation.navigate(name, params);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={23} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{content.title}</Text>
        <View style={styles.back} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>{content.subtitle}</Text>
        <Text style={styles.sectionLabel}>{content.learningHeading}</Text>
        {content.modules.map((module, index) => (
          <TouchableOpacity
            key={module.id}
            style={styles.card}
            onPress={() =>
              openScreen("FireSafetyModuleDetail", { moduleId: module.id })
            }
            activeOpacity={0.75}
          >
            <View style={styles.moduleIcon}>
              <Ionicons name={module.icon} size={23} color={COLORS.primary} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.cardTitle}>{module.title}</Text>
              <Text style={styles.cardText}>{module.summary}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.text3} />
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>
          {content.practiceHeading}
        </Text>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => openScreen("FireSafetyChecklist")}
          activeOpacity={0.75}
        >
          <View
            style={[styles.moduleIcon, { backgroundColor: COLORS.blueLight }]}
          >
            <Ionicons name="clipboard-outline" size={22} color={COLORS.blue} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>{content.checklistTitle}</Text>
            <Text style={styles.cardText}>{content.checklistSubtitle}</Text>
            <Text style={styles.progress}>
              {content.checklistScore.replace(
                "{{done}}",
                String(fireSafetyProgress?.checklist?.length || 0),
              )}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text3} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => openScreen("FireSafetyQuiz")}
          activeOpacity={0.75}
        >
          <View
            style={[styles.moduleIcon, { backgroundColor: COLORS.purpleLight }]}
          >
            <Ionicons name="school-outline" size={22} color={COLORS.purple} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.cardTitle}>{content.quizTitle}</Text>
            <Text style={styles.cardText}>{content.quizSubtitle}</Text>
            {fireSafetyProgress?.quizPassed ? (
              <Text style={styles.badge}>
                <Ionicons name="ribbon" size={14} color={COLORS.amber} />{" "}
                {content.badge}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text3} />
        </TouchableOpacity>
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    height: 54,
    paddingHorizontal: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md },
  subtitle: {
    color: COLORS.text2,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    color: COLORS.text3,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOW.small,
  },
  actionCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOW.small,
  },
  moduleIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  cardText: { color: COLORS.text2, fontSize: 12, lineHeight: 17, marginTop: 4 },
  progress: {
    color: COLORS.green,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 5,
  },
  badge: { color: COLORS.amber, fontSize: 11, fontWeight: "700", marginTop: 5 },
});
