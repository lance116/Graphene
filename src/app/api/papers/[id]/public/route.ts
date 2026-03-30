import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

// GET public paper data (no auth required, but checks if user has it in library)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUser(req);

  const { data: paper, error } = await supabase
    .from("papers")
    .select("id, title, authors, abstract, published, source_url, pdf_url, categories, summary, bs_score, is_public")
    .eq("id", id)
    .single();

  if (error || !paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  if (!paper.is_public) {
    return NextResponse.json({ error: "Paper is not public" }, { status: 403 });
  }

  let in_library = false;
  if (user) {
    const { data } = await supabase
      .from("user_papers")
      .select("id")
      .eq("user_id", user.id)
      .eq("paper_id", id)
      .maybeSingle();
    in_library = !!data;
  }

  return NextResponse.json({ paper, in_library });
}
