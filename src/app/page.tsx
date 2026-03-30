"use client";

import { useState, useEffect, useCallback } from "react";
import { Paper, PaperConnection, ChatMessage } from "@/lib/supabase";
import PaperList from "@/components/PaperList";
import PaperDetail from "@/components/PaperDetail";
import AddPaperModal from "@/components/AddPaperModal";
import {
  Plus,
  LayoutGrid,
  List,
  Loader2,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import PaperReader from "@/components/PaperReader";
import ResizeHandle from "@/components/ResizeHandle";
import PaperGraph from "@/components/PaperGraph";
import LoginPage from "@/components/LoginPage";
import { useAuth } from "@/components/AuthProvider";
import { LogOut, Compass, User } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const { user, loading: authLoading, signOut, getToken } = useAuth();

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <Loader2 size={24} className="animate-spin text-text-dim" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <AppContent user={user} signOut={signOut} getToken={getToken} />;
}

function AppContent({ user, signOut, getToken }: { user: { id: string; email?: string }; signOut: () => void; getToken: () => Promise<string | null> }) {
  // Helper for authenticated fetch
  const authFetch = async (url: string, opts: RequestInit = {}) => {
    const token = await getToken();
    return fetch(url, {
      ...opts,
      headers: {
        ...opts.headers as Record<string, string>,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };
  const [papers, setPapers] = useState<Paper[]>([]);
  const [connections, setConnections] = useState<PaperConnection[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<"graph" | "list">("graph");
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "read" | "unread">("all");
  const [searchLocal, setSearchLocal] = useState("");
  const [listWidth, setListWidth] = useState(320);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [readerCollapsed, setReaderCollapsed] = useState(false);
  const [detailWidth, setDetailWidth] = useState(420);
  const [username, setUsername] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  // Check/create profile (server auto-creates from signup metadata)
  useEffect(() => {
    const checkProfile = async () => {
      try {
        const res = await authFetch("/api/profiles/me");
        const data = await res.json();
        if (data.profile) {
          setUsername(data.profile.username);
          setIsVerified(data.profile.is_verified || false);
        }
      } catch {}
    };
    checkProfile();
  }, []);

  // Fetch all papers
  const fetchPapers = useCallback(async () => {
    try {
      const res = await authFetch(`/api/papers?user_id=${user.id}`);
      const data = await res.json();
      setPapers(data.papers || []);
      setConnections(data.connections || []);
    } catch (e) {
      console.error("Failed to fetch papers:", e);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  // Fetch single paper detail
  const selectPaper = useCallback(async (id: string) => {
    setSelectedPaperId(id);
    try {
      const res = await authFetch(`/api/papers/${encodeURIComponent(id)}`);
      const data = await res.json();
      setSelectedPaper(data.paper);
      setChatMessages(data.messages || []);
    } catch (e) {
      console.error("Failed to fetch paper:", e);
    }
  }, []);

  // Add paper
  const handleAddPaper = async (url: string) => {
    // Close modal immediately and show loading state
    setShowAddModal(false);
    setView("list");
    setAdding(true);

    try {
      const res = await authFetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("Add paper failed:", data.error);
        return;
      }

      // Show the paper
      await fetchPapers();
      setSelectedPaperId(data.paper.id);
      setSelectedPaper(data.paper);
      setChatMessages([]);

      // Enrich in the background (summary, connections) with streaming
      if (!data.alreadyExists) {
        enrichPaper(data.paper.id);
      }
    } catch (e) {
      console.error("Failed to add paper:", e);
    } finally {
      setAdding(false);
    }
  };

  const enrichPaper = (paperId: string) => {
    const evtSource = new EventSource(`/api/papers/${encodeURIComponent(paperId)}/enrich`);

    // EventSource only does GET, so use fetch with POST instead
    authFetch(`/api/papers/${encodeURIComponent(paperId)}/enrich`, { method: "POST" })
      .then(async (res) => {
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedSummary = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const eventData = JSON.parse(line.slice(6));
                // Check previous line for event type
                const eventLine = lines[lines.indexOf(line) - 1];
                const eventType = eventLine?.startsWith("event: ")
                  ? eventLine.slice(7)
                  : "";

                if (eventType === "summary_chunk") {
                  streamedSummary += eventData.text;
                  setSelectedPaper((prev) =>
                    prev && prev.id === paperId
                      ? { ...prev, summary: streamedSummary }
                      : prev
                  );
                } else if (eventType === "metadata") {
                  setSelectedPaper((prev) =>
                    prev && prev.id === paperId
                      ? { ...prev, ...eventData }
                      : prev
                  );
                  fetchPapers();
                } else if (eventType === "bs_score") {
                  setSelectedPaper((prev) =>
                    prev && prev.id === paperId
                      ? { ...prev, bs_score: eventData }
                      : prev
                  );
                } else if (eventType === "done") {
                  fetchPapers();
                }
              } catch {}
            }
          }
        }
      })
      .catch(console.error);
  };

  // Toggle read status
  const handleToggleRead = async () => {
    if (!selectedPaper) return;
    try {
      const res = await authFetch(`/api/papers/${encodeURIComponent(selectedPaper.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: !selectedPaper.is_read }),
      });
      const data = await res.json();
      setSelectedPaper(data.paper);
      fetchPapers();
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle public visibility
  const handleTogglePublic = async () => {
    if (!selectedPaper) return;
    try {
      const res = await authFetch(`/api/papers/${encodeURIComponent(selectedPaper.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: !(selectedPaper as any).is_public }),
      });
      const data = await res.json();
      setSelectedPaper(data.paper);
      fetchPapers();
    } catch (e) {
      console.error(e);
    }
  };

  // Update notes
  const handleUpdateNotes = async (notes: string) => {
    if (!selectedPaper) return;
    try {
      await authFetch(`/api/papers/${encodeURIComponent(selectedPaper.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Filter papers by local search
  const filteredPapers = papers.filter((p) => {
    if (!searchLocal) return true;
    const q = searchLocal.toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      (p.authors as string[])?.some((a) => a.toLowerCase().includes(q)) ||
      (p.categories as string[])?.some((c) => c.toLowerCase().includes(q))
    );
  });

  const stats = {
    total: papers.length,
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-surface">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView(view === "graph" ? "list" : "graph")}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img src="/graphene.png" alt="Graphene" className="w-6 h-6 invert" />
            <span className="text-sm tracking-[0.2em] uppercase text-accent" style={{ fontWeight: 800 }}>
              Graphene
            </span>
          </button>
          <span className="text-xs text-text-dim tracking-wider ml-2 hidden sm:inline">
            {adding ? (
              <span className="flex items-center gap-2">
                <Loader2 size={10} className="animate-spin" />
                Adding paper...
              </span>
            ) : (
              view === "graph" ? `${stats.total} papers — Graph view` : `${stats.total} papers — List view`
            )}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Local search */}
          <div className="relative hidden sm:block">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
            />
            <input
              type="text"
              value={searchLocal}
              onChange={(e) => setSearchLocal(e.target.value)}
              placeholder="Filter..."
              className="bg-bg border border-border pl-9 pr-4 py-2 text-xs text-text w-48 focus:outline-none focus:border-border-hover focus:w-64 transition-all"
            />
          </div>

          {/* View toggle */}
          <div className="flex border border-border">
            <button
              onClick={() => setView("graph")}
              className={`p-2.5 transition-colors ${
                view === "graph"
                  ? "bg-accent text-bg"
                  : "text-text-muted hover:text-text"
              }`}
              title="3D Graph"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-2.5 transition-colors ${
                view === "list"
                  ? "bg-accent text-bg"
                  : "text-text-muted hover:text-text"
              }`}
              title="List"
            >
              <List size={16} />
            </button>
          </div>

          {/* Add button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-bg text-xs font-medium tracking-wider uppercase hover:bg-text transition-colors"
          >
            {adding ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Add Paper
          </button>
          <Link
            href="/explore"
            className="flex items-center gap-1.5 px-3 py-2 text-[10px] tracking-wider uppercase text-text-dim hover:text-accent border border-border hover:border-border-hover transition-colors"
          >
            <Compass size={12} />
            Explore
          </Link>
          {username && (
            <Link
              href={`/profile/${username}`}
              className="flex items-center gap-1.5 px-3 py-2 text-[10px] tracking-wider uppercase text-text-dim hover:text-accent border border-border hover:border-border-hover transition-colors"
            >
              <User size={12} />
              Profile
            </Link>
          )}
          <button
            onClick={signOut}
            className="p-2.5 text-text-dim hover:text-text transition-colors"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - paper list */}
        {view === "list" && (
          <>
            <div
              style={{ width: listCollapsed ? 0 : listWidth }}
              className="shrink-0 overflow-hidden transition-[width] duration-200"
            >
              <div style={{ width: listWidth }} className="h-full">
                <PaperList
                  papers={filteredPapers}
                  selectedId={selectedPaperId}
                  onSelect={selectPaper}
                  filter={filter}
                  onFilterChange={setFilter}
                />
              </div>
            </div>
            <div className="shrink-0 flex flex-col">
              <button
                onClick={() => setListCollapsed((c) => !c)}
                className="px-1 py-2 hover:bg-surface-2 transition-colors text-text-dim hover:text-text"
                title={listCollapsed ? "Show sidebar" : "Hide sidebar"}
              >
                {listCollapsed ? (
                  <PanelLeftOpen size={14} />
                ) : (
                  <PanelLeftClose size={14} />
                )}
              </button>
              {!listCollapsed && (
                <div className="flex-1">
                  <ResizeHandle
                    onResize={(delta) =>
                      setListWidth((w) => Math.max(200, Math.min(600, w + delta)))
                    }
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Main view */}
        <div className={`relative ${view === "list" && selectedPaper && readerCollapsed ? "w-0" : "flex-1"}`}>
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-text-dim" />
            </div>
          ) : !loading && papers.length === 0 && !adding ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <img src="/graphene.png" alt="Graphene" className="w-12 h-12 invert mx-auto mb-4 opacity-40" />
                <h2 className="text-lg font-bold text-accent tracking-tight mb-2">
                  Welcome to Graphene
                </h2>
                <p className="text-xs text-text-dim leading-relaxed mb-6">
                  Add your first paper to get started. Paste an arXiv link or any PDF URL
                  and we'll pull in metadata, generate an AI summary, and score its legitimacy.
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-accent text-bg text-xs font-medium tracking-wider uppercase hover:bg-text transition-colors mx-auto"
                >
                  <Plus size={14} />
                  Add your first paper
                </button>
                <p className="text-[10px] text-text-dim mt-4">
                  Try: <button onClick={() => { navigator.clipboard.writeText("2706.03762"); setShowAddModal(true); }} className="text-accent hover:underline">2706.03762</button> (Attention Is All You Need)
                </p>
              </div>
            </div>
          ) : view === "graph" ? (
            <PaperGraph
              papers={filteredPapers}
              connections={connections}
              onSelectPaper={selectPaper}
              selectedPaperId={selectedPaperId}
            />
          ) : selectedPaper ? (
            readerCollapsed ? null : (
              <div className="w-full h-full relative">
                <PaperReader paper={selectedPaper} />
                <button
                  onClick={() => setReaderCollapsed(true)}
                  className="absolute top-3 right-3 p-1.5 bg-bg/90 backdrop-blur border border-border text-text hover:bg-surface-2 transition-colors z-10 shadow-md"
                  title="Hide reader"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>
            )
          ) : null}

          {/* Graph overlay: paper count chips */}
          {view === "graph" && papers.length > 0 && (
            <div className="absolute bottom-6 left-6 flex gap-3">
              <div className="bg-surface/80 backdrop-blur border border-border px-4 py-2 text-xs tracking-wider text-text-muted">
                {papers.length} nodes / {connections.length} edges
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedPaper && (
          <>
            <div className="shrink-0 flex flex-col">
              {view === "list" && readerCollapsed && (
                <button
                  onClick={() => setReaderCollapsed(false)}
                  className="px-1 py-2 hover:bg-surface-2 transition-colors text-text-dim hover:text-text"
                  title="Show reader"
                >
                  <PanelLeftOpen size={14} />
                </button>
              )}
              <button
                onClick={() => setDetailCollapsed((c) => !c)}
                className="px-1 py-2 hover:bg-surface-2 transition-colors text-text-dim hover:text-text"
                title={detailCollapsed ? "Show detail" : "Hide detail"}
              >
                {detailCollapsed ? (
                  <PanelRightOpen size={14} />
                ) : (
                  <PanelRightClose size={14} />
                )}
              </button>
              {!detailCollapsed && (
                <div className="flex-1">
                  <ResizeHandle
                    onResize={(delta) =>
                      setDetailWidth((w) => Math.max(280, Math.min(700, w - delta)))
                    }
                  />
                </div>
              )}
            </div>
            <div
              style={readerCollapsed && !detailCollapsed ? undefined : { width: detailCollapsed ? 0 : detailWidth }}
              className={`overflow-hidden transition-[width] duration-200 ${readerCollapsed && !detailCollapsed ? "flex-1" : "shrink-0"}`}
            >
              <div className="h-full min-w-0">
                <PaperDetail
                  paper={selectedPaper}
                  messages={chatMessages}
                  onClose={() => {
                    setSelectedPaperId(null);
                    setSelectedPaper(null);
                    setDetailCollapsed(false);
                  }}
                  onToggleRead={handleToggleRead}
                  onUpdateNotes={handleUpdateNotes}
                  onTogglePublic={handleTogglePublic}
                  getToken={getToken}
                  isVerified={isVerified}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add modal */}
      <AddPaperModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddPaper}
      />

    </div>
  );
}
