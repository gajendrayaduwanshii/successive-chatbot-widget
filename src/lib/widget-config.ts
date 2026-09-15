import { z } from "zod";

export const widgetPositionSchema = z.enum(["bottom-right", "bottom-left"]);
export const hexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
export const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname))
      );
    } catch {
      return false;
    }
  }, "URL must use HTTPS outside localhost");

const boundedInt = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).catch(fallback);

export const widgetConfigSchema = z.object({
  title: z.string().trim().min(1).max(60).catch("Ask Successive AI"),
  welcomeMessage: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .catch("Hi! How can I help you explore Successive?"),
  primaryColor: hexColorSchema.catch("#0063ce"),
  position: widgetPositionSchema.catch("bottom-right"),
  buttonLabel: z.string().trim().max(40).catch("Chat with Successive"),
  logoUrl: z.union([httpUrlSchema, z.literal("")]).catch(""),
  openByDefault: z.coerce.boolean().catch(false),
  zIndex: boundedInt(2147483000, 1000, 2147483646),
  width: boundedInt(400, 320, 520),
  height: boundedInt(650, 450, 850),
  mobileFullscreen: z.coerce.boolean().catch(true),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

export function parseWidgetQuery(params: URLSearchParams): WidgetConfig {
  return widgetConfigSchema.parse({
    title: params.get("title") ?? undefined,
    welcomeMessage: params.get("welcomeMessage") ?? undefined,
    primaryColor: params.get("primaryColor") ?? undefined,
    position: params.get("position") ?? undefined,
    buttonLabel: params.get("buttonLabel") ?? undefined,
    logoUrl: params.get("logoUrl") ?? "",
    openByDefault: params.get("openByDefault") === "true",
    zIndex: params.get("zIndex") ?? undefined,
    width: params.get("width") ?? undefined,
    height: params.get("height") ?? undefined,
    mobileFullscreen: params.get("mobileFullscreen") !== "false",
  });
}

export function readableForeground(hex: string): "#ffffff" | "#111827" {
  const [r, g, b] = [1, 3, 5].map((start) =>
    parseInt(hex.slice(start, start + 2), 16),
  );
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export const widgetMessageSchema = z
  .object({
    namespace: z.literal("successive-chat"),
    type: z.enum([
      "SUCCESSIVE_CHAT_READY",
      "SUCCESSIVE_CHAT_OPEN",
      "SUCCESSIVE_CHAT_CLOSE",
      "SUCCESSIVE_CHAT_RESIZE",
      "SUCCESSIVE_CHAT_UNREAD",
      "SUCCESSIVE_CHAT_ERROR",
      "SUCCESSIVE_CHAT_SUBMIT",
      "SUCCESSIVE_CHAT_SUBMIT_ACK",
    ]),
    payload: z
      .object({
        height: z.number().int().min(450).max(850).optional(),
        count: z.number().int().min(0).max(99).optional(),
        message: z.string().max(1000).optional(),
        id: z.string().max(100).optional(),
      })
      .optional(),
  })
  .strict();
