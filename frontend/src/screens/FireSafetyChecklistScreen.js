import React from "react";
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";

export default function FireSafetyChecklistScreen({ navigation }) {
  const { fireSafetyContent: content, fireSafetyProgress, saveFireSafetyProgress } = useApp();
  const checkedItems = fireSafetyProgress?.checklist || [];
  const toggle = (index) => {
    const checklist = checkedItems.includes(index) ? checkedItems.filter((item) => item !== index) : [...checkedItems, index];
    saveFireSafetyProgress({ checklist, quizPassed: fireSafetyProgress?.quizPassed === true });
  };
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="chevron-back" size={23} color={COLORS.text} /></TouchableOpacity>
        <Text style={styles.headerTitle}>{content.checklistTitle}</Text><View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>{content.checklistSubtitle}</Text>
        <View style={styles.scoreCard}>
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.green} />
          <Text style={styles.scoreText}>{content.checklistScore.replace("{{done}}", String(checkedItems.length))}</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${checkedItems.length * 10}%` }]} /></View>
        </View>
        <View style={styles.card}>
          {content.checklist.map((item, index) => {
            const checked = checkedItems.includes(index);
            return <TouchableOpacity key={item} style={[styles.row, index > 0 && styles.border]} onPress={() => toggle(index)} activeOpacity={0.7} accessibilityRole="checkbox" accessibilityState={{ checked }}>
              <Ionicons name={checked ? "checkbox" : "square-outline"} size={23} color={checked ? COLORS.green : COLORS.text3} />
              <Text style={[styles.label, checked && styles.checked]}>{item}</Text>
            </TouchableOpacity>;
          })}
        </View>
        {checkedItems.length === content.checklist.length ? <View style={styles.complete}><Ionicons name="checkmark-circle" size={19} color={COLORS.green} /><Text style={styles.completeText}>{content.checklistComplete}</Text></View> : null}
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 54, paddingHorizontal: SPACING.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: COLORS.text, fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center" },
  content: { padding: SPACING.lg, paddingTop: SPACING.md },
  subtitle: { color: COLORS.text2, fontSize: 13, lineHeight: 19, marginBottom: SPACING.md },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, backgroundColor: COLORS.greenLight, padding: SPACING.md, borderRadius: RADIUS.md, marginBottom: SPACING.md },
  scoreText: { color: COLORS.green, fontSize: 13, fontWeight: "800" },
  track: { height: 6, backgroundColor: "rgba(16,185,129,0.2)", borderRadius: 4, flex: 1, overflow: "hidden" },
  fill: { height: 6, backgroundColor: COLORS.green, borderRadius: 4 },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, ...SHADOW.small },
  row: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: SPACING.md, paddingVertical: SPACING.sm },
  border: { borderTopWidth: 1, borderTopColor: COLORS.border },
  label: { flex: 1, color: COLORS.text, fontSize: 13, lineHeight: 19 },
  checked: { color: COLORS.text2 },
  complete: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.md },
  completeText: { color: COLORS.green, fontSize: 12, fontWeight: "700" },
});
