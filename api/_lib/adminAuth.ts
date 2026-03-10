import crypto from "crypto";

const ADMIN_SESSION_COOKIE = "tf_admin_session";
const ADMIN_TOKEN_TTL_MS = 15 * 60 * 1000;

interface AdminTokenPayload {
  sub: "admin";
  iat: number;
  exp: number;
  nonce: string;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const withPadding = padding > 0 ? normalized + "=".repeat(4 - padding) : normalized;
  return Buffer.from(withPadding, "base64").toString("utf8");
}

function sign(data: string, secret: string): string {
  return base64UrlEncode(crypto.createHmac("sha256", secret).update(data).digest());
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function getRequiredAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET?.trim() ?? "";
  if (!secret) {
    throw new Error("Admin secret is not configured. Set ADMIN_SECRET in server environment variables.");
  }
  return secret;
}

export function createAdminSessionToken(now = Date.now()): { token: string; expiresAt: number } {
  const secret = getRequiredAdminSecret();
  const payload: AdminTokenPayload = {
    sub: "admin",
    iat: now,
    exp: now + ADMIN_TOKEN_TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return { token: `${encodedPayload}.${signature}`, expiresAt: payload.exp };
}

export function verifyAdminSessionToken(token: string | null | undefined, now = Date.now()): AdminTokenPayload | null {
  if (!token) return null;
  const [encodedPayload, encodedSig] = token.split(".");
  if (!encodedPayload || !encodedSig) return null;

  const secret = getRequiredAdminSecret();
  const expectedSig = sign(encodedPayload, secret);
  if (!safeEqual(expectedSig, encodedSig)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as AdminTokenPayload;
    if (parsed.sub !== "admin") return null;
    if (typeof parsed.exp !== "number" || parsed.exp <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookie(header: string | undefined, key: string): string | null {
  if (!header) return null;
  const parts = header.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part.startsWith(`${key}=`)) continue;
    return decodeURIComponent(part.slice(key.length + 1));
  }
  return null;
}

export function readAdminTokenFromRequest(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const authHeader = req.headers.authorization;
  const authValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (authValue?.toLowerCase().startsWith("bearer ")) {
    return authValue.slice("bearer ".length).trim();
  }

  const cookieHeader = req.headers.cookie;
  const cookieValue = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  return parseCookie(cookieValue, ADMIN_SESSION_COOKIE);
}

export function createAdminCookie(token: string): string {
  const maxAge = Math.floor(ADMIN_TOKEN_TTL_MS / 1000);
  return [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

export function clearAdminCookie(): string {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=0",
  ].join("; ");
}
