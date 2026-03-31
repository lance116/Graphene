import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchArxivPaper } from "@/lib/arxiv";
import { getUser } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 30;

// GET all papers for the current user (joined with user_papers)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get user's paper associations
  const { data: userPapers, error: upError } = await supabase
    .from("user_papers")
    .select("*")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });

  if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });
  if (!userPapers || userPapers.length === 0) {
    return NextResponse.json({ papers: [], connections: [] });
  }

  // Get the actual papers
  const paperIds = userPapers.map((up) => up.paper_id);
  const { data: papers, error } = await supabase
    .from("papers")
    .select("*")
    .in("id", paperIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Merge user-specific data onto papers
  const userPaperMap = Object.fromEntries(userPapers.map((up) => [up.paper_id, up]));
  const merged = (papers || []).map((p) => {
    const up = userPaperMap[p.id];
    return {
      ...p,
      added_at: up?.added_at || p.added_at, // Use user's add date
      is_read: up?.is_read || false,
      read_at: up?.read_at || null,
      notes: up?.notes || "",
    };
  });

  // Sort by user's added_at
  merged.sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());

  // Get connections
  const { data: connections } = paperIds.length > 0
    ? await supabase.from("paper_connections").select("*").or(`paper_a.in.(${paperIds.join(",")}),paper_b.in.(${paperIds.join(",")})`)
    : { data: [] };

  return NextResponse.json({ papers: merged, connections: connections || [] });
}

// POST - add a paper to user's library (create shared paper if it doesn't exist)
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { url } = body;

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  try {
    const isArxiv = url.includes("arxiv.org") || /^\d{4}\.\d{4,6}/.test(url);

    if (isArxiv) {
      const paper = await fetchArxivPaper(url);
      if (!paper) {
        return NextResponse.json({ error: "Paper not found on arxiv" }, { status: 404 });
      }

      // Check if paper already exists in shared table
      const { data: existing } = await supabase
        .from("papers")
        .select("*")
        .eq("id", paper.id)
        .single();

      let paperId = paper.id;
      let paperData = existing;
      let alreadyEnriched = false;

      if (existing) {
        alreadyEnriched = !!existing.summary;
      } else {
        // Create the shared paper record
        const { data: inserted, error: insertError } = await supabase
          .from("papers")
          .insert({
            id: paper.id,
            title: paper.title,
            authors: paper.authors,
            abstract: paper.abstract,
            published: paper.published,
            source_url: paper.sourceUrl,
            pdf_url: paper.pdfUrl,
            categories: paper.categories,
            is_public: true,
          })
          .select()
          .single();

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
        paperData = inserted;
      }

      // Add to user's library (if not already there)
      const { data: existingUserPaper } = await supabase
        .from("user_papers")
        .select("id")
        .eq("user_id", user.id)
        .eq("paper_id", paperId)
        .maybeSingle();

      if (existingUserPaper) {
        return NextResponse.json({
          paper: { ...paperData, is_read: false, read_at: null, notes: "" },
          alreadyExists: true,
        });
      }

      await supabase.from("user_papers").insert({
        user_id: user.id,
        paper_id: paperId,
      });

      return NextResponse.json({
        paper: { ...paperData, is_read: false, read_at: null, notes: "" },
        alreadyExists: alreadyEnriched,
      });
    }

    // Non-arXiv URL
    const id = `web-${Date.now()}`;
    const isPdf = /\.pdf(\?|$)/i.test(url) || url.includes("/pdf/");

    // Check if this URL was already added
    const { data: existing } = await supabase
      .from("papers")
      .select("*")
      .eq("source_url", url)
      .maybeSingle();

    if (existing) {
      // Paper exists, just add to user's library
      const { data: existingUserPaper } = await supabase
        .from("user_papers")
        .select("id")
        .eq("user_id", user.id)
        .eq("paper_id", existing.id)
        .maybeSingle();

      if (!existingUserPaper) {
        await supabase.from("user_papers").insert({
          user_id: user.id,
          paper_id: existing.id,
        });
      }

      return NextResponse.json({
        paper: { ...existing, is_read: false, read_at: null, notes: "" },
        alreadyExists: true,
      });
    }

    // Download and upload PDF to Supabase Storage, extract title
    let storedPdfUrl = isPdf ? url : null;
    let pdfTitle = "";
    if (isPdf) {
      try {
        const pdfRes = await fetch(url);
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const fileName = `${id}.pdf`;
          await supabase.storage.from("papers").upload(fileName, buffer, {
            contentType: "application/pdf",
            upsert: true,
          });
          const { data: publicUrl } = supabase.storage.from("papers").getPublicUrl(fileName);
          storedPdfUrl = publicUrl.publicUrl;

          // Extract title from PDF text (first substantial line is usually the title)
          try {
            const pdfParse = await import("pdf-parse");
            const parse = typeof pdfParse === "function" ? pdfParse : (pdfParse as { default: Function }).default;
            const pdfData = await (parse as (buf: Buffer) => Promise<{ text: string; info?: { Title?: string } }>)(buffer);
            // Try PDF metadata title first
            if (pdfData.info?.Title && pdfData.info.Title.length > 5 && !/untitled/i.test(pdfData.info.Title)) {
              pdfTitle = pdfData.info.Title;
            }
            // If metadata title looks truncated (ends with conjunction/preposition), or missing, extract from text
            if (!pdfTitle || /\b(and|or|for|of|in|with|the|a|an)\s*$/i.test(pdfTitle)) {
              const lines = pdfData.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 5);
              if (lines.length > 0) {
                // Grab first line, then keep appending if it looks like the title continues
                let title = lines[0];
                for (let i = 1; i < Math.min(lines.length, 4); i++) {
                  // Stop if we hit something that looks like authors, abstract, or a section
                  if (/^(abstract|introduction|\d+\.?\s|by\s)/i.test(lines[i])) break;
                  if (lines[i].includes("@") || lines[i].includes("University") || lines[i].includes("Institute")) break;
                  if (/\b(and|or|for|of|in|with|the|a|an)\s*$/i.test(title)) {
                    title += " " + lines[i];
                  } else {
                    break;
                  }
                }
                pdfTitle = title.slice(0, 300);
              }
            }
          } catch (e) {
            console.error("PDF title extraction failed:", e);
          }
        }
      } catch (e) {
        console.error("PDF upload failed:", e);
      }
    }

    const fallbackTitle = pdfTitle || new URL(url).pathname.split("/").pop()?.replace(/\.pdf$/i, "") || "Untitled paper";

    // Extract metadata (title, authors, categories) from PDF text via AI
    let extractedMeta: { title?: string; authors?: string[]; abstract?: string; categories?: string[]; published?: string } = {};
    if (isPdf) {
      try {
        const pdfParse = await import("pdf-parse");
        const parse = typeof pdfParse === "function" ? pdfParse : (pdfParse as { default: Function }).default;
        // Re-fetch from stored copy if available, otherwise use the buffer we already have
        let textForAI = "";
        if (storedPdfUrl && storedPdfUrl !== url) {
          try {
            const res = await fetch(storedPdfUrl);
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              const data = await (parse as (buf: Buffer) => Promise<{ text: string }>)(buf);
              textForAI = data.text;
            }
          } catch {}
        }
        if (textForAI.length < 200) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              const data = await (parse as (buf: Buffer) => Promise<{ text: string }>)(buf);
              textForAI = data.text;
            }
          } catch {}
        }
        if (textForAI.length > 100) {
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const metaMsg = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [{
              role: "user",
              content: `Extract metadata from this paper. Return ONLY JSON:\n{"title":"...","authors":["..."],"abstract":"one paragraph summary","categories":["pick 2-4 from: AI, Machine Learning, NLP, Computer Vision, Reinforcement Learning, Robotics, Neuroscience, Software Engineering, Systems, Security, Databases, HCI, Optimization, Mathematics, Physics, Biology, Healthcare, Finance, Education, Ethics"],"published":"YYYY-MM-DD or null"}\n\n${textForAI.slice(0, 6000)}`,
            }],
          });
          const metaText = metaMsg.content[0].type === "text" ? metaMsg.content[0].text : "{}";
          const jsonMatch = metaText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedMeta = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (e) {
        console.error("AI metadata extraction at upload failed:", e);
      }
    }

    // Create shared paper
    const { data: inserted, error: insertError } = await supabase
      .from("papers")
      .insert({
        id,
        title: extractedMeta.title || fallbackTitle,
        authors: extractedMeta.authors || [],
        abstract: extractedMeta.abstract || null,
        source_url: url,
        pdf_url: storedPdfUrl,
        categories: extractedMeta.categories || [],
        published: extractedMeta.published || null,
        is_public: true,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Add to user's library
    await supabase.from("user_papers").insert({
      user_id: user.id,
      paper_id: id,
    });

    return NextResponse.json({
      paper: { ...inserted, is_read: false, read_at: null, notes: "" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to add paper" }, { status: 500 });
  }
}
