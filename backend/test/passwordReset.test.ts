import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPasswordResetService,
  ResetError,
  MAX_ATTEMPTS,
  MAX_REQUESTS_PER_HOUR,
  RESEND_COOLDOWN_MS,
  CODE_TTL_MS,
} from "../src/services/passwordReset";

const USERS: Record<string, string> = { "anya@stocksense.app": "user-1" };
const STRONG = "Brand-New-Pass1!";

function setup() {
  let clock = 1_000_000;
  const sent: { to: string; code: string }[] = [];
  const updates: { userId: string; password: string }[] = [];
  const changed: string[] = [];
  let failSend = false;
  const svc = createPasswordResetService({
    secret: "test-secret",
    now: () => clock,
    lookupUserId: async (e) => USERS[e] ?? null,
    updatePassword: async (userId, password) => {
      updates.push({ userId, password });
    },
    sendCode: async (to, code) => {
      if (failSend) throw new Error("smtp down");
      sent.push({ to, code });
    },
    sendChanged: async (to) => {
      changed.push(to);
    },
  });
  return { svc, sent, updates, changed, tick: (ms: number) => (clock += ms), failSend: (v: boolean) => (failSend = v) };
}

const rejects = (fn: () => unknown, status: number) =>
  assert.rejects(async () => fn(), (e: unknown) => e instanceof ResetError && e.status === status);

test("a known email gets exactly one 6-digit code", async () => {
  const t = setup();
  await t.svc.request("  Anya@StockSense.app ");
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].to, "anya@stocksense.app");
  assert.match(t.sent[0].code, /^\d{6}$/);
});

test("an unknown email looks the same but sends nothing", async () => {
  const t = setup();
  await t.svc.request("nobody@nowhere.com");
  assert.equal(t.sent.length, 0);
  // the cooldown applies to unknown emails too, so it can't be used to probe for accounts
  await rejects(() => t.svc.request("nobody@nowhere.com"), 429);
  // and no code can ever be accepted for it
  assert.throws(() => t.svc.verify("nobody@nowhere.com", "123456"), ResetError);
});

test("bad email format is refused", async () => {
  await rejects(() => setup().svc.request("not-an-email"), 400);
});

test("resend cooldown and hourly limit", async () => {
  const t = setup();
  await t.svc.request("anya@stocksense.app");
  await rejects(() => t.svc.request("anya@stocksense.app"), 429);
  for (let i = 1; i < MAX_REQUESTS_PER_HOUR; i++) {
    t.tick(RESEND_COOLDOWN_MS + 1);
    await t.svc.request("anya@stocksense.app");
  }
  t.tick(RESEND_COOLDOWN_MS + 1);
  await rejects(() => t.svc.request("anya@stocksense.app"), 429); // 6th request inside the hour
  t.tick(3_600_000);
  await t.svc.request("anya@stocksense.app"); // allowed again after an hour
});

test("wrong codes are counted and lock the code after 5 tries", async () => {
  const t = setup();
  await t.svc.request("anya@stocksense.app");
  const good = t.sent[0].code;
  const wrong = good === "000000" ? "111111" : "000000";
  for (let i = 0; i < MAX_ATTEMPTS; i++) assert.throws(() => t.svc.verify("anya@stocksense.app", wrong), (e: any) => e.status === 400);
  assert.throws(() => t.svc.verify("anya@stocksense.app", good), (e: any) => e.status === 429); // even the right code is now refused
  assert.throws(() => t.svc.verify("anya@stocksense.app", good), (e: any) => e.status === 400); // and it is gone
});

test("a code expires after 10 minutes", async () => {
  const t = setup();
  await t.svc.request("anya@stocksense.app");
  t.tick(CODE_TTL_MS + 1);
  assert.throws(() => t.svc.verify("anya@stocksense.app", t.sent[0].code), ResetError);
});

test("full flow: code -> token -> new password, and nothing can be reused", async () => {
  const t = setup();
  await t.svc.request("anya@stocksense.app");
  const code = t.sent[0].code;
  const token = t.svc.verify("anya@stocksense.app", code);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.throws(() => t.svc.verify("anya@stocksense.app", code), ResetError); // code is single-use

  await rejects(() => t.svc.reset("anya@stocksense.app", "wrong-token", STRONG), 400);
  await rejects(() => t.svc.reset("anya@stocksense.app", token, "weak"), 400);
  assert.equal(t.updates.length, 0);

  await t.svc.reset("anya@stocksense.app", token, STRONG);
  assert.deepEqual(t.updates, [{ userId: "user-1", password: STRONG }]);
  assert.deepEqual(t.changed, ["anya@stocksense.app"]);
  await rejects(() => t.svc.reset("anya@stocksense.app", token, STRONG), 400); // token is single-use
});

test("a reset token cannot be used without verifying the code first", async () => {
  const t = setup();
  await t.svc.request("anya@stocksense.app");
  await rejects(() => t.svc.reset("anya@stocksense.app", "", STRONG), 400);
  await rejects(() => t.svc.reset("anya@stocksense.app", "abc", STRONG), 400);
  assert.equal(t.updates.length, 0);
});

test("if the email fails to send, the user can try again straight away", async () => {
  const t = setup();
  t.failSend(true);
  await rejects(() => t.svc.request("anya@stocksense.app"), 502);
  t.failSend(false);
  await t.svc.request("anya@stocksense.app"); // no cooldown left behind
  assert.equal(t.sent.length, 1);
});
