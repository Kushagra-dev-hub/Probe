import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const currentDir = typeof __dirname !== "undefined" ? __dirname : process.cwd();

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../../.env"),
  path.resolve(currentDir, "../../../.env"),
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));
dotenv.config(envPath ? { path: envPath } : undefined);

export function getExpertConfig() {
  const allowedOrigins = [
    process.env.FRONTEND_URL || "http://localhost:3000",
    process.env.COMPANY_FRONTEND_URL || "http://localhost:3003",
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_COMPANY_APP_URL,
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3003",
  ].filter((origin): origin is string => Boolean(origin));

  return {
    host: process.env.EXPERT_HOST || "::",
    port: Number.parseInt(process.env.EXPERT_PORT || "3004", 10),
    allowedOrigins,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}
