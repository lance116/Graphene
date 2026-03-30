import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";
import { fetchArxivPaper } from "@/lib/arxiv";
import { BibtexEntry, deriveUrl, isArxivEntry } from "@/lib/bibtex";

type ImportedPaper = {
  id: string;
  title: string;
  source: "arxiv" | "bibtex";
  alreadyExists: boolean;
};

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const entries: BibtexEntry[] = body.entries;

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "No BibTeX entries provided" }, { status: 400 });
  }

  const imported: ImportedPaper[] = [];
  const errors: { key: string; error: string }[] = [];

  for (const entry of entries) {
    try {
      if (isArxivEntry(entry)) {
        const arxivId = entry.eprint || extractArxivId(entry.url);
        if (arxivId) {
          const result = await importViaArxiv(arxivId, user.id);
          imported.push({ ...result, source: "arxiv" });
          continue;
        }
      }

      const result = await importFromBibtex(entry, user.id);
      imported.push({ ...result, source: "bibtex" });
    } catch (e) {
      errors.push({
        key: entry.key,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ imported, errors });
}

async function importViaArxiv(
  arxivId: string,
  userId: string
): Promise<{ id: string; title: string; alreadyExists: boolean }> {
  const paper = await fetchArxivPaper(arxivId);
  if (!paper) throw new Error("Paper not found on arXiv");

  const { data: existing } = await supabase
    .from("papers")
    .select("id, title, summary")
    .eq("id", paper.id)
    .single();

  let alreadyEnriched = false;

  if (existing) {
    alreadyEnriched = !!existing.summary;
  } else {
    await supabase.from("papers").insert({
      id: paper.id,
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      published: paper.published,
      source_url: paper.sourceUrl,
      pdf_url: paper.pdfUrl,
      categories: paper.categories,
      is_public: true,
    });
  }

  const { data: existingLink } = await supabase
    .from("user_papers")
    .select("id")
    .eq("user_id", userId)
    .eq("paper_id", paper.id)
    .maybeSingle();

  if (!existingLink) {
    await supabase.from("user_papers").insert({
      user_id: userId,
      paper_id: paper.id,
    });
  }

  return {
    id: paper.id,
    title: paper.title,
    alreadyExists: alreadyEnriched || !!existingLink,
  };
}

async function importFromBibtex(
  entry: BibtexEntry,
  userId: string
): Promise<{ id: string; title: string; alreadyExists: boolean }> {
  const sourceUrl = deriveUrl(entry);

  if (sourceUrl) {
    const { data: existing } = await supabase
      .from("papers")
      .select("id, title")
      .eq("source_url", sourceUrl)
      .maybeSingle();

    if (existing) {
      const { data: existingLink } = await supabase
        .from("user_papers")
        .select("id")
        .eq("user_id", userId)
        .eq("paper_id", existing.id)
        .maybeSingle();

      if (!existingLink) {
        await supabase.from("user_papers").insert({
          user_id: userId,
          paper_id: existing.id,
        });
      }

      return { id: existing.id, title: existing.title, alreadyExists: true };
    }
  }

  let published: string | null = null;
  if (entry.year) {
    const monthNum = parseMonth(entry.month);
    published = `${entry.year}-${monthNum}-01T00:00:00Z`;
  }

  const id = `bib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { error: insertError } = await supabase.from("papers").insert({
    id,
    title: entry.title,
    authors: entry.authors,
    abstract: entry.abstract,
    published,
    source_url: sourceUrl,
    pdf_url: null,
    categories: entry.primaryclass ? [entry.primaryclass] : [],
    is_public: true,
  });

  if (insertError) throw new Error(insertError.message);

  await supabase.from("user_papers").insert({
    user_id: userId,
    paper_id: id,
  });

  return { id, title: entry.title, alreadyExists: false };
}

function extractArxivId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,6})/);
  return match ? match[1] : null;
}

function parseMonth(month: string | null): string {
  if (!month) return "01";
  const map: Record<string, string> = {
    jan: "01", january: "01", "1": "01",
    feb: "02", february: "02", "2": "02",
    mar: "03", march: "03", "3": "03",
    apr: "04", april: "04", "4": "04",
    may: "05", "5": "05",
    jun: "06", june: "06", "6": "06",
    jul: "07", july: "07", "7": "07",
    aug: "08", august: "08", "8": "08",
    sep: "09", september: "09", "9": "09",
    oct: "10", october: "10", "10": "10",
    nov: "11", november: "11", "11": "11",
    dec: "12", december: "12", "12": "12",
  };
  return map[month.toLowerCase()] || "01";
}
