"use client";

import { Paper } from "@/lib/supabase";
import { FileText } from "lucide-react";

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
    <div className="w-full h-full">
      <iframe
        src={`${pdfUrl}#toolbar=0&navpanes=0&view=FitH`}
        className="w-full h-full border-none"
        title={paper.title}
      />
    </div>
  );
}
