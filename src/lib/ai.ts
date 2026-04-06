import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function summarizePaper(title: string, abstract: string): Promise<string> {
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Summarize this academic paper concisely in 3-4 bullet points. Focus on the key contribution, method, and results.

Title: ${title}

Abstract: ${abstract}`,
      },
    ],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

export async function chatAboutPaper(
  paper: Record<string, unknown>,
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
  otherPapers?: { id: string; title: string; categories: string[]; summary: string | null }[],
  paperText?: string
): Promise<string> {
  const bsScore = paper.bs_score as Record<string, unknown> | null;
  const bsContext = bsScore
    ? `\nLegitness Score: ${100 - (bsScore.overall as number)}/100 (higher = more legit)
Interesting Score: ${bsScore.interesting}/100
Verdict: ${bsScore.verdict}
Breakdown — Honesty: ${100 - ((bsScore.overclaiming as number) || 0)}, Rigor: ${100 - ((bsScore.rigor as number) || 0)}, Novelty: ${100 - ((bsScore.novelty as number) || 0)}, Credibility: ${100 - ((bsScore.credibility as number) || 0)}, Reproducibility: ${100 - ((bsScore.reproducibility as number) || 0)}
Why interesting: ${bsScore.interesting_why || "N/A"}`
    : "";

  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = `You are Graphene AI, a research assistant powered by Claude Opus 4.6 by Anthropic. Today's date is ${today}. You are helping a user understand an academic paper. Be concise and precise. You have full context about this paper including its metadata, summary, ratings, and full text. Do NOT use markdown formatting — no **, ##, or other markup. Use plain text only.

When referencing specific claims or passages from the paper, include inline citations using this format: [source: "short quote from paper"]. Keep quotes short (under 15 words) and only quote when it adds value — don't cite every sentence.

Paper: "${paper.title}"
Authors: ${(paper.authors as string[])?.join(", ") || "Unknown"}
Categories: ${(paper.categories as string[])?.join(", ") || "Unknown"}
Published: ${paper.published || "Unknown"}

Abstract: ${paper.abstract || "N/A"}

${paper.summary ? `AI Summary: ${paper.summary}` : ""}${bsContext}${otherPapers && otherPapers.length > 0 ? `\nThe user's library also contains these papers. Reference them when relevant to help the user connect ideas across their reading:\n${otherPapers.map(p => `- "${p.title}" (${p.categories?.join(", ") || "uncategorized"})`).join("\n")}` : ""}${paperText ? `\n\n--- FULL PAPER TEXT ---\n${paperText}` : ""}`;

  const messages = [
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: question },
  ];

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "";
}

export type ExtractedPaper = {
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  published: string | null;
};

export async function extractPaperMetadata(text: string): Promise<ExtractedPaper> {
  const truncated = text.slice(0, 8000);
  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Extract paper metadata from this text. Return ONLY valid JSON with these fields:
{
  "title": "the paper title",
  "authors": ["author1", "author2"],
  "abstract": "the abstract or a summary if no explicit abstract",
  "categories": ["field1", "field2"],
  "published": "YYYY-MM-DD or null if unknown"
}

Text:
${truncated}`,
      },
    ],
  });

  const block = message.content[0];
  const responseText = block.type === "text" ? block.text : "{}";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      title: parsed.title || "Untitled",
      authors: parsed.authors || [],
      abstract: parsed.abstract || "",
      categories: parsed.categories || [],
      published: parsed.published || null,
    };
  } catch {
    return {
      title: "Untitled",
      authors: [],
      abstract: text.slice(0, 500),
      categories: [],
      published: null,
    };
  }
}

