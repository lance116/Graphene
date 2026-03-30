import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase as adminSupabase } from "./supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function isBanned(userId: string, email?: string): Promise<boolean> {
  // Check by user_id
  const { data: byId } = await adminSupabase
    .from("banned_users")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (byId) return true;

  if (email) {
    const lower = email.toLowerCase();
    // Check by exact email
    const { data: byEmail } = await adminSupabase
      .from("banned_users")
      .select("id")
      .eq("email", lower)
      .limit(1)
      .maybeSingle();
    if (byEmail) return true;

    // Check by pattern (substring match)
    const { data: patterns } = await adminSupabase
      .from("banned_users")
      .select("pattern")
      .not("pattern", "is", null);
    if (patterns?.some((row) => lower.includes(row.pattern))) return true;
  }

  return false;
}

export async function getUser(req: NextRequest): Promise<{ id: string; email?: string; user_metadata: Record<string, any> } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  if (await isBanned(user.id, user.email)) return null;
  return { id: user.id, email: user.email, user_metadata: user.user_metadata };
}
