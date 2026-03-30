import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

// POST - add an existing paper to user's library
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Verify paper exists
  const { data: paper } = await supabase
    .from("papers")
    .select("id")
    .eq("id", id)
    .single();

  if (!paper) return NextResponse.json({ error: "Paper not found" }, { status: 404 });

  // Add to library (ignore if already there)
  await supabase
    .from("user_papers")
    .upsert({ user_id: user.id, paper_id: id }, { onConflict: "user_id,paper_id" });

  return NextResponse.json({ success: true });
}
