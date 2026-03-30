import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { getUser } from "@/lib/auth";
import { checkTokenLimit, trackTokens } from "@/lib/tokens";
import { checkRateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const { id } = await params;

  // Check daily token limit
  const withinLimit = await checkTokenLimit(user.id);
  if (!withinLimit) {
    return new Response(JSON.stringify({ error: "Daily token limit reached. Try again tomorrow." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!checkRateLimit(user.id)) {
    return new Response(JSON.stringify({ error: "Too many requests. Please wait a moment." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", id)
    .single();

  if (!paper) {
    return new Response(JSON.stringify({ error: "Paper not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (paper.summary) {
    return new Response(JSON.stringify({ done: true, summary: paper.summary }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const isWebPaper = id.startsWith("web-") || id.startsWith("bib-");
  const isArxiv = !isWebPaper;
  let title = paper.title;
  let abstract = paper.abstract || "";
  let authors = paper.authors || [];
  let categories = paper.categories || [];
  let published = paper.published;
  let extractedText = "";

  // --- Step 1: Get paper text ---
  if (isWebPaper) {
    const sourceUrl = paper.source_url || paper.pdf_url;
    // Try HTML scraping for non-PDF URLs
    if (sourceUrl && !/\.pdf(\?|$)/i.test(sourceUrl)) {
      try {
        const pageRes = await fetch(sourceUrl);
        if (pageRes.ok) {
          const html = await pageRes.text();
          extractedText = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
      } catch {}
    }
    // Fall back to PDF — try stored copy first, then original source URL
    if (extractedText.length < 200) {
      const pdfUrls = [paper.pdf_url, paper.source_url].filter(Boolean);
      for (const pdfUrl of pdfUrls) {
        if (extractedText.length >= 200) break;
        try {
          const pdfRes = await fetch(pdfUrl!, { signal: AbortSignal.timeout(15000) });
          if (pdfRes.ok) {
            const buffer = Buffer.from(await pdfRes.arrayBuffer());
            const pdfParse = await import("pdf-parse");
            const parse = typeof pdfParse === "function" ? pdfParse : (pdfParse as { default: Function }).default;
            const pdfData = await (parse as (buf: Buffer) => Promise<{ text: string }>)(buffer);
            if (pdfData.text.length > extractedText.length) {
              extractedText = pdfData.text;
            }
          }
        } catch {}
      }
    }
  } else {
    // arXiv: try HTML then PDF
    try {
      const htmlRes = await fetch(`https://arxiv.org/html/${id}`, { signal: AbortSignal.timeout(10000) });
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
    } catch {}
    if (extractedText.length < 500) {
      try {
        const pdfUrl = paper.pdf_url || `https://arxiv.org/pdf/${id}`;
        const pdfRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(15000) });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const pdfParse = await import("pdf-parse");
          const parse = typeof pdfParse === "function" ? pdfParse : (pdfParse as { default: Function }).default;
          const pdfData = await (parse as (buf: Buffer) => Promise<{ text: string }>)(buffer);
          extractedText = pdfData.text;
        }
      } catch {}
    }
  }

  const contextText = extractedText.length > 500 ? extractedText.slice(0, 15000) : abstract || "";

  // --- Step 2: ALL calls in parallel ---
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Metadata + categories (web papers) or just categories (arxiv)
      const needsMeta = isWebPaper && (
        extractedText.length > 100 ||
        authors.length === 0 ||
        !title ||
        title.startsWith("web-") ||
        /^\d[\d_-]+\d$/.test(title) // garbage filename-derived titles like "657045057_451752..."
      );
      const metaPromise = (async () => {
        if (needsMeta && (extractedText.length > 100 || abstract)) {
          try {
            const metaMsg = await client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 512,
              messages: [{
                role: "user",
                content: `Extract metadata from this paper. Return ONLY JSON:
{"title":"...","authors":["..."],"abstract":"one paragraph summary","categories":["pick 2-4 from: AI, Machine Learning, NLP, Computer Vision, Reinforcement Learning, Robotics, Neuroscience, Software Engineering, Systems, Security, Databases, HCI, Optimization, Mathematics, Physics, Biology, Healthcare, Finance, Education, Ethics"],"published":"YYYY-MM-DD or null"}

${extractedText.length > 100 ? extractedText.slice(0, 6000) : `Title (may be wrong): ${title}\nAbstract: ${abstract || "unknown"}`}`,
              }],
            });
            const metaText = metaMsg.content[0].type === "text" ? metaMsg.content[0].text : "{}";
            const jsonMatch = metaText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const meta = JSON.parse(jsonMatch[0]);
              title = meta.title || title;
              authors = meta.authors || authors;
              abstract = meta.abstract || abstract;
              categories = meta.categories || categories;
              published = meta.published || published;
              await supabase.from("papers").update({ title, authors, abstract, categories, published }).eq("id", id);
              send("metadata", { title, authors, abstract, categories, published });
            }
          } catch (e) {
            console.error("Metadata extraction failed:", e);
          }
        } else if (abstract || title) {
          try {
            const catMsg = await client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 128,
              messages: [{
                role: "user",
                content: `Return 2-4 category labels as a JSON array. Pick from: "AI", "Machine Learning", "NLP", "Computer Vision", "Reinforcement Learning", "Robotics", "Neuroscience", "Software Engineering", "Systems", "Security", "Databases", "HCI", "Optimization", "Mathematics", "Physics", "Biology", "Healthcare", "Finance", "Education", "Ethics". Return ONLY the JSON array.\n\nTitle: ${title}\nAbstract: ${abstract?.slice(0, 500) || ""}`,
              }],
            });
            const catText = catMsg.content[0].type === "text" ? catMsg.content[0].text : "[]";
            const catMatch = catText.match(/\[[\s\S]*\]/);
            if (catMatch) {
              const aiCats = JSON.parse(catMatch[0]);
              if (Array.isArray(aiCats) && aiCats.length > 0) {
                categories = aiCats;
                await supabase.from("papers").update({ categories }).eq("id", id);
                send("metadata", { title, authors, abstract, categories, published });
              }
            }
          } catch {}
        }
      })();

      const summaryPromise = (async () => {
        try {
          const summaryStream = client.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            messages: [{
              role: "user",
              content: `Summarize this academic paper in 3-4 concise bullet points. Focus on key contribution, method, and results. Plain text only, no markdown.\n\nTitle: ${title}\n\n${contextText}`,
            }],
          });
          let fullSummary = "";
          for await (const event of summaryStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullSummary += event.delta.text;
              send("summary_chunk", { text: event.delta.text });
            }
          }
          await supabase.from("papers").update({ summary: fullSummary }).eq("id", id);
          send("summary_done", { summary: fullSummary });
        } catch (e) {
          console.error("Summary failed:", e);
          send("error", { message: "Summary generation failed" });
        }
      })();

      const bsPromise = (async () => {
        try {
          const bsMsg = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 800,
            messages: [{
              role: "user",
              content: `You are a ruthlessly honest academic paper reviewer. Rate this paper. Return ONLY valid JSON:
{
  "overall": <0-100, weighted BS score. 0=seminal, 100=pure BS>,
  "novelty": <0-100, 0=genuinely new, 100=rehash. Judge relative to publication date, not today>,
  "rigor": <0-100, 0=airtight, 100=hand-wavy>,
  "overclaiming": <0-100, 0=honest about limitations, 100=hype>,
  "credibility": <0-100, 0=established authors, 100=unknown making big claims>,
  "reproducibility": <0-100, 0=code+data released, 100=impossible to verify>,
  "verdict": "<one brutally honest sentence>",
  "interesting": <0-100, judge the IDEA not execution>,
  "interesting_why": "<one sentence>",
  "legitness_why": "<one sentence>"
}
Weights: overclaiming 30%, rigor 25%, novelty 20%, credibility 15%, reproducibility 10%.

Published: ${published || "unknown"}
Authors: ${(authors as string[])?.join(", ") || "unknown"}
Title: ${title}
${contextText.slice(0, 10000)}`,
            }],
          });
          const bsText = bsMsg.content[0].type === "text" ? bsMsg.content[0].text : "{}";
          const bsMatch = bsText.match(/\{[\s\S]*\}/);
          if (bsMatch) {
            const bsScore = JSON.parse(bsMatch[0]);
            await supabase.from("papers").update({ bs_score: bsScore }).eq("id", id);
            send("bs_score", bsScore);
          }
        } catch (e) {
          console.error("BS score failed:", e);
        }
      })();

      const connPromise = (async () => {
        try {
          const { data: existingPapers } = await supabase
            .from("papers")
            .select("id, title, abstract, categories")
            .neq("id", id)
            .limit(20);

          if (existingPapers && existingPapers.length > 0 && abstract) {
            const paperList = existingPapers
              .map((p, i) => `[${i}] ${p.title} | ${(p.categories as string[])?.join(", ") || ""}`)
              .join("\n");

            const connMsg = await client.messages.create({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 512,
              messages: [{
                role: "user",
                content: `Given this new paper and existing papers, identify related ones. Return ONLY JSON array: [{"index":0,"strength":0.8,"relation":"same_topic"}]\nstrength: 0-1, relation: same_topic|similar_method|same_field|extends\nOnly include strength > 0.3\n\nNew: "${title}"\nAbstract: ${abstract.slice(0, 500)}\nCategories: ${(categories as string[])?.join(", ")}\n\nExisting:\n${paperList}`,
              }],
            });
            const connText = connMsg.content[0].type === "text" ? connMsg.content[0].text : "[]";
            const connMatch = connText.match(/\[[\s\S]*\]/);
            if (connMatch) {
              const parsed = JSON.parse(connMatch[0]);
              const connections = parsed
                .filter((c: { index: number }) => c.index < existingPapers.length)
                .map((c: { index: number; strength: number; relation: string }) => ({
                  paper_a: id,
                  paper_b: existingPapers[c.index].id,
                  strength: c.strength,
                  relation_type: c.relation,
                }));
              if (connections.length > 0) {
                await supabase.from("paper_connections").insert(connections);
                send("connections", { count: connections.length });
              }
            }
          }
        } catch (e) {
          console.error("Connection finding failed:", e);
        }
      })();

      // Semantic Scholar: citation count + related papers (arXiv only)
      const semanticScholarPromise = (async () => {
        if (!isArxiv) return;
        try {
          const [infoRes, recsRes] = await Promise.all([
            fetch(`https://api.semanticscholar.org/graph/v1/paper/ArXiv:${id}?fields=citationCount,externalIds`, {
              signal: AbortSignal.timeout(8000),
            }),
            fetch(`https://api.semanticscholar.org/recommendations/v1/papers/forpaper/ArXiv:${id}?fields=title,authors,year,externalIds&limit=5`, {
              signal: AbortSignal.timeout(8000),
            }),
          ]);

          let citationCount = 0;
          if (infoRes.ok) {
            const info = await infoRes.json();
            citationCount = info.citationCount ?? 0;
          }

          let relatedPapers: { title: string; authors: string[]; year: number; arxiv_id: string }[] = [];
          if (recsRes.ok) {
            const recs = await recsRes.json();
            relatedPapers = (recs.recommendedPapers || [])
              .filter((p: { externalIds?: { ArXiv?: string } }) => p.externalIds?.ArXiv)
              .map((p: { title: string; authors: { name: string }[]; year: number; externalIds: { ArXiv: string } }) => ({
                title: p.title,
                authors: p.authors?.map((a) => a.name) || [],
                year: p.year,
                arxiv_id: p.externalIds.ArXiv,
              }));
          }

          await supabase.from("papers").update({ citation_count: citationCount, further_reading: relatedPapers }).eq("id", id);
          send("further_reading", { citation_count: citationCount, further_reading: relatedPapers });
        } catch {
          // Semantic Scholar can be slow/flaky — fail silently
        }
      })();

      // Prerequisites generation
      const prerequisitesPromise = (async () => {
        try {
          const prereqMsg = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 512,
            messages: [{
              role: "user",
              content: `Generate 4-6 prerequisites for understanding this paper. Return ONLY JSON array: [{"topic":"...","why":"one sentence on why this is needed","difficulty":"basic|intermediate|advanced"}]\n\nTitle: ${title}\nAbstract: ${abstract?.slice(0, 1000) || ""}`,
            }],
          });
          const prereqText = prereqMsg.content[0].type === "text" ? prereqMsg.content[0].text : "[]";
          const prereqMatch = prereqText.match(/\[[\s\S]*\]/);
          if (prereqMatch) {
            const prerequisites = JSON.parse(prereqMatch[0]);
            await supabase.from("papers").update({ prerequisites }).eq("id", id);
            send("prerequisites", prerequisites);
          }
        } catch {
          // Fail silently
        }
      })();

      await Promise.all([metaPromise, summaryPromise, bsPromise, connPromise, semanticScholarPromise, prerequisitesPromise]);

      // Track ~5000 tokens per enrichment (rough estimate across all calls)
      await trackTokens(user.id, 5000).catch(() => {});

      send("done", {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
