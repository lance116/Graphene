import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

const DAILY_LIMIT = 100000; // tokens per day

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("token_usage")
    .select("tokens_used")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  return NextResponse.json({
    used: data?.tokens_used || 0,
    limit: DAILY_LIMIT,
    remaining: DAILY_LIMIT - (data?.tokens_used || 0),
  });
}
