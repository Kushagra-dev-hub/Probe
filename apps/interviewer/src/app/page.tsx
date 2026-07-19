"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ForceLight } from "@/components/force-light";
import { CookieConsent } from "@/components/cookie-consent";
import { Target, Sparkle, ChatCircleText, TrendUp } from "@phosphor-icons/react";
import BorderGlow from "@/components/BorderGlow";
import { useEffect, useRef, useState, useCallback } from "react";
import { gsap, ScrollTrigger } from "@/hooks/useGsap";
import { useGSAP } from "@gsap/react";
import { useAuth } from "@/context/auth-context";
import { publicBlogFallbackPosts } from "@/lib/public-blog-fallback";

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverImage: string | null;
  content: string;
  author: {
    id: string;
    name: string;
    avatar: string | null;
  };
  publishedAt: string;
  readTimeMinutes: number;
  views: number;
  tags: string[];
  featured: boolean;
}

function CompanyLogo({ name }: { name: string }) {
  const logos: Record<string, React.ReactNode> = {
    Meta: (
      <span className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#0082FB"/>
          <path d="M4 15.5C4 17 4.8 18 6 18c1 0 1.6-.5 2.5-1.8L12 11l3.5 5.2c.9 1.3 1.5 1.8 2.5 1.8 1.2 0 2-1 2-2.5 0-.8-.2-1.4-.7-2.1L15 8.2C14.2 7 13.3 6.4 12 6.4c-1.3 0-2.2.6-3 1.8L4.7 13.4C4.2 14.1 4 14.7 4 15.5z" fill="white"/>
        </svg>
        <span className="font-bold text-[13px] tracking-wide text-[#1a1a1a]">META</span>
      </span>
    ),
    Google: (
      <span className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span className="font-bold text-[13px] tracking-wide text-[#1a1a1a]">GOOGLE</span>
      </span>
    ),
    Stripe: (
      <span className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#635BFF"/>
          <path d="M11.2 9.4c0-.7.6-1 1.5-1 1.3 0 2.9.4 4.2 1.1V6.3c-1.4-.6-2.8-.9-4.2-.9-3.4 0-5.7 1.8-5.7 4.7 0 4.6 6.3 3.9 6.3 5.9 0 .8-.7 1.1-1.7 1.1-1.5 0-3.3-.6-4.8-1.5v3.3c1.6.7 3.3 1 4.8 1 3.5 0 5.9-1.7 5.9-4.7-.1-4.9-6.3-4.1-6.3-5.8z" fill="white"/>
        </svg>
        <span className="font-bold text-[13px] tracking-wide text-[#1a1a1a]">STRIPE</span>
      </span>
    ),
    Amazon: (
      <span className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#232F3E"/>
          <path d="M14.9 14.4c-1.8 1.3-4.4 2-6.6 2-3.1 0-5.9-1.2-8-3.1-.2-.2 0-.4.2-.3 2.3 1.3 5.1 2.1 8 2.1 2 0 4.1-.4 6.1-1.2.3-.1.5.2.3.5z" fill="#FF9900"/>
          <path d="M15.7 13.5c-.2-.3-1.5-.1-2.1 0-.2 0-.2-.1-.1-.3.4-1 1.1-.7 1.8-.8.6-.1 1.2.1 1.3.3.2.3-.1 1.4-.4 1.9-.1.1-.2.1-.3 0l-.2-1.1z" fill="#FF9900"/>
          <text x="3" y="12" fontSize="6" fontWeight="bold" fill="white">amazon</text>
        </svg>
        <span className="font-bold text-[13px] tracking-wide text-[#1a1a1a]">AMAZON</span>
      </span>
    ),
    Shopify: (
      <span className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#96BF48"/>
          <path d="M15.5 6.5s-.2-.1-.6-.1c0-.1-.3-1.8-2-1.8-.1 0-.3 0-.4.1C12.3 4.3 12 4 11.4 4c-1.1 0-2.1.8-2.4 2C7.9 6.2 7.5 6.4 7.5 6.4L6.8 14 13 15.5l4-1L15.5 6.5zm-4-1.5c.2 0 .4.1.5.2-.4.2-.7.5-.8 1H9.8c.3-.8.9-1.2 1.7-1.2zM12 19l-1-.3v-1l1 .2V19zm1 .3l-1-.3v-1l1 .2v1.1z" fill="white"/>
        </svg>
        <span className="font-bold text-[13px] tracking-wide text-[#1a1a1a]">SHOPIFY</span>
      </span>
    ),
    Atlassian: (
      <span className="flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#0052CC"/>
          <path d="M8.2 12.4c-.2-.2-.4-.1-.5.1l-2.3 4.9c-.1.2 0 .4.2.4h4c.1 0 .3-.1.3-.2.9-2 .4-4-.7-5.2zM12 4.2c-2.5 3.5-2.1 7.1-.4 9.5.5.7 1.3 1.8 1.9 2.9.1.1.2.2.3.2h4c.2 0 .3-.2.2-.4C15.1 10 12 4.2 12 4.2z" fill="white"/>
        </svg>
        <span className="font-bold text-[13px] tracking-wide text-[#1a1a1a]">ATLASSIAN</span>
      </span>
    ),
  };
  return <>{logos[name] ?? <span className="font-bold text-[13px] tracking-widest text-[#bbb] uppercase">{name}</span>}</>;
}

function FadeInRow({ children, className = "", dir = "up" }: { children: React.ReactNode; className?: string; dir?: "up" | "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      // Animate the whole row
      gsap.fromTo(el,
        { opacity: 0, x: dir === "left" ? -80 : dir === "right" ? 80 : 0, y: dir === "up" ? 60 : 0 },
        {
          opacity: 1, x: 0, y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%", end: "top 40%", toggleActions: "play none none none" },
        }
      );
      // Stagger text children
      const textEls = el.querySelectorAll(".feat-text > *");
      if (textEls.length) {
        gsap.fromTo(textEls,
          { opacity: 0, y: 24, filter: "blur(4px)" },
          {
            opacity: 1, y: 0, filter: "blur(0px)",
            duration: 0.7, stagger: 0.12, ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 78%", toggleActions: "play none none none" },
          }
        );
      }
      // Image reveal with scale
      const imgWrap = el.querySelector(".feat-img-wrap");
      if (imgWrap) {
        gsap.fromTo(imgWrap,
          { opacity: 0, scale: 0.92, y: 30 },
          {
            opacity: 1, scale: 1, y: 0,
            duration: 0.9, ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 80%", toggleActions: "play none none none" },
          }
        );
      }
    }, el);
    return () => ctx.revert();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

const BLUE = "#4A7CFF";

function TopCompaniesSection({ className = "" }: { className?: string }) {
  const companies = [
    { name: "Google", src: "https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg", scale: 1.1 },
    { name: "Amazon", src: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg", translateY: "8px" },
    { name: "Meta", src: "https://cdn.simpleicons.org/meta" },
    { name: "Netflix", src: "https://cdn.simpleicons.org/netflix" },
    { name: "Apple", src: "https://cdn.simpleicons.org/apple", scale: 1.1 },
    { name: "Microsoft", src: "https://upload.wikimedia.org/wikipedia/commons/9/96/Microsoft_logo_%282012%29.svg", scale: 1.15 },
    { name: "Stripe", src: "https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo,_revised_2016.svg", scale: 1.1 },
    { name: "Uber", src: "https://cdn.simpleicons.org/uber", scale: 1.5 },
    { name: "Airbnb", src: "https://cdn.simpleicons.org/airbnb" },
    { name: "Spotify", src: "https://cdn.simpleicons.org/spotify" }
  ];

  return (
    <section className={`pt-8 pb-16 md:pt-12 md:pb-24 bg-[#f4f5f7] overflow-hidden companies-section ${className}`}>
      <div className="max-w-[1260px] mx-auto px-6 mb-12 text-center text-content">
        <h2 className="text-[2rem] md:text-[2.6rem] font-black text-[#111] tracking-tight">Get placed at <span style={{ color: BLUE }}>top companies</span></h2>
      </div>
      
      {/* Bare Logos Grid */}
      <div className="max-w-[1000px] mx-auto px-6">
        <div className="flex flex-wrap justify-center gap-12 md:gap-16 items-center">
          {companies.map((company, i) => (
            <div key={i} className="company-logo-wrapper">
              <div className="flex items-center justify-center w-24 sm:w-28 md:w-32 h-10 md:h-12 transition-transform duration-300 hover:-translate-y-1 hover:scale-105 cursor-default">
                <img 
                  src={company.src} 
                  alt={company.name} 
                  className="w-full h-full object-contain pointer-events-none drop-shadow-sm transition-transform"
                  style={{ transform: `${company.scale ? `scale(${company.scale})` : ""} ${company.translateY ? `translateY(${company.translateY})` : ""}`.trim() || "none" }}
                  loading="lazy"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS_DATA = [
  {
    quote: "The system design feedback is unparalleled. I finally understood how to articulate scaling trade-offs. Every session felt like a real onsite with a senior engineer.",
    name: "Alex Chen",
    role: "Senior Dev",
    company: "Meta",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuD4_2LLAd4-3mGFAKmNcYaIwEwOxlGjiVTkz6DoqanVnTepJyKk7NL4QZOg3cudb9BMSTxrd5TuY_BnyCvF2ooAq3a4Tm1EYVN7PTNc_nuZxEMhPjIn5Dx9uTR_RyH56Db6NTeP7tni2btDhG1hx3OKEs-6SqPzQ5UYkkZJOAmjNBE3uWgv_FELA0S41_rj-Xm04vOR-ZMXOMB-QnSwNLhJR2Z9CNO8yX9mPZOCVcmy1IF1ZdpeqdtDCzpE9GBH9yszUr5t7xC5ma0",
  },
  {
    quote: "I practiced 50 times before my Google onsite. The AI predicted 3 of the questions I got asked. This platform is the closest thing to the real thing.",
    name: "Sarah Jenkins",
    role: "L5 SWE",
    company: "Google",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDk19n_fWR8kLX-SOTiyN6yk9HqoSyZmCnLAxCsaU1Kv1YOyPbi6Khk--g7nhWnN69gDptJRVOmJZUqBUq_TAs7Q170UkOXtrmDUdXLe-NEyi1tJELOh-Qv8TWtr1kzPoZMxPQCynH34353AVSpqYcCXcT9oc4zuHnObxIAbXrMKTdc5XeEVPWegQ1GCxsh3RH6rfwP1K-X8PJutEXC05Xt_XUh0bRGQE_XEwh54-vu5sdUTrWE3OquTSVVoLgZYRulsIZrizp-HYA",
  },
  {
    quote: "Behavioral questions were always my weak spot. The sentiment analysis truly changed how I communicate under pressure. I felt noticeably more confident.",
    name: "David Miller",
    role: "Staff Engineer",
    company: "Stripe",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBZnln7YTADeKvELwW9CBCfobED0eCjMovkLj5pHTwBXNSCSfkYiKnRmB_rnBJUeVObHLRosb2WJyJMmD8CPAUJvEWYcdIUxiCnDwkRfAW8gqhtTnP2ZqYzGNTRh3Cu-r9xGHkDxEewrKZhg5b1oXjOm-2hoD9uG2RbNdy_lQzbrL0W3b5ki-CwQpBgJEfM9d4UPnOJ5jv8OdChqW5hwmA1S2Dw5jyz9iXvhpnAH7khtXT_oCpHynJRXxeuMVTynAmTKFCiRukLs4o",
  },
  {
    quote: "The voice interview mode is a game-changer. It feels exactly like a real phone screen. I stopped dreading interviews and started enjoying the process.",
    name: "Priya Patel",
    role: "SDE-2",
    company: "Amazon",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuD4_2LLAd4-3mGFAKmNcYaIwEwOxlGjiVTkz6DoqanVnTepJyKk7NL4QZOg3cudb9BMSTxrd5TuY_BnyCvF2ooAq3a4Tm1EYVN7PTNc_nuZxEMhPjIn5Dx9uTR_RyH56Db6NTeP7tni2btDhG1hx3OKEs-6SqPzQ5UYkkZJOAmjNBE3uWgv_FELA0S41_rj-Xm04vOR-ZMXOMB-QnSwNLhJR2Z9CNO8yX9mPZOCVcmy1IF1ZdpeqdtDCzpE9GBH9yszUr5t7xC5ma0",
  },
  {
    quote: "After two weeks with Probe I got three offers. The rubric-scored reports showed me exactly what to fix and the improvement was immediate and measurable.",
    name: "James Wright",
    role: "Frontend Lead",
    company: "Shopify",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBZnln7YTADeKvELwW9CBCfobED0eCjMovkLj5pHTwBXNSCSfkYiKnRmB_rnBJUeVObHLRosb2WJyJMmD8CPAUJvEWYcdIUxiCnDwkRfAW8gqhtTnP2ZqYzGNTRh3Cu-r9xGHkDxEewrKZhg5b1oXjOm-2hoD9uG2RbNdy_lQzbrL0W3b5ki-CwQpBgJEfM9d4UPnOJ5jv8OdChqW5hwmA1S2Dw5jyz9iXvhpnAH7khtXT_oCpHynJRXxeuMVTynAmTKFCiRukLs4o",
  },
  {
    quote: "Resume analysis found gaps I never noticed. After the AI rewrites I started getting callbacks for roles I had given up on applying to.",
    name: "Nina Torres",
    role: "Product Manager",
    company: "Atlassian",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDk19n_fWR8kLX-SOTiyN6yk9HqoSyZmCnLAxCsaU1Kv1YOyPbi6Khk--g7nhWnN69gDptJRVOmJZUqBUq_TAs7Q170UkOXtrmDUdXLe-NEyi1tJELOh-Qv8TWtr1kzPoZMxPQCynH34353AVSpqYcCXcT9oc4zuHnObxIAbXrMKTdc5XeEVPWegQ1GCxsh3RH6rfwP1K-X8PJutEXC05Xt_XUh0bRGQE_XEwh54-vu5sdUTrWE3OquTSVVoLgZYRulsIZrizp-HYA",
  },
];

function TestimonialSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 2 >= TESTIMONIALS_DATA.length ? 0 : prev + 2));
    }, 3000);
    return () => clearInterval(timer);
  }, [isHovered]);

  const totalPages = Math.ceil(TESTIMONIALS_DATA.length / 2);

  return (
    <div 
      className="relative w-full overflow-hidden pb-12"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div 
        className="flex transition-transform duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]"
        style={{ transform: `translateX(-${(currentIndex / 2) * 100}%)` }}
      >
        {Array.from({ length: totalPages }).map((_, pageIdx) => (
          <div key={pageIdx} className="w-full shrink-0 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 px-6">
            {TESTIMONIALS_DATA.slice(pageIdx * 2, pageIdx * 2 + 2).map((t, i) => (
              <div key={i} className="bg-white rounded-[2.5rem] p-8 md:p-10 flex flex-col sm:flex-row gap-6 md:gap-8 shadow-[0_12px_40px_rgba(0,0,0,0.06)] min-h-[260px] border border-[#f9f9f9]">
                <img
                  className="w-[100px] h-[100px] md:w-[130px] md:h-[130px] rounded-full object-cover shrink-0 self-start sm:self-center shadow-md border-[3px] border-[#f0f4ff]"
                  alt={t.name}
                  src={t.img}
                  loading="lazy"
                />
                <div className="flex flex-col justify-between flex-1 relative">
                  <p className="text-[#3a3a3a] text-[14px] md:text-[15px] font-medium leading-[1.7] md:leading-[1.8] pr-2">
                    {t.quote}
                  </p>
                  <div className="flex items-end justify-between mt-6 pt-6 border-t border-[#f4f4f4]">
                    <div>
                      <p className="text-[16px] font-extrabold tracking-tight" style={{ color: BLUE }}>{t.name}</p>
                      <p className="text-[13px] text-[#777] font-medium mt-0.5">{t.role}</p>
                    </div>
                    <div className="scale-90 origin-bottom-right drop-shadow-sm">
                      <CompanyLogo name={t.company} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      
      {/* Pagination Dots */}
      <div className="absolute bottom-0 right-10 flex gap-2 z-20">
        {Array.from({ length: Math.ceil(TESTIMONIALS_DATA.length / 2) }).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i * 2)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i * 2 === currentIndex ? 'bg-[#4A7CFF] w-6' : 'bg-[#dce4ff] hover:bg-[#aabef5]'}`}
            aria-label={`Go to slide page ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const mainRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { session, user } = useAuth();
  const [blogs, setBlogs] = useState<BlogPost[]>([]);

  useEffect(() => {
    const sorted = [...publicBlogFallbackPosts].sort((a, b) => b.views - a.views);
    setBlogs(sorted.slice(0, 3));
    const timer = setTimeout(() => {
      if (!lampOnRef.current) {
        triggerTransition(true);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Lamp toggle state — kept in refs to avoid triggering re-renders
  const bulbRef = useRef<SVGPathElement | null>(null);
  const glowRef = useRef<SVGEllipseElement | null>(null);
  const lampOnRef = useRef(true);
  const scrollProgressRef = useRef(0);

  const BULB_ON_COLOR = "#FFE500";

  const playClickSound = useCallback(() => {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const sampleRate = ctx.sampleRate;

    // Sharp mechanical switch click: shaped noise burst
    const bufferSize = Math.floor(sampleRate * 0.035);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 60);
    }

    // Bandpass to give it the hard "click" character of a switch
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 4000;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 1.2;
    filter.connect(gain);
    gain.connect(ctx.destination);

    // First click
    const source1 = ctx.createBufferSource();
    source1.buffer = buffer;
    source1.connect(filter);
    source1.start(ctx.currentTime);

    // Second click ("clack") — slightly softer, 60ms later
    const source2 = ctx.createBufferSource();
    source2.buffer = buffer;
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.7;
    source2.connect(filter);
    source2.start(ctx.currentTime + 0.10);
  }, []);

    const triggerTransition = useCallback((goingDark: boolean) => {
    const landing = document.getElementById("landing-page") as HTMLElement | null;
    if (!landing) return;

    const d = goingDark;
    // Mark dark mode on html + landing so CSS rules can target hover/open states (e.g. FAQ)
    landing.dataset.dark = d ? "true" : "";
    document.documentElement.dataset.dark = d ? "true" : "";
    document.documentElement.classList.toggle("dark", d);
    localStorage.setItem("practers-dark", String(d));
    localStorage.setItem("theme", d ? "dark" : "light");

    // Overall bg matches companies section; section containers and cards step progressively lighter
    const BG_PAGE    = d ? "#222222" : "";
    const BG_SECTION = d ? "#2a2a2a" : "";   // features + roles rounded containers
    const BG_CARD    = d ? "#303030" : "";   // How It Works cards, role popup cards
    const BG_HEADER  = d ? "rgba(34,34,34,0.95)" : "";
    const TEXT_1     = d ? "#eff2f6" : "";
    const TEXT_2     = d ? "#a8b3cf" : "";
    const BORDER     = d ? "#3e3e3e" : "";

    // Page wrapper
    landing.style.backgroundColor = BG_PAGE;
    landing.style.color = TEXT_1;

    // Header
    const header = landing.querySelector<HTMLElement>("header");
    if (header) {
      header.style.backgroundColor = BG_HEADER;
      header.style.borderColor = BORDER;
      // Logo: keep blue logo in both modes (no filter inversion)
      // Nav links
      header.querySelectorAll<HTMLElement>("nav a").forEach(el => { el.style.color = d ? "#eff2f6" : ""; });
      // Header buttons/links
      const loginBtn = header.querySelector<HTMLElement>("a[href='/login']:not(.get-started-btn)");
      if (loginBtn) loginBtn.style.color = d ? "#eff2f6" : "";
      const getStartedBtn = header.querySelector<HTMLElement>("a[href='/login?tab=signup']");
      if (getStartedBtn) { getStartedBtn.style.backgroundColor = d ? "#FFE500" : ""; getStartedBtn.style.color = d ? "#1a1a1a" : ""; }
      const dashboardBtn = header.querySelector<HTMLElement>("a[href='/dashboard']");
      if (dashboardBtn) { dashboardBtn.style.backgroundColor = d ? "#FFE500" : ""; dashboardBtn.style.color = d ? "#1a1a1a" : ""; }
    }

    // Sections bg (skip final CTA — keep yellow)
    landing.querySelectorAll<HTMLElement>("section").forEach(s => {
      if (s.classList.contains("bg-[#FFE500]") || s.style.backgroundColor === "rgb(255, 229, 0)") return;
      s.style.backgroundColor = BG_PAGE;
    });

    // Features section inner rounded container
    const featuresInner = document.getElementById("features-inner");
    if (featuresInner) {
      if (!featuresInner.dataset.lightBg) featuresInner.dataset.lightBg = featuresInner.style.background;
      featuresInner.style.background = d
        ? "linear-gradient(to bottom, #2a2a2a 0%, #2a2a2a 40%, #222222 100%)"
        : (featuresInner.dataset.lightBg || "");
    }

    // Roles/"Everything you need" section inner rounded container
    const rolesInner = document.getElementById("roles-inner");
    if (rolesInner) {
      if (!rolesInner.dataset.lightBg) rolesInner.dataset.lightBg = rolesInner.style.background;
      rolesInner.style.background = d
        ? "linear-gradient(to bottom, #2a2a2a 0%, #2a2a2a 60%, #222222 100%)"
        : (rolesInner.dataset.lightBg || "");
    }

    // Blog section inner container
    const blogInner = landing.querySelector<HTMLElement>("#blog .rounded-3xl");
    if (blogInner) {
      if (!blogInner.dataset.lightBg) blogInner.dataset.lightBg = blogInner.style.background;
      blogInner.style.background = d
        ? "linear-gradient(to bottom, #2a2a2a 0%, #2a2a2a 40%, #222222 100%)"
        : (blogInner.dataset.lightBg || "");
    }

    // Blog card overlay containers
    landing.querySelectorAll<HTMLElement>("#blog .rounded-2xl[style]").forEach(el => {
      if (!el.dataset.lightBg) el.dataset.lightBg = el.style.background || el.style.backgroundColor;
      el.style.background = d ? "linear-gradient(to bottom, #303030 0%, #303030 50%, #2a2a2a 100%)" : (el.dataset.lightBg || "");
    });

    // How It Works step cards
    landing.querySelectorAll<HTMLElement>(".how-step-card").forEach(el => {
      if (!el.dataset.lightBg) el.dataset.lightBg = el.style.background;
      el.style.background = d
        ? "linear-gradient(to bottom, #303030 0%, #303030 45%, #2a2a2a 100%)"
        : (el.dataset.lightBg || "");
    });

    // How It Works icon boxes: keep yellow bg in dark mode (don't change)
    landing.querySelectorAll<HTMLElement>(".how-step-card [class*='bg-[#FFE500]']").forEach(el => {
      // Keep yellow icon box background — no change needed
      el.style.backgroundColor = d ? "#e6cf00" : "";
    });

    // Feature icon boxes: keep light background in dark mode
    landing.querySelectorAll<HTMLElement>(".feature-card .rounded-2xl").forEach(el => {
      el.style.backgroundColor = d ? "#f0efe8" : "";
      el.style.borderColor = d ? "#e0dfd8" : "";
    });

    // bg-white elements (role popup cards etc.) — skip feature icon boxes and step circles
    landing.querySelectorAll<HTMLElement>(".bg-white").forEach(el => {
      if (el.closest(".feature-card") || el.closest(".step-circle") || el.closest(".benefit-circle")) return;
      el.style.backgroundColor = BG_CARD;
      el.style.borderColor = BORDER;
    });

    // Glass cards
    landing.querySelectorAll<HTMLElement>(".glass-card").forEach(el => {
      el.style.background = d ? "rgba(48,48,48,0.85)" : "";
      el.style.borderColor = BORDER;
    });

    // Companies section: same bg as page
    const companiesEl = landing.querySelector<HTMLElement>(".companies-section");
    if (companiesEl) companiesEl.style.backgroundColor = BG_PAGE;

    // Logos with dark/black artwork — invert to white in dark mode
    landing.querySelectorAll<HTMLElement>(".companies-section img").forEach(el => {
      const src = (el).getAttribute("src") || "";
      const needsInvert = src.includes("Amazon") || src.includes("uber") || src.includes("apple");
      if (needsInvert) el.style.filter = d ? "brightness(0) invert(1)" : "";
    });

    // Testimonials section (hidden for now)
    // const testimonialsSection = landing.querySelector<HTMLElement>("#testimonials");
    // if (testimonialsSection) {
    //   testimonialsSection.style.backgroundColor = BG_PAGE;
    //   const h2 = testimonialsSection.querySelector<HTMLElement>("h2");
    //   if (h2) h2.style.color = TEXT_1;
    //   testimonialsSection.querySelectorAll<HTMLElement>(".bg-white").forEach(card => {
    //     if (!card.classList.contains("rounded-[2.5rem]")) return;
    //     card.style.backgroundColor = BG_CARD;
    //     card.style.borderColor = BORDER;
    //   });
    //   testimonialsSection.querySelectorAll<HTMLElement>("p").forEach(el => { el.style.color = TEXT_2; });
    // }

    const isInYellowSection = (node: Element): boolean => {
      const section = node.closest("section");
      return !!section && section.classList.contains("bg-[#FFE500]");
    };

    // FAQ: borders + summary inline color (hover/open override handled by CSS !important)
    landing.querySelectorAll<HTMLElement>("details").forEach(el => { el.style.borderColor = BORDER; });
    const faqBorderTop = landing.querySelector<HTMLElement>("#faq .border-t");
    if (faqBorderTop) faqBorderTop.style.borderColor = BORDER;
    landing.querySelectorAll<HTMLElement>("details summary").forEach(el => { el.style.color = d ? "#eff2f6" : ""; });

    // FAQ answer divs → white text in dark mode
    landing.querySelectorAll<HTMLElement>("#faq details > div").forEach(el => {
      el.style.color = d ? "#eff2f6" : "";
    });

    // Step circles → yellow in dark mode
    landing.querySelectorAll<HTMLElement>(".step-circle > div").forEach(el => {
      el.style.backgroundColor = d ? "#FFE500" : "";
      el.style.borderColor = d ? "#FFE500" : "";
      el.style.color = d ? "#1a1a1a" : "";
    });

    // How It Works connecting paths → yellow in dark mode
    landing.querySelectorAll<SVGPathElement>(".how-path").forEach(el => {
      (el as unknown as HTMLElement).style.stroke = d ? "#FFE500" : "";
      (el as unknown as HTMLElement).style.opacity = d ? "0.6" : "";
    });

    // Headings — skip final CTA (yellow bg) and footer
    landing.querySelectorAll<HTMLElement>("h1,h2,h3,h4").forEach(el => {
      if (isInYellowSection(el) || el.closest("footer")) return;
      if (el.closest(".how-step-card") || el.closest(".benefit-card")) { el.style.color = d ? "#4A7CFF" : ""; return; }
      el.style.color = TEXT_1;
    });

    // "Features" section h2 → blue in dark mode
    const featuresH2 = document.querySelector<HTMLElement>("#features h2");
    if (featuresH2) featuresH2.style.color = d ? "#4A7CFF" : "";

    // Specific text colors (skip ones with blue text or white text overrides)
    landing.querySelectorAll<HTMLElement>("p, span, li, a").forEach(el => {
      if (el.closest("header") || el.closest("footer") || isInYellowSection(el)) return;
      if (el.classList.contains("text-[#4A7CFF]") || el.classList.contains("text-white") || el.classList.contains("bg-[#FFE500]")) return;
      // Skip material icons — they have their own blue color
      if (el.classList.contains("material-symbols-outlined") || el.classList.contains("material-symbols-rounded")) return;
      // Skip spans that already have inline blue color (e.g. "get hired", "Questions", "works?")
      if (el.tagName === "SPAN" && (el.style.color === "rgb(74, 124, 255)" || el.style.color === "#4a7cff" || el.style.color === "#4A7CFF")) return;
      // Skip elements inside yellow CTA buttons
      const parentLink = el.closest("a");
      if (parentLink && parentLink.classList.contains("bg-[#FFE500]")) return;
      if (el.closest(".how-step-card") || el.closest(".benefit-card")) { el.style.color = d ? TEXT_2 : ""; return; }
      el.style.color = d ? TEXT_2 : "";
    });
  }, []);

  const handleLampClick = useCallback(() => {
    // Only allow toggle when lamp is fully stretched (not scrolled)
    if (scrollProgressRef.current >= 0.01) return;
    playClickSound();
    lampOnRef.current = !lampOnRef.current;
    const goingDark = !lampOnRef.current;
    
    // Sync both localStorage keys for consistency across auth/unauth pages
    localStorage.setItem("practers-dark", String(goingDark));
    localStorage.setItem("theme", goingDark ? "dark" : "light");
    
    if (bulbRef.current) gsap.set(bulbRef.current, { attr: { fill: goingDark ? "#ffffff" : BULB_ON_COLOR } });
    if (glowRef.current) gsap.set(glowRef.current, { opacity: goingDark ? 0 : 1 });
    triggerTransition(goingDark);
  }, [playClickSound, BULB_ON_COLOR]);

  const handleCardClick = useCallback(() => {
    if (session) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, [session, router]);

  useGSAP(() => {
    const el = mainRef.current;
    if (!el) return;

      // ── Hero lamp scroll animation ──
      const lampEl = el.querySelector(".hero-lamp") as HTMLElement;
      bulbRef.current = el.querySelector(".lamp-bulb");
      glowRef.current = el.querySelector(".lamp-glow");
      // Only create the pin on lg+ screens where the lamp is visible and 2-col layout is active
      if (lampEl && window.matchMedia("(min-width: 1024px)").matches) {
        // Set initial state: bulb glowing yellow, glow fully visible
        if (bulbRef.current) gsap.set(bulbRef.current, { attr: { fill: BULB_ON_COLOR } });
        if (glowRef.current) gsap.set(glowRef.current, { opacity: 1 });

        // Calculate exact travel distance so shade top lands on header bottom
        const header = document.querySelector("header") as HTMLElement;
        const headerBottom = header ? header.getBoundingClientRect().bottom : 64;
        const lampRect = lampEl.getBoundingClientRect();
        const shadeFraction = 800.388 / 1193; // shade top y in SVG / total SVG height
        const shadeTopFromViewport = lampRect.top + lampRect.height * shadeFraction;
        const travel = Math.round(shadeTopFromViewport - headerBottom);

        ScrollTrigger.create({
          trigger: el,
          start: "top top",
          end: `+=${travel}`,
          pin: true,
          pinSpacing: true,
          scrub: 0.3,
          animation: gsap.to(lampEl, { y: -travel, ease: "none" }),
          onUpdate: (self: { progress: number }) => {
            scrollProgressRef.current = self.progress;
            const isOn = lampOnRef.current && self.progress < 0.01;
            if (bulbRef.current) gsap.set(bulbRef.current, { attr: { fill: isOn ? BULB_ON_COLOR : "#ffffff" } });
            if (glowRef.current) gsap.set(glowRef.current, { opacity: isOn ? 1 : 0 });
          },
        });
      }

      // ── Feature cards staggered reveal ──
      const featureCards = el.querySelectorAll("#features .feature-card");
      if (featureCards.length) {
        gsap.fromTo(featureCards,
          { opacity: 0, y: 50, scale: 0.95 },
          {
            opacity: 1, y: 0, scale: 1,
            duration: 0.6, stagger: 0.1, ease: "back.out(1.2)",
            scrollTrigger: { trigger: "#features .grid", start: "top 80%" },
          }
        );
      }

      // ── Companies section ──
      const companiesSection = el.querySelector(".companies-section");
      if (companiesSection) {
        gsap.fromTo(companiesSection.querySelector(".text-content"),
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", scrollTrigger: { trigger: companiesSection, start: "top 80%" } }
        );
        gsap.fromTo(companiesSection.querySelectorAll(".company-logo-wrapper"),
          { opacity: 0, y: 30, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.08, ease: "back.out(1.2)", scrollTrigger: { trigger: companiesSection, start: "top 80%" } }
        );
      }

      // ── Blue CTA banner ──
      const ctaBanner = el.querySelector(".cta-banner");
      if (ctaBanner) {
        gsap.fromTo(ctaBanner,
          { opacity: 0, y: 40, scale: 0.96 },
          {
            opacity: 1, y: 0, scale: 1,
            duration: 0.8, ease: "power3.out",
            scrollTrigger: { trigger: ctaBanner, start: "top 82%" },
          }
        );
      }

      // ── Roles/Feature showcase intro animation (Girl + Heading) ──
      const rolesSection = el.querySelector("#roles");
      if (rolesSection) {
        const rolesHeading = rolesSection.querySelector(".roles-heading");
        const arrowMask = rolesSection.querySelector(".roles-arrow-mask");
        const rolesCards = rolesSection.querySelectorAll(".roles-card");
        
        const tl = gsap.timeline({
          scrollTrigger: { 
            trigger: rolesSection, 
            start: "top 70%",
            toggleActions: "play none none none" 
          }
        });

        if (rolesHeading && rolesHeading.children) {
          tl.fromTo(rolesHeading.children,
            { opacity: 0, x: -80 },
            { opacity: 1, x: 0, duration: 1.2, ease: "power3.out" }
          );
        }

        if (arrowMask) {
          tl.fromTo(arrowMask,
            { clipPath: "inset(0 100% 0 0)" },
            { clipPath: "inset(0 0% 0 0)", duration: 0.8, ease: "power2.inOut" },
            "-=0.2" // Arrow draws itself right as the heading finishes sliding
          );
        }

        // Animate the cards row-by-row as they come into view using batch
        if (rolesCards.length) {
          // Hide all cards immediately so they don't flash before reaching the viewport Trigger
          gsap.set(rolesCards, { opacity: 0, scale: 0.94, y: 40 });
          
          ScrollTrigger.batch(rolesCards, {
            start: "top 80%",
            onEnter: (batch: Element[]) => {
              gsap.to(batch, {
                opacity: 1, scale: 1, y: 0,
                duration: 0.5, stagger: 0.1, ease: "back.out(1.2)",
                overwrite: true
              });
            }
          });
        }
      }

      // ── Testimonials heading + marquee (hidden for now) ──
      // const testimonialsSection = el.querySelector("#testimonials");
      // if (testimonialsSection) {
      //   gsap.fromTo(testimonialsSection.querySelector("h2"),
      //     { opacity: 0, x: -40 },
      //     { opacity: 1, x: 0, duration: 0.8, ease: "power2.out",
      //       scrollTrigger: { trigger: testimonialsSection, start: "top 82%" } }
      //   );
      // }

      // ── How It Works section ──
      const howSection = el.querySelector("#how-it-works");
      if (howSection) {
        // Heading
        gsap.fromTo(howSection.querySelector(".text-center")?.children || [],
          { opacity: 0, y: 30 },
          {
            opacity: 1, y: 0, duration: 0.7, stagger: 0.15, ease: "power2.out",
            scrollTrigger: { trigger: howSection, start: "top 80%" },
          }
        );
        // Step circles pop in
        const stepCircles = howSection.querySelectorAll(".step-circle");
        gsap.fromTo(stepCircles,
          { opacity: 0, scale: 0 },
          {
            opacity: 1, scale: 1,
            duration: 0.5, stagger: 0.2, ease: "back.out(2)",
            scrollTrigger: { trigger: howSection.querySelector(".hidden.md\\:block"), start: "top 75%" },
          }
        );
        // Step cards slide in from sides
        const stepCards = howSection.querySelectorAll(".step-card");
        stepCards.forEach((card, i) => {
          const fromLeft = i % 2 === 0;
          gsap.fromTo(card,
            { opacity: 0, x: fromLeft ? -60 : 60, rotateY: fromLeft ? -8 : 8 },
            {
              opacity: 1, x: 0, rotateY: 0,
              duration: 0.8, ease: "power3.out",
              scrollTrigger: { trigger: card, start: "top 82%" },
            }
          );
        });
        // Animate the SVG dashed line (draw-on effect)
        const pathEls = howSection.querySelectorAll(".how-path");
        pathEls.forEach((path) => {
          const p = path as SVGPathElement;
          const length = p.getTotalLength?.() || 500;
          gsap.set(p, { strokeDasharray: length, strokeDashoffset: length });
          gsap.to(p, {
            strokeDashoffset: 0,
            duration: 2,
            ease: "power1.inOut",
            scrollTrigger: { trigger: howSection.querySelector(".hidden.md\\:block"), start: "top 70%", end: "bottom 50%", scrub: 1 },
          });
        });
      }

      // ── Final CTA ──
      const finalCta = el.querySelector(".final-cta");
      if (finalCta) {
        gsap.fromTo(finalCta.children,
          { opacity: 0, y: 40 },
          {
            opacity: 1, y: 0,
            duration: 0.7, stagger: 0.2, ease: "power2.out",
            scrollTrigger: { trigger: finalCta, start: "top 82%" },
          }
        );
      }

      // ── FAQ summary hover — JS listeners so inline-style base color can still be overridden ──
      el.querySelectorAll<HTMLElement>("details summary").forEach(summary => {
        const details = summary.closest("details") as HTMLDetailsElement | null;
        summary.addEventListener("mouseenter", () => {
          if (!lampOnRef.current) summary.style.color = "#4A7CFF";
        });
        summary.addEventListener("mouseleave", () => {
          if (!lampOnRef.current) summary.style.color = details?.open ? "#4A7CFF" : "#eff2f6";
        });
        details?.addEventListener("toggle", () => {
          if (!lampOnRef.current) summary.style.color = details.open ? "#4A7CFF" : "#eff2f6";
        });
      });

      // ── Restore dark mode from localStorage ──
      if (typeof window !== "undefined" && localStorage.getItem("practers-dark") === "true") {
        lampOnRef.current = false;
        document.documentElement.dataset.dark = "true";
        triggerTransition(true);
        if (bulbRef.current) gsap.set(bulbRef.current, { attr: { fill: "#ffffff" } });
        if (glowRef.current) gsap.set(glowRef.current, { opacity: 0 });
      }

      // ── Footer slide-up ──
      const footer = el.querySelector("footer");
      if (footer) {
        gsap.fromTo(footer.querySelectorAll(":scope > div > div > *"),
          { opacity: 0, y: 30 },
          {
            opacity: 1, y: 0,
            duration: 0.6, stagger: 0.1, ease: "power2.out",
            scrollTrigger: { trigger: footer, start: "top 90%" },
          }
        );
      }
  }, { scope: mainRef });

  return (
    <>
      {/* Social FABs — OUTSIDE mainRef so GSAP pin doesn't break position:fixed */}
      <div className="fixed right-0 top-1/2 -translate-y-1/2 flex flex-col gap-3 pr-4 z-[9999] hidden lg:flex">
          <a href="https://x.com/practerscom?s=11" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-black flex items-center justify-center hover:-translate-x-1 transition-transform shadow-lg cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
            </svg>
          </a>
          <a href="https://www.linkedin.com/company/practers/" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-black flex items-center justify-center hover:-translate-x-1 transition-transform shadow-lg cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
          </a>
          <a href="https://www.instagram.com/trypracters?igsh=MWowM2RuYTM5NmVydQ%3D%3D&utm_source=qr" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-black flex items-center justify-center hover:-translate-x-1 transition-transform shadow-lg cursor-pointer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
            </svg>
          </a>
          <a href="https://t.me/practers" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-black flex items-center justify-center hover:-translate-x-1 transition-transform shadow-lg cursor-pointer">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
              <path d="M23.91 3.79L20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7l-5.45-1.7c-1.18-.36-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.53 1.73z"/>
            </svg>
          </a>
          <a href="https://chat.whatsapp.com/DARzbWxP9YU2ENTOa8Idj4" target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-black flex items-center justify-center hover:-translate-x-1 transition-transform shadow-lg cursor-pointer">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="white">
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
            </svg>
          </a>
        </div>

      <div ref={mainRef} id="landing-page" className="bg-[#f4f5f7] text-[#1a1a1a] antialiased overflow-x-hidden w-full" style={{ fontFamily: "'Inter', sans-serif" }}>

        <header className="sticky top-0 z-40 w-full bg-[#f4f5f7]/90 backdrop-blur-md border-b border-[#e8e8e8] transition-transform duration-300">
          <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/">
              <Image src="/logo_big.svg" alt="Probe." width={180} height={51} className="h-11 w-auto" />
            </Link>
            <nav className="hidden md:flex items-center gap-9">
              {[
                { label: "Interviews", href: "/login", isHash: false },
                { label: "Questions", href: "/login", isHash: false },
                { label: "FAQ", href: "#faq", isHash: true },
                { label: "Blog", href: "#blog", isHash: true }
              ].map((item) => (
                <a 
                  key={item.label} 
                  className="text-[15px] font-medium tracking-tight text-[#333] hover:text-[#4A7CFF] transition-colors cursor-pointer" 
                  href={item.href}
                  onClick={(e) => {
                    if (item.isHash) {
                      e.preventDefault();
                      const target = document.querySelector(item.href);
                      if (target) {
                        const y = target.getBoundingClientRect().top + window.scrollY - 100;
                        window.scrollTo({ top: y, behavior: 'smooth' });
                      }
                    }
                  }}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            
           <div className="flex items-center gap-3">
              {user ? (
                <Link href="/dashboard" className="bg-[#1a1a1a] text-white text-sm px-5 py-2.5 rounded-full hover:bg-[#333] transition-colors">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="hidden sm:block text-sm text-[#1a1a1a] px-4 py-2">Log In</Link>
                  <Link href="/login?tab=signup" className="bg-[#1a1a1a] text-white text-sm px-5 py-2.5 rounded-full hover:bg-[#333] transition-colors">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="w-full">
          {/* ── Hero ── */}
          <section className="relative w-full bg-transparent overflow-visible pt-16 pb-0">
            {/* Large blue blob top-right */}
            <div className="absolute -top-20 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.06] z-0" style={{ background: BLUE }} />
            <div className="absolute top-40 -left-16 w-[250px] h-[250px] rounded-full opacity-[0.05] z-0" style={{ background: BLUE }} />
            {/* Blue doodle decorations */}
            <svg className="hero-doodle absolute top-16 right-[14%] w-20 h-20 opacity-20 z-0" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke={BLUE} strokeWidth="2.5" strokeDasharray="8 5" /></svg>
            <svg className="hero-doodle absolute top-10 left-[8%] w-4 h-4 opacity-30 z-0" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill={BLUE} /></svg>
            <svg className="hero-doodle absolute bottom-36 left-[5%] w-14 h-14 opacity-10 z-0" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="18" fill="none" stroke={BLUE} strokeWidth="2.5" strokeDasharray="10 6" /></svg>

            <div className="max-w-[1200px] mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">
              <div className="hero-tag flex flex-col gap-5">
                {/* Sparkle/starburst doodle above tagline */}
                <div className="relative">
                  <svg className="absolute -top-8 right-4 w-10 h-10" viewBox="0 0 50 50" fill="none">
                    <path d="M25 5 L27 20 L42 18 L29 25 L38 38 L25 30 L12 38 L21 25 L8 18 L23 20 Z" stroke="#FFE500" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none" />
                  </svg>
                  <h1 className="text-[3rem] md:text-[3.8rem] leading-[1.1] font-extrabold tracking-tight text-[#1a1a1a]">
                    Practice smarter,{" "}
                    <span className="relative inline-block">
                      <span className="italic" style={{ fontFamily: "'Playfair Display', serif" }}>interview</span>
                      {/* Brushstroke underline doodle */}
                      <svg className="absolute -bottom-2 left-0 w-full h-4" viewBox="0 0 200 20" preserveAspectRatio="none">
                        <path d="M3 12 C20 4, 40 18, 60 10 C80 2, 100 16, 120 8 C140 2, 160 14, 197 8" fill="none" stroke="#22C55E" strokeWidth="6" strokeLinecap="round" opacity="0.6" />
                      </svg>
                    </span>{" "}
                    better.
                  </h1>
                </div>

                <p className="hero-desc text-[16px] text-[#666] max-w-md leading-relaxed">
                  Your all-in-one interview prep platform: AI mock interviews, live coding, system design, high-quality peer-to-peer interviews, regular coding contests, a curated question bank, and resume building. Built to get you hired.
                </p>

                <div className="hero-cta pt-1">
                  <Link href="/login" className="inline-flex items-center gap-2 bg-[#FFE500] text-[#1a1a1a] px-7 py-3.5 rounded-full font-semibold text-[15px] hover:bg-[#ffd900] transition-colors">
                    Start Practicing Free
                    <span className="material-symbols-outlined text-xl">arrow_forward</span>
                  </Link>
                </div>
              </div>

              {/* Hero illustration — lamp + person scene, separately layered */}
              <div className="hero-img relative z-30 flex items-start justify-center">
                <div className="hero-scene relative w-full max-w-[520px] mt-24 mb-[-180px] md:mb-[-220px]">
                  {/* Lamp — wire starts at the header, positioned over the monitor */}
                  <svg
                    className="hero-lamp absolute -top-[210px] right-[40%] w-[22%] h-auto z-20 cursor-pointer hidden lg:block"
                    width="676" height="1193" viewBox="0 0 676 1193"
                    fill="none" xmlns="http://www.w3.org/2000/svg"
                    overflow="visible"
                    onClick={handleLampClick}
                    aria-label="Toggle lamp"
                  >
                    <defs>
                      <radialGradient id="bulbGlowGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#FFE500" stopOpacity="0.85"/>
                        <stop offset="40%" stopColor="#FFE500" stopOpacity="0.4"/>
                        <stop offset="100%" stopColor="#FFE500" stopOpacity="0"/>
                      </radialGradient>
                    </defs>
                    {/* Glow — drawn FIRST (behind everything); cy overlaps shade bottom so shade masks top half, glow spills below */}
                    <ellipse className="lamp-glow" cx="338" cy="1200" rx="340" ry="230" fill="url(#bulbGlowGrad)"/>
                    {/* Wire */}
                    <path fillRule="evenodd" clipRule="evenodd" d="M334.366 822H345.366V0H334.366V822Z" fill="#090E2B"/>
                    {/* Bulb — drawn BEFORE shade so shade masks the upper portion; only bottom peeks out */}
                    <path className="lamp-bulb" fillRule="evenodd" clipRule="evenodd" d="M400.389 1112.84C400.389 1156.97 372.461 1192.76 338 1192.76C303.539 1192.76 275.612 1156.97 275.612 1112.84C275.612 1068.7 303.539 1032.91 338 1032.91C372.461 1032.91 400.389 1068.7 400.389 1112.84Z" fill="white"/>
                    {/* Shade — drawn LAST so it covers wire top and upper bulb, leaving only bulb bottom visible */}
                    <path fillRule="evenodd" clipRule="evenodd" d="M323.281 800.388C292.386 870.596 206.161 1021.46 4.05942 1128.75C-2.66938 1132.33 -0.547798 1143.92 6.85874 1143.92H669.143C676.55 1143.92 678.672 1132.33 671.932 1128.75C469.831 1021.46 383.616 870.596 352.711 800.388C346.568 786.425 329.434 786.425 323.281 800.388Z" fill="#0084FF"/>
                  </svg>
                  {/* Main illustration — person at desk with monitor */}
                  <img 
                    src="/hero_illustration.svg" 
                    alt="Person preparing for an interview at their desk" 
                    className="w-full h-auto relative z-10 mt-10"
                  />
                </div>
              </div>
            </div>
          </section>
          

          {/* ── Features ── */}
          <section className="scroll-mt-28 relative pt-80 md:pt-28 pb-6 md:pb-8 overflow-x-clip border-none z-0" id="features">
            {/* Blue tint blob — top-left of section, behind the box */}
            <div className="absolute top-0 left-0 w-[600px] h-[400px] pointer-events-none" style={{
              background: "radial-gradient(ellipse at 0% 0%, rgba(74,124,255,0.28) 0%, rgba(74,124,255,0.12) 45%, transparent 72%)",
              filter: "blur(50px)",
            }} />
            <div className="max-w-[1260px] mx-auto px-2 md:px-6">
              <div id="features-inner" className="relative rounded-xl md:rounded-3xl overflow-hidden" style={{ background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 40%, #f4f5f7 100%)" }}>
                <div className="p-10 md:p-14 relative">

                  <h2 className="text-[2rem] md:text-[2.6rem] font-black text-[#111] tracking-tight mb-8 -mt-2">Features</h2>

                  <div className="grid md:grid-cols-2 gap-y-12 md:gap-y-16 gap-x-8 md:gap-x-16 items-start mt-12">
                    {[
                      { icon: "smart_toy",   title: "AI Interview",                   desc: "Practice realistic voice-driven mock interviews with an AI interviewer that adapts in real-time, asks follow-ups, and evaluates your code and answers live." },
                      { icon: "groups",      title: "Peer-to-Peer Interviews",        desc: "Pair up with other candidates for high-quality, structured mock interviews and practice giving and receiving real-time feedback." },
                      { icon: "workspace_premium", title: "Professional Interviews",   desc: "Schedule live mock interviews with vetted industry professionals and get detailed, expert-level feedback on exactly where to improve." },
                      { icon: "verified",    title: "Verifiable Job Profile",         desc: "Build a recruiter-ready profile where your projects and skills are verified against your real GitHub activity, commits, contributors, and code, then share it with a single recruiter link." },
                      { icon: "emoji_events", title: "Coding Contests",               desc: "Compete in regular timed contests with DSA and MCQ rounds, live leaderboards, and proctoring to sharpen your speed against the community." },
                      { icon: "description", title: "Resume Analysis & Building",     desc: "Get an instant ATS score and let AI improve your existing resume section by section. Or build from scratch using our AI-powered LaTeX editor with professional templates." },
                      { icon: "auto_awesome",title: "AI Tutor",                       desc: "A personal AI tutor that analyzes your performance, identifies weak areas, and provides curated prep materials, resources, and study plans tailored to your level." },
                      { icon: "menu_book",   title: "Question Bank",                  desc: "Curated questions across DSA, CS fundamentals, system design, and behavioural rounds, tagged by company so you know exactly what top firms ask." },
                    ].map((f) => (
                      <div key={f.title} className="feature-card flex flex-row gap-6 md:gap-8 items-start h-full p-2">
                        {/* Icon Box */}
                        <div
                          className="w-16 h-16 md:w-[72px] md:h-[72px] rounded-2xl bg-white flex items-center justify-center shrink-0 border border-[#f4f4f4]"
                          style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.04)" }}
                        >
                          <span className="material-symbols-outlined text-[28px]" style={{ color: BLUE }}>{f.icon}</span>
                        </div>
                        {/* Text */}
                        <div className="pt-1 flex flex-col gap-1.5">
                          <h3 className="text-[19px] md:text-[21px] font-black text-[#111] tracking-tight">{f.title}</h3>
                          <p className="text-[#555] font-medium text-[15px] md:text-[16px] leading-[1.65] max-w-sm">{f.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Stats ── */}
          <TopCompaniesSection />

          {/* ── Blue CTA Banner ── */}
          <section className="py-10 bg-[#f4f5f7]">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="cta-banner rounded-3xl px-10 py-12 flex flex-col md:flex-row items-center justify-between gap-8" style={{ background: "#2563EB" }}>
                <div className="max-w-2xl">
                  <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-2">Probe: Your Complete Interview Prep Solution</h2>
                  <p className="text-white/70 leading-relaxed">
                    The only interview preparation platform for the highest level of technical assessment. Practice coding, system design, and behavioural questions with instant feedback.
                  </p>
                </div>
                <Link href="/login" className="bg-[#FFE500] text-[#1a1a1a] px-7 py-3.5 rounded-full font-semibold text-sm hover:bg-[#ffd900] transition-colors whitespace-nowrap shrink-0">
                  Start Free Session
                </Link>
              </div>
            </div>
          </section>

          {/* ── Feature Showcase ── */}
          <section className="scroll-mt-28 pt-16 md:pt-28 pb-6 md:pb-12 bg-[#f4f5f7]" id="roles">
            <div className="max-w-[1300px] mx-auto px-2 md:px-8">
              <div 
                id="roles-inner" className="rounded-2xl md:rounded-[40px] pt-10 md:pt-24 pb-10 px-4 md:px-16 relative" 
                style={{ background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 60%, #f4f5f7 100%)" }}
              >
                <div className="max-w-[1100px] mx-auto">
                  {/* Section heading */}
                  <div className="roles-heading text-center md:text-right md:pr-0 lg:pr-8 xl:pr-12 mb-32 md:mb-40 md:-mt-4 lg:-mt-8 flex flex-col md:items-end w-full">
                    <h2 className="relative z-10 text-[2.6rem] md:text-[3.2rem] font-black text-[#111] tracking-tight mb-3">
                      Everything you need to <span className="relative inline-block whitespace-nowrap">
                        <span style={{ color: BLUE }}>get hired</span>
                        {/* Hand-drawn yellow triple underline */}
                        <svg className="absolute top-[85%] left-[-5%] w-[110%] h-[24px] overflow-visible pointer-events-none" viewBox="0 0 200 24" fill="none">
                          <g className="roles-arrow-mask" style={{ clipPath: "inset(0 100% 0 0)" }}>
                            <path d="M 5 20 Q 100 5 195 5" stroke="#FFC226" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                            <path d="M 12 24 Q 100 10 185 10" stroke="#FFC226" strokeWidth="3" strokeLinecap="round" fill="none" />
                            <path d="M 22 28 Q 95 16 170 14" stroke="#FFC226" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                          </g>
                        </svg>
                      </span>
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 lg:pt-6 roles-grid">
                
                    {/* Card 1 Wrapper (Preserves Static Girl Overlay) */}
                    <div className="relative w-full mb-10 md:mb-12">
                      <Image 
                        src="/girl_image.svg" 
                        alt="Pointing girl" 
                        width={420} 
                        height={420} 
                        className="roles-girl-img absolute hidden lg:block w-[300px] xl:w-[360px] h-auto object-contain -left-[20px] xl:-left-[30px] bottom-full z-10 drop-shadow-[0_4px_20px_rgba(0,0,0,0.06)] pointer-events-none"
                        priority
                      />
                    <div className="roles-card relative w-full cursor-pointer" onClick={handleCardClick}>
                        <div className="relative w-full h-[260px] md:h-[320px] rounded-[2.5rem] overflow-hidden bg-[#eaf2ff]">
                          <Image src="/interview_lineart.png" alt="Practice Your Way" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-[50%_40%] mix-blend-multiply opacity-[0.85] pointer-events-none" />
                        </div>
                        <div className="group relative z-20 mx-5 md:mx-8 -mt-10 md:-mt-12 bg-white rounded-[2rem] p-6 md:p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.14)] border border-[#ffffff] flex flex-col gap-2 transition-transform duration-200 hover:scale-[1.03]">
                          <h3 className="text-[1.2rem] md:text-[1.5rem] font-extrabold text-[#111] leading-tight tracking-tight">Practice Your Way</h3>
                          <p className="text-[#555] font-medium text-[13px] md:text-[14px] leading-relaxed">Choose your preferred interview type, paste any job description, and tailor the entire mock session around your exact target role.</p>
                        </div>
                      </div>
                    </div>

                    {/* Card 2 */}
                    <div className="relative w-full mb-10 md:mb-12">
                      <div className="roles-card relative w-full cursor-pointer" onClick={handleCardClick}>
                         <div className="relative w-full h-[260px] md:h-[320px] rounded-[2.5rem] overflow-hidden bg-[#eff4ff]">
                           <Image src="/practice_lineart.png" alt="Practice Questions" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-[50%_35%] mix-blend-multiply opacity-[0.85] pointer-events-none" />
                         </div>
                         <div className="relative z-20 mx-5 md:mx-8 -mt-10 md:-mt-12 bg-white rounded-[2rem] p-6 md:p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.14)] border border-[#ffffff] flex flex-col gap-2 transition-transform duration-200 hover:scale-[1.03]">
                           <h3 className="text-[1.2rem] md:text-[1.5rem] font-extrabold text-[#111] leading-tight tracking-tight">Personalised Practice Questions</h3>
                           <p className="text-[#555] font-medium text-[13px] md:text-[14px] leading-relaxed">Your AI coach analyzes weak areas and curates a customized question bank. Instantly get detailed explanations and reviews.</p>
                         </div>
                      </div>
                    </div>

                    {/* Card 3 */}
                    <div className="relative w-full mb-10 md:mb-12">
                      <div className="roles-card relative w-full cursor-pointer" onClick={handleCardClick}>
                         <div className="relative w-full h-[260px] md:h-[320px] rounded-[2.5rem] overflow-hidden bg-[#e8f1ff]">
                           <Image src="/linkedin_lineart.png" alt="LinkedIn Resume" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-center mix-blend-multiply opacity-[0.85] pointer-events-none" />
                         </div>
                         <div className="relative z-20 mx-5 md:mx-8 -mt-10 md:-mt-12 bg-white rounded-[2rem] p-6 md:p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.14)] border border-[#ffffff] flex flex-col gap-2 transition-transform duration-200 hover:scale-[1.03]">
                           <h3 className="text-[1.2rem] md:text-[1.5rem] font-extrabold text-[#111] leading-tight tracking-tight">Resume Builder & Analysis</h3>
                           <p className="text-[#555] font-medium text-[13px] md:text-[14px] leading-relaxed">Create, analyze, and enhance your resume with AI-powered insights. Get instant feedback on formatting, keywords, and ATS optimization to stand out.</p>
                         </div>
                      </div>
                    </div>

                    {/* Card 4 */}
                    <div className="relative w-full mb-10 md:mb-12">
                      <div className="roles-card relative w-full cursor-pointer" onClick={handleCardClick}>
                         <div className="relative w-full h-[260px] md:h-[320px] rounded-[2.5rem] overflow-hidden bg-[#f3f7ff]">
                           <Image src="/analytics_lineart.png" alt="Analytics" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-center mix-blend-multiply opacity-[0.85] pointer-events-none" />
                         </div>
                  <div className="relative z-20 mx-5 md:mx-8 -mt-10 md:-mt-12 bg-white rounded-[2rem] p-6 md:p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.14)] border border-[#ffffff] flex flex-col gap-2 transition-transform duration-200 hover:scale-[1.03]">
                          <h3 className="text-[1.2rem] md:text-[1.5rem] font-extrabold text-[#111] leading-tight tracking-tight">Performance & Contest Analytics</h3>
                          <p className="text-[#555] font-medium text-[13px] md:text-[14px] leading-relaxed">Track your exact progress over time with highly detailed metrics on communication, technical execution, and behavior, plus contest rankings and live leaderboards to see how you stack up.</p>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Testimonials (Slider) — HIDDEN: uncomment to re-enable ──
          <section className="pt-8 pb-24 bg-transparent overflow-hidden relative" id="testimonials">
            <div className="max-w-[1300px] mx-auto">
              <div className="px-6 mb-12">
                <h2 className="text-[2rem] md:text-[2.6rem] font-extrabold tracking-tight text-[#111] text-center md:text-left">What our customers say</h2>
              </div>
              <TestimonialSlider />
            </div>
          </section>
          */}

          {/* ── How It Works ── */}
          <section className="scroll-mt-28 relative py-20 bg-transparent" id="how-it-works">
            <div className="max-w-[1100px] mx-auto px-6">
              <div className="text-center mb-16">
                <h2 className="text-[2.4rem] md:text-[3rem] font-extrabold tracking-tight mb-3">How it <span style={{ color: BLUE }}>works?</span></h2>
              </div>

              {/* ── Desktop Roadmap ── */}
              <div className="hidden md:block relative mt-8" style={{ height: 750 }}>

                {/* SVG: S-curve path from circle 01 to circle 04 */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 750" preserveAspectRatio="none" fill="none" aria-hidden>
                  <path className="how-path" d="M420 105 C420 195 580 205 580 280 C580 355 420 360 420 455 C420 545 580 555 580 630"
                    stroke="#e2e6f3" strokeWidth="3" strokeLinecap="round"/>
                  <path className="how-path" d="M420 105 C420 195 580 205 580 280 C580 355 420 360 420 455 C420 545 580 555 580 630"
                    stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" opacity="0.28"/>
                </svg>

                {/* Step circles */}
                {[
                  { step: "01", left: "42%", top: 105 },
                  { step: "02", left: "58%", top: 280 },
                  { step: "03", left: "42%", top: 455 },
                  { step: "04", left: "58%", top: 630 },
                ].map((c) => (
                  <div key={c.step} className="step-circle absolute z-20" style={{ left: c.left, top: c.top, transform: "translate(-50%,-50%)" }}>
                    <div className="w-[46px] h-[46px] rounded-full flex items-center justify-center bg-white text-[13px] font-black shadow-[0_0_0_4px_rgba(74,124,255,0.12),0_2px_10px_rgba(74,124,255,0.2)]"
                      style={{ border: "2px solid #4A7CFF", color: BLUE }}>
                      {c.step}
                    </div>
                  </div>
                ))}

                {/* Cards */}
                {[
                  {
                    step: "01", side: "left" as const, top: 0,
                    title: "Add Resume",
                    desc: "Upload your resume to get personalized interview questions tailored to your experience. Prepare your resume if you don't have one ready.",
                    icon: <Target className="w-5 h-5 lg:w-6 lg:h-6 text-[#111]" weight="bold" />
                  },
                  {
                    step: "02", side: "right" as const, top: 175,
                    title: "Choose Interview Type",
                    desc: "Select from AI interviews, coding challenges, system design, behavioral rounds, or full mock interviews. Pick what matches your preparation goals.",
                    icon: <ChatCircleText className="w-5 h-5 lg:w-6 lg:h-6 text-[#111]" weight="bold" />
                  },
                  {
                    step: "03", side: "left" as const, top: 350,
                    title: "Give Interview",
                    desc: "Practice with your AI interviewer that adapts in real-time, asks follow-ups, evaluates your code live, and gives you a true onsite experience.",
                    icon: <TrendUp className="w-5 h-5 lg:w-6 lg:h-6 text-[#111]" weight="bold" />
                  },
                  {
                    step: "04", side: "right" as const, top: 525,
                    title: "Analyze Report with Tutor",
                    desc: "Review your rubric-scored report and get instant help from AI Tutor. Ask questions, clarify concepts, and get personalized improvement strategies.",
                    icon: <Sparkle className="w-5 h-5 lg:w-6 lg:h-6 text-[#111]" weight="bold" />
                  }
                ].map((item) => (
                  <div key={item.step} className="step-card absolute group"
                    style={{ [item.side]: 0, top: item.top, width: "38%" }}>
                    <div className="how-step-card rounded-[24px] p-5 lg:p-6 transition-transform hover:-translate-y-1" style={{ background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 45%, #f4f5f7 100%)" }}>
                      <div className="flex flex-col md:flex-row md:items-center gap-3 lg:gap-4 mb-3 lg:mb-4">
                        <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-[14px] bg-[#FFE500] flex items-center justify-center shrink-0">
                          {item.icon}
                        </div>
                        <h3 className="text-[17px] lg:text-[19px] font-extrabold text-[#4A7CFF] tracking-tight leading-tight">{item.title}</h3>
                      </div>
                      <p className="text-[#555] text-[13.5px] lg:text-[14.5px] leading-[1.65] font-medium">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Mobile: vertical stack ── */}
              <div className="md:hidden flex flex-col gap-5 mt-8">
                {[
                  {
                    step: "01", title: "Add Resume",
                    desc: "Upload your resume for personalized questions. Prepare your resume if you don't have one ready.",
                    icon: <Target className="w-5 h-5 text-[#111]" weight="bold" />
                  },
                  {
                    step: "02", title: "Choose Interview Type",
                    desc: "Select from AI interviews, coding, system design, behavioral, or full mock interviews.",
                    icon: <ChatCircleText className="w-5 h-5 text-[#111]" weight="bold" />
                  },
                  {
                    step: "03", title: "Give Interview",
                    desc: "Practice with AI that adapts in real-time, asks follow-ups, and evaluates your code live.",
                    icon: <TrendUp className="w-5 h-5 text-[#111]" weight="bold" />
                  },
                  {
                    step: "04", title: "Analyze Report with Tutor",
                    desc: "Review your report and get instant help from AI Tutor for personalized improvement strategies.",
                    icon: <Sparkle className="w-5 h-5 text-[#111]" weight="bold" />
                  }
                ].map((item) => (
                  <div key={item.step} className="how-step-card rounded-[20px] p-5" style={{ background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 40%, #f4f5f7 100%)" }}>
                    <div className="flex items-center gap-3.5 mb-3.5">
                      <div className="w-10 h-10 rounded-[12px] bg-[#FFE500] flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <h3 className="text-[16px] sm:text-[17px] font-extrabold text-[#4A7CFF] tracking-tight leading-tight">{item.title}</h3>
                    </div>
                    <p className="text-[#555] text-[13.5px] leading-[1.65] font-medium">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── FAQ ── */}
          <section className="scroll-mt-28 relative py-20 bg-transparent" id="faq">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="text-center mb-12">
                <h2 className="text-[2.4rem] md:text-[3rem] font-extrabold tracking-tight mb-3">Frequently Asked <span style={{ color: BLUE }}>Questions</span></h2>
                <p className="text-[#555] text-lg font-medium">Everything you need to know about the platform.</p>
              </div>

              <div className="flex flex-col border-t border-[#e8e8e8]">
                {[
                  {
                    q: "Do I need to download any software?",
                    a: "No, Probe is entirely browser-based. You can record voice answers, execute code, and review your feedback directly in your web browser without installing anything."
                  },
                  {
                    q: "Can I practice for specific roles or companies?",
                    a: "Absolutely. You can paste any job description into Probe, and our AI will adapt its technical interview questions and evaluation criteria specifically for that role."
                  },
                  {
                    q: "What programming languages are supported?",
                    a: "Our built-in IDE supports over 40 programming languages including Python, Java, C++, JavaScript, Go, and Ruby, allowing you to interview in your strongest language."
                  },
                  {
                    q: "How is the feedback generated?",
                    a: "We use a multi-agent AI pipeline to transcribe your speech, run your code against edge cases, and evaluate your problem-solving approach against industry-standard engineering rubrics."
                  },
                  {
                    q: "Can I compete in contests or interview with other users?",
                    a: "Yes. Probe runs regular coding contests with live leaderboards, and you can pair up for high-quality peer-to-peer mock interviews alongside our AI and professional interview options."
                  }
                ].map((faq, i) => (
                  <details key={i} className="group border-b border-[#e8e8e8] overflow-hidden transition-all duration-200">
                    <summary className="cursor-pointer py-6 font-semibold text-[17px] text-[#222] transition-colors duration-300 group-hover:text-[#4A7CFF] group-open:text-[#4A7CFF] flex justify-between items-center list-none select-none [&::-webkit-details-marker]:hidden pr-2">
                      {faq.q}
                      <span className="transition-colors duration-300 text-[#111] group-hover:text-[#4A7CFF] group-open:text-[#4A7CFF] shrink-0 ml-4">
                        <span className="block transition-transform duration-300 group-open:rotate-180">
                          <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" width="20"><path d="M6 9l6 6 6-6"></path></svg>
                        </span>
                      </span>
                    </summary>
                    <div className="pb-6 pr-12 text-[#555] text-[15px] font-medium leading-[1.6]">
                      {faq.a}
                    </div>
                  </details>
                ))}
              </div>

              <div className="text-center mt-10">
                <Link href="/login" className="inline-block text-[#111] font-semibold hover:text-[#4A7CFF] transition-colors text-[17px] underline underline-offset-4 decoration-2 decoration-[#e8e8e8] hover:decoration-[#4A7CFF]">
                  View more
                </Link>
              </div>

            </div>
          </section>

          {/* ── Blog Section ── */}
          <section className="scroll-mt-28 relative pt-16 pb-6 md:pb-8 overflow-x-clip border-none z-0" id="blog">
            <div className="max-w-[1260px] mx-auto px-6">
              <div className="relative rounded-3xl overflow-hidden" style={{ background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 40%, #f4f5f7 100%)" }}>
                <div className="p-10 md:p-14 relative">
                  
                  {/* Header with "More blogs" button */}
                  <div className="flex items-center justify-between mb-8 -mt-2">
                    <h2 className="text-[2rem] md:text-[2.6rem] font-black text-[#111] tracking-tight">Blog</h2>
                    <Link
                      href="/login"
                      className="px-6 py-2.5 rounded-full border-2 border-[#e8e8e8] bg-white text-[#1a1a1a] font-semibold text-[14px] hover:border-[#4A7CFF] hover:text-[#4A7CFF] transition-all duration-300"
                    >
                      More blogs
                    </Link>
                  </div>

                  {/* Blog Cards Grid */}
                  <div className="grid md:grid-cols-3 gap-6 md:gap-8 mt-12">
                    {blogs.length > 0 ? blogs.map((blog) => (
                      <Link key={blog.id} href="/login" className="group cursor-pointer">
                        <div className="relative">
                          {/* Image */}
                          <div className="relative overflow-hidden rounded-2xl h-[240px]">
                            <Image
                              src={blog.coverImage || "/blog1.png"}
                              alt={blog.title}
                              width={400}
                              height={240}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                          </div>
                          {/* White container overlapping image bottom with fade */}
                          <div className="relative -mt-20 mx-4 rounded-2xl p-5 pb-8 shadow-lg" style={{ background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 50%, rgba(244,245,247,0.8) 85%, rgba(244,245,247,0) 100%)" }}>
                            <h3 className="text-[15px] md:text-[16px] font-bold text-[#111] group-hover:text-[#4A7CFF] transition-colors leading-tight mb-2 line-clamp-2">
                              {blog.title}
                            </h3>
                            <p className="text-[13px] text-gray-500 font-medium">
                              {new Date(blog.publishedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}
                            </p>
                          </div>
                        </div>
                      </Link>
                    )) : (
                      Array(3).fill(0).map((_, i) => (
                        <div key={i} className="animate-pulse">
                          <div className="rounded-2xl bg-gray-200 h-[240px] dark:bg-gray-700"></div>
                          <div className="relative -mt-20 mx-4 rounded-2xl p-5 pb-8 shadow-lg" style={{ background: "linear-gradient(to bottom, #ffffff 0%, #ffffff 50%, rgba(244,245,247,0.8) 85%, rgba(244,245,247,0) 100%)" }}>
                            <div className="h-4 bg-gray-300 rounded w-3/4 mb-2 dark:bg-gray-600"></div>
                            <div className="h-4 bg-gray-300 rounded w-1/2 mb-4 dark:bg-gray-600"></div>
                            <div className="h-3 bg-gray-300 rounded w-1/4 dark:bg-gray-600"></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                </div>
              </div>
            </div>
          </section>

          {/* ── Final CTA ── */}
          <section className="bg-[#FFE500]">
            <div className="final-cta max-w-[1200px] mx-auto px-6 py-16 flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-black text-[#1a1a1a] mb-3">Ready to ace your interview?</h2>
                <p className="text-[#1a1a1a]/60 text-lg max-w-xl">
                  Practice with AI voice interviews, live coding, and instant rubric-scored reports. No credit card required.
                </p>
              </div>
              <Link href="/login" className="bg-[#1a1a1a] text-white px-7 py-3.5 rounded-full font-semibold text-sm hover:bg-[#333] transition-colors whitespace-nowrap shrink-0">
                Start Practicing Free
              </Link>
            </div>
          </section>

          {/* ── Footer ── */}
          <footer className="relative overflow-hidden py-16 text-[#999]" style={{ background: "linear-gradient(135deg, #000000 60%, #0c1c38 100%)" }}>
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="grid md:grid-cols-4 gap-12 mb-12">
                <div className="md:col-span-2">
                  <Image src="/logo_big_dark.svg" alt="Probe." width={140} height={40} className="h-8 w-auto mb-5" />
                  <p className="max-w-xs text-sm leading-relaxed">The only AI-native interview preparation platform designed for the highest level of technical assessment.</p>
                </div>
                <div>
                  <h4 className="text-white font-extrabold tracking-tight text-[16px] mb-5">Product</h4>
                  <ul className="space-y-3 text-sm">
                    <li><a className="hover:text-white transition-colors" href="#features">Features</a></li>
                    <li><Link className="hover:text-white transition-colors" href="/login">Interviews</Link></li>
                    <li><Link className="hover:text-white transition-colors" href="/login">Interview Types</Link></li>
                    <li><Link className="hover:text-white transition-colors" href="/login">Questions</Link></li>
                    <li><Link className="hover:text-white transition-colors" href="/login">Blog</Link></li>
                    <li><Link className="hover:text-white transition-colors" href="/login">FAQ</Link></li>

                    <li><a className="hover:text-white transition-colors" href="#testimonials">Testimonials</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-white font-extrabold tracking-tight text-[16px] mb-5">Company</h4>
                  <ul className="space-y-3 text-sm">
                    <li><Link className="hover:text-white transition-colors" href="/login">About Us</Link></li>
                    <li><Link className="hover:text-white transition-colors" href="/login">Careers</Link></li>
                    <li><Link className="hover:text-white transition-colors" href="/login">Privacy Policy</Link></li>
                    <li><Link className="hover:text-white transition-colors" href="/login">Terms of Service</Link></li>
                  </ul>
                </div>
              </div>
              <div className="pt-8 flex flex-col md:flex-row justify-between gap-4 items-center text-xs">
                <p>&copy; 2026 Probe. All rights reserved.</p>
                <div className="flex gap-4">
                  <a href="https://x.com/practerscom?s=11" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#111] border border-[#222] flex items-center justify-center hover:-translate-y-1 transition-transform shadow-lg cursor-pointer">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
                    </svg>
                  </a>
                  <a href="https://www.linkedin.com/company/practers/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#111] border border-[#222] flex items-center justify-center hover:-translate-y-1 transition-transform shadow-lg cursor-pointer">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                    </svg>
                  </a>
                  <a href="https://www.instagram.com/trypracters?igsh=MWowM2RuYTM5NmVydQ%3D%3D&utm_source=qr" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#111] border border-[#222] flex items-center justify-center hover:-translate-y-1 transition-transform shadow-lg cursor-pointer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                    </svg>
                  </a>
                  <a href="https://t.me/practers" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#111] border border-[#222] flex items-center justify-center hover:-translate-y-1 transition-transform shadow-lg cursor-pointer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M23.91 3.79L20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7l-5.45-1.7c-1.18-.36-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.53 1.73z"/>
                    </svg>
                  </a>
                  <a href="https://chat.whatsapp.com/DARzbWxP9YU2ENTOa8Idj4" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-[#111] border border-[#222] flex items-center justify-center hover:-translate-y-1 transition-transform shadow-lg cursor-pointer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>
      
      {/* Cookie Consent Banner */}
      <CookieConsent />
    </>
  );
}
