import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { username } = await params;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (profile.id === user.id) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

  await supabase
    .from("follows")
    .upsert({ follower_id: user.id, following_id: profile.id }, { onConflict: "follower_id,following_id" });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { username } = await params;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase
    .from("follows")
    .delete()
    .eq("follower_id", user.id)
    .eq("following_id", profile.id);

  return NextResponse.json({ ok: true });
}
