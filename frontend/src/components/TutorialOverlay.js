import React, { useEffect, useRef, useState } from "react";
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { COLORS, RADIUS, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";
import { getRoomsByBilik } from "../services/api";
import { navigateInMain } from "../navigation/navigationRef";
import { useTutorialTargets } from "./TutorialTarget";
import { getTutorialLayout } from "./tutorialLayout";

const HOME = { screen: "Home", params: { screen: "HomeMain" } };
const ROOMS = { screen: "Rooms", params: { screen: "RoomsList" } };
const roomDetail = (room) => ({ screen: "Rooms", params: { screen: "ListRoomDetail", params: { room } } });
const STEPS = [
  { key: "welcome", anchor: "tab-Home", target: () => HOME },
  { key: "home", anchor: "home", target: () => HOME },
  { key: "systemStatus", anchor: "systemStatus", target: () => HOME },
  { key: "recentAlerts", anchor: "recentAlerts", target: () => HOME },
  { key: "callBomba", anchor: "callBomba", target: () => HOME },
  { key: "rooms", anchor: "tab-Rooms", target: () => ROOMS },
  { key: "roomDetail", anchor: "roomDetail", target: roomDetail, needsRoom: true },
  { key: "waterPump", anchor: "waterPump", target: roomDetail, needsRoom: true },
  { key: "alerts", anchor: "tab-Notifications", target: () => ({ screen: "Notifications" }) },
  { key: "profile", anchor: "tab-Profile", target: () => ({ screen: "Profile", params: { screen: "ProfileMain" } }) },
  { key: "security", anchor: "security", target: () => ({ screen: "Profile", params: { screen: "Security" } }) },
];
const LANGUAGES = [
  { code: "en", label: "EN", nameKey: "profile.english" },
  { code: "ms", label: "BM", nameKey: "profile.bahasaMalaysia" },
];

export default function TutorialOverlay({ visible, onClose }) {
  const { t, bilik, language, setLanguage } = useApp();
  const targets = useTutorialTargets();
  const window = useWindowDimensions();
  const root = useRef(null);
  const [stepKey, setStepKey] = useState("welcome");
  const [sampleRoom, setSampleRoom] = useState(null);
  const [frame, setFrame] = useState(null);
  const [bubbleHeight, setBubbleHeight] = useState(190);
  const [viewport, setViewport] = useState({ width: window.width, height: window.height });
  const steps = STEPS.filter((item) => !item.needsRoom || sampleRoom);
  const step = Math.max(0, steps.findIndex((item) => item.key === stepKey));
  const current = steps[step];
  const isLast = step === steps.length - 1;

  useEffect(() => {
    if (!visible) {
      setStepKey("welcome");
      return;
    }
    setSampleRoom(null);
    if (!bilik?.bilikId) return;
    let mounted = true;
    getRoomsByBilik(bilik.bilikId)
      .then((rooms) => {
        if (mounted && Array.isArray(rooms)) setSampleRoom(rooms[0] || null);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [visible, bilik?.bilikId]);

  useEffect(() => {
    if (!visible) return;
    return navigateInMain(current.target(sampleRoom));
  }, [visible, current.key, sampleRoom]);

  // Measure after navigation and continue during transitions, async content,
  // rotation, and language changes. Modal coordinates are relative to its root.
  useEffect(() => {
    setFrame(null);
    if (!visible) return;
    let active = true;
    const measure = () => {
      const entry = targets?.get(current.anchor);
      if (!entry?.ref.current || !root.current) return;
      root.current.measureInWindow((rootX, rootY) => {
        entry.ref.current?.measureInWindow((x, y, width, height) => {
          if (!active || !width || !height) return;
          const commit = () => {
            if (!active) return;
            const next = { x: x - rootX, y: y - rootY, width, height };
            setFrame((prev) => prev && Object.keys(next).every((key) => Math.abs(next[key] - prev[key]) < 1) ? prev : next);
          };
          if (entry.scroll?.ref.current) {
            entry.scroll.ref.current.measureInWindow((sx, sy, sw, sh) => {
              if (!active) return;
              // Reveal the entire feature when possible, with room for its bubble.
              if (y < sy + 8 || y + height > sy + sh - 8) {
                const delta = y < sy + 8 ? y - sy - 12 : y + height - sy - sh + 12;
                entry.scroll.ref.current?.scrollTo({ y: Math.max(0, entry.scroll.offset + delta), animated: false });
              }
              commit();
            });
          } else commit();
        });
      });
    };
    const timer = setInterval(measure, 180);
    measure();
    return () => { active = false; clearInterval(timer); };
  }, [visible, current.key, targets, viewport.width, viewport.height, language]);

  const close = () => {
    setStepKey("welcome");
    navigateInMain(HOME);
    onClose();
  };
  const layout = getTutorialLayout(viewport, frame, bubbleHeight);
  const { highlight: h, bubble: b, below, arrowX } = layout;
  const hole = h ? `M${h.x},${h.y} h${h.width} v${h.height} h-${h.width} Z` : "";

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent
      navigationBarTranslucent onRequestClose={close}>
      <View ref={root} collapsable={false} style={styles.overlay}
        onLayout={({ nativeEvent: { layout } }) => setViewport({ width: layout.width, height: layout.height })}>
        <Svg width={viewport.width} height={viewport.height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={`M0,0 H${viewport.width} V${viewport.height} H0 Z ${hole}`}
            fill="rgba(0,0,0,0.28)" fillRule="evenodd" />
        </Svg>
        {h && <View pointerEvents="none" style={[styles.highlight, { left: h.x, top: h.y, width: h.width, height: h.height }]} />}
        <View style={[styles.bubble, { left: b.x, top: b.y, width: b.width, maxHeight: b.maxHeight }]}
          onLayout={({ nativeEvent: { layout } }) => setBubbleHeight(layout.height)} accessibilityViewIsModal>
          {h && <View pointerEvents="none" style={[styles.arrow, { left: arrowX, [below ? "top" : "bottom"]: -6 }]} />}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bubbleContent}>
            <View style={styles.row}>
              <Text style={styles.counter}>{step + 1}/{steps.length}</Text>
              <View style={styles.languages}>
                {LANGUAGES.map(({ code, label, nameKey }) => (
                  <TouchableOpacity key={code} onPress={() => setLanguage(code)}
                    style={[styles.language, language === code && styles.languageActive]}
                    accessibilityRole="button" accessibilityLabel={t(nameKey)} accessibilityState={{ selected: language === code }}>
                    <Text style={[styles.languageText, language === code && styles.languageTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={close} style={styles.skip} accessibilityRole="button">
                <Text style={styles.secondaryText}>{t("tutorial.skip")}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">{t(`tutorial.steps.${current.key}.title`)}</Text>
            <Text style={styles.desc}>{t(`tutorial.steps.${current.key}.desc`)}</Text>
            <View style={styles.controls}>
              {step > 0 && <TouchableOpacity onPress={() => setStepKey(steps[step - 1].key)} style={styles.back} accessibilityRole="button">
                <Text style={styles.secondaryText}>{t("tutorial.back")}</Text>
              </TouchableOpacity>}
              <TouchableOpacity onPress={() => isLast ? close() : setStepKey(steps[step + 1].key)} style={styles.next} accessibilityRole="button">
                <Text style={styles.nextText}>{t(isLast ? "tutorial.done" : "tutorial.next")}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  highlight: { position: "absolute", borderWidth: 2, borderColor: COLORS.primary, borderRadius: 10 },
  bubble: { position: "absolute", backgroundColor: COLORS.white, borderRadius: RADIUS.lg, ...SHADOW.medium },
  bubbleContent: { padding: 14 },
  arrow: { position: "absolute", width: 12, height: 12, backgroundColor: COLORS.white, transform: [{ rotate: "45deg" }] },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  counter: { flex: 1, fontSize: 12, color: COLORS.text3 },
  languages: { flexDirection: "row", borderRadius: RADIUS.full, backgroundColor: COLORS.bg },
  language: { paddingHorizontal: 9, minHeight: 32, justifyContent: "center", borderRadius: RADIUS.full },
  languageActive: { backgroundColor: COLORS.primary },
  languageText: { fontSize: 11, fontWeight: "700", color: COLORS.text2 },
  languageTextActive: { color: COLORS.white },
  skip: { paddingHorizontal: 4, minHeight: 32, justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 5 },
  desc: { fontSize: 13, lineHeight: 19, color: COLORS.text2 },
  controls: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 12 },
  back: { minHeight: 40, paddingHorizontal: 12, justifyContent: "center" },
  secondaryText: { fontSize: 12, fontWeight: "600", color: COLORS.text2 },
  next: { minHeight: 40, paddingHorizontal: 18, justifyContent: "center", borderRadius: RADIUS.md, backgroundColor: COLORS.primary },
  nextText: { fontSize: 13, fontWeight: "700", color: COLORS.white },
});
