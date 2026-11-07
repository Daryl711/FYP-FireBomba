const { test } = require("node:test");
const assert = require("node:assert/strict");
const { create, act } = require("react-test-renderer");
const { React, loadScreen, textOf, button, hasText, press } = require("./helpers/render.cjs");

// 12 questions; the screen should pick 10 at random. Each option's text says
// which question it belongs to, e.g. "Q3-opt1", and CORRECT[3] is the answer.
const CORRECT = Array.from({ length: 12 }, (_, i) => i % 4);
const CONTENT = {
  quizTitle: "Quiz", quizSubtitle: "Answer all", submitQuiz: "Submit", tryAgain: "Try again",
  question: "Question {{current}} of {{total}}", score: "Score: {{score}}/10",
  passed: "You passed", failed: "Not yet", badge: "Badge earned", syncPending: "Not saved yet", retrySync: "Retry save",
  questions: CORRECT.map((answer, q) => [`Question text ${q}`, [0, 1, 2, 3].map((i) => `Q${q}-opt${i}`), answer]),
};

function renderQuiz({ saveResults = [{ ok: true }], checklist = ["exits"] } = {}) {
  const saves = [];
  const Quiz = loadScreen("src/screens/FireSafetyQuizScreen.js", {
    "../context/AppContext": { useApp: () => ({
      fireSafetyContent: CONTENT,
      fireSafetyProgress: { checklist },
      saveFireSafetyProgress: async (progress, score) => { saves.push([progress, score]); return saveResults.shift(); },
    }) },
  });
  let renderer;
  act(() => { renderer = create(React.createElement(Quiz, { navigation: { goBack() {} } })); });
  const root = renderer.root;
  const options = () => root.findAllByProps({ accessibilityRole: "radio" });
  // Answers the shown questions, getting the first `correctCount` right.
  const answer = (correctCount) => {
    const shown = [...new Set(options().map((o) => Number(textOf(o).match(/^Q(\d+)/)[1])))];
    shown.forEach((q, index) => {
      const pick = index < correctCount ? CORRECT[q] : (CORRECT[q] + 1) % 4;
      const option = options().find((o) => textOf(o) === `Q${q}-opt${pick}`);
      act(() => option.props.onPress());
    });
    return shown;
  };
  return { root, renderer, saves, options, answer };
}

test("10 of the questions are shown, each with 4 options", () => {
  const { root, options, renderer } = renderQuiz();
  assert.equal(options().length, 40);
  assert.ok(hasText(root, "Question 1 of 10"));
  assert.ok(hasText(root, "Question 10 of 10"));
  assert.ok(!hasText(root, "Question 11 of 10"));
  act(() => renderer.unmount());
});

test("submit stays disabled until every question has an answer", () => {
  const { root, answer, options, renderer } = renderQuiz();
  assert.equal(button(root, "Submit").props.disabled, true);
  act(() => options()[0].props.onPress());
  assert.equal(button(root, "Submit").props.disabled, true);
  answer(10);
  assert.equal(button(root, "Submit").props.disabled, false);
  act(() => renderer.unmount());
});

test("choosing another option for the same question replaces the first choice", () => {
  const { options, renderer } = renderQuiz();
  act(() => options()[0].props.onPress());
  act(() => options()[1].props.onPress());
  const selected = options().slice(0, 4).map((o) => o.props.accessibilityState.selected);
  assert.deepEqual(selected, [false, true, false, false]);
  act(() => renderer.unmount());
});

test("8, 9 or 10 correct is a pass and is saved with the score and checklist", async () => {
  for (const correct of [8, 9, 10]) {
    const { root, answer, saves, renderer } = renderQuiz();
    answer(correct);
    await press(button(root, "Submit"));
    assert.ok(hasText(root, `Score: ${correct}/10`));
    assert.ok(hasText(root, "You passed"));
    assert.ok(hasText(root, "Badge earned"));
    assert.equal(saves.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(saves[0])), [{ checklist: ["exits"], quizPassed: true }, correct]);
    act(() => renderer.unmount());
  }
});

test("7 or fewer correct is a fail and nothing is saved", async () => {
  for (const correct of [0, 7]) {
    const { root, answer, saves, renderer } = renderQuiz();
    answer(correct);
    await press(button(root, "Submit"));
    assert.ok(hasText(root, `Score: ${correct}/10`));
    assert.ok(hasText(root, "Not yet"));
    assert.ok(!hasText(root, "Badge earned"));
    assert.equal(saves.length, 0);
    act(() => renderer.unmount());
  }
});

test("after submitting, answers are locked and each correct answer is marked", async () => {
  const { root, answer, options, renderer } = renderQuiz();
  const shown = answer(5);
  await press(button(root, "Submit"));
  assert.ok(options().every((o) => o.props.disabled === true));
  for (const q of shown) {
    const right = options().find((o) => textOf(o) === `Q${q}-opt${CORRECT[q]}`);
    assert.equal(right.findAllByType("Ionicons").length, 1, "the correct answer shows a tick");
  }
  act(() => renderer.unmount());
});

test("if saving a pass fails, a retry button saves it again", async () => {
  const { root, answer, saves, renderer } = renderQuiz({ saveResults: [{ pendingSync: true }, { ok: true }] });
  answer(9);
  await press(button(root, "Submit"));
  assert.ok(hasText(root, "Not saved yet"));
  await press(button(root, "Retry save"));
  assert.equal(saves.length, 2);
  assert.equal(saves[1][1], 9);
  assert.ok(!hasText(root, "Not saved yet"));
  act(() => renderer.unmount());
});

test("try again clears the answers and the result", async () => {
  const { root, answer, options, renderer } = renderQuiz();
  answer(3);
  await press(button(root, "Submit"));
  act(() => button(root, "Try again").props.onPress());
  assert.ok(!hasText(root, "Score:"));
  assert.ok(options().every((o) => o.props.accessibilityState.selected === false));
  assert.equal(button(root, "Submit").props.disabled, true);
  act(() => renderer.unmount());
});
