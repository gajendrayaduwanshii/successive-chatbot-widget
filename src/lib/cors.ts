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
  const isAllowed = !normalizedOrigin || allowed.includes(normalizedOrigin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (normalizedOrigin && isAllowed)
    headers["Access-Control-Allow-Origin"] = normalizedOrigin;
  return { isAllowed, headers };
}
