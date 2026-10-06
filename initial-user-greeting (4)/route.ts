import { and, desc, eq, or, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { pvpBattles, questions, users, notifications } from "@/db/schema";
import { uid, now, json, getSessionUser } from "@/lib/auth";
import { ensureSeed } from "@/lib/ensure-seed";

/** ⚔️ نبرد واقعی بازیکن‌به‌بازیکن — دعوت، پذیرش، پاسخ‌دهی و نتیجه همه سمت سرور (ضدتقلب) */

type PvPQ = { id: string; title: string; options: string[]; correct: number; seconds: number; explanation?: string };
type Ans = { i: number; t: number };

const COUNT = 5;
const INVITE_TTL = 10 * 60 * 1000; // دعوت ۱۰ دقیقه اعتبار دارد

const fa = (n: number) => Number(n || 0).toLocaleString("fa-IR");

async function notify(userId: string, title: string, body: string) {
  try {
    await db.insert(notifications).values({ id: uid("n"), userId, title, body, link: "pvp", createdAt: now(), seen: 0 });
  } catch { /* ignore */ }
}

/** دعوت‌های منقضی‌شده را به‌حالت expired درمی‌آورد و چالش‌گر را مطلع می‌کند */
async function sweepExpired(myId: string) {
  const rows = await db.select().from(pvpBattles)
    .where(and(eq(pvpBattles.status, "pending"), or(eq(pvpBattles.aId, myId), eq(pvpBattles.bId, myId))));
  for (const b of rows) {
    if ((b.expiresAt ?? 0) > now()) continue;
    await db.update(pvpBattles).set({ status: "expired" }).where(and(eq(pvpBattles.id, b.id), eq(pvpBattles.status, "pending")));
    if (b.aId === myId) await notify(b.aId, "⌛ دعوت بی‌پاسخ ماند", `${b.bName || "حریف"} به دعوت نبردت جواب نداد.`);
  }
}

async function drawQuestions(category: string): Promise<PvPQ[]> {
  const pick = (rows: typeof questions.$inferSelect[]) =>
    rows.map((q) => ({ id: q.id, title: q.title, options: q.options, correct: q.correct, seconds: q.seconds ?? 25, explanation: q.explanation ?? "" }));
  const shuffle = <T>(arr: T[]) => arr.map((v) => [Math.random(), v] as [number, T]).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
  const inCat = await db.select().from(questions).where(and(eq(questions.category, category), eq(questions.status, "approved"))).limit(80);
  let pool = shuffle(inCat);
  if (pool.length < COUNT) {
    const extra = await db.select().from(questions).where(eq(questions.status, "approved")).limit(80);
    pool = shuffle(pool.concat(extra.filter((e) => !pool.some((p) => p.id === e.id))));
  }
  if (pool.length < 3) return [];
  return pick(pool.slice(0, COUNT));
}

function pubOpp(u: typeof users.$inferSelect | undefined, fallbackId: string, fallbackName: string) {
  const av = u?.avatar as { seed?: number } | number | undefined;
  return {
    id: u?.id || fallbackId,
    name: u?.name || fallbackName || "بازیکن",
    avatar: typeof av === "number" ? { seed: av } : (av && typeof av === "object" ? { seed: av.seed ?? 1 } : { seed: 1 }),
    xp: u?.xp ?? 0,
    wins: u?.wins ?? 0,
    online: (u?.lastSeen ?? 0) > now() - 5 * 60000,
  };
}

function scoreOf(qs: PvPQ[], answers: Ans[]) {
  const arr: (Ans | null)[] = Array.isArray(answers) ? answers : [];
  let score = 0, correct = 0, ms = 0;
  const detail = qs.map((q, k) => {
    const a = arr[k] || { i: -1, t: q.seconds * 1000 };
    const limit = (q.seconds || 25) * 1000;
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
    iAmA, myDone, oppDone, seen: !!seen,
    myScore: myDone || b.status === "finished" ? myScore : null,
    oppScore: b.status === "finished" ? oppScore : null,
    winnerId: b.winnerId ?? "",
    finishedAt: b.finishedAt ?? 0,
  };
}

async function loadOpp(b: typeof pvpBattles.$inferSelect, meId: string) {
  const oppId = b.aId === meId ? b.bId : b.aId;
  const rows = await db.select().from(users).where(eq(users.id, oppId)).limit(1);
  return pubOpp(rows[0], oppId, b.aId === meId ? (b.bName ?? "") : (b.aName ?? ""));
}

function fullState(b: typeof pvpBattles.$inferSelect, meId: string, opp: ReturnType<typeof pubOpp>) {
  const qs = (b.questions as PvPQ[]) || [];
  const iAmA = b.aId === meId;
  const myAns = (iAmA ? b.aAnswers : b.bAnswers) as Ans[];
  const oppAns = (iAmA ? b.bAnswers : b.aAnswers) as Ans[];
  const base = mini(b, meId, opp);
  const out: Record<string, unknown> = { ...base, me: meId, qCount: qs.length };
  const started = b.status === "accepted" || b.status === "finished";
  const myDone = base.myDone;
  // سؤال‌ها فقط وقتی ارسال می‌شوند که نبرد پذیرفته شده و من هنوز پاسخ نداده‌ام (بدون گزینهٔ صحیح)
  if (started && !myDone) {
    out.questions = qs.map((q) => ({ id: q.id, title: q.title, options: q.options, seconds: q.seconds }));
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

// --------------------------------------------------------------- GET
export async function GET(req: Request) {
  await ensureSeed();
  const me = await getSessionUser();
  if (!me) return json({ error: "not-authed", message: "ابتدا وارد بازی شو 🌱" }, 401);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "inbox";
  await sweepExpired(me.id);

  if (action === "inbox") {
    const rows = await db.select().from(pvpBattles)
      .where(or(eq(pvpBattles.aId, me.id), eq(pvpBattles.bId, me.id)))
      .orderBy(desc(pvpBattles.createdAt)).limit(40);
    const incoming: unknown[] = [], outgoing: unknown[] = [], active: unknown[] = [], results: unknown[] = [];
    for (const b of rows) {
      const opp = await loadOpp(b, me.id);
      if (b.status === "pending" && b.bId === me.id) incoming.push(mini(b, me.id, opp));
      else if (b.status === "pending" && b.aId === me.id) outgoing.push(mini(b, me.id, opp));
      else if (b.status === "accepted") active.push(mini(b, me.id, opp));
      else if (b.status === "finished") results.push(mini(b, me.id, opp));
    }
    return json({ me: me.id, incoming, outgoing, active, results: results.slice(0, 10) });
  }

  if (action === "state") {
    const id = url.searchParams.get("id") || "";
    const rows = await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1);
    const b = rows[0];
    if (!b) return json({ error: "نبرد پیدا نشد." }, 404);
    if (b.aId !== me.id && b.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    const opp = await loadOpp(b, me.id);
    return json(fullState(b, me.id, opp));
  }

  return json({ error: "action نامعتبر" }, 400);
}

// --------------------------------------------------------------- POST
export async function POST(req: Request) {
  await ensureSeed();
  const me = await getSessionUser();
  if (!me) return json({ error: "not-authed", message: "ابتدا وارد بازی شو 🌱" }, 401);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { b = {}; }
  await sweepExpired(me.id);

  // ---- دعوت به نبرد واقعی ----
  if (action === "invite") {
    const to = String(b.to || "");
    if (!to) return json({ error: "حریف مشخص نشده." }, 400);
    if (to === me.id) return json({ error: "نمی‌توانی با خودت نبرد کنی! 😄" }, 400);
    const target = (await db.select().from(users).where(eq(users.id, to)).limit(1))[0];
    if (!target) return json({ error: "بازیکن پیدا نشد." }, 404);
    if (target.banned) return json({ error: "این بازیکن در دسترس نیست." }, 400);
    if (target.isDemo) return json({ error: "این بازیکن واقعی نیست؛ از فهرست بازیکنان واقعی انتخاب کن." }, 400);

    // دعوت باز در همین جفت؟ همان را برگردان (ضدتکرار)
    const open = await db.select().from(pvpBattles).where(and(
      eq(pvpBattles.status, "pending"),
      or(
        and(eq(pvpBattles.aId, me.id), eq(pvpBattles.bId, to)),
        and(eq(pvpBattles.aId, to), eq(pvpBattles.bId, me.id)),
      ),
    )).limit(1);
    if (open[0] && (open[0].expiresAt ?? 0) > now()) {
      const opp = await loadOpp(open[0], me.id);
      return json({ ok: true, already: true, battle: fullState(open[0], me.id, opp) });
    }

    const category = String(b.category || "general").slice(0, 40);
    const qs = await drawQuestions(category);
    if (!qs.length) return json({ error: "سؤال کافی برای این دسته هنوز در بانک سؤال نیست." }, 400);

    const id = uid("pvp");
    const t = now();
    await db.insert(pvpBattles).values({
      id, aId: me.id, bId: to, aName: me.name, bName: target.name, category,
      questions: qs as unknown[], status: "pending", createdAt: t, expiresAt: t + INVITE_TTL,
      rematchOf: String(b.rematchOf || ""),
    });
    await notify(to, "⚔️ دعوت به نبرد واقعی", `${me.name} تو را به نبرد واقعی دعوت کرد! ورود: پنل نبرد ⚔️`);
    const created = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
    const opp = pubOpp(target, to, target.name);
    return json({ ok: true, battle: fullState(created, me.id, opp) });
  }

  // ---- پذیرش دعوت ----
  if (action === "accept") {
    const id = String(b.id || "");
    const row = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.bId !== me.id) return json({ error: "فقط حریف دعوت‌شده می‌تواند بپذیرد." }, 403);
    if (row.status !== "pending") return json({ error: "این دعوت دیگر معتبر نیست." }, 400);
    if ((row.expiresAt ?? 0) < now()) {
      await db.update(pvpBattles).set({ status: "expired" }).where(eq(pvpBattles.id, id));
      return json({ error: "مهلت دعوت تمام شده بود. دوباره دعوت کن." }, 400);
    }
    await db.update(pvpBattles).set({ status: "accepted" }).where(eq(pvpBattles.id, id));
    await notify(row.aId, "✅ دعوتت پذیرفته شد", `${me.name} دعوت نبردت را پذیرفت! نوبت توست، بزن بریم ⚔️`);
    const fresh = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
    const opp = await loadOpp(fresh, me.id);
    return json({ ok: true, battle: fullState(fresh, me.id, opp) });
  }

  // ---- رد دعوت ----
  if (action === "decline") {
    const id = String(b.id || "");
    const row = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "pending") return json({ error: "این دعوت دیگر معتبر نیست." }, 400);
    await db.update(pvpBattles).set({ status: "declined" }).where(eq(pvpBattles.id, id));
    await notify(row.aId, "❌ دعوت رد شد", `${me.name} الان برای نبرد آماده نیست.`);
    return json({ ok: true });
  }

  // ---- لغو دعوت ارسالی ----
  if (action === "cancel") {
    const id = String(b.id || "");
    const row = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "pending") return json({ error: "این دعوت دیگر قابل لغو نیست." }, 400);
    await db.update(pvpBattles).set({ status: "cancelled" }).where(eq(pvpBattles.id, id));
    return json({ ok: true });
  }

  // ---- ثبت پاسخ‌های من ----
  if (action === "submit") {
    const id = String(b.id || "");
    const row = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id && row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    if (row.status !== "accepted") {
      const opp = await loadOpp(row, me.id);
      return json({ ok: true, battle: fullState(row, me.id, opp), already: true });
    }
    const qs = (row.questions as PvPQ[]) || [];
    const iAmA = row.aId === me.id;
    const prev = (iAmA ? row.aAnswers : row.bAnswers) as Ans[];
    if (Array.isArray(prev) && prev.length >= qs.length) {
      const opp = await loadOpp(row, me.id);
      return json({ ok: true, battle: fullState(row, me.id, opp), already: true });
    }
    const raw = Array.isArray(b.answers) ? (b.answers as unknown[]) : [];
    const answers: Ans[] = qs.map((q, k) => {
      const it = (raw[k] || {}) as { i?: unknown; t?: unknown };
      const idx = typeof it.i === "number" && Number.isInteger(it.i) && it.i >= 0 && it.i < q.options.length ? it.i : -1;
      const t = typeof it.t === "number" && Number.isFinite(it.t) ? Math.max(0, it.t) : (q.seconds || 25) * 1000;
      return { i: idx, t };
    });
    const s = scoreOf(qs, answers);
    const set: Record<string, unknown> = iAmA
      ? { aAnswers: answers as unknown[], aScore: s.score, aCorrect: s.correct, aMs: s.ms, aDoneAt: now() }
      : { bAnswers: answers as unknown[], bScore: s.score, bCorrect: s.correct, bMs: s.ms, bDoneAt: now() };
    await db.update(pvpBattles).set(set).where(eq(pvpBattles.id, id));
    let fresh = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];

    // هر دو تمام کرده‌اند؟ → پایان نبرد + بروزرسانی آمار
    if (fresh.aDoneAt && fresh.bDoneAt) {
      fresh = await finalize(fresh);
    } else {
      const oppId = iAmA ? row.bId : row.aId;
      await notify(oppId, "🎯 حریفت پاسخ داد", `${me.name} پاسخ‌هایش را ثبت کرد؛ نوبت توست!`);
    }
    const opp = await loadOpp(fresh, me.id);
    return json({ ok: true, battle: fullState(fresh, me.id, opp) });
  }

  // ---- دیدن نتیجه (علامت خوانده‌شده) ----
  if (action === "ack") {
    const id = String(b.id || "");
    const row = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
    if (!row) return json({ ok: true });
    if (row.aId !== me.id && row.bId !== me.id) return json({ ok: true });
    await db.update(pvpBattles).set(row.aId === me.id ? { aSeen: 1 } : { bSeen: 1 }).where(eq(pvpBattles.id, id));
    return json({ ok: true });
  }

  // ---- مبارزهٔ مجدد ----
  if (action === "rematch") {
    const id = String(b.id || "");
    const row = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, id)).limit(1))[0];
    if (!row) return json({ error: "نبرد پیدا نشد." }, 404);
    if (row.aId !== me.id && row.bId !== me.id) return json({ error: "دسترسی نداری." }, 403);
    const oppId = row.aId === me.id ? row.bId : row.aId;
    const target = (await db.select().from(users).where(eq(users.id, oppId)).limit(1))[0];
    if (!target || target.banned) return json({ error: "این بازیکن در دسترس نیست." }, 400);
    const qs = await drawQuestions(row.category || "general");
    if (!qs.length) return json({ error: "سؤال کافی برای این دسته نیست." }, 400);
    const nid = uid("pvp");
    const t = now();
    await db.insert(pvpBattles).values({
      id: nid, aId: me.id, bId: oppId, aName: me.name, bName: target.name, category: row.category || "general",
      questions: qs as unknown[], status: "pending", createdAt: t, expiresAt: t + INVITE_TTL, rematchOf: id,
    });
    await notify(oppId, "⚔️ درخواست مبارزهٔ مجدد", `${me.name} خواست دوباره با تو نبرد کند!`);
    const created = (await db.select().from(pvpBattles).where(eq(pvpBattles.id, nid)).limit(1))[0];
    const opp = pubOpp(target, oppId, target.name);
    return json({ ok: true, battle: fullState(created, me.id, opp) });
  }

  return json({ error: "action نامعتبر" }, 400);
}

async function finalize(battle: typeof pvpBattles.$inferSelect) {
  const { aId, bId } = battle;
  const aScore = battle.aScore ?? 0, bScore = battle.bScore ?? 0;
  let winnerId = "";
  if (aScore > bScore) winnerId = aId;
  else if (bScore > aScore) winnerId = bId;
  else if ((battle.aMs ?? 0) < (battle.bMs ?? 0)) winnerId = aId;
  else if ((battle.bMs ?? 0) < (battle.aMs ?? 0)) winnerId = bId;
  await db.update(pvpBattles).set({ status: "finished", winnerId, finishedAt: now() }).where(eq(pvpBattles.id, battle.id));

  const rows = await db.select().from(users).where(inArray(users.id, [aId, bId]));
  const uA = rows.find((u) => u.id === aId), uB = rows.find((u) => u.id === bId);
  const apply = async (u: typeof users.$inferSelect | undefined, score: number, correct: number, won: boolean, drew: boolean) => {
    if (!u) return;
    const xpGain = Math.round(score / 10) + (won ? 25 : drew ? 12 : 5);
    const coinGain = won ? 10 : 2;
    await db.update(users).set({
      played: sql`${users.played} + 1`,
      wins: sql`${users.wins} + ${won ? 1 : 0}`,
      cups: sql`${users.cups} + ${won ? 1 : 0}`,
      xp: sql`${users.xp} + ${xpGain}`,
      weekXp: sql`${users.weekXp} + ${xpGain}`,
      coins: sql`${users.coins} + ${coinGain}`,
      rating: sql`${users.rating} + ${won ? 24 : drew ? 0 : -12}`,
      lastSeen: now(),
    }).where(eq(users.id, u.id));
  };
  const drew = !winnerId;
  await apply(uA, aScore, battle.aCorrect ?? 0, winnerId === aId, drew);
  await apply(uB, bScore, battle.bCorrect ?? 0, winnerId === bId, drew);

  const name = (id: string) => (id === aId ? battle.aName : battle.bName) || "بازیکن";
  const msgFor = (selfId: string) => {
    const my = selfId === aId ? aScore : bScore, other = selfId === aId ? bScore : aScore;
    if (!winnerId) return `مساوی شدید! ${fa(my)} برابر ${fa(other)} ⚖️`;
    return winnerId === selfId
      ? `بردی! 🏆 ${fa(my)} برابر ${fa(other)} از ${name(selfId === aId ? bId : aId)}`
      : `باختی! ${fa(my)} برابر ${fa(other)} از ${name(selfId === aId ? bId : aId)} — از پنل ⚔️ مبارزهٔ مجدد بخواه.`;
  };
  await notify(aId, "⚔️ نتیجهٔ نبرد واقعی", msgFor(aId));
  await notify(bId, "⚔️ نتیجهٔ نبرد واقعی", msgFor(bId));
  return (await db.select().from(pvpBattles).where(eq(pvpBattles.id, battle.id)).limit(1))[0];
}
