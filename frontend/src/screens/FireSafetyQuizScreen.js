import React, { useMemo, useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, SHADOW } from "../../constants/theme";
import { useApp } from "../context/AppContext";

const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

export default function FireSafetyQuizScreen({ navigation }) {
  const { fireSafetyContent: content, fireSafetyProgress, saveFireSafetyProgress } = useApp();
  const questions = useMemo(() => shuffle(content.questions).slice(0, 10), [content]);
  const [answers, setAnswers] = useState(Array(10).fill(null));
  const [result, setResult] = useState(null);
  const submit = async () => {
    const score = questions.reduce((total, item, index) => total + (answers[index] === item[2] ? 1 : 0), 0);
    const passed = score >= 8;
    let syncPending = false;
    if (passed) {
      const saved = await saveFireSafetyProgress(
        { checklist: fireSafetyProgress?.checklist || [], quizPassed: true },
        score,
      );
      syncPending = saved?.pendingSync === true;
    }
    setResult({ score, passed, syncPending });
  };
  const retrySync = async () => {
    if (!result?.passed) return;
    const saved = await saveFireSafetyProgress(
      { checklist: fireSafetyProgress?.checklist || [], quizPassed: true },
      result.score,
    );
    if (saved?.ok) setResult((current) => ({ ...current, syncPending: false }));
  };
  const restart = () => {
    setAnswers(Array(10).fill(null));
    setResult(null);
  };
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="chevron-back" size={23} color={COLORS.text} /></TouchableOpacity>
        <Text style={styles.headerTitle}>{content.quizTitle}</Text><View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>{content.quizSubtitle}</Text>
        {questions.map((question, index) => (
          <View key={`${index}-${question[0]}`} style={styles.questionCard}>
            <Text style={styles.questionTitle}>{content.question.replace("{{current}}", String(index + 1)).replace("{{total}}", "10")}</Text>
            <Text style={styles.questionText}>{question[0]}</Text>
            {question[1].map((option, optionIndex) => {
              const selected = answers[index] === optionIndex;
              const showAnswer = result !== null;
              const correct = showAnswer && optionIndex === question[2];
              const wrongSelected = showAnswer && selected && !correct;
              return <TouchableOpacity key={option} style={[styles.option, selected && !showAnswer && styles.optionSelected, correct && styles.optionCorrect, wrongSelected && styles.optionWrong]} disabled={showAnswer} onPress={() => setAnswers((previous) => previous.map((answer, answerIndex) => answerIndex === index ? optionIndex : answer))} accessibilityRole="radio" accessibilityState={{ selected }}>
                <View style={[styles.radio, selected && styles.radioSelected, correct && styles.radioCorrect]} />
                <Text style={styles.optionText}>{option}</Text>
                {correct ? <Ionicons name="checkmark-circle" size={18} color={COLORS.green} /> : null}
              </TouchableOpacity>;
            })}
          </View>
        ))}
        {result ? (
          <View style={[styles.result, result.passed ? styles.resultPassed : styles.resultFailed]}>
            <Ionicons name={result.passed ? "ribbon" : "refresh-circle"} size={29} color={result.passed ? COLORS.green : COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.resultScore}>{content.score.replace("{{score}}", String(result.score))}</Text>
              <Text style={styles.resultText}>{result.passed ? content.passed : content.failed}</Text>
              {result.passed ? <Text style={styles.resultText}>{content.badge}</Text> : null}
              {result.syncPending ? (
                <View>
                  <Text style={styles.resultText}>{content.syncPending}</Text>
                  <TouchableOpacity onPress={retrySync} style={styles.retrySync}>
                    <Text style={styles.tryAgain}>{content.retrySync}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            <TouchableOpacity onPress={restart}><Text style={styles.tryAgain}>{content.tryAgain}</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.submit, answers.some((answer) => answer === null) && styles.submitDisabled]} onPress={submit} disabled={answers.some((answer) => answer === null)} activeOpacity={0.8}>
            <Text style={styles.submitText}>{content.submitQuiz}</Text><Ionicons name="checkmark" size={19} color={COLORS.white} />
          </TouchableOpacity>
        )}
        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 54, paddingHorizontal: SPACING.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  content: { padding: SPACING.lg, paddingTop: SPACING.md },
  subtitle: { color: COLORS.text2, fontSize: 13, lineHeight: 19, marginBottom: SPACING.md },
  questionCount: { color: COLORS.text3, fontSize: 11, fontWeight: "700", marginBottom: SPACING.sm },
  questionCard: { backgroundColor: COLORS.white, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOW.small },
  questionTitle: { color: COLORS.primary, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  questionText: { color: COLORS.text, fontSize: 14, fontWeight: "700", lineHeight: 20, marginTop: 5, marginBottom: SPACING.sm },
  option: { minHeight: 43, flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingHorizontal: SPACING.sm, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginTop: 6 },
  optionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  optionCorrect: { borderColor: COLORS.green, backgroundColor: COLORS.greenLight },
  optionWrong: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.text3 },
  radioSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  radioCorrect: { borderColor: COLORS.green, backgroundColor: COLORS.green },
  optionText: { color: COLORS.text, fontSize: 12, lineHeight: 17, flex: 1 },
  submit: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: RADIUS.md, marginTop: SPACING.xs },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: COLORS.white, fontSize: 14, fontWeight: "700" },
  result: { padding: SPACING.md, borderRadius: RADIUS.md, flexDirection: "row", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.sm },
  resultPassed: { backgroundColor: COLORS.greenLight },
  resultFailed: { backgroundColor: COLORS.primaryLight },
  resultScore: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  resultText: { color: COLORS.text2, fontSize: 11, lineHeight: 16, marginTop: 3 },
  tryAgain: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
  retrySync: { alignSelf: "flex-start", paddingVertical: 5 },
});
