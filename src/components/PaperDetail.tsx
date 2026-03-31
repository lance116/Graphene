"use client";

import { useState, useRef, useEffect } from "react";
import { Paper, ChatMessage } from "@/lib/supabase";
import { humanCategory } from "@/lib/categories";
import { decodeEntities } from "@/lib/entities";
import {
  X,
  BookOpen,
  Check,
  ExternalLink,
  FileText,
  Send,
  Loader2,
  MessageSquare,
  StickyNote,
  Star,
  Globe,
  Lock,
  Award,
  Trash2,
  Sparkles,
} from "lucide-react";

export default function PaperDetail({
  paper,
  messages: initialMessages,
  onClose,
  onToggleRead,
  onUpdateNotes,
  onTogglePublic,
  onDelete,
  onEnrich,
  getToken,
  isVerified,
}: {
  paper: Paper;
  messages: ChatMessage[];
  onClose: () => void;
  onToggleRead: () => void;
  onUpdateNotes: (notes: string) => void;
  onTogglePublic?: () => void;
  onDelete?: () => void;
  onEnrich?: () => void;
  getToken?: () => Promise<string | null>;
  isVerified?: boolean;
}) {
  const [tab, setTab] = useState<"overview" | "chat" | "notes">("overview");
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [notes, setNotes] = useState(paper.notes || "");
  const [starred, setStarred] = useState(false);
  const [starCount, setStarCount] = useState(0);
  const [starLoading, setStarLoading] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch star status + claim status
  useEffect(() => {
    const fetchStars = async () => {
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch(`/api/papers/${encodeURIComponent(paper.id)}/star`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setStarred(data.starred);
        setStarCount(data.star_count);
      } catch {}
    };
    fetchStars();
    // Check if user has claimed this paper
    if (isVerified) {
      (async () => {
        try {
          const token = getToken ? await getToken() : null;
          const res = await fetch(`/api/papers/${encodeURIComponent(paper.id)}/claim`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const data = await res.json();
            setClaimed(data.claimed);
          }
        } catch {}
      })();
    }
  }, [paper.id, getToken, isVerified]);

  const handleToggleStar = async () => {
    if (starLoading) return;
    setStarLoading(true);
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch(`/api/papers/${encodeURIComponent(paper.id)}/star`, {
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

  const handleToggleClaim = async () => {
    if (claimLoading) return;
    setClaimLoading(true);
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch(`/api/papers/${encodeURIComponent(paper.id)}/claim`, {
        method: claimed ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      setClaimed(data.claimed);
    } catch {} finally {
      setClaimLoading(false);
    }
  };

  // Reset chat and notes when paper changes
  useEffect(() => {
    setMessages([]);
    setNotes(paper.notes || "");
    setQuestion("");
    setTab("overview");
  }, [paper.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAsk = async () => {
    if (!question.trim() || chatLoading) return;
    const q = question.trim();
    setQuestion("");
    setChatLoading(true);

    // Optimistic user message
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      paper_id: paper.id,
      role: "user",
      content: q,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          paperId: paper.id,
          question: q,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: `temp-${Date.now() + 1}`,
        paper_id: paper.id,
        role: "assistant",
        content: data.answer,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          paper_id: paper.id,
          role: "assistant",
          content: "Failed to get response. Try again.",
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveNotes = () => {
    onUpdateNotes(notes);
  };

  return (
    <div className="h-full flex flex-col bg-surface animate-slide-in">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium text-accent leading-tight">
              {decodeEntities(paper.title)}
            </h2>
            <p className="text-[10px] text-text mt-1 line-clamp-2">
              {(() => {
                const authors = paper.authors as string[];
                if (!authors || authors.length === 0) return "Unknown";
                if (authors.length <= 5) return authors.join(", ");
                return authors.slice(0, 5).join(", ") + ` +${authors.length - 5} more`;
              })()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-2 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={handleToggleStar}
            disabled={starLoading}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border whitespace-nowrap transition-colors ${
              starred
                ? "border-yellow-500/50 text-yellow-400"
                : "border-border text-text hover:border-border-hover"
            }`}
          >
            <Star size={10} fill={starred ? "currentColor" : "none"} />
            {starCount > 0 ? starCount : "Star"}
          </button>
          <button
            onClick={onToggleRead}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border whitespace-nowrap transition-colors ${
              paper.is_read
                ? "border-accent text-accent"
                : "border-border text-text hover:border-border-hover"
            }`}
          >
            {paper.is_read ? <Check size={10} /> : <BookOpen size={10} />}
            {paper.is_read ? "Read" : "Mark Read"}
          </button>
          {onTogglePublic && (
            <button
              onClick={onTogglePublic}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border whitespace-nowrap transition-colors ${
                (paper as any).is_public
                  ? "border-accent text-accent"
                  : "border-border text-text hover:border-border-hover"
              }`}
              title={(paper as any).is_public ? "Paper is public" : "Make paper public"}
            >
              {(paper as any).is_public ? <Globe size={10} /> : <Lock size={10} />}
              {(paper as any).is_public ? "Public" : "Private"}
            </button>
          )}
          {onEnrich && !paper.summary && (
            <button
              onClick={onEnrich}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border border-accent/50 text-accent hover:bg-accent hover:text-bg whitespace-nowrap transition-colors"
            >
              <Sparkles size={10} />
              AI Review
            </button>
          )}
          {isVerified && (
            <button
              onClick={handleToggleClaim}
              disabled={claimLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border whitespace-nowrap transition-colors ${
                claimed
                  ? "border-blue-500/50 text-blue-400"
                  : "border-border text-text hover:border-border-hover"
              }`}
            >
              <Award size={10} />
              {claimed ? "Claimed" : "Claim"}
            </button>
          )}
          {paper.pdf_url && (
            <a
              href={paper.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border border-border text-text hover:border-border-hover whitespace-nowrap transition-colors"
            >
              <FileText size={10} />
              PDF
            </a>
          )}
          {paper.source_url && (
            <a
              href={paper.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border border-border text-text hover:border-border-hover whitespace-nowrap transition-colors"
            >
              <ExternalLink size={10} />
              Source
            </a>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase border border-border text-red-400/70 hover:text-red-400 hover:border-red-400/50 whitespace-nowrap transition-colors"
            >
              <Trash2 size={10} />
              Remove
            </button>
          )}
        </div>

        {/* Detail tabs */}
        <div className="flex gap-0 mt-3 -mb-4 border-b border-border -mx-5 px-5">
          {(["overview", "chat", "notes"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[10px] tracking-[0.2em] uppercase transition-colors ${
                tab === t
                  ? "text-accent border-b border-accent"
                  : "text-text hover:text-text"
              }`}
            >
              {t === "chat" && <MessageSquare size={10} />}
              {t === "notes" && <StickyNote size={10} />}
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && (
          <div className="p-5 space-y-4">
            {/* Categories */}
            {(paper.categories as string[])?.length > 0 && (
              <div>
                <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">
                  Categories
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {(paper.categories as string[]).map((cat) => (
                    <span
                      key={cat}
                      className="text-[10px] border border-border px-2 py-1 text-text"
                    >
                      {humanCategory(cat)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Published */}
            {paper.published && (
              <div>
                <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-1">
                  Published
                </h3>
                <p className="text-xs text-text">
                  {new Date(paper.published).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            )}

            {/* Interesting + BS Scores side by side */}
            {(paper as any).bs_score && (paper as any).bs_score.interesting != null && (
              <div className="flex gap-3">
                <div className="flex-1 border border-border p-3 text-center flex flex-col justify-center">
                  <p className="text-[9px] text-text-dim tracking-[0.2em] uppercase mb-1">Interesting</p>
                  <p className="text-2xl font-bold" style={{
                    color: (paper as any).bs_score.interesting >= 80 ? "#8bf7c4"
                      : (paper as any).bs_score.interesting >= 60 ? "#b8f78b"
                      : (paper as any).bs_score.interesting >= 40 ? "#f7e88b"
                      : "#666666"
                  }}>
                    {(paper as any).bs_score.interesting}
                  </p>
                  <p className="text-[9px] text-text-dim mt-1 italic leading-tight">
                    {decodeEntities((paper as any).bs_score.interesting_why || "")}
                  </p>
                </div>
                <div className="flex-1 border border-border p-3 text-center flex flex-col justify-center">
                  <p className="text-[9px] text-text-dim tracking-[0.2em] uppercase mb-1">Legitness</p>
                  {(() => {
                    const legit = 100 - (paper as any).bs_score.overall;
                    return (
                      <>
                        <p className="text-2xl font-bold" style={{
                          color: legit >= 80 ? "#8bf7c4"
                            : legit >= 60 ? "#b8f78b"
                            : legit >= 40 ? "#f7e88b"
                            : legit >= 20 ? "#f7a08b"
                            : "#f78b8b"
                        }}>
                          {legit}
                        </p>
                        <p className="text-[9px] text-text-dim mt-1 italic leading-tight">
                          {decodeEntities((paper as any).bs_score.legitness_why || "") || (legit >= 85 ? "Seminal"
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

            {/* BS Score Breakdown */}
            {(paper as any).bs_score && (
              <div>
                <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">
                  Breakdown
                </h3>
                <div className="border border-border p-3 space-y-2">
                  <p className="text-[10px] text-text italic">
                    &quot;{decodeEntities((paper as any).bs_score.verdict || "")}&quot;
                  </p>
                  <div className="space-y-1.5 mt-2">
                    {[
                      ["Honesty", 100 - ((paper as any).bs_score.overclaiming || 0), "Claims match evidence"],
                      ["Rigor", 100 - ((paper as any).bs_score.rigor || 0), "Methodology & baselines"],
                      ["Novelty", 100 - ((paper as any).bs_score.novelty || 0), "Original ideas"],
                      ["Credibility", 100 - ((paper as any).bs_score.credibility || 0), "Authors & institution"],
                      ["Reproducibility", 100 - ((paper as any).bs_score.reproducibility || 0), "Code, data, clarity"],
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
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${val}%`,
                              background: (val as number) >= 75 ? "#8bf7c4"
                                : (val as number) >= 50 ? "#f7e88b"
                                : (val as number) >= 25 ? "#f7a08b"
                                : "#f78b8b"
                            }}
                          />
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
              <div>
                <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">
                  AI Summary
                </h3>
                <div
                  className="text-xs text-text leading-relaxed border-l-2 border-border pl-3 summary-content"
                  dangerouslySetInnerHTML={{
                    __html: paper.summary
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text">$1</strong>')
                      .replace(/\*(.*?)\*/g, "<em>$1</em>")
                      .replace(/^[•\-]\s*/gm, "")
                      .split("\n")
                      .filter((l) => l.trim())
                      .map((l) => `<p style="margin-bottom: 8px">${l.trim()}</p>`)
                      .join(""),
                  }}
                />
              </div>
            )}

            {/* Prerequisites */}
            {(paper as any).prerequisites?.length > 0 && (
              <div>
                <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">
                  Prerequisites
                </h3>
                <div className="space-y-2">
                  {((paper as any).prerequisites as { topic: string; why: string; difficulty: string }[]).map((p, i) => (
                    <div key={i} className="border border-border p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text font-medium">{p.topic}</span>
                        <span className={`text-[8px] tracking-wider uppercase px-1.5 py-0.5 border ${
                          p.difficulty === "basic" ? "border-green-500/30 text-green-400" :
                          p.difficulty === "intermediate" ? "border-yellow-500/30 text-yellow-400" :
                          "border-red-500/30 text-red-400"
                        }`}>{p.difficulty}</span>
                      </div>
                      <p className="text-[10px] text-text-dim mt-1">{p.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Further Reading */}
            {(paper as any).further_reading?.length > 0 && (
              <div>
                <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">
                  Further Reading
                  {(paper as any).citation_count > 0 && (
                    <span className="text-text-dim ml-2 normal-case">({(paper as any).citation_count} citations)</span>
                  )}
                </h3>
                <div className="space-y-1.5">
                  {((paper as any).further_reading as { title: string; authors: string[]; year: number; arxiv_id: string }[]).map((r, i) => (
                    <a
                      key={i}
                      href={`https://arxiv.org/abs/${r.arxiv_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block border border-border p-2.5 hover:border-border-hover transition-colors"
                    >
                      <p className="text-xs text-accent leading-tight">{r.title}</p>
                      <p className="text-[10px] text-text-dim mt-1">
                        {r.authors?.slice(0, 3).join(", ")}
                        {r.authors?.length > 3 && " et al."}
                        {r.year && ` (${r.year})`}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Abstract */}
            {paper.abstract && (
              <div>
                <h3 className="text-[10px] text-text-dim tracking-[0.2em] uppercase mb-2">
                  Abstract
                </h3>
                <p className="text-xs text-text leading-relaxed">
                  {decodeEntities(paper.abstract)}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "chat" && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare size={24} className="mx-auto text-text-dim mb-2" />
                  <p className="text-xs text-text-dim tracking-wider">
                    Ask anything about this paper
                  </p>
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "text-accent pl-4 border-l border-accent"
                      : "text-text pl-4 border-l border-border"
                  }`}
                >
                  <span className="text-[9px] text-text-dim tracking-[0.2em] uppercase block mb-1">
                    {msg.role === "user" ? "You" : "Graphene AI"}
                  </span>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-text-dim text-xs pl-4">
                  <Loader2 size={12} className="animate-spin" />
                  Thinking...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {tab === "notes" && (
          <div className="p-5">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSaveNotes}
              placeholder="Write your notes here..."
              className="w-full h-64 bg-bg border border-border p-4 text-xs text-text leading-relaxed resize-none focus:outline-none focus:border-border-hover"
            />
            <p className="text-[9px] text-text-dim mt-2 tracking-wider">
              Auto-saves on blur
            </p>
          </div>
        )}
      </div>

      {/* Chat input */}
      {tab === "chat" && (
        <div className="p-4 border-t border-border shrink-0">
          <div className="flex gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              placeholder="Ask about this paper... (Shift+Enter for new line)"
              rows={2}
              className="flex-1 bg-bg border border-border px-3 py-2 text-xs text-text placeholder:text-text-dim focus:outline-none focus:border-border-hover resize-none"
            />
            <button
              onClick={handleAsk}
              disabled={chatLoading || !question.trim()}
              className="px-3 py-2 bg-accent text-bg hover:bg-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
