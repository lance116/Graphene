"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  ArrowLeft,
  ExternalLink,
  Search,
  Users,
  BookOpen,
  Star,
  Calendar,
  Sparkles,
  Flame,
  Loader2,
  Library,
} from "lucide-react";
import Link from "next/link";

type UserProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string;
  paper_count: number;
  stars_given: number;
};

export default function ExplorePage() {
  const { user, getToken } = useAuth();
  const [tab, setTab] = useState<"foryou" | "popular" | "people">("foryou");
  const [recommended, setRecommended] = useState<{ id: string; title: string; authors: string[]; year: number; abstract: string | null; citation_count: number; source_url: string }[]>([]);
  const [popular, setPopular] = useState<{ id: string; title: string; authors: string[]; categories: string[]; source_url: string | null; star_count: number; citation_count: number; starred: boolean }[]>([]);
  const [period, setPeriod] = useState<"week" | "month" | "year" | "all">("month");
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addingPaper, setAddingPaper] = useState<string | null>(null);
  const [addedPapers, setAddedPapers] = useState<Set<string>>(new Set());
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch "For You" recommendations
  useEffect(() => {
    if (tab !== "foryou" || !user) return;
    const fetchRecs = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        const res = await fetch("/api/feed/recommended", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setRecommended(data.papers || []);
      } catch (e) {
        console.error("Failed to fetch recommendations:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchRecs();
  }, [user, tab]);

  // Fetch popular papers
  useEffect(() => {
    if (tab !== "popular") return;
    const fetchPopular = async () => {
      setLoading(true);
      try {
        const token = user ? await getToken() : null;
        const res = await fetch(`/api/feed/popular?period=${period}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setPopular(data.papers || []);
      } catch (e) {
        console.error("Failed to fetch popular:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPopular();
  }, [user, tab, period]);

  useEffect(() => {
    if (tab !== "people") return;
    const fetchPeople = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/profiles/search?q=${encodeURIComponent(searchDebounced)}`
        );
        const data = await res.json();
        setPeople(data.profiles || []);
      } catch (e) {
        console.error("Failed to fetch people:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPeople();
  }, [searchDebounced, tab]);

  const handleAddToLibrary = async (url: string, paperId: string) => {
    if (!user || addingPaper || addedPapers.has(paperId)) return;
    setAddingPaper(paperId);
    try {
      const token = await getToken();
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        setAddedPapers((prev) => new Set(prev).add(paperId));
      }
    } catch {} finally {
      setAddingPaper(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        {/* Top row: logo + search */}
        <div className="flex items-center justify-between px-4 sm:px-6 h-14">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0 p-1 -m-1"
          >
            <ArrowLeft size={16} className="text-text-dim" />
            <img src="/graphene.png" alt="Graphene" className="w-6 h-6 invert" />
            <span
              className="text-sm tracking-[0.2em] uppercase text-accent hidden sm:inline"
              style={{ fontWeight: 800 }}
            >
              Explore
            </span>
          </Link>

          {/* Search */}
          <div className="relative flex-1 max-w-xs sm:max-w-sm ml-3">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "people" ? "Search users..." : "Search..."}
              className="w-full bg-bg border border-border pl-9 pr-4 py-2.5 sm:py-2 text-sm sm:text-xs text-text focus:outline-none focus:border-border-hover transition-all"
            />
          </div>
        </div>

        {/* Bottom row: tabs + sort */}
        <div className="flex items-center justify-between px-4 sm:px-6 pb-2 gap-2 overflow-x-auto">
          {/* Tabs */}
          <div className="flex border border-border shrink-0">
            <button
              onClick={() => setTab("foryou")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] tracking-wider uppercase transition-colors cursor-pointer ${
                tab === "foryou"
                  ? "bg-accent text-bg"
                  : "text-text-dim hover:text-text hover:bg-surface-2"
              }`}
            >
              <Sparkles size={12} />
              For You
            </button>
            <button
              onClick={() => setTab("popular")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] tracking-wider uppercase transition-colors cursor-pointer ${
                tab === "popular"
                  ? "bg-accent text-bg"
                  : "text-text-dim hover:text-text hover:bg-surface-2"
              }`}
            >
              <Flame size={12} />
              Popular
            </button>
            <button
              onClick={() => setTab("people")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] tracking-wider uppercase transition-colors cursor-pointer ${
                tab === "people"
                  ? "bg-accent text-bg"
                  : "text-text-dim hover:text-text hover:bg-surface-2"
              }`}
            >
              <Users size={12} />
              People
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={20} className="animate-spin text-text-dim" />
            <p className="text-text-dim text-[10px] tracking-wider uppercase">Loading</p>
          </div>
        ) : tab === "foryou" ? (
          recommended.length === 0 ? (
            <div className="text-center py-16">
              <Library size={28} className="mx-auto text-text-dim/40 mb-4" />
              <p className="text-sm text-text-muted mb-1">No recommendations yet</p>
              <p className="text-xs text-text-dim max-w-xs mx-auto">
                Add some arXiv papers to your library and we'll suggest related work you might find interesting.
              </p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <p className="text-[10px] text-text-dim tracking-wider uppercase mb-2">
                Based on your library — {recommended.length} recommendations
              </p>
              {recommended.map((rec) => (
                <div
                  key={rec.id}
                  className="border border-border p-4 hover:border-border-hover hover:bg-surface/50 transition-all duration-200"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-accent leading-tight">
                        {rec.title}
                      </h3>
                      <p className="text-[10px] text-text-muted mt-1">
                        {rec.authors?.slice(0, 3).join(", ")}
                        {rec.authors?.length > 3 && " et al."}
                        {rec.year && ` (${rec.year})`}
                      </p>
                      {rec.abstract && (
                        <p className="text-[10px] text-text-dim mt-2 line-clamp-2">
                          {rec.abstract.slice(0, 200)}...
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        {rec.citation_count > 0 && (
                          <span className="text-[9px] text-text-dim tracking-wider">
                            {rec.citation_count.toLocaleString()} citations
                          </span>
                        )}
                        <a
                          href={rec.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-dim hover:text-text transition-colors p-1.5 -m-1.5"
                          aria-label="Open paper in new tab"
                        >
                          <ExternalLink size={12} />
                        </a>
                        {user && (
                          <button
                            onClick={() => handleAddToLibrary(rec.source_url, rec.id)}
                            disabled={addingPaper === rec.id || addedPapers.has(rec.id)}
                            className={`text-[10px] tracking-wider uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                              addedPapers.has(rec.id)
                                ? "border-accent/50 text-accent"
                                : "border-border text-text-dim hover:border-accent hover:text-accent"
                            }`}
                          >
                            {addedPapers.has(rec.id) ? "Added" : addingPaper === rec.id ? "..." : "+ Add"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === "popular" ? (
          <div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {(["week", "month", "year", "all"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 text-[10px] tracking-wider uppercase border transition-colors cursor-pointer ${
                    period === p
                      ? "border-accent text-accent bg-accent/5"
                      : "border-border text-text-dim hover:text-text hover:border-border-hover"
                  }`}
                >
                  {p === "all" ? "All Time" : p === "week" ? "This Week" : p === "month" ? "This Month" : "This Year"}
                </button>
              ))}
            </div>
            {popular.length === 0 ? (
              <div className="text-center py-16">
                <Flame size={28} className="mx-auto text-text-dim/40 mb-4" />
                <p className="text-sm text-text-muted mb-1">No papers this period</p>
                <p className="text-xs text-text-dim">Try a different time range to discover trending research.</p>
              </div>
            ) : (
              <div className="space-y-3 animate-fade-in">
                {popular.map((paper, i) => (
                  <div
                    key={paper.id}
                    className="border border-border p-4 hover:border-border-hover hover:bg-surface/50 transition-all duration-200"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg font-bold text-text-dim/30 w-6 text-right shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-accent leading-tight">
                          {paper.title}
                        </h3>
                        <p className="text-[10px] text-text-muted mt-1">
                          {(paper.authors as string[])?.slice(0, 3).join(", ")}
                          {(paper.authors as string[])?.length > 3 && " et al."}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[9px] text-text-dim tracking-wider flex items-center gap-1">
                            <Star size={9} fill={paper.starred ? "currentColor" : "none"} className={paper.starred ? "text-yellow-400" : ""} />
                            {paper.star_count}
                          </span>
                          {paper.citation_count > 0 && (
                            <span className="text-[9px] text-text-dim tracking-wider">
                              {paper.citation_count.toLocaleString()} citations
                            </span>
                          )}
                          {paper.source_url && (
                            <a
                              href={paper.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-text-dim hover:text-text transition-colors p-1.5 -m-1.5"
                              aria-label="Open paper in new tab"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                          {user && (
                            <button
                              onClick={() => handleAddToLibrary(paper.source_url || `https://arxiv.org/abs/${paper.id}`, paper.id)}
                              disabled={addingPaper === paper.id || addedPapers.has(paper.id)}
                              className={`text-[10px] tracking-wider uppercase px-3 py-1.5 border transition-colors cursor-pointer ${
                                addedPapers.has(paper.id)
                                  ? "border-accent/50 text-accent"
                                  : "border-border text-text-dim hover:border-accent hover:text-accent"
                              }`}
                            >
                              {addedPapers.has(paper.id) ? "Added" : addingPaper === paper.id ? "..." : "+ Add"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : /* People tab */
        people.length === 0 ? (
          <div className="text-center py-16">
            <Users size={28} className="mx-auto text-text-dim/40 mb-4" />
            <p className="text-sm text-text-muted mb-1">
              {searchDebounced ? "No users found" : "No users yet"}
            </p>
            <p className="text-xs text-text-dim">
              {searchDebounced
                ? "Try a different search term."
                : "Be the first to create a profile."}
            </p>
          </div>
        ) : (
          <div className="space-y-3 animate-fade-in">
            {people.map((person) => (
              <Link
                key={person.id}
                href={`/profile/${person.username}`}
                className="border border-border p-3 sm:p-4 hover:border-border-hover hover:bg-surface/50 transition-all duration-200 flex items-center gap-3 sm:gap-4 group block"
              >
                {person.avatar_url ? (
                  <img
                    src={person.avatar_url}
                    alt={person.username}
                    className="w-10 h-10 border border-border object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 border border-border bg-surface-2 flex items-center justify-center text-sm text-accent font-bold shrink-0">
                    {(person.display_name || person.username)[0].toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-accent group-hover:underline truncate">
                      {person.display_name || person.username}
                    </h3>
                    {person.is_verified && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-blue-400 shrink-0"><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.15"/></svg>
                    )}
                    {person.display_name && (
                      <span className="text-[10px] text-text-dim hidden sm:inline">
                        @{person.username}
                      </span>
                    )}
                  </div>
                  {person.bio && (
                    <p className="text-xs text-text-dim mt-0.5 truncate">
                      {person.bio}
                    </p>
                  )}
                  <div className="flex items-center gap-3 sm:gap-4 mt-1.5">
                    <span className="text-[9px] text-text-dim tracking-wider flex items-center gap-1">
                      <BookOpen size={9} />
                      {person.paper_count}
                    </span>
                    <span className="text-[9px] text-text-dim tracking-wider flex items-center gap-1">
                      <Star size={9} />
                      {person.stars_given}
                    </span>
                    <span className="text-[9px] text-text-dim tracking-wider flex items-center gap-1">
                      <Calendar size={9} />
                      {new Date(person.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
