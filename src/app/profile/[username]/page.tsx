"use client";

import { useState, useEffect, useRef, use } from "react";
import { Star, ArrowLeft, BookOpen, Calendar, Pencil, Camera, FileText, Share2, MapPin, Clock, Link as LinkIcon, Plus, Check, UserPlus, UserMinus } from "lucide-react";
import { humanCategory } from "@/lib/categories";
import { decodeEntities } from "@/lib/entities";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import ReadingHeatmap from "@/components/ReadingHeatmap";

type ActivityEvent = {
  type: "added" | "read" | "starred" | "published";
  paper_id: string;
  title: string;
  date: string;
};

type ProfileData = {
  profile_id: string;
  profile: {
    username: string;
    display_name: string | null;
    bio: string;
    avatar_url: string | null;
    is_verified: boolean;
    created_at: string;
    location: string | null;
    timezone: string | null;
    website: string | null;
    twitter: string | null;
    linkedin: string | null;
  };
  claimed_papers: any[];
  starred_papers: any[];
  public_papers: any[];
  read_dates: string[];
  activity: ActivityEvent[];
  stats: {
    claimed: number;
    stars_given: number;
    stars_received: number;
    public_papers: number;
    total_papers: number;
    read: number;
    followers: number;
    following: number;
  };
  is_following: boolean;
};

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { user, getToken } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"published" | "papers" | "stars">("papers");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: "", display_name: "", bio: "", location: "", timezone: "", website: "", twitter: "", linkedin: "" });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`/api/profiles/${encodeURIComponent(username)}`, { headers });
        if (res.ok) {
          const d = await res.json();
          setData(d);
          setIsFollowing(d.is_following || false);
        }
      } catch (e) {
        console.error("Failed to fetch profile:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [username, getToken]);

  const handleFollow = async () => {
    if (!user || followLoading) return;
    setFollowLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/profiles/${encodeURIComponent(username)}/follow`, {
        method: isFollowing ? "DELETE" : "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setIsFollowing(!isFollowing);
        setData((prev) => prev ? {
          ...prev,
          stats: {
            ...prev.stats,
            followers: prev.stats.followers + (isFollowing ? -1 : 1),
          },
        } : prev);
      }
    } catch {}
    setFollowLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-text-dim text-xs tracking-wider">Loading...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-dim text-xs tracking-wider">Profile not found</p>
          <Link href="/explore" className="text-accent text-xs mt-2 inline-block hover:underline">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  const { profile, claimed_papers, starred_papers, public_papers, stats } = data;
  const displayPapers = tab === "published" ? claimed_papers : tab === "papers" ? public_papers : starred_papers;
  const isOwner = user?.id === data.profile_id;

  const startEditing = () => {
    setEditForm({
      username: profile.username,
      display_name: profile.display_name || "",
      bio: profile.bio || "",
      location: profile.location || "",
      timezone: profile.timezone || "",
      website: profile.website || "",
      twitter: profile.twitter || "",
      linkedin: profile.linkedin || "",
    });
    setAvatarPreview(null);
    setEditError("");
    setEditing(true);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    setUploadingAvatar(true);
    setEditError("");
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profiles/avatar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const result = await res.json();
      if (!res.ok) {
        setEditError(result.error || "Upload failed");
        setAvatarPreview(null);
        return;
      }
      setData((prev) => prev ? { ...prev, profile: { ...prev.profile, avatar_url: result.profile.avatar_url } } : prev);
    } catch {
      setEditError("Upload failed");
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    setEditError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/profiles/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          username: editForm.username.trim().toLowerCase(),
          display_name: editForm.display_name.trim() || null,
          bio: editForm.bio.trim(),
          location: editForm.location.trim() || null,
          timezone: editForm.timezone.trim() || null,
          website: editForm.website.trim() || null,
          twitter: editForm.twitter.trim() || null,
          linkedin: editForm.linkedin.trim() || null,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setEditError(result.error || "Failed to save");
        return;
      }
      // If username changed, redirect to new profile URL
      if (result.profile.username !== username) {
        window.location.href = `/profile/${result.profile.username}`;
        return;
      }
      // Update local data
      setData((prev) => prev ? {
        ...prev,
        profile: { ...prev.profile, ...result.profile },
      } : prev);
      setEditing(false);
    } catch {
      setEditError("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-4 sm:px-6 bg-surface">
        <Link href="/explore" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <ArrowLeft size={14} className="text-text-dim" />
          <img src="/graphene.png" alt="Graphene" className="w-6 h-6 invert" />
        </Link>
      </header>

      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Profile header */}
        <div className="border border-border p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="relative shrink-0">
              {(avatarPreview || profile.avatar_url) ? (
                <img
                  src={avatarPreview || profile.avatar_url!}
                  alt={profile.username}
                  className="w-12 h-12 sm:w-16 sm:h-16 border border-border object-cover"
                />
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 border border-border bg-surface-2 flex items-center justify-center text-lg sm:text-xl text-accent font-bold">
                  {(profile.display_name || profile.username)[0].toUpperCase()}
                </div>
              )}
              {editing && profile.is_verified && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploadingAvatar
                      ? <span className="text-[8px] text-white">...</span>
                      : <Camera size={16} className="text-white" />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                </>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">Display Name</label>
                    <input
                      type="text"
                      value={editForm.display_name}
                      onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                      placeholder="Your name"
                      className="w-full bg-bg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-border-hover"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">Username</label>
                    <input
                      type="text"
                      value={editForm.username}
                      onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value.replace(/[^a-z0-9_-]/gi, "").toLowerCase() }))}
                      className="w-full bg-bg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-border-hover"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">Bio</label>
                    <textarea
                      value={editForm.bio}
                      onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                      placeholder="Tell us about yourself"
                      rows={3}
                      className="w-full bg-bg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-border-hover resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">Location</label>
                      <input type="text" value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} placeholder="San Francisco" className="w-full bg-bg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-border-hover" />
                    </div>
                    <div>
                      <label className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">Timezone</label>
                      <input type="text" value={editForm.timezone} onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))} placeholder="America/Los_Angeles" className="w-full bg-bg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-border-hover" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">Website</label>
                    <input type="text" value={editForm.website} onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://yoursite.com" className="w-full bg-bg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-border-hover" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">X / Twitter</label>
                      <input type="text" value={editForm.twitter} onChange={(e) => setEditForm((f) => ({ ...f, twitter: e.target.value }))} placeholder="@handle" className="w-full bg-bg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-border-hover" />
                    </div>
                    <div>
                      <label className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">LinkedIn</label>
                      <input type="text" value={editForm.linkedin} onChange={(e) => setEditForm((f) => ({ ...f, linkedin: e.target.value }))} placeholder="in/username" className="w-full bg-bg border border-border px-3 py-2 text-xs text-text focus:outline-none focus:border-border-hover" />
                    </div>
                  </div>
                  {editError && <p className="text-[10px] text-red-400">{editError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveProfile}
                      disabled={saving}
                      className="px-4 py-1.5 bg-accent text-bg text-[10px] tracking-wider uppercase font-medium hover:bg-text disabled:opacity-30 transition-colors"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-1.5 border border-border text-text-dim text-[10px] tracking-wider uppercase hover:text-text hover:border-border-hover transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-base sm:text-lg font-medium text-accent truncate">
                      {profile.display_name || profile.username}
                    </h1>
                    {profile.is_verified && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-blue-400 shrink-0"><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.15"/></svg>
                    )}
                    {isOwner && (
                      <button onClick={startEditing} className="ml-1 text-text-dim hover:text-accent transition-colors" title="Edit profile">
                        <Pencil size={12} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        // Brief visual feedback
                        const btn = document.activeElement as HTMLButtonElement;
                        const orig = btn.textContent;
                        btn.textContent = "Copied!";
                        setTimeout(() => { btn.textContent = orig; }, 1500);
                      }}
                      className="ml-1 text-text-dim hover:text-accent transition-colors text-[10px] tracking-wider uppercase flex items-center gap-1"
                      title="Share profile"
                    >
                      <Share2 size={12} />
                    </button>
                  </div>
                  <p className="text-[10px] text-text-dim tracking-wider">@{profile.username}</p>
                  {profile.bio && (
                    <p className="text-xs text-text mt-2">{profile.bio}</p>
                  )}
                  {/* Follow button */}
                  {user && !isOwner && (
                    <button
                      onClick={handleFollow}
                      disabled={followLoading}
                      className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase transition-colors ${
                        isFollowing
                          ? "border border-border text-text-dim hover:border-red-500/50 hover:text-red-400"
                          : "bg-accent text-bg hover:bg-text"
                      }`}
                    >
                      {isFollowing ? <UserMinus size={10} /> : <UserPlus size={10} />}
                      {isFollowing ? "Unfollow" : "Follow"}
                    </button>
                  )}
                  {/* Followers / Following */}
                  <p className="text-[10px] text-text mt-2">
                    <span className="font-medium text-accent">{stats.followers}</span>{" "}
                    <span className="text-text-dim">followers</span>
                    <span className="text-text-dim mx-1.5">&middot;</span>
                    <span className="font-medium text-accent">{stats.following}</span>{" "}
                    <span className="text-text-dim">following</span>
                  </p>
                  {/* Social links */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] text-text-dim">
                    {profile.location && (
                      <span className="flex items-center gap-1"><MapPin size={10} />{profile.location}</span>
                    )}
                    {profile.timezone && (
                      <span className="flex items-center gap-1"><Clock size={10} />{profile.timezone}</span>
                    )}
                    {profile.website && (
                      <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent hover:underline">
                        <LinkIcon size={10} />{profile.website.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                    {profile.twitter && (
                      <a href={`https://x.com/${profile.twitter.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-text">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        @{profile.twitter.replace(/^@/, "")}
                      </a>
                    )}
                    {profile.linkedin && (
                      <a href={`https://linkedin.com/${profile.linkedin.startsWith("in/") ? profile.linkedin : `in/${profile.linkedin}`}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-text">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                        {profile.linkedin.replace(/^in\//, "in/")}
                      </a>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-px border border-border mb-4 sm:mb-6 bg-border">
          {[
            { label: "Papers", value: stats.total_papers },
            { label: "Read", value: stats.read },
            { label: "Public", value: stats.public_papers },
            { label: "Stars Given", value: stats.stars_given },
            { label: "Stars Received", value: stats.stars_received },
            { label: "Published", value: stats.claimed },
          ].map((s) => (
            <div key={s.label} className="bg-bg p-3 text-center">
              <p className="text-sm font-medium text-accent">{s.value}</p>
              <p className="text-[9px] text-text-dim tracking-wider uppercase mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Reading Heatmap */}
        {data.read_dates && <ReadingHeatmap dates={data.read_dates} />}

        {/* Activity Feed */}
        {data.activity && data.activity.length > 0 && (() => {
          // Group by (date, type) — aggregate all same-type events on same day
          const groupMap = new Map<string, { type: string; date: string; items: ActivityEvent[] }>();
          for (const evt of data.activity) {
            const dateKey = new Date(evt.date).toISOString().slice(0, 10);
            const mapKey = `${dateKey}-${evt.type}`;
            const existing = groupMap.get(mapKey);
            if (existing) {
              existing.items.push(evt);
            } else {
              groupMap.set(mapKey, { type: evt.type, date: dateKey, items: [evt] });
            }
          }
          const allGroups = [...groupMap.values()].sort((a, b) => b.date.localeCompare(a.date));
          const visibleGroups = showAllActivity ? allGroups : allGroups.slice(0, 4);
          const hasMore = allGroups.length > 4;

          // Group by month for headers
          const monthGroups: { month: string; groups: typeof allGroups }[] = [];
          for (const g of visibleGroups) {
            const month = new Date(g.date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
            const last = monthGroups[monthGroups.length - 1];
            if (last && last.month === month) {
              last.groups.push(g);
            } else {
              monthGroups.push({ month, groups: [g] });
            }
          }

          return (
            <div className="border border-border mb-4 sm:mb-6">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-[10px] text-text-dim tracking-[0.2em] uppercase">Activity</p>
              </div>
              {monthGroups.map((mg, mi) => (
                <div key={mi}>
                  <div className="px-4 py-2 border-b border-border/50 bg-surface/30">
                    <p className="text-[10px] font-medium text-text">{mg.month}</p>
                  </div>
                  <div className="relative pl-8 pr-4">
                    <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />
                    {mg.groups.map((group, gi) => {
                      const icon = group.type === "read" ? <BookOpen size={12} />
                        : group.type === "added" ? <Plus size={12} />
                        : group.type === "starred" ? <Star size={12} />
                        : <FileText size={12} />;
                      const label = group.type === "read" ? `Read ${group.items.length} paper${group.items.length > 1 ? "s" : ""}`
                        : group.type === "added" ? `Added ${group.items.length} paper${group.items.length > 1 ? "s" : ""} to library`
                        : group.type === "starred" ? `Starred ${group.items.length} paper${group.items.length > 1 ? "s" : ""}`
                        : `Published ${group.items.length} paper${group.items.length > 1 ? "s" : ""}`;
                      const date = new Date(group.items[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      return (
                        <div key={gi} className="relative py-3">
                          <div className="absolute left-[-22px] top-3.5 w-5 h-5 bg-surface border border-border flex items-center justify-center text-text-dim">
                            {icon}
                          </div>
                          <div className="flex items-baseline justify-between">
                            <p className="text-xs text-text font-medium">{label}</p>
                            <span className="text-[9px] text-text-dim shrink-0 ml-2">{date}</span>
                          </div>
                          {group.items.length <= 5 && (
                            <div className="mt-1 space-y-0.5">
                              {group.items.map((item, ii) => (
                                <p key={ii} className="text-[10px] text-text-dim truncate">{decodeEntities(item.title)}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {hasMore && !showAllActivity && (
                <button
                  onClick={() => setShowAllActivity(true)}
                  className="w-full py-3 text-[10px] text-accent tracking-wider uppercase hover:bg-surface/50 transition-colors border-t border-border"
                >
                  Show more activity
                </button>
              )}
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border mb-4">
          {profile.is_verified && (
            <button
              onClick={() => setTab("published")}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[10px] tracking-[0.2em] uppercase transition-colors ${
                tab === "published"
                  ? "text-accent border-b border-accent"
                  : "text-text-dim hover:text-text"
              }`}
            >
              <FileText size={10} />
              Published ({claimed_papers.length})
            </button>
          )}
          {(["papers", "stars"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[10px] tracking-[0.2em] uppercase transition-colors ${
                tab === t
                  ? "text-accent border-b border-accent"
                  : "text-text-dim hover:text-text"
              }`}
            >
              {t === "papers" && <BookOpen size={10} />}
              {t === "stars" && <Star size={10} />}
              {t} ({t === "papers" ? public_papers.length : starred_papers.length})
            </button>
          ))}
        </div>

        {/* Paper list */}
        {displayPapers.length === 0 ? (
          <div className="text-center py-8 text-text-dim text-xs tracking-wider">
            No {tab === "published" ? "published papers" : tab === "papers" ? "public papers" : "starred papers"} yet
          </div>
        ) : (
          <div className="space-y-2">
            {displayPapers.map((paper: any) => (
              <div
                key={paper.id}
                className="border border-border p-3 hover:border-border-hover transition-colors"
              >
                <h3 className="text-xs font-medium text-accent leading-tight">
                  {decodeEntities(paper.title)}
                </h3>
                <p className="text-[10px] text-text-muted mt-1 truncate">
                  {(paper.authors as string[])?.slice(0, 3).join(", ")}
                  {(paper.authors as string[])?.length > 3 && " et al."}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  {(paper.categories as string[])?.slice(0, 3).map((cat: string) => (
                    <span
                      key={cat}
                      className="text-[9px] text-text-dim border border-border px-1.5 py-0.5"
                    >
                      {humanCategory(cat)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
