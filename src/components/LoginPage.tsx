"use client";

import { useAuth } from "./AuthProvider";
import { ArrowRight, Shield, Zap, Brain, Map } from "lucide-react";
import { useRef, useEffect, useState } from "react";

function AsciiLogo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = 500, H = 500;
    canvas.width = W;
    canvas.height = H;

    const img = new Image();
    img.src = "/graphene.png";
    let logoPixels: Uint8ClampedArray | null = null;
    const SAMPLE = 200;

    img.onload = () => {
      const tmp = document.createElement("canvas");
      tmp.width = SAMPLE;
      tmp.height = SAMPLE;
      const tc = tmp.getContext("2d")!;
      const inset = 10;
      tc.fillStyle = "#fff";
      tc.fillRect(0, 0, SAMPLE, SAMPLE);
      tc.drawImage(img, inset, inset, SAMPLE - inset * 2, SAMPLE - inset * 2);
      logoPixels = tc.getImageData(0, 0, SAMPLE, SAMPLE).data;
    };

    const chars = " .,:;+*?%S#@";
    const CELL = 8;
    const cols = Math.floor(W / CELL);
    const rows = Math.floor(H / CELL);

    const charOffsets = new Float32Array(cols * rows);
    for (let i = 0; i < charOffsets.length; i++) {
      charOffsets[i] = Math.random() * Math.PI * 2;
    }

    let time = 0;

    const render = () => {
      time += 0.02;
      ctx.clearRect(0, 0, W, H);

      if (!logoPixels) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.font = `${CELL}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const lx = Math.floor((col / cols) * SAMPLE);
          const ly = Math.floor((row / rows) * SAMPLE);
          const idx = (ly * SAMPLE + lx) * 4;
          const r = logoPixels[idx], g = logoPixels[idx + 1], b = logoPixels[idx + 2];
          const brightness = (r + g + b) / 3;
          const logoVal = 1 - brightness / 255;

          if (logoVal < 0.15) continue;

          const shimmer = Math.sin(time * 2 + charOffsets[row * cols + col]) * 0.15;
          const wave = Math.sin(col * 0.3 + time * 1.5) * 0.05 + Math.sin(row * 0.25 + time * 1.2) * 0.05;
          const val = Math.max(0, Math.min(1, logoVal + shimmer + wave));

          const charIdx = Math.floor(val * (chars.length - 1));
          const ch = chars[charIdx];

          const alpha = 0.3 + val * 0.7;
          ctx.fillStyle = `rgba(255,255,255,${alpha})`;

          const x = col * CELL + CELL / 2;
          const y = row * CELL + CELL / 2;
          ctx.fillText(ch, x, y);
        }
      }

      animRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return <canvas ref={canvasRef} className="w-[280px] h-[280px] sm:w-[400px] sm:h-[400px] lg:w-[500px] lg:h-[500px]" />;
}

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="min-h-screen bg-bg flex flex-col overflow-hidden">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 sm:px-8 py-4">
        <div className="flex items-center gap-2">
          <img src="/graphene.png" alt="Graphene" className="w-5 h-5 invert" style={{ clipPath: "inset(4%)" }} />
          <span className="text-sm font-bold tracking-[0.15em] uppercase text-accent">Graphene</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <iframe
            src="https://ghbtns.com/github-btn.html?user=lance116&repo=Graphene&type=star&count=true&size=large"
            frameBorder="0"
            scrolling="0"
            width="130"
            height="30"
            title="GitHub Stars"
            className="mt-0.5 hidden sm:block"
          />
          <button
            onClick={() => { setShowModal(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="flex items-center gap-2 text-xs px-4 sm:px-5 py-2.5 bg-accent text-bg font-medium tracking-wider hover:bg-text transition-colors cursor-pointer"
          >
            Sign in <ArrowRight size={12} />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-10 sm:pt-20 pb-10 sm:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0 items-center lg:min-h-[500px]">
            {/* Left — text */}
            <div className="text-center lg:text-left order-2 lg:order-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-accent leading-[1.1] tracking-tight mb-2">
                Open-source research<br />
                paper management.
              </h1>
              <p className="text-sm sm:text-base text-text-dim leading-relaxed mb-4 max-w-md mx-auto lg:mx-0">
                Collect, read, and track academic papers in one place.
                AI-powered summaries, a knowledge graph, and a
                built-in legitness detector.
              </p>

              <div className="flex items-center justify-center lg:justify-start gap-3">
                <a
                  href="https://github.com/lance116/Graphene"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 sm:px-6 py-3 bg-accent text-bg text-xs font-medium tracking-wider uppercase hover:bg-text transition-colors cursor-pointer"
                >
                  Star on GitHub <ArrowRight size={14} />
                </a>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-5 sm:px-6 py-3 border border-border text-text text-xs font-medium tracking-wider uppercase hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  Sign in
                </button>
              </div>
              <p className="text-[10px] text-text-dim mt-3">
                Free and open source. Self-host with your own API key.
              </p>
            </div>

            {/* Right — ASCII dithered logo */}
            <div className="flex items-center justify-center order-1 lg:order-2">
              <AsciiLogo />
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 sm:py-20 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8">
            {[
              { icon: Map, title: "Knowledge Graph", desc: "A visual map of every paper you've read with category clusters and connections between them." },
              { icon: Brain, title: "AI Summaries & Chat", desc: "Get instant summaries and ask questions about any paper. Full context, no hallucination." },
              { icon: Shield, title: "Legitness Score", desc: "AI rates each paper on honesty, rigor, novelty, and credibility. Know what you're reading." },
              { icon: Zap, title: "Track Everything", desc: "Paste any arXiv link or PDF. Mark as read, take notes, sort by date, category, or score." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="border border-border p-5 sm:p-6 hover:border-border-hover hover:bg-surface/30 transition-all duration-200">
                <Icon size={20} className="text-text-dim mb-4" />
                <h3 className="text-xs font-bold tracking-wider uppercase text-accent mb-2">{title}</h3>
                <p className="text-[11px] text-text-dim leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative overflow-hidden bg-surface">
        <div className="h-24 bg-gradient-to-b from-bg to-surface" />
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-8 pb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <img src="/graphene.png" alt="Graphene" className="w-6 h-6 invert" style={{ clipPath: "inset(4%)" }} />
              <span className="text-xs text-text-dim">Graphene &copy; {new Date().getFullYear()}</span>
            </div>
            <a href="https://github.com/lance116/Graphene" target="_blank" rel="noopener noreferrer" className="text-sm text-text-dim hover:text-text transition-colors">GitHub Project</a>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 overflow-hidden pointer-events-none select-none" style={{ height: "clamp(85px, 12vw, 155px)" }}>
          <p className="font-bold leading-[0.82] text-white/[0.04]" style={{ fontSize: "clamp(130px, 16vw, 260px)", letterSpacing: "-0.03em" }}>
            Graphene
          </p>
        </div>
      </footer>

      {/* Sign in Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-full max-w-sm bg-surface border border-border p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-accent">Sign in</h2>
              <button onClick={() => setShowModal(false)} className="text-text-dim hover:text-text text-2xl p-2 -m-2 cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Close">&times;</button>
            </div>
            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-3 py-3 bg-bg border border-border text-sm text-text hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <p className="text-[10px] text-text-dim mt-4 text-center">
              Sign in or create an account with your Google account.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
