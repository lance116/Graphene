"use client";

import { useState, useEffect, useRef, use } from "react";
import { Star, ArrowLeft, BookOpen, Calendar, Pencil, Camera, FileText } from "lucide-react";
import { humanCategory } from "@/lib/categories";
import { decodeEntities } from "@/lib/entities";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

type ProfileData = {
  profile_id: string;
  profile: {
    username: string;
    display_name: string | null;
    bio: string;
    avatar_url: string | null;
    is_verified: boolean;
    created_at: string;
  };
  claimed_papers: any[];
  starred_papers: any[];
  public_papers: any[];
  stats: {
    claimed: number;
    stars_given: number;
    stars_received: number;
    public_papers: number;
    total_papers: number;
    read: number;
  };
};

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { user, getToken } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"published" | "papers" | "stars">("papers");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: "", display_name: "", bio: "" });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/profiles/${encodeURIComponent(username)}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch (e) {
        console.error("Failed to fetch profile:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [username]);

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
                  </div>
                  <p className="text-[10px] text-text-dim tracking-wider">@{profile.username}</p>
                  {profile.bio && (
                    <p className="text-xs text-text mt-2">{profile.bio}</p>
                  )}
                  <p className="text-[10px] text-text-dim tracking-wider flex items-center gap-1 mt-2">
                    <Calendar size={10} />
                    Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </p>
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
