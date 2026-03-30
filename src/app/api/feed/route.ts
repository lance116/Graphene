import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET public feed - trending and recent papers
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") || "trending";
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  let paperIds: string[];
  let papers: any[];

  if (sort === "stars" || sort === "trending") {
    // For star-based sorts: get top starred papers first, then fetch their details
    const { data: allStars } = await supabase
      .from("paper_stars")
      .select("paper_id");

    // Count stars per paper
    const countMap: Record<string, number> = {};
    (allStars || []).forEach((s) => {
      countMap[s.paper_id] = (countMap[s.paper_id] || 0) + 1;
    });

    // Get all public papers (just ids + scores for sorting)
    const { data: allPublic } = await supabase
      .from("papers")
      .select("id, added_at, bs_score")
      .eq("is_public", true);

    if (!allPublic || allPublic.length === 0) {
      return NextResponse.json({ papers: [] });
    }

    if (sort === "trending") {
      // Trending: stars x 5 + recency decay over 14 days
      const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      allPublic.sort((a, b) => {
        const scoreA = (countMap[a.id] || 0) * 5 + Math.max(0, 1 - (now - new Date(a.added_at).getTime()) / FOURTEEN_DAYS) * 10;
        const scoreB = (countMap[b.id] || 0) * 5 + Math.max(0, 1 - (now - new Date(b.added_at).getTime()) / FOURTEEN_DAYS) * 10;
        return scoreB - scoreA;
      });
    } else {
      // Stars: sort by star count, then interesting score
      const interestingOf = (p: any) => p.bs_score?.interesting ?? 0;
      allPublic.sort((a, b) => {
        const starDiff = (countMap[b.id] || 0) - (countMap[a.id] || 0);
        if (starDiff !== 0) return starDiff;
        return interestingOf(b) - interestingOf(a);
      });
    }

    // Paginate
    const page = allPublic.slice(offset, offset + limit);
    paperIds = page.map((p) => p.id);

    // Fetch full paper data for this page
    const { data: fullPapers, error } = await supabase
      .from("papers")
      .select("id, title, authors, abstract, categories, published, added_at, bs_score, source_url")
      .in("id", paperIds);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Preserve sort order
    const paperMap = Object.fromEntries((fullPapers || []).map((p) => [p.id, p]));
    papers = paperIds.map((id) => paperMap[id]).filter(Boolean);
  } else {
    // Recent: just sort by added_at from DB
    const { data, error } = await supabase
      .from("papers")
      .select("id, title, authors, abstract, categories, published, added_at, bs_score, source_url")
      .eq("is_public", true)
      .order("added_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    papers = data || [];
    paperIds = papers.map((p) => p.id);
  }

  if (papers.length === 0) return NextResponse.json({ papers: [] });

  // Get star counts for these papers
  const { data: starCounts } = await supabase
    .from("paper_stars")
    .select("paper_id")
    .in("paper_id", paperIds);

  const countMap: Record<string, number> = {};
  (starCounts || []).forEach((s) => {
    countMap[s.paper_id] = (countMap[s.paper_id] || 0) + 1;
  });

  // Check which papers the current user has starred
  let userStars = new Set<string>();
  if (user) {
    const { data: starred } = await supabase
      .from("paper_stars")
      .select("paper_id")
      .eq("user_id", user.id)
      .in("paper_id", paperIds);
    userStars = new Set((starred || []).map((s) => s.paper_id));
  }

  // Find who first added each paper (the "contributor")
  const { data: firstAdders } = await supabase
    .from("user_papers")
    .select("paper_id, user_id, added_at")
    .in("paper_id", paperIds)
    .order("added_at", { ascending: true });

  const firstAdderMap: Record<string, string> = {};
  (firstAdders || []).forEach((ua) => {
    if (!firstAdderMap[ua.paper_id]) {
      firstAdderMap[ua.paper_id] = ua.user_id;
    }
  });

  const adderIds = [...new Set(Object.values(firstAdderMap))];
  let profileMap: Record<string, { username: string; display_name: string | null; is_verified: boolean }> = {};
  if (adderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, is_verified")
      .in("id", adderIds);
    (profiles || []).forEach((p) => {
      profileMap[p.id] = { username: p.username, display_name: p.display_name, is_verified: p.is_verified || false };
    });
  }

  const enriched = papers.map((p) => {
    const adderId = firstAdderMap[p.id];
    return {
      ...p,
      star_count: countMap[p.id] || 0,
      starred: userStars.has(p.id),
      owner: adderId ? profileMap[adderId] || null : null,
    };
  });

  return NextResponse.json({ papers: enriched });
}
