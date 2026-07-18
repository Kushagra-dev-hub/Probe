"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { api, type InterviewListResponse, type InterviewSummary } from "@/lib/api";
import { InterviewForm } from "@/components/interview-form";

export default function EditInterviewPage({ params }: { params: Promise<{ interviewId: string }> }) {
  const { interviewId } = use(params);
  const { session } = useAuth();
  const token = session?.access_token;

  const [interview, setInterview] = useState<InterviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<InterviewListResponse>("/interviews", token)
      .then((list) => {
        const found = list.interviews.find((i) => i.id === interviewId);
        if (!found) setError("Interview not found (or you don't have access).");
        else setInterview(found);
      })
      .catch((e: Error) => setError(e.message));
  }, [token, interviewId]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← Back to interviews
      </Link>
      <h1 className="mb-1 mt-4 text-2xl font-bold text-slate-900">Edit interview</h1>
      <p className="mb-8 text-sm text-slate-500">Change the questions, schedule, or notes.</p>
      {error && <p className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {!error && !interview && <p className="text-sm text-slate-500">Loading…</p>}
      {interview && <InterviewForm existing={interview} />}
    </main>
  );
}
