import type { ReactNode } from "react";
import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeSync } from "@/components/theme-sync";
import "./globals.css";

export const metadata = {
  title: "Probe — AI Interview Copilot",
  description: "Live coding interview room (interviewer).",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* Blocking script: read localStorage before first paint to prevent dark-mode flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var legacy=localStorage.getItem('practers-dark');var theme=localStorage.getItem('theme');var dark=legacy==='true'||theme==='dark';var light=legacy==='false'||theme==='light';if(dark&&!light){document.documentElement.classList.add('dark');document.documentElement.dataset.dark='true';localStorage.setItem('theme','dark');localStorage.setItem('practers-dark','true');}else if(light){document.documentElement.classList.remove('dark');document.documentElement.dataset.dark='';localStorage.setItem('theme','light');localStorage.setItem('practers-dark','false');}}catch(e){}})();`,
          }}
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Syne:wght@400;700;800&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&family=Nunito:wght@700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased dark:bg-lc-bg dark:text-[#eff1f6] overflow-x-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
          storageKey="theme"
        >
          <ThemeSync />
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
