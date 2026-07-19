"use client";

/**
 * SQL round UI helpers (ported from practers' DataTable pattern).
 *  DataTable     — renders an array-of-row-objects, or an object keyed by table
 *                  name, as clean HTML tables.
 *  SqlSchema     — the database schema + sample rows from the question examples.
 *  SqlResultView — the query output grid + Accepted/Wrong-Answer verdict.
 */
import type { ExecutionTable } from "@probe/contract";

function cellText(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

export function DataTable({ data, title }: { data: unknown; title?: string }) {
    let parsed = data;
    if (typeof data === "string") {
        try {
            parsed = JSON.parse(data);
        } catch {
            return <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[12px] text-slate-700 dark:bg-lc-bg dark:text-slate-200">{data}</pre>;
        }
    }

    // Object keyed by table name → render each table.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const entries = Object.entries(parsed as Record<string, unknown>);
        return (
            <div className="space-y-3">
                {entries.map(([name, rows]) => (
                    <DataTable key={name} data={rows} title={name} />
                ))}
            </div>
        );
    }

    const rows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    if (rows.length === 0) {
        return (
            <div>
                {title && <p className="mb-1 text-[12px] font-bold text-slate-700 dark:text-slate-200">{title}</p>}
                <p className="rounded-lg bg-slate-50 p-2 text-[12px] italic text-slate-400 dark:bg-lc-bg">No rows.</p>
            </div>
        );
    }
    const keys = Object.keys(rows[0] ?? {});
    return (
        <div>
            {title && <p className="mb-1 text-[12px] font-bold text-slate-700 dark:text-slate-200">{title}</p>}
            <div className="custom-scrollbar overflow-x-auto rounded-lg border border-slate-200 dark:border-lc-border">
                <table className="min-w-full text-[12px]">
                    <thead className="bg-slate-100 dark:bg-lc-hover">
                        <tr>
                            {keys.map((k) => (
                                <th key={k} className="whitespace-nowrap border-b border-slate-200 px-3 py-1.5 text-left font-bold text-slate-700 dark:border-lc-border dark:text-slate-200">{k}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                                {keys.map((k) => (
                                    <td key={k} className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 font-mono text-slate-600 dark:border-lc-border/60 dark:text-slate-300">{cellText(row[k])}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** Renders a backend ExecutionTable (columns + rows) as a grid. */
function ExecTable({ table }: { table: ExecutionTable }) {
    if (!table.columns.length) return <p className="rounded-lg bg-slate-50 p-2 text-[12px] italic text-slate-400 dark:bg-lc-bg">No rows returned.</p>;
    return (
        <div className="custom-scrollbar overflow-x-auto rounded-lg border border-slate-200 dark:border-lc-border">
            <table className="min-w-full text-[12px]">
                <thead className="bg-slate-100 dark:bg-lc-hover">
                    <tr>{table.columns.map((c, i) => <th key={i} className="whitespace-nowrap border-b border-slate-200 px-3 py-1.5 text-left font-bold text-slate-700 dark:border-lc-border dark:text-slate-200">{c}</th>)}</tr>
                </thead>
                <tbody>
                    {table.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                            {row.map((cell, j) => <td key={j} className="whitespace-nowrap border-b border-slate-100 px-3 py-1.5 font-mono text-slate-600 dark:border-lc-border/60 dark:text-slate-300">{cell}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function SqlSchema({ examples }: { examples?: Array<{ input?: unknown; output?: unknown; explanation?: string }> | null }) {
    const first = examples?.[0];
    if (!first?.input) return null;
    return (
        <div className="space-y-3">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-900 dark:text-white">Database schema & sample data</h3>
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-lc-bg">
                <DataTable data={first.input} />
            </div>
            {first.output != null && (
                <>
                    <h3 className="text-[13px] font-bold uppercase tracking-wider text-slate-900 dark:text-white">Expected result</h3>
                    <div className="rounded-lg bg-slate-50 p-3 dark:bg-lc-bg">
                        <DataTable data={first.output} />
                    </div>
                </>
            )}
            {first.explanation && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-[12px] leading-relaxed text-slate-600 dark:border-lc-border dark:bg-lc-bg dark:text-slate-300">
                    <span className="font-bold text-slate-700 dark:text-slate-200">Explanation: </span>{first.explanation}
                </div>
            )}
        </div>
    );
}

export function SqlResultView({
    table,
    passed,
    error,
    ran,
}: {
    table: ExecutionTable | null | undefined;
    passed: boolean | null | undefined;
    error: string | null | undefined;
    ran: boolean;
}) {
    if (!ran) {
        return (
            <div className="flex h-full flex-col items-center justify-center text-[13px] text-slate-400">
                <span className="material-symbols-outlined mb-2 text-3xl opacity-50">table_view</span>
                <p>Run the query to see the result grid.</p>
            </div>
        );
    }
    if (error) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 font-mono text-[12px] whitespace-pre-wrap text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{error}</div>
        );
    }
    return (
        <div className="space-y-3">
            {passed != null && (
                <div className={`rounded-lg border p-3 ${passed ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10"}`}>
                    <p className={`flex items-center gap-1.5 text-sm font-bold ${passed ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                        <span className="material-symbols-outlined text-[18px]">{passed ? "check_circle" : "cancel"}</span>
                        {passed ? "Accepted" : "Wrong Answer"}
                    </p>
                    <p className={`mt-0.5 text-[11px] font-semibold ${passed ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500"}`}>
                        {passed ? "Your output matches the expected result." : "Your output does not match the expected result."}
                    </p>
                </div>
            )}
            <div>
                <p className="mb-1.5 text-[12px] font-bold text-slate-700 dark:text-slate-200">Your output</p>
                {table ? <ExecTable table={table} /> : <p className="text-[12px] italic text-slate-400">No output.</p>}
            </div>
        </div>
    );
}
