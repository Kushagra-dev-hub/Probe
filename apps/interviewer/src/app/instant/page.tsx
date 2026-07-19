"use client";

import Link from "next/link";
import { InterviewWizard } from "@/components/interview-wizard";

export default function InstantInterviewPage() {
  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col px-6 py-6">
      <Link href="/dashboard" className="shrink-0 text-sm text-haze/60 hover:text-white">
        ← Back to dashboard
      </Link>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <InterviewWizard mode="instant" />
      </div>
    </main>
  );
}
