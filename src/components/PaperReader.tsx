"use client";

import { Paper } from "@/lib/supabase";
import { FileText } from "lucide-react";
import { PDFViewer } from "@embedpdf/react-pdf-viewer";

export default function PaperReader({ paper }: { paper: Paper }) {
  // Proxy all PDFs through our API to avoid CORS issues
  const pdfUrl = `/api/papers/${encodeURIComponent(paper.id)}/viewer?pdf=1`;

  return (
    <div className="w-full h-full">
      <PDFViewer
        config={{
          src: pdfUrl,
          theme: {
            preference: "dark",
          },
        }}
        className="w-full h-full"
      />
    </div>
  );
}
