import { and, desc, eq, or, inArray, sql, lt } from "drizzle-orm";
import { db } from "@/db";
import { pvpBattles, questions, users, notifications } from "@/db/schema";
import { uid, now, json, getSessionUser } from "@/lib/auth";
import { ensureSeed } from "@/lib/ensure-seed";
import { publish, isConnected } from "@/lib/realtime";
import { requireAdmin } from "@/lib/admin";

/**
 * ⚔️ نبرد واقعی و هم‌زمان بازیکن‌به‌بازیکن
 * - دعوت / پذیرش / رد / لغو / انقضا
 * - شروع هم‌زمان: سرور لحظهٔ شروع (startedAt) را تعیین می‌کند؛ هر سؤال پنجرهٔ زمانی مشخص دارد
 * - هر پاسخ جداگانه با زمان سرور اعتبارسنجی می‌شود (پاسخ دیرهنگام/تکراری/خارج از بازه رد می‌شود)
 * - امتیاز و برنده فقط در سرور محاسبه می‌شود؛ رویدادها با SSE به هر دو طرف می‌رسد
 */

type PvPQ = { id: string; title: string; options: string[]; correct: number; seconds: number; explanation?: string };
type Ans = { i: number; t: number } | null;
/** کمک‌های یک بازیکن برای یک سؤال (۵۰/۵۰، راهنما، زمان اضافه) */
type HelpQ = { fifty?: number[]; hint?: boolean; bonus?: number };

const COUNT = 5;
const INVITE_TTL = 3 * 60 * 1000; // دعوت ۳ دقیقه اعتبار دارد
const COUNTDOWN = 4000; // شمارش معکوس بعد از پذیرش
const GAP = 2500; // فاصلهٔ بین سؤال‌ها (نمایش نتیجهٔ سؤال)
const GRACE = 1500; // تلورانس شبکه برای پاسخ
const Q_SECONDS = 15; // زمان هر سؤال در نبرد زنده
const BONUS_SECONDS = 10; // «۱۰ ثانیه بیشتر» — دقیقاً مثل کمک‌های بقیهٔ مسابقه‌ها

const fa = (n: number) => Number(n || 0).toLocaleString("fa-IR");

// ---------------- کمک‌ها (۵۰/۵۰ · راهنما · ۱۰ ثانیه بیشتر) ----------------
function helpsOf(raw: unknown): { a: (HelpQ | null)[]; b: (HelpQ | null)[] } {
  const o = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as { a?: unknown; b?: unknown };
  const norm = (v: unknown) => (Array.isArray(v) ? (v as (HelpQ | null)[]) : []);
  return { a: norm(o.a), b: norm(o.b) };
}
function helpAt(raw: unknown, iAmA: boolean, q: number): HelpQ {
  const arr = helpsOf(raw)[iAmA ? "a" : "b"] || [];
  const h = arr[q];
  return h && typeof h === "object" ? (h as HelpQ) : {};
}
/** زمان اضافهٔ ثبت‌شده برای یک سؤال (از دید یک بازیکن) */
function bonusMs(raw: unknown, iAmA: boolean, q: number) {
  const b = Number(helpAt(raw, iAmA, q).bonus || 0);
  return Number.isFinite(b) && b > 0 ? Math.min(b, BONUS_SECONDS) * 1000 : 0;
}
/** آخرین لحظه‌ای که هر یک از دو طرف هنوز فرصت پاسخ دارد (برای به تعویق انداختن پایان نبرد) */
function bonusTail(b: { questions: unknown; helps: unknown; startedAt: number | null }): number {
  const qs = (b.questions as PvPQ[]) || [];
  const h = helpsOf(b.helps);
  const base = b.startedAt ?? 0;
  let tail = 0;
  qs.forEach((_, k) => {
    const extra = Math.max(
      bonusMs(b.helps, true, k),
      bonusMs(b.helps, false, k),
    );
    if (extra > 0) tail = Math.max(tail, base + k * (Q_SECONDS * 1000 + GAP) + Q_SECONDS * 1000 + extra);
  });
  return tail;
}
/** امتیاز زندهٔ دو طرف تا همین لحظه (برای نمایش لحظه‌ای امتیاز حریف) */
function runningScores(qs: PvPQ[], aAns: Ans[], bAns: Ans[]) {
  const sA = scoreOf(qs, aAns), sB = scoreOf(qs, bAns);
  return {
    aScore: sA.score, bScore: sB.score, aCorrect: sA.correct, bCorrect: sB.correct,
    detailA: sA.detail.map((d) => d.pts), detailB: sB.detail.map((d) => d.pts),
  };
}

// محدودسازی نرخ دعوت: حداکثر ۱۰ دعوت در دقیقه برای هر کاربر
const inviteRate = new Map<string, number[]>();
function rateOk(userId: string, limit = 10) {
  const t = now();
  const arr = (inviteRate.get(userId) || []).filter((x) => x > t - 60000);
  if (arr.length >= limit) return false;
  arr.push(t);
  inviteRate.set(userId, arr);
  return true;
}

async function notify(userId: string, title: string, body: string) {
  try {
    await db.insert(notifications).values({ id: uid("n"), userId, title, body, link: "pvp", createdAt: now(), seen: 0 });
  } catch { /* ignore */ }
}

/** زمان‌بندی سؤال‌ها از روی startedAt (پایان نبرد با زمان اضافهٔ کمک‌ها به تعویق می‌افتد) */
function plan(b: typeof pvpBattles.$inferSelect) {
  const qs = (b.questions as PvPQ[]) || [];
  const started = b.startedAt ?? 0;
  const starts = qs.map((_, k) => started + k * (Q_SECONDS * 1000 + GAP));
  const deadline = Math.max(started + qs.length * (Q_SECONDS * 1000 + GAP), bonusTail(b));
  return { starts, deadline, seconds: Q_SECONDS, gap: GAP, startedAt: started };
}

async function sweepExpired(myId: string) {
  const t = now();
  const rows = await db.select().from(pvpBattles)
    .where(and(eq(pvpBattles.status, "pending"), lt(pvpBattles.expiresAt, t), or(eq(pvpBattles.aId, myId), eq(pvpBattles.bId, myId))));
  for (const b of rows) {
    await db.update(pvpBattles).set({ status: "expired" }).where(and(eq(pvpBattles.id, b.id), eq(pvpBattles.status, "pending")));
    publish([b.aId, b.bId], "pvp:update", { id: b.id, status: "expired" });
  }
  // نبردهای پذیرفته‌شده‌ای که مهلتشان گذشته → پایان (اگر زمان اضافهٔ کمک‌ها تمام شده باشد)
  const act = await db.select().from(pvpBattles)
    .where(and(eq(pvpBattles.status, "accepted"), or(eq(pvpBattles.aId, myId), eq(pvpBattles.bId, myId))));
  for (const b of act) {
    if (Math.max(plan(b).deadline, bonusTail(b), openBonusUntil(b)) + GRACE < t) await finalize(b);
  }
}

async function drawQuestions(category: string): Promise<PvPQ[]> {
  const pick = (rows: typeof questions.$inferSelect[]) =>
    rows.map((q) => ({ id: q.id, title: q.title, options: q.options, correct: q.correct, seconds: Q_SECONDS, explanation: q.explanation ?? "" }));
  const inCat = await db.select().from(questions)
    .where(and(eq(questions.category, category), eq(questions.status, "approved")))
    .orderBy(sql`random()`).limit(COUNT * 2);
  let pool = inCat.filter((q) => Array.isArray(q.options) && q.options.length >= 2);
  if (pool.length < COUNT) {
    const extra = await db.select().from(questions).where(eq(questions.status, "approved")).orderBy(sql`random()`).limit(COUNT * 3);
    pool = pool.concat(extra.filter((e) => !pool.some((p) => p.id === e.id) && Array.isArray(e.options) && e.options.length >= 2));
  }
  if (pool.length < 3) return [];
  return pick(pool.slice(0, COUNT));
}

function avatarOf(u: typeof users.$inferSelect | undefined) {
  const av = u?.avatar as unknown;
  if (typeof av === "number") return av;
  if (av && typeof av === "object") return av;
  return { seed: 1 };
}

function pubOpp(u: typeof users.$inferSelect | undefined, fallbackId: string, fallbackName: string) {
  return {
    id: u?.id || fallbackId,
    name: u?.name || fallbackName || "بازیکن",
    avatar: avatarOf(u),
    xp: u?.xp ?? 0,
    wins: u?.wins ?? 0,
    online: isConnected(u?.id || fallbackId) || (u?.lastSeen ?? 0) > now() - 2 * 60000,
    isBot: !!u?.isDemo,
  };
}

function scoreOf(qs: PvPQ[], answers: Ans[]) {
  const arr: Ans[] = Array.isArray(answers) ? answers : [];
  let score = 0, correct = 0, ms = 0;
  const detail = qs.map((q, k) => {
    const limit = Q_SECONDS * 1000;
    const a = arr[k] || { i: -1, t: limit };
    const t = Math.max(0, Math.min(limit, Number(a.t) || limit));
    ms += t;
    const ok = a.i === q.correct;
    let pts = 0;
    if (ok) { correct++; pts = 100 + Math.max(0, Math.round(50 * (1 - t / limit))); score += pts; }
    return { correct: q.correct, pick: a.i, pts, ok };
  });
  return { score, correct, ms, detail };
}

function mini(b: typeof pvpBattles.$inferSelect, meId: string, opp: ReturnType<typeof pubOpp>) {
  const iAmA = b.aId === meId;
  const myScore = iAmA ? b.aScore : b.bScore;
  const oppScore = iAmA ? b.bScore : b.aScore;
  const myDone = !!(iAmA ? b.aDoneAt : b.bDoneAt);
  const oppDone = !!(iAmA ? b.bDoneAt : b.aDoneAt);
  const seen = iAmA ? b.aSeen : b.bSeen;
  return {
    id: b.id, category: b.category, status: b.status, at: b.createdAt, opponent: opp,
    iAmA, myDone, oppDone, seen: !!seen, byAdmin: b.byAdmin || "",
    myScore: myDone || b.status === "finished" ? myScore : null,
    oppScore: b.status === "finished" ? oppScore : null,
    winnerId: b.winnerId ?? "",
    finishedAt: b.finishedAt ?? 0,
    expiresAt: b.expiresAt ?? 0,
  };
}

async function loadOpp(b: typeof pvpBattles.$inferSelect, meId: string) {
  const oppId = b.aId === meId ? b.bId : b.aId;
  const rows = await db.select().from(users).where(eq(users.id, oppId)).limit(1);
  return pubOpp(rows[0], oppId, b.aId === meId ? (b.bName ?? "") : (b.aName ?? ""));
}

function stripQ(q: PvPQ) { return { id: q.id, title: q.title, options: q.options, seconds: Q_SECONDS }; }

function fullState(b: typeof pvpBattles.$inferSelect, meId: string, opp: ReturnType<typeof pubOpp>) {
  const qs = (b.questions as PvPQ[]) || [];
  const iAmA = b.aId === meId;
  const myAns = ((iAmA ? b.aAnswers : b.bAnswers) as Ans[]) || [];
  const oppAns = ((iAmA ? b.bAnswers : b.aAnswers) as Ans[]) || [];
  const base = mini(b, meId, opp);
  const t = now();
  const p = plan(b);
  const out: Record<string, unknown> = { ...base, me: meId, qCount: qs.length, serverNow: t, startedAt: p.startedAt, seconds: p.seconds, gap: p.gap, deadline: p.deadline };
  if (b.status === "accepted") {
    // فقط سؤال‌هایی که پنجره‌شان شروع شده (ضد پیش‌خوانی)
    out.questions = qs.map((q, k) => (p.starts[k] - 300 <= t ? stripQ(q) : null));
    out.myAnswered = qs.map((_, k) => !!myAns[k]);
    out.oppAnswered = qs.map((_, k) => !!oppAns[k]);
    // امتیاز زندهٔ هر دو طرف (تا بازیکن امتیاز حریف را همان لحظه ببیند)
    const run = runningScores(qs, (b.aAnswers as Ans[]) || [], (b.bAnswers as Ans[]) || []);
    out.myRunning = iAmA ? run.aScore : run.bScore;
    out.oppRunning = iAmA ? run.bScore : run.aScore;
    out.oppCorrect = iAmA ? run.bCorrect : run.aCorrect;
    out.oppPts = iAmA ? run.detailB : run.detailA;
    // کمک‌های مصرف‌شدهٔ خودم (برای بازگشت به نبرد پس از رفرش صفحه)
    const hs = helpsOf(b.helps)[iAmA ? "a" : "b"] || [];
    out.myHelps = qs.map((_, k) => (hs[k] && typeof hs[k] === "object" ? { fifty: hs[k]!.fifty || null, hint: !!hs[k]!.hint, bonus: Number(hs[k]!.bonus || 0) } : null));
    out.bonus = qs.map((_, k) => bonusMs(b.helps, iAmA, k) / 1000);
    // نتیجهٔ سؤال‌های تمام‌شده (برای نمایش درست/غلط بین سؤال‌ها) — با احتساب زمان اضافهٔ هر دو طرف
    out.reveal = qs.map((q, k) => {
      const maxBonus = Math.max(bonusMs(b.helps, true, k), bonusMs(b.helps, false, k));
      return p.starts[k] + Q_SECONDS * 1000 + maxBonus <= t
        ? { correct: q.correct, myPick: myAns[k]?.i ?? -1, oppPick: oppAns[k]?.i ?? -1 }
        : null;
    });
  }
  if (b.status === "finished") {
    const mine = scoreOf(qs, myAns);
    const theirs = scoreOf(qs, oppAns);
    out.result = {
      winnerId: b.winnerId ?? "",
      myScore: mine.score, oppScore: theirs.score,
      myCorrect: mine.correct, oppCorrect: theirs.correct,
      myMs: mine.ms, oppMs: theirs.ms,
      perQ: qs.map((q, k) => ({
        title: q.title, options: q.options, correct: q.correct, explanation: q.explanation || "",
        myPick: myAns[k]?.i ?? -1, oppPick: oppAns[k]?.i ?? -1,
        myPts: mine.detail[k]?.pts ?? 0, oppPts: theirs.detail[k]?.pts ?? 0,
      })),
    };
  }
  return out;
}

async function getBattle(id: string) {
  return (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
}

/** زمان‌بندی رویدادهای سؤال و پایان (در همین پردازه؛ از طریق NOTIFY به بقیه می‌رسد) */
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
const revealTimers = new Map<string, ReturnType<typeof setTimeout>>();
const endTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleBattle(b: typeof pvpBattles.$inferSelect) {
  if (timers.has(b.id)) return;
  const qs = (b.questions as PvPQ[]) || [];
  const p = plan(b);
  const list: ReturnType<typeof setTimeout>[] = [];
  const targets = [b.aId, b.bId];
  qs.forEach((q, k) => {
    const delay = Math.max(0, p.starts[k] - now());
    list.push(setTimeout(() => {
      publish(targets, "pvp:q", { id: b.id, q: k, question: stripQ(q), startsAt: p.starts[k], serverNow: now(), seconds: Q_SECONDS });
    }, delay));
  });
  list.push(setTimeout(() => { void finalizeLater(b.id); }, Math.max(0, p.deadline + GRACE + 300 - now())));
  timers.set(b.id, list);
  qs.forEach((_, k) => scheduleReveal(b, k));
}

/** افشای پاسخ صحیح یک سؤال — بعد از پایان پنجرهٔ آن سؤال (+ زمان اضافهٔ هر دو طرف) */
function scheduleReveal(b: typeof pvpBattles.$inferSelect, k: number) {
  const qs = (b.questions as PvPQ[]) || [];
  const q = qs[k];
  if (!q) return;
  const key = b.id + ":" + k;
  const prev = revealTimers.get(key);
  if (prev) clearTimeout(prev);
  const p = plan(b);
  const extra = Math.max(bonusMs(b.helps, true, k), bonusMs(b.helps, false, k));
  const at = p.starts[k] + Q_SECONDS * 1000 + 200 + extra;
  const targets = [b.aId, b.bId];
  revealTimers.set(key, setTimeout(async () => {
    revealTimers.delete(key);
    const fresh = await getBattle(b.id);
    if (!fresh || fresh.status !== "accepted") return;
    const aA = (fresh.aAnswers as Ans[]) || [], bA = (fresh.bAnswers as Ans[]) || [];
    publish(targets, "pvp:reveal", { id: b.id, q: k, correct: q.correct, aPick: aA[k]?.i ?? -1, bPick: bA[k]?.i ?? -1, explanation: q.explanation || "" });
  }, Math.max(0, at - now())));
}

/** تا چه لحظه‌ای یکی از دو طرف هنوز «پنجرهٔ بازِ زمان اضافه» دارد (پاسخ نداده + زمان اضافه فعال) */
function openBonusUntil(b: { questions: unknown; helps: unknown; aAnswers: unknown; bAnswers: unknown; startedAt: number | null }): number {
  const qs = (b.questions as PvPQ[]) || [];
  const base = b.startedAt ?? 0;
  const aA = (b.aAnswers as Ans[]) || [], bA = (b.bAnswers as Ans[]) || [];
  const t = now();
  let until = 0;
  qs.forEach((_, k) => {
    const start = base + k * (Q_SECONDS * 1000 + GAP);
    if (!aA[k]) until = Math.max(until, start + Q_SECONDS * 1000 + bonusMs(b.helps, true, k));
    if (!bA[k]) until = Math.max(until, start + Q_SECONDS * 1000 + bonusMs(b.helps, false, k));
  });
  return until > t ? until : 0;
}

/** پایان نبرد در لحظه‌ای که هیچ‌کدام از دو طرف فرصت پاسخ (حتی با زمان اضافه) ندارند */
function finalizeLater(id: string, notBefore = 0) {
  const prev = endTimers.get(id);
  if (prev) clearTimeout(prev);
  const delay = Math.max(0, notBefore - now());
  endTimers.set(id, setTimeout(async () => {
    endTimers.delete(id);
    const fresh = await getBattle(id);
    if (!fresh || fresh.status !== "accepted") return;
    // پایان نبرد = دیرترینِ «پایان برنامهٔ سؤال‌ها»، «آخرین زمان اضافهٔ ثبت‌شده» و «پنجرهٔ بازِ زمان اضافه»
    const until = Math.max(plan(fresh).deadline, bonusTail(fresh), openBonusUntil(fresh)) + GRACE;
    if (until > now()) { finalizeLater(id, until + 200); return; }
    await finalize(fresh);
  }, delay));
}

async function createInvite(from: typeof users.$inferSelect, target: typeof users.$inferSelect, category: string, opts: { rematchOf?: string; byAdmin?: string } = {}) {
  const qs = await drawQuestions(category);
  if (!qs.length) return { error: "سؤال کافی برای این دسته هنوز در بانک سؤال نیست." };
  const id = uid("pvp");
  const t = now();
  await db.insert(pvpBattles).values({
    id, aId: from.id, bId: target.id, aName: from.name, bName: target.name, category,
    questions: qs as unknown[], status: "pending", createdAt: t, expiresAt: t + INVITE_TTL,
    rematchOf: opts.rematchOf || "", byAdmin: opts.byAdmin || "", mode: "live",
  });
  const created = await getBattle(id);
  const title = opts.byAdmin ? "⚔️ مسابقهٔ ویژه از طرف مدیر" : "⚔️ دعوت به نبرد واقعی";
  await notify(target.id, title, `${from.name} تو را به نبرد زنده دعوت کرد!`);
  publish([target.id], "pvp:invite", { battle: fullState(created, target.id, pubOpp(from, from.id, from.name)) });
  publish([from.id], "pvp:outgoing", { battle: fullState(created, from.id, pubOpp(target, target.id, target.name)) });
  return { battle: created };
}

// --------------------------------------------------------------- GET
export async function GET(req: Request) {
  await ensureSeed();
  const me = await getSessionUser();
  if (!me) return json({ error: "not-authed", message: "ابتدا وارد بازی شو 🌱" }, 401);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "inbox";

  if (action === "inbox") {
    await sweepExpired(me.id);
    const rows = await db.select().from(pvpBattles)
      .where(or(eq(pvpBattles.aId, me.id), eq(pvpBattles.bId, me.id)))
      .orderBy(desc(pvpBattles.createdAt)).limit(40);
    const oppIds = Array.from(new Set(rows.map((b) => (b.aId === me.id ? b.bId : b.aId))));
    const oppRows = oppIds.length ? await db.select().from(users).where(inArray(users.id, oppIds)) : [];
    const byId = new Map(oppRows.map((u) => [u.id, u]));
    const incoming: unknown[] = [], outgoing: unknown[] = [], active: unknown[] = [], results: unknown[] = [];
    for (const b of rows) {
      const oppId = b.aId === me.id ? b.bId : b.aId;
      const opp = pubOpp(byId.get(oppId), oppId, b.aId === me.id ? (b.bName ?? "") : (b.aName ?? ""));
      if (b.status === "pending" && b.bId === me.id) incoming.push(mini(b, me.id, opp));
      else if (b.status === "pending" && b.aId === me.id) outgoing.push(mini(b, me.id, opp));
      else if (b.status === "accepted") active.push(mini(b, me.id, opp));
      else if (b.status === "finished") results.push(mini(b, me.id, opp));
    }
    return json({ me: me.id, serverNow: now(), incoming, outgoing, active, results: results.slice(0, 15) });
  }

  if (action === "state") {
    const id = url.searchParams.get("id") || "";
    let b = await getBattle(id);
    if (!b) return json({ error: "نبرد پیدا نشد." }, 404);
    if (b.aId !== me.id && b.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (b.status === "accepted") {
      if (Math.max(plan(b).deadline, bonusTail(b), openBonusUntil(b)) + GRACE < now()) b = await finalize(b);
      else scheduleBattle(b);
    }
    if (b.status === "pending" && (b.expiresAt ?? 0) < now()) {
      await db.update(pvpBattles).set({ status: "expired" }).where(and(eq(pvpBattles.id, id), eq(pvpBattles.status, "pending")));
      b = await getBattle(id);
    }
    const opp = await loadOpp(b, me.id);
    return json(fullState(b, me.id, opp));
  }

  if (action === "history") {
    const rows = await db.select().from(pvpBattles)
      .where(and(eq(pvpBattles.status, "finished"), or(eq(pvpBattles.aId, me.id), eq(pvpBattles.bId, me.id))))
      .orderBy(desc(pvpBattles.finishedAt)).limit(50);
    return json(rows.map((b) => ({
      id: b.id, at: b.finishedAt, category: b.category,
      me: b.aId === me.id ? { score: b.aScore, correct: b.aCorrect } : { score: b.bScore, correct: b.bCorrect },
      opp: b.aId === me.id ? { id: b.bId, name: b.bName, score: b.bScore } : { id: b.aId, name: b.aName, score: b.aScore },
      won: b.winnerId === me.id, draw: !b.winnerId,
    })));
  }

  return json({ error: "action نامعتبر" }, 400);
}

// --------------------------------------------------------------- POST
export async function POST(req: Request) {
  await ensureSeed();
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { b = {}; }

  // ---- مدیر: ترتیب‌دادن مسابقه بین دو کاربر ----
  if (action === "admin-match") {
    const adm = await requireAdmin(req);
    if (!adm) return json({ error: "forbidden" }, 403);
    const aId = String(b.a || ""), bId = String(b.b || "");
    if (!aId || !bId || aId === bId) return json({ error: "دو بازیکن متفاوت انتخاب کن." }, 400);
    const rows = await db.select().from(users).where(inArray(users.id, [aId, bId]));
    const A = rows.find((u) => u.id === aId), B = rows.find((u) => u.id === bId);
    if (!A || !B) return json({ error: "بازیکن پیدا نشد." }, 404);
    if (A.isDemo || B.isDemo) return json({ error: "فقط بین کاربران واقعی می‌توان مسابقه ترتیب داد." }, 400);
    const category = String(b.category || "general").slice(0, 40);
    const r = await createInvite(A, B, category, { byAdmin: adm.name });
    if ("error" in r) return json({ error: r.error }, 400);
    return json({ ok: true, id: r.battle!.id });
  }

  const me = await getSessionUser();
  if (!me) return json({ error: "not-authed", message: "ابتدا وارد بازی شو 🌱" }, 401);

  // ---- دعوت ----
  if (action === "invite") {
    const to = String(b.to || "");
    if (!to) return json({ error: "حریف مشخص نشده." }, 400);
    if (to === me.id) return json({ error: "نمی‌توانی با خودت نبرد کنی! 😄" }, 400);
    if (!rateOk(me.id)) return json({ error: "تعداد دعوت‌ها زیاد است؛ کمی صبر کن." }, 429);
    const target = (await db.select().from(users).where(eq(users.id, to)).limit(1))[0];
    if (!target) return json({ error: "بازیکن پیدا نشد." }, 404);
    if (target.banned) return json({ error: "این بازیکن در دسترس نیست." }, 400);
    if (target.isDemo) return json({ error: "این بازیکن ربات است؛ برای نبرد زنده یک بازیکن واقعی انتخاب کن." }, 400);

    const open = await db.select().from(pvpBattles).where(and(
      inArray(pvpBattles.status, ["pending", "accepted"]),
      or(and(eq(pvpBattles.aId, me.id), eq(pvpBattles.bId, to)), and(eq(pvpBattles.aId, to), eq(pvpBattles.bId, me.id))),
    )).limit(1);
    if (open[0] && (open[0].status === "accepted" || (open[0].expiresAt ?? 0) > now())) {
      const opp = await loadOpp(open[0], me.id);
      return json({ ok: true, already: true, battle: fullState(open[0], me.id, opp) });
    }
    const category = String(b.category || "general").slice(0, 40);
    const r = await createInvite(me, target, category, { rematchOf: String(b.rematchOf || "") });
    if ("error" in r) return json({ error: r.error }, 400);
    return json({ ok: true, battle: fullState(r.battle!, me.id, pubOpp(target, to, target.name)) });
  }

  // ---- پذیرش: شروع هم‌زمان ----
  if (action === "accept") {
    const id = String(b.id || "");
    const row = await getBattle(id);
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.bId !== me.id) return json({ error: "این دعوت برای تو نیست." }, 403);
    if (row.status !== "pending") {
      const opp = await loadOpp(row, me.id);
      return json({ ok: true, battle: fullState(row, me.id, opp), already: true });
    }
    if ((row.expiresAt ?? 0) < now()) {
      await db.update(pvpBattles).set({ status: "expired" }).where(eq(pvpBattles.id, id));
      return json({ error: "این دعوت منقضی شده." }, 400);
    }
    // جلوگیری از دو نبرد زندهٔ هم‌زمان
    const busy = await db.select({ id: pvpBattles.id }).from(pvpBattles).where(and(eq(pvpBattles.status, "accepted"), or(
      eq(pvpBattles.aId, me.id), eq(pvpBattles.bId, me.id), eq(pvpBattles.aId, row.aId), eq(pvpBattles.bId, row.aId),
    ))).limit(1);
    if (busy[0]) return json({ error: "یکی از طرفین الان در نبرد دیگری است؛ چند لحظه بعد دوباره تلاش کن." }, 409);

    const startedAt = now() + COUNTDOWN;
    // به‌روزرسانی اتمیک: فقط اگر هنوز pending است (ضد race)
    const upd = await db.update(pvpBattles).set({ status: "accepted", startedAt, expiresAt: 0 })
      .where(and(eq(pvpBattles.id, id), eq(pvpBattles.status, "pending"))).returning({ id: pvpBattles.id });
    if (!upd.length) return json({ error: "این دعوت دیگر معتبر نیست." }, 409);
    const fresh = await getBattle(id);
    scheduleBattle(fresh);
    const aRow = (await db.select().from(users).where(eq(users.id, fresh.aId)).limit(1))[0];
    publish([fresh.aId], "pvp:accepted", { battle: fullState(fresh, fresh.aId, pubOpp(me, me.id, me.name)) });
    publish([fresh.bId], "pvp:accepted", { battle: fullState(fresh, fresh.bId, pubOpp(aRow, fresh.aId, fresh.aName || "")) });
    return json({ ok: true, battle: fullState(fresh, me.id, pubOpp(aRow, fresh.aId, fresh.aName || "")) });
  }

  if (action === "decline") {
    const id = String(b.id || "");
    const row = await getBattle(id);
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "pending") return json({ ok: true });
    await db.update(pvpBattles).set({ status: "declined" }).where(eq(pvpBattles.id, id));
    publish([row.aId], "pvp:update", { id, status: "declined", by: me.name });
    await notify(row.aId, "❌ دعوت رد شد", `${me.name} الان برای نبرد آماده نیست.`);
    return json({ ok: true });
  }

  if (action === "cancel") {
    const id = String(b.id || "");
    const row = await getBattle(id);
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "pending") return json({ error: "این دعوت دیگر قابل لغو نیست." }, 400);
    await db.update(pvpBattles).set({ status: "cancelled" }).where(eq(pvpBattles.id, id));
    publish([row.bId], "pvp:update", { id, status: "cancelled" });
    return json({ ok: true });
  }

  // ---- پاسخ تک‌سؤال (اعتبارسنجی زمان سمت سرور) ----
  // ---- کمک‌ها: ۵۰/۵۰ · راهنما · ۱۰ ثانیه بیشتر (در هر راند یکی از هر کدام) ----
  if (action === "help") {
    const id = String(b.id || "");
    const q = Number(b.q);
    const kind = String(b.kind || "");
    const row = await getBattle(id);
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id && row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "accepted") return json({ error: "نبرد فعال نیست.", status: row.status }, 400);
    const qs = (row.questions as PvPQ[]) || [];
    if (!Number.isInteger(q) || q < 0 || q >= qs.length) return json({ error: "سؤال نامعتبر" }, 400);
    if (!["fifty", "hint", "time"].includes(kind)) return json({ error: "کمک نامعتبر" }, 400);
    const iAmA = row.aId === me.id;
    const p = plan(row);
    const t = now();
    const elapsed = t - p.starts[q];
    const myAns = ((iAmA ? row.aAnswers : row.bAnswers) as Ans[]) || [];
    if (elapsed < -GRACE) return json({ error: "این سؤال هنوز شروع نشده." }, 400);
    if (myAns[q]) return json({ error: "برای این سؤال پاسخ داده‌ای." }, 400);
    const used = helpAt(row.helps, iAmA, q);
    if (kind === "fifty" && (used.fifty || []).length) return json({ error: "۵۰/۵۰ این سؤال را استفاده کرده‌ای." }, 400);
    if (kind === "hint" && used.hint) return json({ error: "راهنمای این سؤال را دیده‌ای." }, 400);
    if (kind === "time" && Number(used.bonus || 0) > 0) return json({ error: "زمان اضافهٔ این سؤال را گرفته‌ای." }, 400);
    if (elapsed > Q_SECONDS * 1000 + bonusMs(row.helps, iAmA, q) + GRACE) {
      return json({ error: "وقت این سؤال تمام شده." }, 400);
    }

    const next: HelpQ = { ...used };
    const out: Record<string, unknown> = { ok: true, kind, q };
    if (kind === "fifty") {
      const opts = Array.isArray(qs[q].options) ? qs[q].options : [];
      const wrong = opts.map((_, i) => i).filter((i) => i !== qs[q].correct);
      // حذف قطعی دو گزینهٔ غلط (بدون تصادف، تا دو طرف یک چیز نبینند مهم نیست — فقط خودِ بازیکن می‌بیند)
      const hide = wrong.slice(0, Math.max(0, Math.min(2, opts.length - 1)));
      next.fifty = hide;
      out.hide = hide;
    } else if (kind === "hint") {
      next.hint = true;
      out.hint = qs[q].explanation || "پاسخ درست در همان گزینه‌ای است که با موضوع سؤال بیشترین تناسب را دارد. دقت کن!";
    } else {
      next.bonus = BONUS_SECONDS;
      out.bonus = BONUS_SECONDS;
    }
    const arrs = helpsOf(row.helps);
    const mine = (arrs[iAmA ? "a" : "b"] || []).slice();
    while (mine.length < qs.length) mine.push(null);
    mine[q] = next;
    const helpsNext = iAmA ? { a: mine, b: arrs.b } : { a: arrs.a, b: mine };
    const upd = await db.update(pvpBattles).set({ helps: helpsNext as unknown })
      .where(and(eq(pvpBattles.id, id), eq(pvpBattles.status, "accepted"))).returning({ id: pvpBattles.id });
    if (!upd.length) return json({ error: "نبرد فعال نیست." }, 409);
    // زمان اضافه = مهلت پاسخ و افشای نتیجه و پایان نبرد کمی عقب‌تر می‌رود
    if (kind === "time") {
      const fresh0 = await getBattle(id);
      // زمان‌بندی افشای پاسخ و پایان نبرد با زمان اضافهٔ تازه بازسازی می‌شود
      if (fresh0) {
        scheduleReveal(fresh0, q);
        void finalizeLater(id, Math.max(plan(fresh0).deadline, bonusTail(fresh0), openBonusUntil(fresh0)) + GRACE + 200);
      }
    }
    return json(out);
  }

  // ---- پاسخ تک‌سؤال (اعتبارسنجی زمان سمت سرور) ----
  if (action === "answer") {
    const id = String(b.id || "");
    const q = Number(b.q);
    const pickIdx = Number(b.i);
    const row = await getBattle(id);
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id && row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "accepted") return json({ error: "نبرد فعال نیست.", status: row.status }, 400);
    const qs = (row.questions as PvPQ[]) || [];
    if (!Number.isInteger(q) || q < 0 || q >= qs.length) return json({ error: "سؤال نامعتبر" }, 400);
    const p = plan(row);
    const t = now();
    const elapsed = t - p.starts[q];
    if (elapsed < -GRACE) return json({ error: "هنوز وقت این سؤال نرسیده." }, 400);
    const iAmA = row.aId === me.id;
    const prev: Ans[] = ((iAmA ? row.aAnswers : row.bAnswers) as Ans[]) || [];
    if (prev[q]) return json({ ok: true, already: true });
    const bonus = bonusMs(row.helps, iAmA, q); // «۱۰ ثانیه بیشتر»
    const limit = Q_SECONDS * 1000 + bonus;
    const late = elapsed > limit + GRACE;
    const idx = !late && Number.isInteger(pickIdx) && pickIdx >= 0 && pickIdx < qs[q].options.length ? pickIdx : -1;
    const next: Ans[] = qs.map((_, k) => prev[k] || null);
    next[q] = { i: idx, t: Math.max(0, Math.min(limit, elapsed)) };
    const answeredAll = next.every((x) => !!x);
    const set: Record<string, unknown> = iAmA
      ? { aAnswers: next as unknown[], ...(answeredAll ? { aDoneAt: t } : {}) }
      : { bAnswers: next as unknown[], ...(answeredAll ? { bDoneAt: t } : {}) };
    await db.update(pvpBattles).set(set).where(eq(pvpBattles.id, id));
    const oppId = iAmA ? row.bId : row.aId;
    const ok = idx === qs[q].correct;
    const pts = !late && ok ? 100 + Math.max(0, Math.round(50 * (1 - Math.min(Q_SECONDS * 1000, elapsed) / (Q_SECONDS * 1000)))) : 0;
    // امتیاز زندهٔ من از دید حریف → او همان لحظه امتیازم را می‌بیند
    const run = runningScores(qs, iAmA ? next : ((row.aAnswers as Ans[]) || []), iAmA ? ((row.bAnswers as Ans[]) || []) : next);
    publish([oppId], "pvp:opp-answered", {
      id, q, late, pts,
      score: iAmA ? run.aScore : run.bScore,
      correctCount: iAmA ? run.aCorrect : run.bCorrect,
      serverNow: now(),
    });
    let fresh = await getBattle(id);
    // اگر طرف مقابل هنوز زمان اضافه دارد، پایان نبرد کمی به تعویق می‌افتد
    if (fresh.status === "accepted" && fresh.aDoneAt && fresh.bDoneAt) {
      const wait = openBonusUntil(fresh);
      if (wait > now()) void finalizeLater(id, wait + GRACE + 200);
      else fresh = await finalize(fresh);
    }
    fresh = await getBattle(id);
    return json({ ok: true, correct: late ? null : ok, late, pts, finished: fresh.status === "finished" });
  }

  // ---- ارسال یکجا (پشتیبان برای قطع اتصال) ----
  if (action === "submit") {
    const id = String(b.id || "");
    const row = await getBattle(id);
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id && row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "accepted") {
      const opp = await loadOpp(row, me.id);
      return json({ ok: true, battle: fullState(row, me.id, opp), already: true });
    }
    const qs = (row.questions as PvPQ[]) || [];
    const p = plan(row);
    const t = now();
    const iAmA = row.aId === me.id;
    const prev: Ans[] = ((iAmA ? row.aAnswers : row.bAnswers) as Ans[]) || [];
    const raw = Array.isArray(b.answers) ? (b.answers as unknown[]) : [];
    const next: Ans[] = qs.map((q, k) => {
      if (prev[k]) return prev[k];
      // فقط سؤال‌هایی که پنجره‌شان گذشته یا در جریان است پذیرفته می‌شود
      if (p.starts[k] - GRACE > t) return null;
      const it = (raw[k] || {}) as { i?: unknown; t?: unknown };
      const idx = typeof it.i === "number" && Number.isInteger(it.i) && it.i >= 0 && it.i < q.options.length ? it.i : -1;
      const tt = typeof it.t === "number" && Number.isFinite(it.t) ? Math.max(0, Math.min(Q_SECONDS * 1000, it.t)) : Q_SECONDS * 1000;
      return { i: idx, t: tt };
    });
    const done = next.every((x) => !!x);
    await db.update(pvpBattles).set(iAmA ? { aAnswers: next as unknown[], ...(done ? { aDoneAt: t } : {}) } : { bAnswers: next as unknown[], ...(done ? { bDoneAt: t } : {}) }).where(eq(pvpBattles.id, id));
    let fresh = await getBattle(id);
    if (fresh.aDoneAt && fresh.bDoneAt) fresh = await finalize(fresh);
    const opp = await loadOpp(fresh, me.id);
    return json({ ok: true, battle: fullState(fresh, me.id, opp) });
  }

  // ---- ترک نبرد (باخت فنی) ----
  if (action === "forfeit") {
    const id = String(b.id || "");
    const row = await getBattle(id);
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id && row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "accepted") return json({ ok: true });
    const fresh = await finalize(row, me.id);
    const opp = await loadOpp(fresh, me.id);
    return json({ ok: true, battle: fullState(fresh, me.id, opp) });
  }

  if (action === "ack") {
    const id = String(b.id || "");
    const row = await getBattle(id);
    if (!row || (row.aId !== me.id && row.bId !== me.id)) return json({ ok: true });
    await db.update(pvpBattles).set(row.aId === me.id ? { aSeen: 1 } : { bSeen: 1 }).where(eq(pvpBattles.id, id));
    return json({ ok: true });
  }

  if (action === "rematch") {
    const id = String(b.id || "");
    const row = await getBattle(id);
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id && row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (!rateOk(me.id)) return json({ error: "تعداد دعوت‌ها زیاد است؛ کمی صبر کن." }, 429);
    const oppId = row.aId === me.id ? row.bId : row.aId;
    const target = (await db.select().from(users).where(eq(users.id, oppId)).limit(1))[0];
    if (!target || target.banned) return json({ error: "این بازیکن در دسترس نیست." }, 400);
    const r = await createInvite(me, target, row.category || "general", { rematchOf: id });
    if ("error" in r) return json({ error: r.error }, 400);
    return json({ ok: true, battle: fullState(r.battle!, me.id, pubOpp(target, oppId, target.name)) });
  }

  return json({ error: "action نامعتبر" }, 400);
}

/** پایان نبرد: محاسبهٔ امتیاز از روی پاسخ‌های ذخیره‌شده، تعیین برنده، به‌روزرسانی آمار؛ ضد ثبت دوگانه */
async function finalize(battle: typeof pvpBattles.$inferSelect, forfeiter = ""): Promise<typeof pvpBattles.$inferSelect> {
  const qs = (battle.questions as PvPQ[]) || [];
  const sA = scoreOf(qs, (battle.aAnswers as Ans[]) || []);
  const sB = scoreOf(qs, (battle.bAnswers as Ans[]) || []);
  const { aId, bId } = battle;
  let winnerId = "";
  if (forfeiter) winnerId = forfeiter === aId ? bId : aId;
  else if (sA.score > sB.score) winnerId = aId;
  else if (sB.score > sA.score) winnerId = bId;
  else if (sA.ms < sB.ms) winnerId = aId;
  else if (sB.ms < sA.ms) winnerId = bId;

  // فقط یک‌بار (CAS روی status)
  const upd = await db.update(pvpBattles).set({
    status: "finished", winnerId, finishedAt: now(),
    aScore: sA.score, bScore: sB.score, aCorrect: sA.correct, bCorrect: sB.correct, aMs: sA.ms, bMs: sB.ms,
    aDoneAt: battle.aDoneAt || now(), bDoneAt: battle.bDoneAt || now(),
  }).where(and(eq(pvpBattles.id, battle.id), eq(pvpBattles.status, "accepted"))).returning({ id: pvpBattles.id });
  if (!upd.length) return getBattle(battle.id);
  const list = timers.get(battle.id); if (list) { list.forEach(clearTimeout); timers.delete(battle.id); }
  const endT = endTimers.get(battle.id); if (endT) { clearTimeout(endT); endTimers.delete(battle.id); }
  revealTimers.forEach((t, key) => { if (key.startsWith(battle.id + ":")) { clearTimeout(t); revealTimers.delete(key); } });

  const rows = await db.select().from(users).where(inArray(users.id, [aId, bId]));
  const uA = rows.find((u) => u.id === aId), uB = rows.find((u) => u.id === bId);
  const drew = !winnerId;
  const apply = async (u: typeof users.$inferSelect | undefined, score: number, won: boolean) => {
    if (!u) return;
    const xpGain = Math.round(score / 10) + (won ? 25 : drew ? 12 : 5);
    await db.update(users).set({
      played: sql`${users.played} + 1`,
      wins: sql`${users.wins} + ${won ? 1 : 0}`,
      cups: sql`${users.cups} + ${won ? 1 : 0}`,
      xp: sql`${users.xp} + ${xpGain}`,
      weekXp: sql`${users.weekXp} + ${xpGain}`,
      coins: sql`${users.coins} + ${won ? 10 : 2}`,
      rating: sql`GREATEST(100, ${users.rating} + ${won ? 24 : drew ? 0 : -12})`,
      lastSeen: now(),
    }).where(eq(users.id, u.id));
  };
  await apply(uA, sA.score, winnerId === aId);
  await apply(uB, sB.score, winnerId === bId);

  const name = (id: string) => (id === aId ? battle.aName : battle.bName) || "بازیکن";
  const msgFor = (selfId: string) => {
    const my = selfId === aId ? sA.score : sB.score, other = selfId === aId ? sB.score : sA.score;
    if (!winnerId) return `مساوی شدید! ${fa(my)} برابر ${fa(other)} ⚖️`;
    return winnerId === selfId
      ? `بردی! 🏆 ${fa(my)} برابر ${fa(other)} از ${name(selfId === aId ? bId : aId)}`
      : `باختی! ${fa(my)} برابر ${fa(other)} از ${name(selfId === aId ? bId : aId)}`;
  };
  await notify(aId, "⚔️ نتیجهٔ نبرد", msgFor(aId));
  await notify(bId, "⚔️ نتیجهٔ نبرد", msgFor(bId));
  const fresh = await getBattle(battle.id);
  publish([aId], "pvp:finished", { battle: fullState(fresh, aId, pubOpp(uB, bId, battle.bName || "")) });
  publish([bId], "pvp:finished", { battle: fullState(fresh, bId, pubOpp(uA, aId, battle.aName || "")) });
  return fresh;
}
