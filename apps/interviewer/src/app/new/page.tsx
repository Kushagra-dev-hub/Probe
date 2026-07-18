"use client";

import Link from "next/link";
import { InterviewForm } from "@/components/interview-form";

export default function NewInterviewPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← Back to interviews
      </Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold text-slate-900">New interview</h1>
      <p className="mb-8 text-sm text-slate-500">
        Pick an interviewee, choose questions from the bank, and schedule the session.
      </p>
      <InterviewForm />
    </main>
  );
}
