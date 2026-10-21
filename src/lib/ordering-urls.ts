import {
  DEMO_ORDERING_WEBSITE_URL,
  DEMO_ORDERING_WHATSAPP_URL,
  ORDERING_METHOD,
  type OrderingMethod,
} from "@/lib/constants";

/**
 * Validate an external ordering URL. Only https is allowed.
 * WhatsApp / website methods require a URL; INTERNAL must not have one.
 */
export function validateOrderingUrl(
  method: OrderingMethod,
  rawUrl: string | null | undefined,
): { ok: true; url: string | null } | { ok: false; error: string } {
  const trimmed = String(rawUrl ?? "").trim();

  if (method === ORDERING_METHOD.INTERNAL) {
    if (trimmed) {
      return {
        ok: false,
        error: "Internal ordering cards should not have an external URL.",
      };
    }
    return { ok: true, url: null };
  }

  if (!trimmed) {
    return {
      ok: false,
      error: "WhatsApp and website cards need an https URL.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "That URL is not valid." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Only https:// links are allowed." };
  }

  if (!parsed.hostname) {
    return { ok: false, error: "That URL is not valid." };
  }

  return { ok: true, url: parsed.toString() };
}

export function defaultDemoUrl(method: OrderingMethod): string | null {
  if (method === ORDERING_METHOD.WHATSAPP) return DEMO_ORDERING_WHATSAPP_URL;
  if (method === ORDERING_METHOD.WEBSITE) return DEMO_ORDERING_WEBSITE_URL;
  return null;
}

export function isExternalOrderingMethod(method: OrderingMethod): boolean {
  return (
    method === ORDERING_METHOD.WHATSAPP || method === ORDERING_METHOD.WEBSITE
  );
}
