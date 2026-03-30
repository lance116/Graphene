import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import { getUser } from "@/lib/auth";

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

  // Already enriched
  if (paper.summary) {
    return new Response(JSON.stringify({ done: true, summary: paper.summary }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // For non-arxiv PDFs, extract metadata first
  const isWebPaper = id.startsWith("web-") || id.startsWith("bib-");
  let title = paper.title;
  let abstract = paper.abstract || "";
  let authors = paper.authors || [];
  let categories = paper.categories || [];
  let published = paper.published;

  if (isWebPaper) {
    let extractedText = "";
    const sourceUrl = paper.source_url || paper.pdf_url;

    // Try HTML scraping first (faster, preserves structure)
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
      } catch (e) {
        console.error("HTML scraping failed:", e);
      }
    }

    // Fall back to PDF parsing if no usable HTML
    if (extractedText.length < 200 && paper.pdf_url) {
      try {
        const pdfRes = await fetch(paper.pdf_url);
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const pdfParse = await import("pdf-parse");
          const parse =
            typeof pdfParse === "function"
              ? pdfParse
              : (pdfParse as { default: Function }).default;
          const pdfData = await (
            parse as (buf: Buffer) => Promise<{ text: string }>
          )(buffer);
          extractedText = pdfData.text;
        }
      } catch (e) {
        console.error("PDF parsing failed:", e);
      }
    }

    // Extract metadata with Claude
    if (extractedText.length > 100) {
      try {
        const metaMsg = await client.messages.create({
          model: "claude-opus-4-6",
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: `Extract metadata from this paper/article. Return ONLY JSON: {"title":"...","authors":["..."],"abstract":"...","categories":["..."],"published":"YYYY-MM-DD or null"}\n\n${extractedText.slice(0, 6000)}`,
            },
          ],
        });
        const metaText =
          metaMsg.content[0].type === "text" ? metaMsg.content[0].text : "{}";
        const jsonMatch = metaText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const meta = JSON.parse(jsonMatch[0]);
          title = meta.title || title;
          authors = meta.authors || authors;
          abstract = meta.abstract || abstract;
          categories = meta.categories || categories;
          published = meta.published || published;

          await supabase
            .from("papers")
            .update({ title, authors, abstract, categories, published })
            .eq("id", id);
        }
      } catch (e) {
        console.error("Metadata extraction failed:", e);
      }
    }
  }

  // Generate AI categories for ALL papers (replace arxiv codes with human labels)
  if (abstract || title) {
    try {
      const catMsg = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `Given this paper, return 2-4 short category labels. Pick from this list ONLY (use these exact strings): "AI", "Machine Learning", "NLP", "Computer Vision", "Reinforcement Learning", "Robotics", "Neuroscience", "Software Engineering", "Systems", "Security", "Databases", "HCI", "Optimization", "Mathematics", "Physics", "Biology", "Healthcare", "Finance", "Education", "Ethics". If none fit well, you may create ONE new short label. Return ONLY a JSON array.\n\nTitle: ${title}\nAbstract: ${abstract?.slice(0, 1000) || ""}`,
          },
        ],
      });
      const catText = catMsg.content[0].type === "text" ? catMsg.content[0].text : "[]";
      const catMatch = catText.match(/\[[\s\S]*\]/);
      if (catMatch) {
        const aiCategories = JSON.parse(catMatch[0]);
        if (Array.isArray(aiCategories) && aiCategories.length > 0) {
          categories = aiCategories;
          await supabase.from("papers").update({ categories }).eq("id", id);
        }
      }
    } catch (e) {
      console.error("Category generation failed:", e);
    }
  }

  // Fetch full paper text for better AI context
  let fullText = "";
  const isArxiv = !id.startsWith("web-") && !id.startsWith("bib-");
  if (isArxiv) {
    // Try HTML version first (cleaner text)
    try {
      const htmlRes = await fetch(`https://arxiv.org/html/${id}`, { signal: AbortSignal.timeout(10000) });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        if (!html.includes("No HTML for") && !html.includes("HTML is not available")) {
          fullText = html
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
      }
    } catch {}

    // Fall back to PDF
    if (fullText.length < 500) {
      try {
        const pdfUrl = paper.pdf_url || `https://arxiv.org/pdf/${id}`;
        const pdfRes = await fetch(pdfUrl, { signal: AbortSignal.timeout(15000) });
        if (pdfRes.ok) {
          const buffer = Buffer.from(await pdfRes.arrayBuffer());
          const pdfParse = await import("pdf-parse");
          const parse = typeof pdfParse === "function" ? pdfParse : (pdfParse as { default: Function }).default;
          const pdfData = await (parse as (buf: Buffer) => Promise<{ text: string }>)(buffer);
          fullText = pdfData.text;
        }
      } catch {}
    }
  }
  // For non-arxiv, fullText was already extracted above in the isWebPaper block

  // Use full text if available, otherwise fall back to abstract
  const contextForSummary = fullText.length > 500
    ? fullText.slice(0, 15000)
    : abstract || "";

  // Stream the summary generation
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Send metadata update
      if (title !== paper.title || categories !== paper.categories) {
        send("metadata", { title, authors, abstract, categories, published });
      }

      // Stream summary
      send("status", { step: "summarizing" });
      try {
        const summaryStream = client.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Summarize this academic paper in 3-4 concise bullet points. Focus on key contribution, method, and results. Do NOT use markdown formatting. Use plain text only.\n\nTitle: ${title}\n\n${contextForSummary}`,
            },
          ],
        });

        let fullSummary = "";
        for await (const event of summaryStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullSummary += event.delta.text;
            send("summary_chunk", { text: event.delta.text });
          }
        }

        // Save summary
        await supabase
          .from("papers")
          .update({ summary: fullSummary })
          .eq("id", id);

        send("summary_done", { summary: fullSummary });
      } catch (e) {
        console.error("Summary streaming failed:", e);
        send("error", { message: "Summary generation failed" });
      }

      // Find connections (non-streaming, quick)
      send("status", { step: "finding_connections" });
      try {
        const { data: existingPapers } = await supabase
          .from("papers")
          .select("id, title, abstract, categories")
          .neq("id", id)
          .limit(20);

        if (existingPapers && existingPapers.length > 0 && abstract) {
          const paperList = existingPapers
            .map(
              (p, i) =>
                `[${i}] ${p.title} | ${(p.categories as string[])?.join(", ") || ""}`
            )
            .join("\n");

          const connMsg = await client.messages.create({
            model: "claude-opus-4-6",
            max_tokens: 512,
            messages: [
              {
                role: "user",
                content: `Given this new paper and existing papers, identify related ones. Return ONLY JSON array: [{"index":0,"strength":0.8,"relation":"same_topic"}]\nstrength: 0-1, relation: same_topic|similar_method|same_field|extends\nOnly include strength > 0.3\n\nNew: "${title}"\nAbstract: ${abstract.slice(0, 500)}\nCategories: ${(categories as string[])?.join(", ")}\n\nExisting:\n${paperList}`,
              },
            ],
          });

          const connText =
            connMsg.content[0].type === "text" ? connMsg.content[0].text : "[]";
          const connMatch = connText.match(/\[[\s\S]*\]/);
          if (connMatch) {
            const parsed = JSON.parse(connMatch[0]);
            const connections = parsed
              .filter(
                (c: { index: number }) => c.index < existingPapers.length
              )
              .map(
                (c: {
                  index: number;
                  strength: number;
                  relation: string;
                }) => ({
                  paper_a: id,
                  paper_b: existingPapers[c.index].id,
                  strength: c.strength,
                  relation_type: c.relation,
                })
              );

            if (connections.length > 0) {
              await supabase.from("paper_connections").insert(connections);
              send("connections", { count: connections.length });
            }
          }
        }
      } catch (e) {
        console.error("Connection finding failed:", e);
      }

      // BS Score — rate the paper's credibility
      send("status", { step: "rating" });
      try {
        const bsMsg = await client.messages.create({
          model: "claude-opus-4-6",
          max_tokens: 800,
          messages: [
            {
              role: "user",
              content: `You are a ruthlessly honest academic paper reviewer. Rate this paper. Return ONLY valid JSON:
{
  "overall": <0-100, weighted average of below. 0 = seminal work, 100 = pure BS>,
  "novelty": <0-100, 0 = genuinely new idea/approach, 100 = rehash of existing work with new branding. IMPORTANT: Judge novelty relative to the paper's publication date, not relative to today. A paper from 2018 proposing transformers for vision was novel THEN even if common now. Ask: was this a new idea at the time it was published?>,
  "rigor": <0-100, 0 = airtight methodology, 100 = hand-wavy with cherry-picked results>,
  "overclaiming": <0-100, 0 = honest about limitations, 100 = "revolutionary paradigm shift" for a minor tweak>,
  "credibility": <0-100, 0 = established authors with track record, 100 = unknown authors making extraordinary claims>,
  "reproducibility": <0-100, 0 = code+data released, clear methodology, 100 = impossible to verify>,
  "verdict": "<one brutally honest sentence about the BS level>",
  "interesting": <0-100, COMPLETELY INDEPENDENT from BS score. Judge the IDEA and QUESTION being explored, NOT the execution or writing quality. A terribly written paper exploring a fascinating question = high interesting. A perfectly executed paper on a boring incremental benchmark = low interesting. Ask: Is the core question genuinely thought-provoking? Would you want to discuss this over coffee? Does it connect ideas from different fields in surprising ways? Does it challenge assumptions?>,
  "interesting_why": "<one sentence on why the IDEA is or isn't compelling>",
  "legitness_why": "<one sentence explaining the legitness/credibility assessment>"
}

The overall BS score should be a WEIGHTED combination:
- Overclaiming: 30% weight (biggest BS signal)
- Rigor: 25% weight
- Novelty: 20% weight
- Credibility: 15% weight
- Reproducibility: 10% weight

Judge each paper purely on its own merits. Do not anchor to any specific papers or preconceived scores.

Published: ${published || "unknown"}
Authors: ${(authors as string[])?.join(", ") || "unknown"}
Title: ${title}
${contextForSummary.slice(0, 10000)}`,
            },
          ],
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
