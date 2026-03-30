import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { chatAboutPaper } from "@/lib/ai";
import { getUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { paperId, question, history } = await req.json();

  if (!paperId || !question) {
    return NextResponse.json({ error: "paperId and question required" }, { status: 400 });
  }

  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", paperId)
    .single();

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  // Fetch other papers in the user's library for cross-referencing
  const { data: otherPapers } = await supabase
    .from("user_papers")
    .select("papers(id, title, categories, summary)")
    .eq("user_id", user.id)
    .neq("paper_id", paperId)
    .limit(30);

  const libraryPapers = (otherPapers || [])
    .map((up: Record<string, unknown>) => up.papers as { id: string; title: string; categories: string[]; summary: string | null } | null)
    .filter((p): p is { id: string; title: string; categories: string[]; summary: string | null } => p !== null);

  const answer = await chatAboutPaper(
    paper,
    (history || []) as { role: "user" | "assistant"; content: string }[],
    question,
    libraryPapers
  );

  return NextResponse.json({ answer });
}
