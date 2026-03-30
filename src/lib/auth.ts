import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const BANNED_EMAILS = new Set([
  "zyu31415@gmail.com",
  "zach@traverse.so",
  "zach@clice.ai",
]);

const BANNED_IDS = new Set([
  "6055cb9f-4213-4994-8a79-cc8be83a34fd",
  "6e8cfd31-289c-4198-85ee-490ce4fb582f",
]);

export async function getUser(req: NextRequest): Promise<{ id: string; email?: string; user_metadata: Record<string, any> } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  if (BANNED_IDS.has(user.id)) return null;
  if (user.email) {
    const email = user.email.toLowerCase();
    if (BANNED_EMAILS.has(email) || email.includes("zach")) return null;
  }
  return { id: user.id, email: user.email, user_metadata: user.user_metadata };
}
