"use client";

import { useState, useRef } from "react";
import { X, Plus, Search, Loader2, ExternalLink, Upload, FileText } from "lucide-react";
import { parseBibtex, BibtexEntry } from "@/lib/bibtex";

type ArxivResult = {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  categories: string[];
  pdfUrl: string;
  sourceUrl: string;
};

export default function AddPaperModal({
  isOpen,
  onClose,
  onAdd,
  onImportBibtex,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (url: string) => Promise<void>;
  onImportBibtex: (entries: BibtexEntry[]) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ArxivResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"url" | "search" | "bibtex">("url");

  const [bibtexInput, setBibtexInput] = useState("");
  const [parsedEntries, setParsedEntries] = useState<BibtexEntry[]>([]);
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmitUrl = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onAdd(url.trim());
      setUrl("");
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add paper");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setError("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAddFromSearch = async (result: ArxivResult) => {
    setAdding(result.id);
    try {
      await onAdd(result.sourceUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(null);
    }
  };

  const handleParseBibtex = (text: string) => {
    setBibtexInput(text);
    setParseError("");
    if (!text.trim()) {
      setParsedEntries([]);
      return;
    }
    try {
      const entries = parseBibtex(text);
      if (entries.length === 0) {
        setParseError("No valid BibTeX entries found");
      }
      setParsedEntries(entries);
    } catch {
      setParseError("Failed to parse BibTeX");
      setParsedEntries([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      handleParseBibtex(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    if (parsedEntries.length === 0) return;
    setLoading(true);
    setError("");
    try {
      await onImportBibtex(parsedEntries);
      setBibtexInput("");
      setParsedEntries([]);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to import");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-surface border border-border animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-medium tracking-widest uppercase text-accent">
            Add Paper
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-2 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab("url")}
            className={`flex-1 px-4 py-3 text-xs tracking-widest uppercase transition-colors ${
              tab === "url"
                ? "text-accent border-b border-accent"
                : "text-text-muted hover:text-text"
            }`}
          >
            Paste URL
          </button>
          <button
            onClick={() => setTab("search")}
            className={`flex-1 px-4 py-3 text-xs tracking-widest uppercase transition-colors ${
              tab === "search"
                ? "text-accent border-b border-accent"
                : "text-text-muted hover:text-text"
            }`}
          >
            Search arXiv
          </button>
          <button
            onClick={() => setTab("bibtex")}
            className={`flex-1 px-4 py-3 text-xs tracking-widest uppercase transition-colors ${
              tab === "bibtex"
                ? "text-accent border-b border-accent"
                : "text-text-muted hover:text-text"
            }`}
          >
            Import BibTeX
          </button>
        </div>

        <div className="p-6">
          {tab === "url" ? (
            <div>
              <label className="block text-xs text-text-muted mb-2 tracking-wider uppercase">
                Paper URL (arXiv, PDF, or any webpage)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmitUrl()}
                  placeholder="https://arxiv.org/abs/... or any PDF URL"
                  autoFocus
                  className="flex-1 bg-bg border border-border px-4 py-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-border-hover"
                />
                <button
                  onClick={handleSubmitUrl}
                  disabled={loading || !url.trim()}
                  className="px-4 py-3 bg-accent text-bg text-xs font-medium tracking-wider uppercase hover:bg-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  Add
                </button>
              </div>
            </div>
          ) : tab === "search" ? (
            <div>
              <label className="block text-xs text-text-muted mb-2 tracking-wider uppercase">
                Search Query
              </label>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="transformer attention mechanism..."
                  className="flex-1 bg-bg border border-border px-4 py-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-border-hover"
                />
                <button
                  onClick={handleSearch}
                  disabled={loading || !searchQuery.trim()}
                  className="px-4 py-3 bg-accent text-bg text-xs font-medium tracking-wider uppercase hover:bg-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {loading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Search size={14} />
                  )}
                  Search
                </button>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto space-y-1">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className="p-3 border border-border hover:border-border-hover transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm text-text font-medium leading-tight truncate">
                          {result.title}
                        </h3>
                        <p className="text-xs text-text-muted mt-1 truncate">
                          {result.authors.slice(0, 3).join(", ")}
                          {result.authors.length > 3 && ` +${result.authors.length - 3}`}
                        </p>
                        <p className="text-xs text-text-dim mt-1 line-clamp-2">
                          {result.abstract.slice(0, 150)}...
                        </p>
                      </div>
                      <button
                        onClick={() => handleAddFromSearch(result)}
                        disabled={adding === result.id}
                        className="shrink-0 px-3 py-1.5 border border-border text-xs tracking-wider uppercase hover:bg-accent hover:text-bg hover:border-accent disabled:opacity-30 transition-colors"
                      >
                        {adding === result.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          "Add"
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-text-muted tracking-wider uppercase">
                  Paste BibTeX or upload .bib file
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs tracking-wider uppercase hover:bg-surface-2 transition-colors"
                >
                  <Upload size={12} />
                  Upload .bib
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".bib,.bibtex,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              <textarea
                value={bibtexInput}
                onChange={(e) => handleParseBibtex(e.target.value)}
                placeholder={`@article{doe2024example,
  title={Example Paper Title},
  author={Doe, Jane and Smith, John},
  journal={Nature},
  year={2024},
  doi={10.1234/example}
}`}
                rows={8}
                className="w-full bg-bg border border-border px-4 py-3 text-sm text-text font-mono placeholder:text-text-dim focus:outline-none focus:border-border-hover resize-none"
              />

              {parseError && (
                <p className="text-xs text-red-400 mt-2 tracking-wider">{parseError}</p>
              )}

              {parsedEntries.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-text-muted mb-2 tracking-wider">
                    {parsedEntries.length} {parsedEntries.length === 1 ? "entry" : "entries"} found
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1 mb-3">
                    {parsedEntries.map((entry, i) => (
                      <div
                        key={`${entry.key}-${i}`}
                        className="flex items-start gap-2 p-2 border border-border"
                      >
                        <FileText size={14} className="shrink-0 mt-0.5 text-text-muted" />
                        <div className="min-w-0">
                          <p className="text-sm text-text truncate">{entry.title}</p>
                          <p className="text-xs text-text-muted truncate">
                            {entry.authors.slice(0, 3).join(", ")}
                            {entry.authors.length > 3 && ` +${entry.authors.length - 3}`}
                            {entry.year && ` (${entry.year})`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleImport}
                    disabled={loading}
                    className="w-full px-4 py-3 bg-accent text-bg text-xs font-medium tracking-wider uppercase hover:bg-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Plus size={14} />
                    )}
                    Import {parsedEntries.length} {parsedEntries.length === 1 ? "Paper" : "Papers"}
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 mt-3 tracking-wider">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
