import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Log In",
    description: "Log in to Probe to run live coding interviews, review reports, and continue your interview workflow.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
