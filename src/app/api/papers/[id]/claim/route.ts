import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

// GET - check if current user has claimed this paper
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ claimed: false });
  const { id } = await params;

  const { data } = await supabase
    .from("paper_claims")
    .select("id")
    .eq("user_id", user.id)
    .eq("paper_id", id)
    .maybeSingle();

  return NextResponse.json({ claimed: !!data });
}

// POST - claim authorship of a paper (verified users only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Check verified
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_verified) {
    return NextResponse.json({ error: "Only verified users can claim papers" }, { status: 403 });
  }

  const { error } = await supabase
    .from("paper_claims")
    .upsert({ user_id: user.id, paper_id: id }, { onConflict: "user_id,paper_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claimed: true });
}

// DELETE - unclaim a paper
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { error } = await supabase
    .from("paper_claims")
    .delete()
    .eq("user_id", user.id)
    .eq("paper_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claimed: false });
}
