import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "all"; // day, week, month, year, all

  // Calculate cutoff date
  const now = new Date();
  let cutoff: Date | null = null;
  if (period === "day") cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  else if (period === "week") cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else if (period === "month") cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  else if (period === "year") cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Get public papers, optionally filtered by date
  let query = supabase
    .from("papers")
    .select("id, title, authors, categories, published, added_at, bs_score, source_url, citation_count")
    .eq("is_public", true);

  if (cutoff) {
    query = query.gte("added_at", cutoff.toISOString());
  }

  const { data: papers, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!papers || papers.length === 0) return NextResponse.json({ papers: [] });

  const paperIds = papers.map((p) => p.id);

  // Get star counts
  const { data: stars } = await supabase
    .from("paper_stars")
    .select("paper_id")
    .in("paper_id", paperIds);

  const starMap: Record<string, number> = {};
  (stars || []).forEach((s) => {
    starMap[s.paper_id] = (starMap[s.paper_id] || 0) + 1;
  });

  // Score: stars × 5 + citations
  const scored = papers.map((p) => ({
    ...p,
    star_count: starMap[p.id] || 0,
    score: (starMap[p.id] || 0) * 5 + (p.citation_count || 0),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Check user stars
  let userStars = new Set<string>();
  if (user) {
    const { data: starred } = await supabase
      .from("paper_stars")
      .select("paper_id")
      .eq("user_id", user.id)
      .in("paper_id", paperIds);
    userStars = new Set((starred || []).map((s) => s.paper_id));
  }

  const result = scored.slice(0, 30).map((p) => ({
    ...p,
    starred: userStars.has(p.id),
  }));

  return NextResponse.json({ papers: result });
}
