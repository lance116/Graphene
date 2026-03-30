"use client";

import { useState, useEffect, use } from "react";
import { useAuth } from "@/components/AuthProvider";
import { humanCategory } from "@/lib/categories";
import { decodeEntities } from "@/lib/entities";
import {
  ArrowLeft,
  Star,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
} from "lucide-react";
import Link from "next/link";

export default function PublicPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, getToken } = useAuth();
  const [paper, setPaper] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starred, setStarred] = useState(false);
  const [starCount, setStarCount] = useState(0);
  const [starLoading, setStarLoading] = useState(false);
  const [inLibrary, setInLibrary] = useState(false);
  const [addingToLibrary, setAddingToLibrary] = useState(false);

  useEffect(() => {
    const fetchPaper = async () => {
      try {
        const res = await fetch(`/api/papers/${encodeURIComponent(id)}/public`);
        if (res.ok) {
          const data = await res.json();
          setPaper(data.paper);
          setInLibrary(data.in_library || false);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchPaper();
  }, [id]);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const token = user ? await getToken() : null;
        const res = await fetch(`/api/papers/${encodeURIComponent(id)}/star`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setStarred(data.starred);
        setStarCount(data.star_count);
      } catch {}
    };
    fetchStars();
  }, [id, user]);

  const handleToggleStar = async () => {
    if (!user || starLoading) return;
    setStarLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/papers/${encodeURIComponent(id)}/star`, {
        method: starred ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      setStarred(data.starred);
      setStarCount(data.star_count);
    } catch {} finally {
      setStarLoading(false);
    }
  };

  const handleAddToLibrary = async () => {
    if (!user || addingToLibrary || inLibrary) return;
    setAddingToLibrary(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/papers/${encodeURIComponent(id)}/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.ok) setInLibrary(true);
    } catch {} finally {
      setAddingToLibrary(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-text-dim" />
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-text-dim text-xs tracking-wider">Paper not found</p>
          <Link href="/explore" className="text-accent text-xs mt-2 inline-block hover:underline">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  const bs = paper.bs_score;

  return (
    <div className="min-h-screen bg-bg">
      <header className="h-14 border-b border-border flex items-center justify-between px-4 sm:px-6 bg-surface">
        <Link href="/explore" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <ArrowLeft size={14} className="text-text-dim" />
          <img src="/graphene.png" alt="Graphene" className="w-6 h-6 invert" />
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleStar}
            disabled={starLoading || !user}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border transition-colors ${
              starred
                ? "border-yellow-500/50 text-yellow-400"
                : "border-border text-text-dim hover:text-text hover:border-border-hover"
            }`}
          >
            <Star size={10} fill={starred ? "currentColor" : "none"} />
            {starCount > 0 ? starCount : "Star"}
          </button>
          {user && (
            <button
              onClick={handleAddToLibrary}
              disabled={addingToLibrary || inLibrary}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border transition-colors ${
                inLibrary
                  ? "border-accent text-accent"
                  : "border-border text-text-dim hover:text-text hover:border-border-hover"
              }`}
            >
              <Plus size={10} />
              {inLibrary ? "In Library" : "Add to Library"}
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        {/* Title + Authors */}
        <h1 className="text-lg sm:text-xl font-medium text-accent leading-tight">
          {decodeEntities(paper.title)}
        </h1>
        <p className="text-xs text-text-muted mt-2">
          {(() => {
            const authors = paper.authors as string[];
            if (!authors || authors.length === 0) return "Unknown";
            return authors.join(", ");
          })()}
        </p>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {(paper.categories as string[])?.map((cat: string) => (
            <span key={cat} className="text-[9px] border border-border px-2 py-0.5 text-text-dim">
              {humanCategory(cat)}
            </span>
          ))}
          {paper.published && (
            <span className="text-[9px] text-text-dim">
              {new Date(paper.published).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </span>
          )}
          {paper.pdf_url && (
            <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[9px] text-text-dim hover:text-accent transition-colors">
              <FileText size={9} /> PDF
            </a>
          )}
          {paper.source_url && (
            <a href={paper.source_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[9px] text-text-dim hover:text-accent transition-colors">
              <ExternalLink size={9} /> Source
            </a>
          )}
        </div>

        {/* Scores */}
        {bs && bs.interesting != null && (
          <div className="flex gap-3 mt-6">
            <div className="flex-1 border border-border p-4 text-center">
              <p className="text-[9px] text-text-dim tracking-[0.2em] uppercase mb-1">Interesting</p>
              <p className="text-3xl font-bold" style={{
                color: bs.interesting >= 80 ? "#8bf7c4"
                  : bs.interesting >= 60 ? "#b8f78b"
                  : bs.interesting >= 40 ? "#f7e88b"
                  : "#666666"
              }}>
                {bs.interesting}
              </p>
              <p className="text-[9px] text-text-dim mt-1 italic leading-tight">
                {decodeEntities(bs.interesting_why || "")}
              </p>
            </div>
            <div className="flex-1 border border-border p-4 text-center flex flex-col justify-center">
              <p className="text-[9px] text-text-dim tracking-[0.2em] uppercase mb-1">Legitness</p>
              {(() => {
                const legit = 100 - bs.overall;
                return (
                  <>
                    <p className="text-3xl font-bold" style={{
                      color: legit >= 80 ? "#8bf7c4"
                        : legit >= 60 ? "#b8f78b"
                        : legit >= 40 ? "#f7e88b"
                        : legit >= 20 ? "#f7a08b"
                        : "#f78b8b"
                    }}>
                      {legit}
                    </p>
                    <p className="text-[9px] text-text-dim mt-1 italic leading-tight">
                      {decodeEntities(bs.legitness_why || "") || (legit >= 85 ? "Seminal"
                        : legit >= 70 ? "Legit"
                        : legit >= 50 ? "Decent"
                        : legit >= 30 ? "Questionable"
                        : legit >= 15 ? "Sussy"
                        : "Pure BS")}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Breakdown */}
        {bs && (
          <div className="mt-6">
            <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">Breakdown</h3>
            <div className="border border-border p-4 space-y-2">
              {bs.verdict && (
                <p className="text-xs text-text italic mb-3">
                  &quot;{decodeEntities(bs.verdict)}&quot;
                </p>
              )}
              <div className="space-y-2">
                {[
                  ["Honesty", 100 - (bs.overclaiming || 0), "Claims match evidence"],
                  ["Rigor", 100 - (bs.rigor || 0), "Methodology & baselines"],
                  ["Novelty", 100 - (bs.novelty || 0), "Original ideas"],
                  ["Credibility", 100 - (bs.credibility || 0), "Authors & institution"],
                  ["Reproducibility", 100 - (bs.reproducibility || 0), "Code, data, clarity"],
                ].map(([label, val, desc]) => (
                  <div key={label as string}>
                    <div className="flex items-center justify-between text-[9px] mb-0.5">
                      <span className="text-text">{label}</span>
                      <span style={{
                        color: (val as number) >= 75 ? "#8bf7c4"
                          : (val as number) >= 50 ? "#f7e88b"
                          : (val as number) >= 25 ? "#f7a08b"
                          : "#f78b8b"
                      }}>{val}</span>
                    </div>
                    <div className="h-1 bg-surface-2 w-full">
                      <div className="h-full transition-all" style={{
                        width: `${val}%`,
                        background: (val as number) >= 75 ? "#8bf7c4"
                          : (val as number) >= 50 ? "#f7e88b"
                          : (val as number) >= 25 ? "#f7a08b"
                          : "#f78b8b"
                      }} />
                    </div>
                    <p className="text-[8px] text-text-dim">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI Summary */}
        {paper.summary && (
          <div className="mt-6">
            <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">AI Summary</h3>
            <div
              className="text-xs text-text leading-relaxed border-l-2 border-border pl-4"
              dangerouslySetInnerHTML={{
                __html: paper.summary
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text">$1</strong>')
                  .replace(/\*(.*?)\*/g, "<em>$1</em>")
                  .replace(/^[•\-]\s*/gm, "")
                  .split("\n")
                  .filter((l: string) => l.trim())
                  .map((l: string) => `<p style="margin-bottom: 8px">${l.trim()}</p>`)
                  .join(""),
              }}
            />
          </div>
        )}

        {/* Abstract */}
        {paper.abstract && (
          <div className="mt-6">
            <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">Abstract</h3>
            <p className="text-xs text-text leading-relaxed">
              {decodeEntities(paper.abstract)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
