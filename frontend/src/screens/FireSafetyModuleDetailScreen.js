import React, { useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";

export default function FireSafetyModuleDetailScreen({ navigation, route }) {
  const { fireSafetyContent: content } = useApp();
  const module = content.modules.find((item) => item.id === route.params?.moduleId) || content.modules[0];
  const [revealed, setRevealed] = useState(null);
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="chevron-back" size={23} color={COLORS.text} /></TouchableOpacity>
        <Text style={styles.headerTitle}>{module.title}</Text><View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name={module.icon} size={28} color={COLORS.primary} /></View>
          <Text style={styles.heroTitle}>{module.title}</Text>
          <Text style={styles.heroText}>{module.summary}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{module.title}</Text>
          {module.bullets.map((bullet) => <View style={styles.bullet} key={bullet}><Ionicons name="checkmark-circle" size={18} color={COLORS.green} /><Text style={styles.bodyText}>{bullet}</Text></View>)}
        </View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{module.detailTitle}</Text>
          {module.details.map((detail, index) => {
            const isExtinguisher = module.id === "extinguishers";
            if (!isExtinguisher) return <View style={styles.detailRow} key={detail}><View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View><Text style={styles.bodyText}>{detail}</Text></View>;
            const [name, description] = detail.split(" — ");
            return <TouchableOpacity key={detail} style={styles.revealRow} onPress={() => setRevealed(revealed === index ? null : index)} accessibilityRole="button" accessibilityState={{ expanded: revealed === index }}>
              <View style={styles.revealTop}><Text style={styles.revealTitle}>{name}</Text><Ionicons name={revealed === index ? "chevron-up" : "chevron-down"} size={18} color={COLORS.primary} /></View>
              {revealed === index ? <Text style={styles.bodyText}>{description}</Text> : null}
            </TouchableOpacity>;
          })}
        </View>
        <View style={styles.takeaway}><Ionicons name="information-circle" size={21} color={COLORS.primary} /><Text style={styles.takeawayText}>{module.takeaway}</Text></View>
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 54, paddingHorizontal: SPACING.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  content: { padding: SPACING.lg, paddingTop: SPACING.md },
  hero: { alignItems: "center", padding: SPACING.xl, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginBottom: SPACING.md, ...SHADOW.small },
  heroIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  heroTitle: { color: COLORS.text, fontSize: 20, fontWeight: "800", marginTop: SPACING.md },
  heroText: { color: COLORS.text2, textAlign: "center", fontSize: 13, lineHeight: 19, marginTop: SPACING.xs },
  card: { padding: SPACING.lg, backgroundColor: COLORS.white, borderRadius: RADIUS.lg, marginBottom: SPACING.md, gap: SPACING.md, ...SHADOW.small },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  bodyText: { color: COLORS.text2, fontSize: 13, lineHeight: 20, flex: 1 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  number: { width: 23, height: 23, borderRadius: 12, backgroundColor: COLORS.blueLight, alignItems: "center", justifyContent: "center" },
  numberText: { color: COLORS.blue, fontSize: 11, fontWeight: "700" },
  revealRow: { backgroundColor: COLORS.bg, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  revealTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  revealTitle: { color: COLORS.text, fontSize: 14, fontWeight: "700" },
  takeaway: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md, padding: SPACING.lg, marginTop: SPACING.xs },
  takeawayText: { color: COLORS.primaryDark, fontSize: 13, lineHeight: 20, flex: 1, fontWeight: "600" },
});
