import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

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

  // Get all read dates for heatmap
  const { data: readDates } = await supabase
    .from("user_papers")
    .select("read_at")
    .eq("user_id", profile.id)
    .eq("is_read", true)
    .not("read_at", "is", null);

  // Activity feed: papers added, read, starred (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: recentAdded } = await supabase
    .from("user_papers")
    .select("paper_id, added_at")
    .eq("user_id", profile.id)
    .gte("added_at", sixMonthsAgo.toISOString())
    .order("added_at", { ascending: false });

  const { data: recentRead } = await supabase
    .from("user_papers")
    .select("paper_id, read_at")
    .eq("user_id", profile.id)
    .eq("is_read", true)
    .not("read_at", "is", null)
    .gte("read_at", sixMonthsAgo.toISOString())
    .order("read_at", { ascending: false });

  const { data: recentStars } = await supabase
    .from("paper_stars")
    .select("paper_id, created_at")
    .eq("user_id", profile.id)
    .gte("created_at", sixMonthsAgo.toISOString())
    .order("created_at", { ascending: false });

  // Gather all paper IDs we need titles for
  const activityPaperIds = new Set<string>();
  (recentAdded || []).forEach((r) => activityPaperIds.add(r.paper_id));
  (recentRead || []).forEach((r) => activityPaperIds.add(r.paper_id));
  (recentStars || []).forEach((r) => activityPaperIds.add(r.paper_id));

  let activityPaperMap: Record<string, string> = {};
  if (activityPaperIds.size > 0) {
    const { data: actPapers } = await supabase
      .from("papers")
      .select("id, title")
      .in("id", [...activityPaperIds]);
    if (actPapers) {
      activityPaperMap = Object.fromEntries(actPapers.map((p) => [p.id, p.title]));
    }
  }

  // Build activity events
  type ActivityEvent = { type: string; paper_id: string; title: string; date: string };
  const activity: ActivityEvent[] = [];
  for (const r of recentAdded || []) {
    activity.push({ type: "added", paper_id: r.paper_id, title: activityPaperMap[r.paper_id] || "Unknown", date: r.added_at });
  }
  for (const r of recentRead || []) {
    activity.push({ type: "read", paper_id: r.paper_id, title: activityPaperMap[r.paper_id] || "Unknown", date: r.read_at });
  }
  for (const r of recentStars || []) {
    activity.push({ type: "starred", paper_id: r.paper_id, title: activityPaperMap[r.paper_id] || "Unknown", date: r.created_at });
  }
  // Also add claimed papers
  for (const c of claims || []) {
    activity.push({ type: "published", paper_id: c.paper_id, title: activityPaperMap[c.paper_id] || claimedPapers.find((p: any) => p.id === c.paper_id)?.title || "Unknown", date: c.claimed_at });
  }
  activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Follow stats
  const { count: followersCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", profile.id);

  const { count: followingCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", profile.id);

  // Check if current user follows this profile
  let isFollowing = false;
  const currentUser = await getUser(_req);
  if (currentUser && currentUser.id !== profile.id) {
    const { data: followRow } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", profile.id)
      .maybeSingle();
    isFollowing = !!followRow;
  }

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
      location: profile.location || null,
      timezone: profile.timezone || null,
      website: profile.website || null,
      twitter: profile.twitter || null,
      linkedin: profile.linkedin || null,
    },
    claimed_papers: claimedPapers,
    starred_papers: starredPapers,
    public_papers: publicPapers,
    read_dates: (readDates || []).map((r) => r.read_at),
    activity: activity.slice(0, 50),
    stats: {
      claimed: claimedPapers.length,
      stars_given: totalStarsGiven || 0,
      public_papers: publicPapers.length,
      total_papers: totalPapers,
      stars_received: starsReceived,
      read: readCount || 0,
      followers: followersCount || 0,
      following: followingCount || 0,
    },
    is_following: isFollowing,
  });
}
