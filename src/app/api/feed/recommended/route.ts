import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

export const maxDuration = 30;

// GET personalized recommendations based on user's library
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's arXiv papers (only arXiv IDs work with Semantic Scholar)
  const { data: userPapers } = await supabase
    .from("user_papers")
    .select("paper_id")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false })
    .limit(20);

  if (!userPapers || userPapers.length === 0) {
    return NextResponse.json({ papers: [] });
  }

  // Filter to arXiv IDs (not web-* or bib-*)
  const arxivIds = userPapers
    .map((up) => up.paper_id)
    .filter((id) => !id.startsWith("web-") && !id.startsWith("bib-"));

  if (arxivIds.length === 0) {
    return NextResponse.json({ papers: [] });
  }

  // Sample up to 5 papers to query Semantic Scholar (avoid rate limits)
  const sampleIds = arxivIds.slice(0, 5);
  const allUserPaperIds = new Set(userPapers.map((up) => up.paper_id));

  // Fetch recommendations from Semantic Scholar in parallel
  const recPromises = sampleIds.map(async (id) => {
    try {
      const res = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/ArXiv:${id}/recommendations?fields=title,authors,year,abstract,externalIds,citationCount&limit=5`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.recommendedPapers || [])
        .filter((p: any) => p.externalIds?.ArXiv && !allUserPaperIds.has(p.externalIds.ArXiv))
        .map((p: any) => ({
          id: p.externalIds.ArXiv,
          title: p.title,
          authors: p.authors?.map((a: any) => a.name) || [],
          year: p.year,
          abstract: p.abstract,
          citation_count: p.citationCount || 0,
          source_url: `https://arxiv.org/abs/${p.externalIds.ArXiv}`,
        }));
    } catch {
      return [];
    }
  });

  const results = await Promise.all(recPromises);
  const allRecs = results.flat();

  // Deduplicate by ID, keep highest citation count version
  const seen = new Map<string, any>();
  for (const rec of allRecs) {
    if (!seen.has(rec.id) || rec.citation_count > seen.get(rec.id).citation_count) {
      seen.set(rec.id, rec);
    }
  }

  // Sort by citation count descending
  const deduplicated = [...seen.values()].sort((a, b) => b.citation_count - a.citation_count).slice(0, 20);

  return NextResponse.json({ papers: deduplicated });
}
