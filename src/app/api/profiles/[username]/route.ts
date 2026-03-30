import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET public profile by username
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Get their public starred papers
  const { data: stars } = await supabase
    .from("paper_stars")
    .select("paper_id, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);

  let starredPapers: any[] = [];
  if (stars && stars.length > 0) {
    const paperIds = stars.map((s) => s.paper_id);
    const { data: papers } = await supabase
      .from("papers")
      .select("id, title, authors, categories, published, is_public, bs_score")
      .in("id", paperIds)
      .eq("is_public", true);
    starredPapers = papers || [];
  }

  // Get their public papers (papers in their library that are marked public)
  const { data: userPaperLinks } = await supabase
    .from("user_papers")
    .select("paper_id")
    .eq("user_id", profile.id);

  let publicPapers: any[] = [];
  if (userPaperLinks && userPaperLinks.length > 0) {
    const paperIds = userPaperLinks.map((up) => up.paper_id);
    const { data: papers } = await supabase
      .from("papers")
      .select("id, title, authors, categories, published, bs_score")
      .in("id", paperIds)
      .eq("is_public", true)
      .order("added_at", { ascending: false })
      .limit(50);
    publicPapers = papers || [];
  }

  // Get claimed (published) papers
  const { data: claims } = await supabase
    .from("paper_claims")
    .select("paper_id, claimed_at")
    .eq("user_id", profile.id)
    .order("claimed_at", { ascending: false });

  let claimedPapers: any[] = [];
  if (claims && claims.length > 0) {
    const claimIds = claims.map((c) => c.paper_id);
    const { data: papers } = await supabase
      .from("papers")
      .select("id, title, authors, categories, published, bs_score")
      .in("id", claimIds);
    claimedPapers = papers || [];
  }

  // Count stats
  const { count: totalStarsGiven } = await supabase
    .from("paper_stars")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id);

  // Count stars received on user's papers
  let starsReceived = 0;
  if (userPaperLinks && userPaperLinks.length > 0) {
    const paperIds = userPaperLinks.map((up) => up.paper_id);
    const { count } = await supabase
      .from("paper_stars")
      .select("*", { count: "exact", head: true })
      .in("paper_id", paperIds);
    starsReceived = count || 0;
  }

  // Count papers read
  const { count: readCount } = await supabase
    .from("user_papers")
    .select("*", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", true);

  const totalPapers = userPaperLinks?.length || 0;

  return NextResponse.json({
    profile_id: profile.id,
    profile: {
      username: profile.username,
      display_name: profile.display_name,
      bio: profile.bio,
      avatar_url: profile.avatar_url,
      created_at: profile.created_at,
      is_verified: profile.is_verified || false,
    },
    claimed_papers: claimedPapers,
    starred_papers: starredPapers,
    public_papers: publicPapers,
    stats: {
      claimed: claimedPapers.length,
      stars_given: totalStarsGiven || 0,
      public_papers: publicPapers.length,
      total_papers: totalPapers,
      stars_received: starsReceived,
      read: readCount || 0,
    },
  });
}
