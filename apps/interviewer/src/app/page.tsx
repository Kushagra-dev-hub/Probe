"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Target, Sparkle, ChatCircleText, TrendUp } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/hooks/useGsap";
import { useGSAP } from "@gsap/react";
import { useAuth } from "@/context/auth-context";

/* ── Shared class recipes (dark palette) ─────────────────────────── */
const CTA =
  "inline-flex items-center justify-center gap-2 rounded-full bg-mint px-7 py-3.5 font-semibold text-[15px] text-night transition-all duration-300 hover:bg-[#cbf3e7] hover:-translate-y-0.5 shadow-[0_0_40px_-8px_rgba(182,234,218,0.55)]";
const NAV_CTA =
  "inline-flex items-center justify-center gap-2 rounded-full bg-mint px-5 py-2 text-[14px] font-semibold text-night transition-all duration-300 hover:bg-[#cbf3e7]";
const GHOST =
  "inline-flex items-center justify-center gap-2 rounded-full border border-steel/40 px-7 py-3.5 font-semibold text-[15px] text-mint transition-all duration-300 hover:bg-steel/10 hover:border-steel/70";
const CARD =
  "rounded-3xl border border-steel/15 bg-grape/25 backdrop-blur-xl transition-all duration-300";

/* Small 4-point sparkle used for hero side decoration */
function DecoStar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`absolute ${className}`} fill="currentColor" aria-hidden>
      <path d="M12 0c1 8 3 11 12 12-9 1-11 4-12 12-1-8-3-11-12-12 9-1 11-4 12-12Z" />
    </svg>
  );
}

/* Animated live-interview-room preview */
const HERO_CODE = [
  { p: 0, node: <><span className="text-mint">def</span> <span className="text-steel">two_sum</span>(nums, target):</> },
  { p: 1, node: <span className="text-haze/50"># O(n) hash map lookup</span> },
  { p: 1, node: <>seen = {"{}"}</> },
  { p: 1, node: <><span className="text-mint">for</span> i, n <span className="text-mint">in</span> enumerate(nums):</> },
  { p: 2, node: <>diff = target - n</> },
  { p: 2, node: <><span className="text-mint">if</span> diff <span className="text-mint">in</span> seen:</> },
  { p: 3, node: <><span className="text-mint">return</span> [seen[diff], i]</> },
  { p: 2, node: <>seen[n] = i</> },
];

const HERO_SUGGESTIONS = [
  { q: "“What's the time complexity of this approach?”", cite: "Cites lines 1–8", conf: "96%" },
  { q: "“How does it behave with duplicate values?”", cite: "Cites lines 6–7", conf: "94%" },
  { q: "“Would this handle an empty input array?”", cite: "Edge case", conf: "92%" },
];

function HeroPreview() {
  const [elapsed, setElapsed] = useState(2417);
  const [visible, setVisible] = useState(0);
  const [phase, setPhase] = useState<"typing" | "running" | "accepted">("typing");
  const [sug, setSug] = useState(0);

  // ticking timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // typing → run → accepted → next-suggestion loop
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (visible < HERO_CODE.length) t = setTimeout(() => setVisible((v) => v + 1), 360);
      else t = setTimeout(() => setPhase("running"), 650);
    } else if (phase === "running") {
      t = setTimeout(() => setPhase("accepted"), 1100);
    } else {
      t = setTimeout(() => {
        setSug((s) => (s + 1) % HERO_SUGGESTIONS.length);
        setVisible(0);
        setPhase("typing");
      }, 2600);
    }
    return () => clearTimeout(t);
  }, [phase, visible]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="hero-preview relative w-full max-w-[640px]">
      {/* animated ambient glows */}
      <div className="pointer-events-none absolute -inset-10 -z-10">
        <div className="absolute left-2 top-4 h-56 w-56 animate-pulse rounded-full bg-steel/30 blur-3xl" />
        <div className="absolute bottom-2 right-4 h-56 w-56 animate-pulse rounded-full bg-mint/25 blur-3xl [animation-delay:1.1s]" />
      </div>

      {/* gradient ring */}
      <div className="rounded-[22px] bg-gradient-to-br from-steel/70 via-mint/50 to-steel/60 p-[1.5px] shadow-[0_35px_90px_-30px_rgba(0,0,0,0.95)]">
        <div className="overflow-hidden rounded-[21px] bg-night/95 backdrop-blur-xl">
          {/* room header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-night/70 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[10px] font-bold text-red-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> REC
              </span>
              <span className="text-[11px] font-semibold text-haze">Two Sum · Live round</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-mint/15 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-mint">
                {mm}:{ss}
              </span>
              <div className="flex -space-x-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-steel text-[9px] font-bold text-night ring-2 ring-night">JS</span>
                <span className="grid h-6 w-6 place-items-center rounded-full bg-mint text-[9px] font-bold text-night ring-2 ring-night">You</span>
              </div>
            </div>
          </div>

          {/* room body: solution (left) + copilot (right) — fixed height */}
          <div className="grid grid-cols-12 gap-2 p-3">
            {/* editor panel — candidate solution typing */}
            <div className="col-span-7 flex h-[300px] flex-col rounded-lg border border-white/5 bg-black/50">
              <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
                <span className="font-mono text-[9px] text-steel">solution.py</span>
                <span className="rounded bg-steel/15 px-1.5 py-0.5 text-[8px] font-bold text-steel">python</span>
              </div>
              <div className="flex-1 space-y-0.5 overflow-hidden p-3 font-mono text-[10.5px] leading-relaxed">
                {HERO_CODE.slice(0, visible).map((l, i) => (
                  <div key={i} style={{ paddingLeft: l.p * 12 }} className="animate-fade-in text-haze/85">
                    {l.node}
                    {i === visible - 1 && phase === "typing" && (
                      <span className="ml-0.5 inline-block animate-pulse text-mint">&#9613;</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-white/5 px-3 py-2">
                <span className="rounded-md bg-mint px-2.5 py-1 text-[9px] font-bold text-night">&#9654; Run</span>
                {phase === "typing" && <span className="text-[9px] font-medium text-steel">Editing&hellip;</span>}
                {phase === "running" && (
                  <span className="flex items-center gap-1.5 text-[9px] font-semibold text-steel">
                    <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-steel/30 border-t-mint" />
                    Running tests&hellip;
                  </span>
                )}
                {phase === "accepted" && (
                  <span className="flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                    &#10003; Accepted &middot; 4/4
                  </span>
                )}
              </div>
            </div>

            {/* copilot panel — reacts once the solution is written */}
            <div
              className={`col-span-5 flex h-[300px] flex-col rounded-lg border bg-gradient-to-b from-grape/55 to-night/40 p-3 transition-all duration-500 ${
                phase === "accepted"
                  ? "border-mint/45 shadow-[0_0_34px_-8px_rgba(182,234,218,0.45)]"
                  : "border-white/5"
              }`}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-mint text-night">
                    <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white">AI Copilot</span>
                </div>
                {phase === "accepted" ? (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-mint">
                    <span className="h-1.5 w-1.5 rounded-full bg-mint" /> Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-semibold text-steel">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-steel" /> Watching
                  </span>
                )}
              </div>

              {/* fixed content area: idle → response */}
              <div className="flex-1 overflow-hidden pt-3">
                {phase !== "accepted" ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <span className="material-symbols-outlined animate-pulse text-[30px] text-steel/60">neurology</span>
                    <p className="text-[10px] font-medium text-haze/60">
                      Analyzing the candidate&apos;s solution
                      <span className="typing-dot ml-1" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </p>
                  </div>
                ) : (
                  <div key={sug} className="animate-slide-up space-y-3">
                    <div className="rounded-lg border border-mint/30 bg-night/70 p-2.5">
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-mint">Ask this next</p>
                      <p className="text-[11px] font-semibold leading-snug text-white">{HERO_SUGGESTIONS[sug].q}</p>
                      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-[9px] text-steel">
                        <span>{HERO_SUGGESTIONS[sug].cite}</span>
                        <span className="font-bold text-mint">{HERO_SUGGESTIONS[sug].conf}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-[9.5px]">
                      <div className="flex items-center justify-between">
                        <span className="text-haze/80">Data Structures</span>
                        <span className="font-bold text-emerald-300">Strong</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-haze/80">Edge Cases</span>
                        <span className="font-bold text-amber-300">Follow-up</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturesSection() {
  const [activeTab, setActiveTab] = useState(0);

  const features = [
    { id: "reads-code", title: "Reads code as it's written", desc: "Analyzes the candidate's edits in real time and flags logical gaps, complexity issues, and missed edge cases." },
    { id: "ask-next", title: "Suggests the next question", desc: "Grounded, line-cited follow-ups delivered privately — so you always know exactly what to probe next." },
    { id: "rubrics", title: "Builds role-based rubrics", desc: "Turns any job description into weighted, objective evaluation criteria — so every candidate is measured the same way." },
    { id: "scorecard", title: "Drafts the scorecard", desc: "An evidence-backed evaluation citing exact code lines, so your hire decision is defensible and fair." },
    { id: "invisible", title: "Invisible to the candidate", desc: "Runs quietly on the interviewer's side only — zero distraction, zero latency in the candidate's editor." },
  ];

  return (
    <section id="copilot" className="scroll-mt-16 px-6 pb-20 pt-6 md:pb-28 md:pt-8">
      <div className="mx-auto max-w-[1240px]">
        {/* Header */}
        <div className="reveal mb-14 text-center">
          <h2 className="text-[2.2rem] font-extrabold tracking-tight text-white md:text-[2.9rem]">
            An AI copilot that sits <span className="text-mint">in the interview</span> with you
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-haze">
            Probe follows the candidate&apos;s code and conversation as they happen — quietly, on the interviewer&apos;s side — so you can focus on the person, not on note-taking.
          </p>
        </div>

        {/* 2-Column Split: Balanced 6-col Left / 6-col Right */}
        <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Balanced width (6 cols) */}
          <div className="reveal relative lg:col-span-6 pl-6 border-l-2 border-steel/20 space-y-8">
            {features.map((item, idx) => {
              const isSelected = activeTab === idx;
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveTab(idx)}
                  className="group relative cursor-pointer transition-all duration-300"
                >
                  {/* Left accent indicator line */}
                  <div className="absolute -left-[26px] top-0 bottom-0 w-[4px] rounded-r bg-transparent">
                    <div className={`h-full w-full rounded-r bg-mint shadow-[0_0_14px_rgba(182,234,218,0.85)] transition-opacity duration-300 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                  </div>

                  <div className="space-y-2.5">
                    <h3 className={`font-extrabold tracking-tight transition-all ${
                      isSelected ? "text-white text-[25px]" : "text-haze/70 text-[20px] group-hover:text-white"
                    }`}>
                      {item.title}
                    </h3>

                    {isSelected && (
                      <p className="text-[15.5px] leading-relaxed text-haze/90 pr-4">
                        {item.desc}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: the live-room animation (reused hero preview) */}
          <div className="reveal flex justify-center lg:col-span-6 lg:justify-end">
            <HeroPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

/* 6-card overview of everything Probe does */
function FeatureGrid() {
  const items = [
    { img: "/interview_lineart.png", pos: "object-center", title: "Live coding room", desc: "HD video, screen share, and a shared code editor — the whole interview happens in one collaborative room." },
    { img: "/practice_lineart.png", pos: "object-center", title: "Real code execution", desc: "Run the candidate's solution against real test cases in 40+ languages, right inside the room." },
    { img: "/blog1.png", pos: "object-center", title: "AI code intelligence", desc: "The copilot reads code edits as they happen and flags logical gaps, complexity issues, and missed edge cases." },
    { img: "/blog2.png", pos: "object-center", title: "Ask-this-next", desc: "Grounded, line-cited follow-up questions delivered privately to the interviewer at the right moment." },
    { img: "/linkedin_lineart.png", pos: "object-center", title: "Role-based rubrics", desc: "Paste any job description and get objective, weighted evaluation criteria tailored to the role." },
    { img: "/analytics_lineart.png", pos: "object-[50%_60%]", title: "Evidence scorecards", desc: "Auto-drafted evaluations that cite exact code lines, so your hire/no-hire call is backed by proof." },
  ];

  return (
    <section id="features" className="scroll-mt-16 px-6 pb-20 pt-6 md:pb-24 md:pt-8">
      <div className="mx-auto max-w-[1240px]">
        <div className="reveal mb-14 text-center">
          <h2 className="mx-auto max-w-[22ch] text-[2.2rem] font-extrabold tracking-tight text-white md:text-[2.8rem]">
            Everything a technical interview needs, <span className="text-mint">in one room</span>
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <div
              key={f.title}
              className={`reveal group ${CARD} overflow-hidden hover:-translate-y-1.5 hover:border-mint/40 hover:shadow-[0_24px_60px_-24px_rgba(182,234,218,0.28)]`}
            >
              {/* image header */}
              <div className="relative h-52 overflow-hidden">
                <Image
                  src={f.img}
                  alt={f.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className={`${f.pos} object-cover transition-transform duration-[600ms] ease-out group-hover:scale-110`}
                />
                {/* palette wash to unify photos + line-art on the dark card */}
                <div className="absolute inset-0 bg-gradient-to-t from-grape via-grape/30 to-transparent" />
                <div className="absolute inset-0 bg-steel/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              </div>
              {/* copy */}
              <div className="px-6 pb-7 pt-5">
                <h3 className="mb-2.5 text-[19px] font-bold tracking-tight text-white transition-colors group-hover:text-mint">
                  {f.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-haze/80">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const mainRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user } = useAuth();

  const goNew = () => router.push("/later");

  const scrollTo = (hash: string) => {
    const target = document.querySelector(hash);
    if (target) {
      const y = target.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  useGSAP(
    () => {
      const el = mainRef.current;
      if (!el) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      // hero intro
      gsap.from(".hero-stagger", {
        opacity: 0,
        y: 28,
        duration: 0.8,
        stagger: 0.12,
        ease: "power3.out",
      });
      gsap.from(".hero-preview", {
        opacity: 0,
        y: 40,
        scale: 0.96,
        duration: 1,
        delay: 0.2,
        ease: "power3.out",
      });

      // generic scroll reveals
      const items = gsap.utils.toArray<HTMLElement>(".reveal");
      items.forEach((node) => {
        gsap.set(node, { opacity: 0, y: 34 });
        ScrollTrigger.create({
          trigger: node,
          start: "top 88%",
          onEnter: () => gsap.to(node, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }),
        });
      });

      // ── How-it-works roadmap ──
      const howSection = el.querySelector("#how-it-works");
      const roadmap = howSection?.querySelector<HTMLElement>(".md\\:block");
      if (howSection && roadmap) {
        // step circles pop in
        gsap.fromTo(
          howSection.querySelectorAll(".step-circle"),
          { opacity: 0, scale: 0 },
          {
            opacity: 1, scale: 1, duration: 0.5, stagger: 0.2, ease: "back.out(2)",
            scrollTrigger: { trigger: roadmap, start: "top 75%" },
          },
        );
        // step cards slide in from their side
        howSection.querySelectorAll<HTMLElement>(".step-card").forEach((card, i) => {
          const fromLeft = i % 2 === 0;
          gsap.fromTo(
            card,
            { opacity: 0, x: fromLeft ? -60 : 60 },
            {
              opacity: 1, x: 0, duration: 0.8, ease: "power3.out",
              scrollTrigger: { trigger: card, start: "top 82%" },
            },
          );
        });
        // the S-curve line draws on as you scroll (scrub)
        howSection.querySelectorAll<SVGPathElement>(".how-path").forEach((path) => {
          const length = path.getTotalLength?.() || 500;
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
          gsap.to(path, {
            strokeDashoffset: 0,
            ease: "none",
            scrollTrigger: { trigger: roadmap, start: "top 70%", end: "bottom 55%", scrub: 1 },
          });
        });
      }
    },
    { scope: mainRef },
  );

  return (
    <>
      <div
        ref={mainRef}
        className="relative min-h-screen w-full overflow-x-hidden bg-night text-haze antialiased"
      >
        {/* ambient background glows */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div
            className="absolute -top-40 right-[-10%] h-[560px] w-[560px] rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, #301E67 0%, transparent 70%)" }}
          />
          <div
            className="absolute top-[30%] left-[-15%] h-[520px] w-[520px] rounded-full opacity-[0.12] blur-3xl"
            style={{ background: "radial-gradient(circle, #5B8FB9 0%, transparent 70%)" }}
          />
          <div
            className="absolute bottom-[-10%] right-[20%] h-[420px] w-[420px] rounded-full opacity-[0.08] blur-3xl"
            style={{ background: "radial-gradient(circle, #B6EADA 0%, transparent 70%)" }}
          />
        </div>

        {/* ── Header ── */}
        <header className="sticky top-0 z-40 w-full border-b border-steel/10 bg-night/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
            <Link href="/">
              <Image src="/logo_big_dark.svg" alt="Probe." width={170} height={48} className="h-10 w-auto" priority />
            </Link>
            <nav className="hidden items-center gap-9 md:flex">
              {[
                { label: "Features", href: "#features" },
                { label: "AI Copilot", href: "#copilot" },
                { label: "How it works", href: "#how-it-works" },
                { label: "FAQ", href: "#faq" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => scrollTo(item.href)}
                  className="text-[15px] font-medium tracking-tight text-haze transition-colors hover:text-mint"
                >
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              {user ? (
                <Link href="/dashboard" className={NAV_CTA}>
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="hidden px-4 py-2 text-sm font-medium text-haze transition-colors hover:text-white sm:block">
                    Log In
                  </Link>
                  <Link href="/login?tab=signup" className={NAV_CTA}>
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="w-full">
          {/* ── Hero ── */}
          <section className="relative px-6 pt-6 pb-16 md:pt-8 md:pb-20">
            {/* decorative side elements (subtle) */}
            <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
              {/* left */}
              <div className="hero-anim-float absolute left-[5%] top-28 h-16 w-16 rounded-full border border-steel/15" />
              <DecoStar className="left-[8%] top-52 h-4 w-4 animate-pulse text-mint/40" />
              <div className="absolute left-[6%] top-[24rem] h-40 w-40 rounded-full bg-steel/[0.06] blur-3xl" />
              {/* right */}
              <div className="hero-anim-float absolute right-[5%] top-40 h-14 w-14 rounded-full border border-mint/15 [animation-delay:1s]" />
              <DecoStar className="right-[7%] top-56 h-5 w-5 animate-pulse text-mint/40 [animation-delay:.5s]" />
              <div className="absolute right-[6%] top-[24rem] h-40 w-40 rounded-full bg-mint/[0.06] blur-3xl" />
            </div>

            {/* centered copy */}
            <div className="relative mx-auto max-w-[980px] text-center">
              <h1 className="hero-stagger mx-auto max-w-[26ch] text-[2.7rem] font-extrabold leading-[1.05] tracking-tight text-white md:text-[4rem]">
                The interview room that{" "}
                <span className="bg-gradient-to-r from-steel via-mint to-white bg-clip-text text-transparent">
                  thinks with you.
                </span>
              </h1>
              <p className="hero-stagger mx-auto mt-4 max-w-[68ch] text-[15.5px] leading-relaxed text-haze md:text-[17px]">
                A live coding interview room with HD video, a shared editor, and real code execution with an AI
                copilot that reads the candidate&apos;s code, hands you the next question, and drafts an
                evidence-backed scorecard.
              </p>
              <div className="hero-stagger mt-6 flex justify-center">
                <button onClick={goNew} className={CTA}>
                  Start an interview
                  <span className="material-symbols-outlined text-xl">arrow_forward</span>
                </button>
              </div>
            </div>

            {/* large media panel */}
            <div className="hero-preview relative mx-auto mt-10 max-w-[980px]">
              {/* floating accent card — left */}
              <div className="absolute -left-4 top-20 z-20 hidden w-44 -rotate-6 rounded-2xl border border-steel/20 bg-grape/80 p-3 shadow-2xl backdrop-blur-xl lg:block xl:-left-10">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-steel to-mint text-[10px] font-bold text-night">A</span>
                  <div className="leading-tight">
                    <p className="text-[11px] font-bold text-white">Candidate</p>
                    <p className="text-[9px] text-mint">screen sharing</p>
                  </div>
                </div>
              </div>

              {/* floating accent card — right (NEW! sticker) */}
              <div className="absolute -right-4 top-10 z-20 hidden w-52 rotate-6 rounded-2xl border border-mint/25 bg-grape/80 p-3 shadow-2xl backdrop-blur-xl lg:block xl:-right-10">
                <span className="absolute -right-2 -top-3 rotate-12 rounded-full bg-mint px-2 py-0.5 text-[10px] font-black text-night shadow-lg">NEW!</span>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-mint">auto_awesome</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-mint">Ask this next</span>
                </div>
                <p className="text-[10.5px] font-semibold leading-snug text-white">
                  &ldquo;How does this handle duplicate values?&rdquo;
                </p>
              </div>

              {/* gradient-ring media */}
              <div className="rounded-[28px] bg-gradient-to-br from-steel/60 via-mint/40 to-steel/50 p-[1.5px] shadow-[0_45px_120px_-45px_rgba(0,0,0,0.95)]">
                <div className="relative overflow-hidden rounded-[27px] bg-night">
                  {/* window bar */}
                  <div className="flex items-center gap-2 border-b border-white/10 bg-night/80 px-5 py-3">
                    <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                    <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                    <span className="h-3 w-3 rounded-full bg-mint" />
                  </div>

                  {/* body: video stage + editor */}
                  <div className="grid h-[280px] grid-cols-12 md:h-[420px]">
                    <div className="col-span-5 flex flex-col gap-3 border-r border-white/5 bg-black/40 p-4">
                      {[
                        { n: "Candidate", t: "from-steel to-mint", i: "A" },
                        { n: "You", t: "from-mint to-steel", i: "Y" },
                      ].map((v) => (
                        <div key={v.n} className="relative flex-1 overflow-hidden rounded-xl border border-white/5 bg-grape/25">
                          <div className="grid h-full place-items-center">
                            <span className={`grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br ${v.t} text-lg font-bold text-night`}>{v.i}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="col-span-7 space-y-1 bg-black/50 p-4 font-mono text-[11px] leading-relaxed md:text-[12px]">
                      <div className="text-steel/60"># two_sum — O(n)</div>
                      <div><span className="text-mint">def</span> <span className="text-steel">two_sum</span>(nums, target):</div>
                      <div className="pl-4 text-haze/85">seen = {"{}"}</div>
                      <div className="pl-4"><span className="text-mint">for</span> i, n <span className="text-mint">in</span> enumerate(nums):</div>
                      <div className="pl-8 text-haze/85">diff = target - n</div>
                      <div className="pl-8"><span className="text-mint">if</span> diff <span className="text-mint">in</span> seen:</div>
                      <div className="pl-12 text-haze/85"><span className="text-mint">return</span> [seen[diff], i]</div>
                      <div className="pl-8 text-haze/85">seen[n] = i</div>
                    </div>
                  </div>

                  {/* dim + play overlay */}
                  <div className="absolute inset-0 grid place-items-center bg-night/40">
                    <button
                      onClick={() => scrollTo("#features")}
                      className="group relative grid h-24 w-24 place-items-center"
                      aria-label="Watch the demo"
                    >
                      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full animate-[spin_16s_linear_infinite]">
                        <defs>
                          <path id="watchRing" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
                        </defs>
                        <text className="fill-mint/80 text-[10px] font-bold uppercase tracking-[0.28em]">
                          <textPath href="#watchRing">Watch the demo &middot; Watch the demo &middot; </textPath>
                        </text>
                      </svg>
                      <span className="grid h-16 w-16 place-items-center rounded-full bg-mint text-night shadow-[0_0_40px_-6px_rgba(182,234,218,0.7)] transition-transform duration-300 group-hover:scale-110">
                        <span className="material-symbols-outlined text-[30px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Features overview (6 cards) ── */}
          <FeatureGrid />

          {/* ── Copilot deep-dive (interactive list + live-room animation) ── */}
          <FeaturesSection />

          {/* ── CTA banner ── */}
          <section className="px-6 py-12">
            <div className="mx-auto max-w-[1200px]">
              <div
                className="reveal relative overflow-hidden rounded-3xl border border-steel/20 px-8 py-12 md:px-14"
                style={{ background: "linear-gradient(120deg, #301E67 0%, #03001C 60%, #114 100%)" }}
              >
                <div
                  className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
                  style={{ background: "radial-gradient(circle, #5B8FB9, transparent 70%)" }}
                />
                <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
                  <div className="max-w-2xl">
                    <h2 className="mb-2 text-2xl font-extrabold text-white md:text-3xl">
                      Never conduct an interview without Copilot again
                    </h2>
                    <p className="leading-relaxed text-haze">
                      Get real-time question suggestions, custom role rubrics, and line-cited evaluation scorecards.
                    </p>
                  </div>
                  <button onClick={goNew} className={`${CTA} shrink-0`}>
                    Create an Interview
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ── How it works (scroll-drawn roadmap) ── */}
          <section id="how-it-works" className="scroll-mt-16 px-6 pb-20 pt-6 md:pt-8">
            <div className="mx-auto max-w-[1100px]">
              <div className="mb-12 text-center md:mb-16">
                <h2 className="text-[2.2rem] font-extrabold tracking-tight text-white md:text-[2.8rem]">
                  How AI Copilot <span className="text-mint">works</span>
                </h2>
              </div>

              {/* ── Desktop roadmap ── */}
              <div className="relative mt-8 hidden md:block" style={{ height: 750 }}>
                {/* S-curve path — draws on as you scroll */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 750" preserveAspectRatio="none" fill="none" aria-hidden>
                  {/* static faint guide track */}
                  <path d="M420 105 C420 195 580 205 580 280 C580 355 420 360 420 455 C420 545 580 555 580 630"
                    stroke="#301E67" strokeWidth="3" strokeLinecap="round" />
                  {/* bright mint line that draws on scroll */}
                  <path className="how-path" d="M420 105 C420 195 580 205 580 280 C580 355 420 360 420 455 C420 545 580 555 580 630"
                    stroke="#B6EADA" strokeWidth="2.5" strokeLinecap="round"
                    style={{ filter: "drop-shadow(0 0 6px rgba(182,234,218,0.55))" }} />
                </svg>

                {/* Step circles along the curve */}
                {[
                  { step: "01", left: "42%", top: 105 },
                  { step: "02", left: "58%", top: 280 },
                  { step: "03", left: "42%", top: 455 },
                  { step: "04", left: "58%", top: 630 },
                ].map((c) => (
                  <div key={c.step} className="step-circle absolute z-20" style={{ left: c.left, top: c.top, transform: "translate(-50%,-50%)" }}>
                    <div className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-2 border-mint bg-night text-[13px] font-black text-mint shadow-[0_0_0_4px_rgba(182,234,218,0.12),0_0_18px_rgba(182,234,218,0.35)]">
                      {c.step}
                    </div>
                  </div>
                ))}

                {/* Cards */}
                {[
                  { step: "01", side: "left" as const, top: 0, title: "Define Job Rubric", desc: "Paste your Job Description or select a role title to generate custom, weighted evaluation rubrics.", icon: <Target className="h-5 w-5 text-night lg:h-6 lg:w-6" weight="bold" /> },
                  { step: "02", side: "right" as const, top: 175, title: "Live Code Analysis", desc: "Probe Copilot reads the candidate's code edits as they solve — flagging logic gaps and complexity issues in real time.", icon: <ChatCircleText className="h-5 w-5 text-night lg:h-6 lg:w-6" weight="bold" /> },
                  { step: "03", side: "left" as const, top: 350, title: "Smart Prompts", desc: "Review “Ask This Next” follow-ups with exact line citations, delivered privately so you always know what to probe.", icon: <TrendUp className="h-5 w-5 text-night lg:h-6 lg:w-6" weight="bold" /> },
                  { step: "04", side: "right" as const, top: 525, title: "Auto-Scorecard", desc: "Receive an evidence-backed evaluation draft citing exact code lines, with strengths and concerns prefilled.", icon: <Sparkle className="h-5 w-5 text-night lg:h-6 lg:w-6" weight="bold" /> },
                ].map((item) => (
                  <div key={item.step} className="step-card group absolute" style={{ [item.side]: 0, top: item.top, width: "38%" }}>
                    <div className="rounded-2xl bg-gradient-to-b from-grape/30 via-grape/15 to-transparent p-5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:from-grape/40 hover:via-grape/20 hover:shadow-[0_26px_70px_-14px_rgba(0,0,0,0.8)] lg:p-6">
                      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center lg:mb-4 lg:gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-mint lg:h-14 lg:w-14">
                          {item.icon}
                        </div>
                        <h3 className="text-[17px] font-extrabold tracking-tight text-mint lg:text-[19px]">{item.title}</h3>
                      </div>
                      <p className="text-[13.5px] font-medium leading-[1.65] text-haze/80 lg:text-[14.5px]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Mobile: vertical stack ── */}
              <div className="mt-8 flex flex-col gap-5 md:hidden">
                {[
                  { step: "01", title: "Define Job Rubric", desc: "Paste your Job Description or select a role to generate custom, weighted evaluation rubrics.", icon: <Target className="h-5 w-5 text-night" weight="bold" /> },
                  { step: "02", title: "Live Code Analysis", desc: "Copilot reads the candidate's code edits as they solve, flagging gaps in real time.", icon: <ChatCircleText className="h-5 w-5 text-night" weight="bold" /> },
                  { step: "03", title: "Smart Prompts", desc: "Line-cited “Ask This Next” follow-ups delivered privately, so you know what to probe.", icon: <TrendUp className="h-5 w-5 text-night" weight="bold" /> },
                  { step: "04", title: "Auto-Scorecard", desc: "An evidence-backed evaluation draft with strengths and concerns prefilled.", icon: <Sparkle className="h-5 w-5 text-night" weight="bold" /> },
                ].map((item) => (
                  <div key={item.step} className="reveal rounded-2xl bg-gradient-to-b from-grape/30 via-grape/15 to-transparent p-5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-sm">
                    <div className="mb-3.5 flex items-center gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-mint">{item.icon}</div>
                      <h3 className="text-[16px] font-extrabold tracking-tight text-mint sm:text-[17px]">{item.title}</h3>
                    </div>
                    <p className="text-[13.5px] font-medium leading-[1.65] text-haze/80">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── FAQ ── */}
          <section id="faq" className="scroll-mt-16 px-6 pb-16 pt-6 md:pb-24 md:pt-8">
            <div className="mx-auto max-w-[860px]">
              <div className="reveal mb-12 text-center">
                <h2 className="mb-3 text-[2.2rem] font-extrabold tracking-tight text-white md:text-[2.8rem]">
                  Frequently asked <span className="text-mint">questions</span>
                </h2>
                <p className="text-[17px] text-haze">Everything you need to know about Probe AI Copilot.</p>
              </div>
              <div className="reveal flex flex-col gap-3">
                {[
                  { q: "What is Probe AI Copilot?", a: "Probe AI Copilot is an intelligent assistant for interviewers that analyzes candidate code live, suggests targeted follow-up questions, and auto-drafts evidence-backed evaluation scorecards." },
                  { q: "Does the candidate see the AI Copilot?", a: "No. Probe AI Copilot operates exclusively for the interviewer, delivering real-time question suggestions and scorecard drafts without interrupting candidate focus." },
                  { q: "How does Copilot generate suggestions?", a: "Copilot debounces candidate code edits (7 seconds idle) and evaluates the approach against problem constraints, edge cases, and your custom job rubric." },
                  { q: "How are evaluation rubrics generated?", a: "Probe parses job description text or role titles using LLM providers to construct 6-criteria evaluation rubrics tailored specifically to the target role." },
                  { q: "Can I use AI Copilot for any technical role?", a: "Yes. You can paste any Job Description — from Backend Engineer to System Architect — and Probe will generate role-specific rubrics and suggestions." },
                ].map((faq, i) => (
                  <details key={i} className="group rounded-2xl border border-steel/15 bg-grape/20 px-6 transition-colors open:border-steel/30 open:bg-grape/30">
                    <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-[16px] font-semibold text-white transition-colors group-hover:text-mint [&::-webkit-details-marker]:hidden">
                      {faq.q}
                      <span className="ml-4 shrink-0 text-mint transition-transform duration-300 group-open:rotate-180">
                        <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" width="20"><path d="M6 9l6 6 6-6" /></svg>
                      </span>
                    </summary>
                    <div className="pb-5 pr-8 text-[15px] leading-relaxed text-haze/85">{faq.a}</div>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* ── Footer (thin bar) ── */}
          <footer className="border-t border-steel/10 px-6 py-6">
            <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 text-xs text-haze/60 md:flex-row">
              <Image src="/logo_big_dark.svg" alt="Probe." width={100} height={28} className="h-6 w-auto" />
              <nav className="flex items-center gap-6">
                <button onClick={() => scrollTo("#features")} className="transition-colors hover:text-mint">Features</button>
                <button onClick={() => scrollTo("#copilot")} className="transition-colors hover:text-mint">AI Copilot</button>
                <button onClick={() => scrollTo("#how-it-works")} className="transition-colors hover:text-mint">How it works</button>
                <button onClick={() => scrollTo("#faq")} className="transition-colors hover:text-mint">FAQ</button>
              </nav>
              <p>© 2026 Probe. All rights reserved.</p>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}
