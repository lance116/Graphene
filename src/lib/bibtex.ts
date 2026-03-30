export type BibtexEntry = {
  type: string;
  key: string;
  title: string;
  authors: string[];
  abstract: string | null;
  year: string | null;
  month: string | null;
  journal: string | null;
  booktitle: string | null;
  doi: string | null;
  url: string | null;
  eprint: string | null;
  archiveprefix: string | null;
  primaryclass: string | null;
  pages: string | null;
  volume: string | null;
  number: string | null;
  publisher: string | null;
};

export function parseBibtex(input: string): BibtexEntry[] {
  const entries: BibtexEntry[] = [];
  const entryRegex = /@(\w+)\s*\{([^,]*),\s*([\s\S]*?)(?=\n@|\n*$)/g;
  let match;

  while ((match = entryRegex.exec(input)) !== null) {
    const type = match[1].toLowerCase();
    const key = match[2].trim();
    const body = match[3];

    if (type === "comment" || type === "string" || type === "preamble") continue;

    const fields = parseFields(body);

    const authors = parseAuthors(fields.author || "");
    const title = cleanLatex(fields.title || key);

    entries.push({
      type,
      key,
      title,
      authors,
      abstract: fields.abstract ? cleanLatex(fields.abstract) : null,
      year: fields.year || null,
      month: fields.month || null,
      journal: fields.journal ? cleanLatex(fields.journal) : null,
      booktitle: fields.booktitle ? cleanLatex(fields.booktitle) : null,
      doi: fields.doi || null,
      url: fields.url || null,
      eprint: fields.eprint || null,
      archiveprefix: fields.archiveprefix || null,
      primaryclass: fields.primaryclass || null,
      pages: fields.pages || null,
      volume: fields.volume || null,
      number: fields.number || null,
      publisher: fields.publisher ? cleanLatex(fields.publisher) : null,
    });
  }

  return entries;
}

function parseFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};

  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (i >= body.length) break;

    const nameStart = i;
    while (i < body.length && body[i] !== "=" && body[i] !== "}" && !/[\s]/.test(body[i])) i++;
    const name = body.slice(nameStart, i).trim().toLowerCase();
    if (!name || name === "}") break;

    while (i < body.length && /[\s]/.test(body[i])) i++;
    if (i >= body.length || body[i] !== "=") continue;
    i++;
    while (i < body.length && /[\s]/.test(body[i])) i++;
    if (i >= body.length) break;

    let value = "";
    if (body[i] === "{") {
      i++;
      let depth = 1;
      const valueStart = i;
      while (i < body.length && depth > 0) {
        if (body[i] === "{") depth++;
        else if (body[i] === "}") depth--;
        if (depth > 0) i++;
      }
      value = body.slice(valueStart, i);
      i++;
    } else if (body[i] === '"') {
      i++;
      const valueStart = i;
      while (i < body.length && body[i] !== '"') i++;
      value = body.slice(valueStart, i);
      i++;
    } else {
      const valueStart = i;
      while (i < body.length && body[i] !== "," && body[i] !== "}" && body[i] !== "\n") i++;
      value = body.slice(valueStart, i).trim();
    }

    if (name) {
      fields[name] = value.trim();
    }
  }

  return fields;
}

function parseAuthors(authorField: string): string[] {
  if (!authorField.trim()) return [];

  return authorField
    .split(/\s+and\s+/i)
    .map((a) => {
      const cleaned = cleanLatex(a.trim());
      if (cleaned.includes(",")) {
        const parts = cleaned.split(",").map((p) => p.trim());
        return `${parts[1]} ${parts[0]}`.trim();
      }
      return cleaned;
    })
    .filter(Boolean);
}

function cleanLatex(str: string): string {
  return str
    .replace(/\\&/g, "&")
    .replace(/\\\$/g, "$")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\#/g, "#")
    .replace(/~|\\,/g, " ")
    .replace(/\\[a-zA-Z]+\s*/g, "")
    .replace(/\{|\}/g, "")
    .replace(/``|''/g, '"')
    .replace(/`|'/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveUrl(entry: BibtexEntry): string | null {
  if (entry.eprint && entry.archiveprefix?.toLowerCase() === "arxiv") {
    return `https://arxiv.org/abs/${entry.eprint}`;
  }
  if (entry.eprint && /^\d{4}\.\d{4,6}/.test(entry.eprint)) {
    return `https://arxiv.org/abs/${entry.eprint}`;
  }
  if (entry.doi) {
    return `https://doi.org/${entry.doi}`;
  }
  if (entry.url) {
    return entry.url;
  }
  return null;
}

export function isArxivEntry(entry: BibtexEntry): boolean {
  if (entry.archiveprefix?.toLowerCase() === "arxiv") return true;
  if (entry.eprint && /^\d{4}\.\d{4,6}/.test(entry.eprint)) return true;
  if (entry.url?.includes("arxiv.org")) return true;
  return false;
}
