import crypto from "node:crypto";

/**
 * Password reset by emailed 6-digit code.
 *   1. request(email)            -> emails a code (never reveals whether the account exists)
 *   2. verify(email, code)       -> returns a one-time reset token
 *   3. reset(email, token, pw)   -> sets the new password
 * State is kept in memory (a restart just means asking for a new code).
 */
export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_REQUESTS_PER_HOUR = 5;

export class ResetError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface ResetDeps {
  lookupUserId(email: string): Promise<string | null>;
  updatePassword(userId: string, password: string): Promise<void>;
  sendCode(email: string, code: string): Promise<void>;
  sendChanged?(email: string): Promise<void>;
  secret: string;
  now?: () => number;
}

interface Entry {
  userId: string | null; // null = no such account (decoy, so timing/cooldown look the same)
  codeHash: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
  resetHash?: string;
  resetExpires?: number;
}

export function isValidPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length > 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAD_CODE = "That code doesn’t match or has expired. Request a new one.";

export function createPasswordResetService(deps: ResetDeps) {
  const now = deps.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const sends = new Map<string, number[]>();

  const norm = (email: unknown) => String(email ?? "").trim().toLowerCase();
  const hash = (v: string) => crypto.createHmac("sha256", deps.secret).update(v).digest("hex");
  const same = (a: string, b: string) => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };

  function sweep() {
    const t = now();
    for (const [k, e] of entries) if (t > Math.max(e.expiresAt, e.resetExpires ?? 0)) entries.delete(k);
    for (const [k, list] of sends) {
      const recent = list.filter((x) => t - x < 3_600_000);
      if (recent.length) sends.set(k, recent);
      else sends.delete(k);
    }
  }

  async function request(emailRaw: unknown) {
    sweep();
    const email = norm(emailRaw);
    if (!EMAIL_RE.test(email)) throw new ResetError(400, "Enter a valid email address.");

    const t = now();
    const recent = sends.get(email) ?? [];
    if (recent.length >= MAX_REQUESTS_PER_HOUR) throw new ResetError(429, "Too many requests. Try again in an hour.");
    const prev = entries.get(email);
    if (prev && t - prev.sentAt < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (t - prev.sentAt)) / 1000);
      throw new ResetError(429, `Wait ${wait} seconds before asking for another code.`);
    }
    sends.set(email, [...recent, t]);

    const userId = await deps.lookupUserId(email);
    if (!userId) {
      // Same outward behaviour as a real account, but nothing is sent.
      entries.set(email, { userId: null, codeHash: hash("decoy:" + crypto.randomBytes(8).toString("hex")), expiresAt: t + CODE_TTL_MS, attempts: 0, sentAt: t });
      return;
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    entries.set(email, { userId, codeHash: hash(`${email}:${code}`), expiresAt: t + CODE_TTL_MS, attempts: 0, sentAt: t });
    try {
      await deps.sendCode(email, code);
    } catch (err) {
      entries.delete(email);
      sends.set(email, recent); // a failed send shouldn't burn the user's hourly allowance
      throw new ResetError(502, "We couldn’t send the email. Try again in a moment.");
    }
  }

  function verify(emailRaw: unknown, codeRaw: unknown): string {
    const email = norm(emailRaw);
    const code = String(codeRaw ?? "").trim();
    const e = entries.get(email);
    const t = now();
    if (!e || t > e.expiresAt || !e.codeHash) throw new ResetError(400, BAD_CODE);
    if (e.attempts >= MAX_ATTEMPTS) {
      entries.delete(email);
      throw new ResetError(429, "Too many wrong codes. Request a new one.");
    }
    const ok = e.userId !== null && /^\d{6}$/.test(code) && same(hash(`${email}:${code}`), e.codeHash);
    if (!ok) {
      e.attempts += 1;
      throw new ResetError(400, BAD_CODE);
    }
    const token = crypto.randomBytes(32).toString("hex");
    e.codeHash = ""; // a code works once
    e.resetHash = hash("token:" + token);
    e.resetExpires = t + CODE_TTL_MS;
    return token;
  }

  async function reset(emailRaw: unknown, tokenRaw: unknown, password: unknown) {
    const email = norm(emailRaw);
    const token = String(tokenRaw ?? "");
    const e = entries.get(email);
    const t = now();
    if (!e || !e.userId || !e.resetHash || !e.resetExpires || t > e.resetExpires || !same(hash("token:" + token), e.resetHash)) {
      throw new ResetError(400, "Your reset session expired. Start again.");
    }
    if (!isValidPassword(password)) {
      throw new ResetError(400, "Password must be more than 8 characters with a lowercase, an uppercase and a special character.");
    }
    try {
      await deps.updatePassword(e.userId, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/same|different from the old/i.test(msg)) throw new ResetError(400, "Choose a password you haven’t used before.");
      throw new ResetError(500, "Couldn’t update the password. Try again.");
    }
    entries.delete(email);
    void deps.sendChanged?.(email)?.catch(() => undefined);
  }

  return { request, verify, reset };
}
