import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const proxy = req.nextUrl.searchParams.get("proxy") === "1";

  const { data: paper } = await supabase
    .from("papers")
    .select("id, pdf_url, source_url")
    .eq("id", id)
    .single();

  if (!paper) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isArxiv = !id.startsWith("web-") && !id.startsWith("bib-");

  if (isArxiv) {
    const htmlUrl = `https://arxiv.org/html/${id}`;

    // If proxy mode, fetch and clean the HTML
    if (proxy) {
      try {
        const res = await fetch(htmlUrl);
        if (res.ok) {
          let html = await res.text();

          // Check if it's actually a "No HTML" page
          if (html.includes("No HTML for") || html.includes("HTML is not available")) {
            return NextResponse.json({ fallback: "pdf" });
          }

          // Strip all scripts (they inject beta badge, report button, etc.)
          html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
          // Strip header, nav, footer
          html = html
            .replace(/<header[\s\S]*?<\/header>/gi, "")
            .replace(/<nav[\s\S]*?<\/nav>/gi, "")
            .replace(/<footer[\s\S]*?<\/footer>/gi, "");

          // Inject dark theme CSS
          const darkCss = `<style>
            body, .ltx_page_main, .ltx_document {
              background: #1a1a1a !important;
              color: #e0e0e0 !important;
            }
            h1, h2, h3, h4, h5, h6,
            .ltx_title, .ltx_personname, .ltx_role {
              color: #ffffff !important;
            }
            a { color: #888 !important; }
            a:hover { color: #fff !important; }
            .ltx_abstract, .ltx_para, p, li, td, th, span, div {
              color: #d0d0d0 !important;
            }
            .ltx_bibblock, .ltx_bib_cited {
              color: #888 !important;
            }
            figure, .ltx_figure, .ltx_table {
              border-color: #333 !important;
              background: #111 !important;
            }
            img { filter: brightness(0.9); }
            table, th, td {
              border-color: #333 !important;
            }
            .ltx_listing, pre, code {
              background: #111 !important;
              color: #ccc !important;
            }
            .ltx_note_content {
              background: #222 !important;
              color: #aaa !important;
            }
            /* Hide any remaining arxiv chrome */
            .package-alerts, .html-header-message,
            [class*="banner"], [class*="alert"],
            .arxiv-watermark, .ltx_page_logo,
            .beta-badge, [class*="beta"],
            .report-issue, [class*="report-issue"],
            .ltx_page_header, .ltx_page_footer,
            #report-issue-button, .ar5iv-footer,
            [id*="report"], [class*="Report"],
            .feedbackOverlay, .feedback-button,
            a[href*="report"], button[class*="report"],
            .corner-ribbon, [class*="ribbon"],
            [style*="position: fixed"] {
              display: none !important;
            }
            /* Clean up spacing */
            .ltx_page_main {
              max-width: 900px !important;
              margin: 0 auto !important;
              padding: 40px 60px !important;
            }
          </style>`;

          // Make relative URLs absolute
          html = html.replace(/(href|src)="\/(?!\/)/g, '$1="https://arxiv.org/');

          // Inject CSS before </head>
          html = html.replace("</head>", darkCss + "</head>");

          return new NextResponse(html, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      } catch (e) {
        console.error("HTML proxy failed:", e);
      }

      // Fall back to PDF
      return NextResponse.json({ fallback: "pdf" });
    }

    // Non-proxy: check if HTML exists
    try {
      const res = await fetch(htmlUrl, { method: "HEAD" });
      if (res.ok) {
        return NextResponse.json({ url: `/api/papers/${encodeURIComponent(id)}/viewer?proxy=1`, type: "html" });
      }
    } catch {}

    const pdfUrl = paper.pdf_url || `https://arxiv.org/pdf/${id}`;
    return NextResponse.json({ url: pdfUrl, type: "pdf" });
  }

  // Non-arxiv
  const url = paper.pdf_url || paper.source_url;
  return NextResponse.json({ url, type: paper.pdf_url ? "pdf" : "page" });
}
