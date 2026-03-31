"use client";

import { Paper } from "@/lib/supabase";
import { FileText, ZoomIn, ZoomOut } from "lucide-react";
import {
  Root,
  Pages,
  Page,
  CanvasLayer,
  TextLayer,
  CurrentPage,
  TotalPages,
  CurrentZoom,
  ZoomIn as LectorZoomIn,
  ZoomOut as LectorZoomOut,
} from "@anaralabs/lector";
import "pdfjs-dist/web/pdf_viewer.css";

function Toolbar() {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/70 backdrop-blur text-white px-2 py-1.5 rounded shadow-lg text-xs opacity-0 hover:opacity-100 transition-opacity">
      <LectorZoomOut>
        <button className="p-1.5 hover:bg-white/10 transition-colors" title="Zoom out">
          <ZoomOut size={14} />
        </button>
      </LectorZoomOut>
      <CurrentZoom className="text-[10px] text-white/70 min-w-[40px] text-center" />
      <LectorZoomIn>
        <button className="p-1.5 hover:bg-white/10 transition-colors" title="Zoom in">
          <ZoomIn size={14} />
        </button>
      </LectorZoomIn>
      <div className="w-px h-4 bg-white/20 mx-1" />
      <div className="flex items-center gap-1 text-[10px] text-white/70">
        <CurrentPage className="w-6 text-center bg-transparent text-white/70" />
        <span>/</span>
        <TotalPages />
      </div>
    </div>
  );
}

export default function PaperReader({ paper }: { paper: Paper }) {
  const isArxiv = !paper.id.startsWith("web-") && !paper.id.startsWith("bib-");
  const pdfUrl = isArxiv
    ? `https://arxiv.org/pdf/${paper.id}`
    : paper.pdf_url || paper.source_url;

  if (!pdfUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-bg">
        <div className="text-center">
          <FileText size={32} className="mx-auto mb-3 text-text-dim" />
          <p className="text-xs text-text-dim tracking-wider uppercase">No PDF available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <Root
        source={pdfUrl}
        className="w-full h-full overflow-auto bg-bg"
        isZoomFitWidth
        loader={
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-xs text-text-dim tracking-wider">Loading PDF...</p>
          </div>
        }
      >
        <Toolbar />
        <Pages className="p-4 flex flex-col items-center gap-4">
          <Page>
            <CanvasLayer />
            <TextLayer />
          </Page>
        </Pages>
      </Root>
    </div>
  );
}
