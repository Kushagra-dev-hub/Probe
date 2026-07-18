import type { ReactNode } from "react";
import { AuthProvider } from "@/context/auth-context";
import "./globals.css";

export const metadata = {
  title: "Probe — Interviewee",
  description: "Live coding interview room (interviewee).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;700&family=Nunito:wght@700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased dark:bg-lc-bg dark:text-[#eff1f6]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
