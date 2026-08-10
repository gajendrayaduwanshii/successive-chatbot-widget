import { getEnv } from "./env";
export function corsHeaders(origin: string | null) {
  const env = getEnv();
  const configured = [env.ALLOWED_ORIGINS, env.WIDGET_ALLOWED_ORIGINS]
    .filter(Boolean)
    .join(",");
  const allowed = configured
    .split(",")
    .map((x) => x.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const normalizedOrigin = origin?.replace(/\/$/, "") ?? null;
  // Plain-HTML local widget demos opened via file:// send `Origin: null`.
  // Permit that opaque origin only during local development; production must
  // continue using the explicit website allowlist.
  const isLocalFileDevelopment =
    normalizedOrigin === "null" && process.env.NODE_ENV !== "production";
  const isAllowed =
    !normalizedOrigin ||
    isLocalFileDevelopment ||
    allowed.includes(normalizedOrigin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (normalizedOrigin && isAllowed)
    headers["Access-Control-Allow-Origin"] = normalizedOrigin;
  return { isAllowed, headers };
}
