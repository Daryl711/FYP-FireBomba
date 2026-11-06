const supabase = require("../config/supabase");

exports.getByUserId = async (userId) => {
  const { data, error } = await supabase
    .from("user_fire_safety_progress")
    .select("quiz_passed, passed_at, best_quiz_score")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || { quiz_passed: false, passed_at: null, best_quiz_score: null };
};

exports.recordQuizPass = async (userId, score) => {
  const existing = await exports.getByUserId(userId);
  if (existing.quiz_passed) {
    if (score <= Number(existing.best_quiz_score || 0)) return existing;

    const { data, error } = await supabase
      .from("user_fire_safety_progress")
      .update({ best_quiz_score: score })
      .eq("user_id", userId)
      .select("quiz_passed, passed_at, best_quiz_score")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("user_fire_safety_progress")
    .upsert(
      {
        user_id: userId,
        quiz_passed: true,
        passed_at: new Date().toISOString(),
        best_quiz_score: score,
      },
      { onConflict: "user_id" },
    )
    .select("quiz_passed, passed_at, best_quiz_score")
    .single();

  if (error) throw error;
  return data;
};
