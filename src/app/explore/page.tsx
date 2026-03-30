"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Star,
  TrendingUp,
  Clock,
  ArrowLeft,
  ExternalLink,
  Search,
  Users,
  FileText,
  BookOpen,
  Calendar,
  Sparkles,
} from "lucide-react";
import { humanCategory } from "@/lib/categories";
import { decodeEntities } from "@/lib/entities";
import Link from "next/link";

type FeedPaper = {
  id: string;
  title: string;
  authors: string[];
  abstract: string | null;
  categories: string[];
  published: string | null;
  added_at: string;
  bs_score: any;
  source_url: string | null;
  star_count: number;
  starred: boolean;
  owner: { username: string; display_name: string | null; is_verified: boolean } | null;
};

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
  const [tab, setTab] = useState<"foryou" | "papers" | "people">(user ? "foryou" : "papers");
  const [papers, setPapers] = useState<FeedPaper[]>([]);
  const [recommended, setRecommended] = useState<{ id: string; title: string; authors: string[]; year: number; abstract: string | null; citation_count: number; source_url: string }[]>([]);
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"trending" | "recent" | "stars">("trending");
  const [search, setSearch] = useState("");
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

  useEffect(() => {
    if (tab !== "papers") return;
    const fetchFeed = async () => {
      setLoading(true);
      try {
        const token = user ? await getToken() : null;
        const res = await fetch(`/api/feed?sort=${sort}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        const data = await res.json();
        setPapers(data.papers || []);
      } catch (e) {
        console.error("Failed to fetch feed:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchFeed();
  }, [sort, user, tab]);

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

  const handleToggleStar = async (paperId: string) => {
    if (!user) return;
    const paper = papers.find((p) => p.id === paperId);
    if (!paper) return;

    // Optimistic update
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paperId
          ? { ...p, starred: !p.starred, star_count: p.star_count + (p.starred ? -1 : 1) }
          : p
      )
    );

    const token = await getToken();
    try {
      const res = await fetch(
        `/api/papers/${encodeURIComponent(paperId)}/star`,
        {
          method: paper.starred ? "DELETE" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
      const data = await res.json();
      // Reconcile with server state
      setPapers((prev) =>
        prev.map((p) =>
          p.id === paperId
            ? { ...p, starred: data.starred, star_count: data.star_count }
            : p
        )
      );
    } catch {
      // Revert on error
      setPapers((prev) =>
        prev.map((p) =>
          p.id === paperId
            ? { ...p, starred: paper.starred, star_count: paper.star_count }
            : p
        )
      );
    }
  };

  const filteredPapers = searchDebounced
    ? papers.filter((p) => {
        const q = searchDebounced.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          (p.authors as string[])?.some((a) => a.toLowerCase().includes(q)) ||
          (p.categories as string[])?.some((c) => c.toLowerCase().includes(q))
        );
      })
    : papers;

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
              placeholder={tab === "papers" ? "Search papers..." : "Search users..."}
              className="w-full bg-bg border border-border pl-9 pr-4 py-2 text-xs text-text focus:outline-none focus:border-border-hover transition-all"
            />
          </div>
        </div>

        {/* Bottom row: tabs + sort */}
        <div className="flex items-center justify-between px-4 sm:px-6 pb-2 gap-2">
          {/* Tabs */}
          <div className="flex border border-border">
            {user && (
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
            )}
            <button
              onClick={() => setTab("papers")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase transition-colors ${
                tab === "papers"
                  ? "bg-accent text-bg"
                  : "text-text-dim hover:text-text"
              }`}
            >
              <FileText size={10} />
              Papers
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

          {/* Sort (papers only) */}
          {tab === "papers" && (
            <div className="flex items-center gap-1 sm:gap-2">
              {(["trending", "recent", "stars"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 text-[10px] tracking-wider uppercase border transition-colors ${
                    sort === s
                      ? "border-accent text-accent"
                      : "border-border text-text-dim hover:text-text hover:border-border-hover"
                  }`}
                >
                  {s === "trending" && <TrendingUp size={10} />}
                  {s === "recent" && <Clock size={10} />}
                  {s === "stars" && <Star size={10} />}
                  <span className="hidden sm:inline">{s}</span>
                </button>
              ))}
            </div>
          )}
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
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === "papers" ? (
          filteredPapers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-dim text-xs tracking-wider">
                {searchDebounced ? "No papers match your search" : "No public papers yet"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPapers.map((paper) => (
                <div
                  key={paper.id}
                  className="border border-border p-3 sm:p-4 hover:border-border-hover transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleToggleStar(paper.id)}
                      className={`mt-0.5 shrink-0 flex flex-col items-center gap-0.5 transition-colors ${
                        paper.starred
                          ? "text-yellow-400"
                          : "text-text-dim hover:text-text"
                      }`}
                    >
                      <Star
                        size={16}
                        fill={paper.starred ? "currentColor" : "none"}
                      />
                      <span className="text-[9px]">{paper.star_count}</span>
                    </button>

                    <Link href={`/paper/${encodeURIComponent(paper.id)}`} className="flex-1 min-w-0">
                      <h3 className="text-xs sm:text-sm font-medium text-accent leading-tight hover:underline">
                        {decodeEntities(paper.title)}
                      </h3>
                      <p className="text-[10px] text-text-muted mt-1 truncate">
                        {(paper.authors as string[])?.slice(0, 3).join(", ")}
                        {(paper.authors as string[])?.length > 3 && " et al."}
                      </p>

                      {paper.bs_score && (
                        <div className="flex items-center gap-3 mt-2">
                          {paper.bs_score.interesting != null && (
                            <span className="text-[9px] tracking-wider">
                              <span className="text-text-dim">INTERESTING </span>
                              <span
                                style={{
                                  color:
                                    paper.bs_score.interesting >= 80
                                      ? "#8bf7c4"
                                      : paper.bs_score.interesting >= 60
                                        ? "#b8f78b"
                                        : "#f7e88b",
                                }}
                              >
                                {paper.bs_score.interesting}
                              </span>
                            </span>
                          )}
                          {paper.bs_score.overall != null && (
                            <span className="text-[9px] tracking-wider">
                              <span className="text-text-dim">LEGIT </span>
                              <span
                                style={{
                                  color:
                                    100 - paper.bs_score.overall >= 80
                                      ? "#8bf7c4"
                                      : 100 - paper.bs_score.overall >= 60
                                        ? "#b8f78b"
                                        : "#f7e88b",
                                }}
                              >
                                {100 - paper.bs_score.overall}
                              </span>
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                        {(paper.categories as string[])
                          ?.slice(0, 2)
                          .map((cat) => (
                            <span
                              key={cat}
                              className="text-[9px] text-text-dim border border-border px-1.5 py-0.5"
                            >
                              {humanCategory(cat)}
                            </span>
                          ))}
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
                      </div>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
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
