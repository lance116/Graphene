import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

// GET single paper (merged with user data)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: paper, error } = await supabase
    .from("papers")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  // Get user-specific data
  const { data: userPaper } = await supabase
    .from("user_papers")
    .select("*")
    .eq("user_id", user.id)
    .eq("paper_id", id)
    .maybeSingle();

  // Get connections
  const { data: connections } = await supabase
    .from("paper_connections")
    .select("*")
    .or(`paper_a.eq.${id},paper_b.eq.${id}`);

  return NextResponse.json({
    paper: {
      ...paper,
      is_read: userPaper?.is_read || false,
      read_at: userPaper?.read_at || null,
      notes: userPaper?.notes || "",
    },
    connections: connections || [],
  });
}

// PATCH - update paper or user-specific data
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  // User-specific updates go to user_papers
  const userUpdates: Record<string, unknown> = {};
  if (body.is_read !== undefined) {
    userUpdates.is_read = body.is_read;
    if (body.is_read) userUpdates.read_at = new Date().toISOString();
  }
  if (body.notes !== undefined) userUpdates.notes = body.notes;

  if (Object.keys(userUpdates).length > 0) {
    await supabase
      .from("user_papers")
      .update(userUpdates)
      .eq("user_id", user.id)
      .eq("paper_id", id);
  }

  // Paper-level updates go to papers table
  const paperUpdates: Record<string, unknown> = {};
  if (body.is_public !== undefined) paperUpdates.is_public = body.is_public;

  if (Object.keys(paperUpdates).length > 0) {
    await supabase
      .from("papers")
      .update(paperUpdates)
      .eq("id", id);
  }

  // Return merged result
  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", id)
    .single();

  const { data: userPaper } = await supabase
    .from("user_papers")
    .select("*")
    .eq("user_id", user.id)
    .eq("paper_id", id)
    .maybeSingle();

  return NextResponse.json({
    paper: {
      ...paper,
      is_read: userPaper?.is_read || false,
      read_at: userPaper?.read_at || null,
      notes: userPaper?.notes || "",
    },
  });
}

// DELETE - remove paper from user's library (not the shared paper itself)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Remove from user's library
  const { error } = await supabase
    .from("user_papers")
    .delete()
    .eq("user_id", user.id)
    .eq("paper_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If no other users have this paper, delete the shared record too
  const { count } = await supabase
    .from("user_papers")
    .select("*", { count: "exact", head: true })
    .eq("paper_id", id);

  if (count === 0) {
    await supabase.from("paper_connections").delete().or(`paper_a.eq.${id},paper_b.eq.${id}`);
    await supabase.from("paper_stars").delete().eq("paper_id", id);
    await supabase.from("paper_claims").delete().eq("paper_id", id);
    await supabase.from("papers").delete().eq("id", id);
  }

  return NextResponse.json({ success: true });
}
