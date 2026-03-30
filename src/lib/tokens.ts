import { supabase } from "@/lib/supabase";

const DAILY_LIMIT = 100000;

export async function trackTokens(userId: string, tokens: number) {
  const today = new Date().toISOString().slice(0, 10);

  // Upsert: increment tokens_used for today
  const { data: existing } = await supabase
    .from("token_usage")
    .select("tokens_used")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("token_usage")
      .update({ tokens_used: existing.tokens_used + tokens })
      .eq("user_id", userId)
      .eq("date", today);
  } else {
    await supabase
      .from("token_usage")
      .insert({ user_id: userId, date: today, tokens_used: tokens });
  }
}

export async function checkTokenLimit(userId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("token_usage")
    .select("tokens_used")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  return (data?.tokens_used || 0) < DAILY_LIMIT;
}
