import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getUser } from "@/lib/auth";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: papers } = await supabase
    .from("papers")
    .select("id, title, abstract, authors, categories, published")
    .order("added_at", { ascending: false });

  if (!papers || papers.length === 0) {
    return NextResponse.json({ message: "No papers" });
  }

  const results: { id: string; categories?: string[]; bs_score?: unknown; error?: string }[] = [];

  // Step 1: Re-score categories + BS for each paper
  for (const paper of papers) {
    try {
      // Generate categories
      const catMsg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: `Given this paper, return 2-4 short category labels. Pick from this list ONLY (use these exact strings): "AI", "Machine Learning", "NLP", "Computer Vision", "Reinforcement Learning", "Robotics", "Neuroscience", "Software Engineering", "Systems", "Security", "Databases", "HCI", "Optimization", "Mathematics", "Physics", "Biology", "Healthcare", "Finance", "Education", "Ethics". If none fit well, you may create ONE new short label. Return ONLY a JSON array.\n\nTitle: ${paper.title}\nAbstract: ${(paper.abstract || "").slice(0, 1000)}`,
          },
        ],
      });
      const catText = catMsg.content[0].type === "text" ? catMsg.content[0].text : "[]";
      const catMatch = catText.match(/\[[\s\S]*\]/);
      const categories = catMatch ? JSON.parse(catMatch[0]) : paper.categories;

      // Generate BS + interesting score
      const bsMsg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: `You are a ruthlessly honest academic paper reviewer. Rate this paper. Return ONLY valid JSON:
{
  "overall": <0-100, 0 = seminal, 100 = pure BS>,
  "novelty": <0-100, 0 = genuinely new, 100 = rehash. IMPORTANT: Judge novelty relative to the paper's publication date, not relative to today. A paper from 2018 proposing transformers for vision was novel THEN even if common now. Ask: was this a new idea at the time it was published?>,
  "rigor": <0-100, 0 = airtight, 100 = hand-wavy>,
  "overclaiming": <0-100, 0 = honest, 100 = massive overclaims>,
  "credibility": <0-100, 0 = established authors, 100 = unknown making wild claims>,
  "reproducibility": <0-100, 0 = code+data released, 100 = impossible to verify>,
  "verdict": "<one brutally honest sentence>",
  "interesting": <0-100, COMPLETELY INDEPENDENT from BS. Judge the IDEA and QUESTION, NOT execution. Fascinating question with bad execution = high interesting. Perfect execution on boring incremental work = low interesting. Would you want to discuss this over coffee?>,
  "interesting_why": "<one sentence on why the IDEA is or isn't compelling>",
  "legitness_why": "<one sentence explaining the legitness/credibility assessment>"
}

Weighted BS: overclaiming 30%, rigor 25%, novelty 20%, credibility 15%, reproducibility 10%.
Judge each paper purely on its own merits.

Published: ${paper.published || "unknown"}
Authors: ${(paper.authors as string[])?.join(", ") || "unknown"}
Title: ${paper.title}
Abstract: ${(paper.abstract || "").slice(0, 3000)}`,
          },
        ],
      });
      const bsText = bsMsg.content[0].type === "text" ? bsMsg.content[0].text : "{}";
      const bsMatch = bsText.match(/\{[\s\S]*\}/);
      const bs_score = bsMatch ? JSON.parse(bsMatch[0]) : null;

      await supabase
        .from("papers")
        .update({ categories, ...(bs_score ? { bs_score } : {}) })
        .eq("id", paper.id);

      results.push({ id: paper.id, categories, bs_score });
    } catch (e) {
      results.push({ id: paper.id, error: String(e) });
    }
  }

  // Step 2: Generate embeddings for all papers
  const embeddingResults: { id: string; success: boolean }[] = [];
  // Batch in groups of 20 (OpenAI supports batch embedding)
  for (let i = 0; i < papers.length; i += 20) {
    const batch = papers.slice(i, i + 20);
    try {
      const inputs = batch.map(p => `${p.title}\n\n${p.abstract || ""}`.slice(0, 8000));
      const embeddingRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: inputs,
      });
      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddingRes.data[j].embedding;
        await supabase.from("papers").update({ embedding: JSON.stringify(embedding) }).eq("id", batch[j].id);
        embeddingResults.push({ id: batch[j].id, success: true });
      }
    } catch (e) {
      for (const p of batch) {
        embeddingResults.push({ id: p.id, success: false });
      }
      console.error("Embedding batch failed:", e);
    }
  }

  // Step 3: Recompute all connections via cosine similarity
  // Delete all existing connections
  await supabase.from("paper_connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  let connectionCount = 0;
  // For each paper with an embedding, find its matches
  for (const paper of papers) {
    try {
      // Get this paper's embedding
      const { data: paperData } = await supabase
        .from("papers")
        .select("embedding")
        .eq("id", paper.id)
        .single();

      if (!paperData?.embedding) continue;

      const { data: matches } = await supabase.rpc("match_papers", {
        query_embedding: paperData.embedding,
        match_threshold: 0.3,
        match_count: 50,
      });

      if (matches && matches.length > 0) {
        const connections = matches
          .filter((m: { id: string }) => m.id !== paper.id)
          .map((m: { id: string; similarity: number }) => ({
            paper_a: paper.id,
            paper_b: m.id,
            strength: m.similarity,
            relation_type: "similar",
          }));

        if (connections.length > 0) {
          await supabase.from("paper_connections").upsert(connections, { onConflict: "paper_a,paper_b" });
          connectionCount += connections.length;
        }
      }
    } catch (e) {
      console.error(`Connection computation failed for ${paper.id}:`, e);
    }
  }

  return NextResponse.json({
    updated: results.length,
    embeddings: embeddingResults.filter(r => r.success).length,
    connections: connectionCount,
    results,
  });
}
