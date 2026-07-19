import type { ReactNode } from "react";
import { AuthProvider } from "@/context/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
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
    <html lang="en" className="dark" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* Dark-only app: pin the dark class before first paint (no toggle). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('dark');document.documentElement.dataset.dark='true';try{localStorage.setItem('theme','dark');localStorage.setItem('practers-dark','true');}catch(e){}`,
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
          defaultTheme="dark"
          forcedTheme="dark"
          enableSystem={false}
          storageKey="theme"
        >
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
