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
            className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0"
          >
            <ArrowLeft size={14} className="text-text-dim" />
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
              placeholder={tab === "people" ? "Search users..." : "Search recommendations..."}
              className="w-full bg-bg border border-border pl-9 pr-4 py-2 text-xs text-text focus:outline-none focus:border-border-hover transition-all"
            />
          </div>
        </div>

        {/* Bottom row: tabs + sort */}
        <div className="flex items-center justify-between px-4 sm:px-6 pb-2 gap-2">
          {/* Tabs */}
          <div className="flex border border-border">
            <button
              onClick={() => setTab("foryou")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase transition-colors ${
                tab === "foryou"
                  ? "bg-accent text-bg"
                  : "text-text-dim hover:text-text"
              }`}
            >
              <Sparkles size={10} />
              For You
            </button>
            <button
              onClick={() => setTab("popular")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase transition-colors ${
                tab === "popular"
                  ? "bg-accent text-bg"
                  : "text-text-dim hover:text-text"
              }`}
            >
              <Flame size={10} />
              Popular
            </button>
            <button
              onClick={() => setTab("people")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase transition-colors ${
                tab === "people"
                  ? "bg-accent text-bg"
                  : "text-text-dim hover:text-text"
              }`}
            >
              <Users size={10} />
              People
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {loading ? (
          <div className="text-center py-12 text-text-dim text-xs tracking-wider">
            Loading...
          </div>
        ) : tab === "foryou" ? (
          recommended.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-dim text-xs tracking-wider">
                Add some arXiv papers to your library to get personalized recommendations.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[10px] text-text-dim tracking-wider uppercase mb-2">
                Based on your library — {recommended.length} recommendations
              </p>
              {recommended.map((rec) => (
                <div
                  key={rec.id}
                  className="border border-border p-4 hover:border-border-hover transition-colors"
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
                          className="text-text-dim hover:text-text transition-colors"
                        >
                          <ExternalLink size={10} />
                        </a>
                        {user && (
                          <button
                            onClick={() => handleAddToLibrary(rec.source_url, rec.id)}
                            disabled={addingPaper === rec.id || addedPapers.has(rec.id)}
                            className={`text-[9px] tracking-wider uppercase px-2 py-0.5 border transition-colors ${
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
            <div className="flex items-center gap-2 mb-4">
              {(["week", "month", "year", "all"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-[10px] tracking-wider uppercase border transition-colors ${
                    period === p
                      ? "border-accent text-accent"
                      : "border-border text-text-dim hover:text-text hover:border-border-hover"
                  }`}
                >
                  {p === "all" ? "All Time" : p === "week" ? "This Week" : p === "month" ? "This Month" : "This Year"}
                </button>
              ))}
            </div>
            {popular.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-text-dim text-xs tracking-wider">No papers found for this period.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {popular.map((paper, i) => (
                  <div
                    key={paper.id}
                    className="border border-border p-4 hover:border-border-hover transition-colors"
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
                              className="text-text-dim hover:text-text transition-colors"
                            >
                              <ExternalLink size={10} />
                            </a>
                          )}
                          {user && (
                            <button
                              onClick={() => handleAddToLibrary(paper.source_url || `https://arxiv.org/abs/${paper.id}`, paper.id)}
                              disabled={addingPaper === paper.id || addedPapers.has(paper.id)}
                              className={`text-[9px] tracking-wider uppercase px-2 py-0.5 border transition-colors ${
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
          <div className="text-center py-12">
            <p className="text-text-dim text-xs tracking-wider">
              {searchDebounced
                ? "No users match your search"
                : "No users yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {people.map((person) => (
              <Link
                key={person.id}
                href={`/profile/${person.username}`}
                className="border border-border p-3 sm:p-4 hover:border-border-hover transition-colors flex items-center gap-3 sm:gap-4 group block"
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
