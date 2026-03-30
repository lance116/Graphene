import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

// GET current user's profile (auto-creates from signup metadata if missing)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) return NextResponse.json({ profile });

  // Auto-create profile from auth metadata
  const meta = user.user_metadata || {};
  // Try explicit username first, then derive from email
  let candidate = meta.username || meta.email?.split("@")[0] || "";
  candidate = candidate.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (candidate.length < 3) candidate = "user" + Math.random().toString(36).slice(2, 8);

  // Find a unique username
  let username = candidate;
  let { data: taken } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (taken) {
    // Append random suffix
    username = candidate.slice(0, 20) + Math.random().toString(36).slice(2, 6);
  }

  const { data: created } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      username,
      display_name: meta.full_name || meta.name || null,
      avatar_url: meta.avatar_url || meta.picture || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select()
    .single();
  return NextResponse.json({ profile: created });
}

// PATCH - create or update profile
export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.username !== undefined) {
    const username = body.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (username.length < 3) {
      return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 });
    }
    // Check uniqueness
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", user.id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    updates.username = username;
  }
  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.bio !== undefined) updates.bio = body.bio;
  if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...updates }, { onConflict: "id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
