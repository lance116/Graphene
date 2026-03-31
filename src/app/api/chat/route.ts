import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { chatAboutPaper } from "@/lib/ai";
import { getUser } from "@/lib/auth";

// Cache extracted text per paper to avoid re-fetching PDF every message
const textCache = new Map<string, { text: string; ts: number }>();

async function getPaperText(paper: Record<string, unknown>): Promise<string> {
  const id = paper.id as string;
  const cached = textCache.get(id);
  if (cached && Date.now() - cached.ts < 1000 * 60 * 30) return cached.text;

  const isArxiv = !id.startsWith("web-") && !id.startsWith("bib-");
  let extractedText = "";

  try {
    // Try HTML first for arXiv
    if (isArxiv) {
      const htmlRes = await fetch(`https://arxiv.org/html/${id}`, { signal: AbortSignal.timeout(8000) });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        if (!html.includes("No HTML for") && !html.includes("HTML is not available")) {
          extractedText = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
      }
    }

    // Fall back to PDF
    if (extractedText.length < 500) {
      const pdfUrl = isArxiv
        ? `https://arxiv.org/pdf/${id}`
        : (paper.pdf_url || paper.source_url) as string;
      if (pdfUrl) {
        const pdfRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(15000) });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const pdfParse = await import("pdf-parse");
          const parse = typeof pdfParse === "function" ? pdfParse : (pdfParse as { default: Function }).default;
          const pdfData = await (parse as (buf: Buffer) => Promise<{ text: string }>)(buffer);
          extractedText = pdfData.text;
        }
      }
    }
  } catch {}

  const text = extractedText.slice(0, 20000);
  textCache.set(id, { text, ts: Date.now() });
  // Keep cache small
  if (textCache.size > 50) {
    const oldest = [...textCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) textCache.delete(oldest[0]);
  }
  return text;
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { paperId, question, history } = await req.json();

  if (!paperId || !question) {
    return NextResponse.json({ error: "paperId and question required" }, { status: 400 });
  }

  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", paperId)
    .single();

  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  // Fetch paper text and other papers in parallel
  const [paperText, otherPapersResult] = await Promise.all([
    getPaperText(paper),
    supabase
      .from("user_papers")
      .select("papers(id, title, categories, summary)")
      .eq("user_id", user.id)
      .neq("paper_id", paperId)
      .limit(30),
  ]);

  const libraryPapers = (otherPapersResult.data || [])
    .map((up: Record<string, unknown>) => up.papers as { id: string; title: string; categories: string[]; summary: string | null } | null)
    .filter((p): p is { id: string; title: string; categories: string[]; summary: string | null } => p !== null);

  const answer = await chatAboutPaper(
    paper,
    (history || []) as { role: "user" | "assistant"; content: string }[],
    question,
    libraryPapers,
    paperText
  );

  return NextResponse.json({ answer });
}
