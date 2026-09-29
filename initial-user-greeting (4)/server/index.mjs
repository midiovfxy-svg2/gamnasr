import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultContent, validateContent } from '../src/lib/content.ts';

const scrypt = promisify(scryptCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{5,100}$/);
const nameSchema = z.string().trim().min(1).max(80);
const emptyOrEmail = z.union([z.literal(''), z.string().email().max(254)]).optional();
const mobileSchema = z.string().max(20).refine(v => !v || /^09\d{9}$/.test(v) || /^\+[1-9]\d{7,14}$/.test(v), 'شماره موبایل معتبر نیست.').optional();
const personalSchema = z.object({ name: nameSchema, mobile: mobileSchema, email: emptyOrEmail, avatar: z.string().max(300).optional(), consentAt: z.number().nonnegative().optional() });
const keySchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const progressSchema = z.object({
  progress: z.record(keySchema, z.object({ stars: z.number().int().min(0).max(3), best: z.number().nonnegative().max(10000), total: z.number().nonnegative().max(10000), done: z.boolean(), traveler: z.boolean().optional() })),
  frequency: z.number().min(0).max(100), momentum: z.number().nonnegative().max(1000000), bestMomentum: z.number().nonnegative().max(1000000),
  repeats: z.record(keySchema, z.number().nonnegative().max(10000000)), daily: z.record(keySchema, z.array(z.string().max(100)).max(500)),
  blessings: z.array(z.string().max(500)).max(10000), certs: z.record(keySchema, z.number().nonnegative()),
});
const blankProgress = () => ({ progress: {}, frequency: 30, momentum: 0, bestMomentum: 0, repeats: {}, daily: {}, blessings: [], certs: {} });
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const audioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/aac', 'audio/flac']);
const allowedFiles = new Set([...imageTypes, ...audioTypes, 'application/pdf', 'text/plain']);

async function hashPassword(password) {
  const salt = randomBytes(24).toString('hex');
  return { salt, hash: (await scrypt(password, salt, 64)).toString('hex') };
}
async function matchesPassword(password, auth) {
  return safeEqual((await scrypt(password, auth.salt, 64)).toString('hex'), auth.hash);
}

function verifyFile(file) {
  const b = file.buffer;
  if (file.originalname.length > 200 || !/\.(png|jpe?g|webp|gif|mp3|ogg|opus|wav|m4a|mp4|webm|aac|flac|pdf|txt)$/i.test(file.originalname.trim())) throw Object.assign(new Error('نام یا پسوند فایل مجاز نیست.'), { status: 400 });
  const begins = (hex) => b.subarray(0, hex.length / 2).toString('hex') === hex;
  const text = (start, end) => b.subarray(start, end).toString('ascii');
  const supplied = file.mimetype.split(';')[0];
  const mime = ({ 'audio/mp3': 'audio/mpeg', 'audio/opus': 'audio/ogg', 'audio/wave': 'audio/wav', 'audio/x-m4a': 'audio/mp4' })[supplied] || supplied;
  const signatures = {
    'image/png': () => begins('89504e470d0a1a0a'), 'image/jpeg': () => begins('ffd8ff'),
    'image/gif': () => ['GIF87a', 'GIF89a'].includes(text(0, 6)),
    'image/webp': () => text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP',
    'application/pdf': () => text(0, 5) === '%PDF-',
    'audio/mpeg': () => text(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
    'audio/aac': () => b[0] === 0xff && (b[1] & 0xf0) === 0xf0,
    'audio/ogg': () => text(0, 4) === 'OggS',
    'audio/wav': () => text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE',
    'audio/x-wav': () => text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE',
    'audio/mp4': () => text(4, 8) === 'ftyp', 'audio/webm': () => begins('1a45dfa3'),
    'audio/flac': () => text(0, 4) === 'fLaC',
    'text/plain': () => { try { new TextDecoder('utf-8', { fatal: true }).decode(b); return !b.includes(0); } catch { return false; } },
  };
  if (!b.length || !signatures[mime]?.()) throw Object.assign(new Error('محتوا یا نوع واقعی فایل با قالب مجاز سازگار نیست.'), { status: 400 });
}

export async function createApplication(options = {}) {
  const dataDirectory = path.resolve(options.dataDirectory || process.env.DATA_DIR || path.join(root, 'server-data'));
  const filesDirectory = path.join(dataDirectory, 'files');
  await mkdir(filesDirectory, { recursive: true, mode: 0o700 });
  const stateFile = path.join(dataDirectory, 'store.json');
  let store;
  try { store = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    store = { version: 2, content: structuredClone(defaultContent), auth: await hashPassword(options.initialPassword || process.env.ADMIN_PASSWORD || 'admin'), users: [], messages: [], audit: [], revisions: [], files: [] };
    await writeFile(stateFile, JSON.stringify(store), { mode: 0o600 });
  }
  let queue = Promise.resolve();
  const persist = () => {
    const snapshot = JSON.stringify(store);
    const task = queue.catch(() => undefined).then(async () => {
      const temp = `${stateFile}.tmp`;
      await writeFile(temp, snapshot, { mode: 0o600 });
      await rename(temp, stateFile);
    });
    queue = task;
    return task;
  };
  const audit = (title, detail = '') => { store.audit.unshift({ id: randomUUID(), title, detail, createdAt: Date.now() }); store.audit = store.audit.slice(0, 200); };
  const sessions = new Map();
  const secureCookies = options.secureCookies ?? (process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production');
  const publicOrigin = options.publicOrigin || process.env.PUBLIC_ORIGIN;
  const cookieOptions = { httpOnly: true, secure: secureCookies, sameSite: 'strict', path: '/api', maxAge: 30 * 60 * 1000 };
  const cookieToken = req => {
    const part = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('nasr_admin='));
    return part ? part.slice('nasr_admin='.length) : '';
  };
  const isAdmin = req => {
    const token = cookieToken(req);
    if (!/^[a-f0-9]{64}$/.test(token)) return false;
    const key = sha(token); const session = sessions.get(key);
    if (!session || session.expires <= Date.now()) { sessions.delete(key); return false; }
    return true;
  };
  const requireAdmin = (req, res, next) => isAdmin(req) ? next() : res.status(401).json({ error: 'ورود مدیر الزامی است؛ نشست ممکن است پایان یافته باشد.' });
  const identifyUser = req => {
    const id = req.get('X-Profile-ID');
    const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
    if (!id || !/^[a-f0-9]{64}$/.test(token)) return null;
    const user = store.users.find(u => u.profile.id === id);
    return user && safeEqual(user.accessHash, sha(token)) ? user : null;
  };
  const requireUser = (req, res, next) => {
    const user = identifyUser(req);
    if (!user) return res.status(401).json({ error: 'حساب قابل دسترسی نیست. با کد بازیابی خود وارد شوید.' });
    req.user = user;
    next();
  };
  const activeUser = (req, res, next) => req.user.profile.status === 'blocked' ? res.status(403).json({ error: 'این حساب توسط مدیریت غیرفعال شده است.' }) : next();

  let indexHTML = '';
  try { indexHTML = await readFile(path.join(root, 'dist/index.html'), 'utf8'); } catch { /* API can be tested without a frontend build. */ }
  const inlineHashes = [...indexHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].filter(m => m[1].trim()).map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", ...inlineHashes], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], imgSrc: ["'self'", 'https:', 'blob:', 'data:'], mediaSrc: ["'self'", 'https:', 'blob:'], connectSrc: ["'self'", 'https://api.github.com', 'https://raw.githubusercontent.com', 'https://cdn.jsdelivr.net'], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: secureCookies ? [] : null } },
    strictTransportSecurity: secureCookies ? { maxAge: 31536000 } : false,
  }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (req.get('X-Nasr-Request') !== '1') return res.status(403).json({ error: 'درخواست نامعتبر است.' });
      const origin = req.get('origin');
      const expected = publicOrigin || `${req.protocol}://${req.get('host')}`;
      if (origin && origin !== expected) return res.status(403).json({ error: 'مبدأ درخواست مجاز نیست.' });
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 2000, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'تعداد درخواست‌ها زیاد است. کمی بعد تلاش کنید.' } }));
  app.use(express.json({ limit: '8mb' }));
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, skipSuccessfulRequests: true, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'تلاش‌های ورود بیش از حد مجاز است. ۱۵ دقیقه بعد تلاش کنید.' } });
  const registerLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'حد ثبت‌نام این ساعت تکمیل شده است.' } });
  const messageLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, keyGenerator: req => req.user.profile.id, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'حداکثر ۳۰ پیام در ساعت قابل ارسال است.' } });
  const upload = (limit, files) => multer({
    storage: multer.memoryStorage(), defParamCharset: 'utf8', limits: { fileSize: limit, files, fields: 5, fieldSize: 30000, parts: 10 },
    fileFilter: (_req, file, cb) => allowedFiles.has(file.mimetype.split(';')[0]) ? cb(null, true) : cb(Object.assign(new Error('قالب فایل مجاز نیست.'), { status: 400 })),
  });

  app.get('/api/health', (_req, res) => res.json({ app: 'nasr-university', version: 2 }));
  app.get('/api/public', (_req, res) => res.json({ content: store.content }));
  app.get('/api/admin/session', (req, res) => res.json({ authenticated: isAdmin(req) }));
  app.post('/api/admin/login', loginLimit, async (req, res) => {
    const { password } = z.object({ password: z.string().min(1).max(128) }).parse(req.body);
    if (!(await matchesPassword(password, store.auth))) return res.status(401).json({ error: 'رمز عبور نادرست است.' });
    const token = randomBytes(32).toString('hex');
    for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
    if (sessions.size >= 5) sessions.delete(sessions.keys().next().value);
    sessions.set(sha(token), { expires: Date.now() + cookieOptions.maxAge });
    audit('ورود به مدیریت', 'نشست مدیریت سمت سرور ایجاد شد'); await persist();
    res.cookie('nasr_admin', token, cookieOptions).json({ authenticated: true });
  });
  app.post('/api/admin/logout', (req, res) => { sessions.delete(sha(cookieToken(req))); res.clearCookie('nasr_admin', { ...cookieOptions, maxAge: undefined }).json({ ok: true }); });
  app.put('/api/admin/password', requireAdmin, loginLimit, async (req, res) => {
    const { current, next } = z.object({ current: z.string().min(1).max(128), next: z.string().min(8).max(128) }).parse(req.body);
    if (!(await matchesPassword(current, store.auth))) return res.status(400).json({ error: 'رمز فعلی نادرست است.' });
    store.auth = await hashPassword(next);
    const currentKey = sha(cookieToken(req));
    for (const key of sessions.keys()) if (key !== currentKey) sessions.delete(key);
    audit('تغییر رمز مدیریت', 'نشست‌های دیگر باطل شدند'); await persist();
    res.json({ ok: true });
  });
  app.get('/api/admin/overview', requireAdmin, (_req, res) => res.json({ users: store.users.map(u => u.profile), messages: store.messages, audit: store.audit, revisions: store.revisions }));
  app.put('/api/admin/content', requireAdmin, async (req, res) => {
    if (req.body.baseUpdatedAt !== undefined && req.body.baseUpdatedAt !== store.content.updatedAt) return res.status(409).json({ error: 'محتوا در نشست دیگری تغییر کرده است. صفحه را تازه کنید.' });
    const label = z.string().max(200).parse(req.body.label);
    const content = validateContent(req.body.content);
    store.revisions.unshift({ id: randomUUID(), label, createdAt: Date.now(), content: store.content });
    store.revisions = store.revisions.slice(0, 10);
    store.content = { ...content, updatedAt: Math.max(store.content.updatedAt + 1, Date.now()) };
    audit(label, 'تغییر محتوا از پنل مدیریت'); await persist();
    res.json({ content: store.content });
  });

  const makeUser = (id, name, track) => {
    const accessKey = randomBytes(32).toString('hex');
    const profile = { id, name, track, status: 'active', mobile: '', email: '', progressRevision: 0, createdAt: Date.now(), lastSeen: Date.now(), ...blankProgress() };
    store.users.push({ profile, accessHash: sha(accessKey) });
    return { profile, accessKey };
  };
  app.post('/api/profiles', registerLimit, async (req, res) => {
    if (!store.content.settings.registration) return res.status(403).json({ error: 'ثبت‌نام جدید موقتاً غیرفعال است.' });
    const p = z.object({ id: identifier, name: nameSchema, track: z.enum(['adult', 'kids']) }).parse(req.body.profile);
    if (store.users.some(u => u.profile.id === p.id)) return res.status(409).json({ error: 'این حساب قبلاً ثبت شده است؛ کد بازیابی آن لازم است.' });
    const created = makeUser(p.id, p.name, p.track);
    audit('ثبت‌نام دانشجو', p.name); await persist(); res.status(201).json(created);
  });
  app.get('/api/profiles/me', requireUser, (req, res) => res.json({ profile: req.user.profile }));
  app.put('/api/profiles/me', requireUser, activeUser, async (req, res) => {
    const updates = personalSchema.parse(req.body);
    if (updates.mobile && !updates.consentAt) return res.status(400).json({ error: 'رضایت ثبت اطلاعات تماس لازم است.' });
    req.user.profile = { ...req.user.profile, ...updates, lastSeen: Date.now() };
    await persist(); res.json({ profile: req.user.profile });
  });
  app.put('/api/profiles/progress', requireUser, activeUser, async (req, res) => {
    if ((req.body.expectedRevision || 0) !== (req.user.profile.progressRevision || 0)) return res.status(409).json({ error: 'مدیریت پیشرفت این حساب را بازنشانی کرده است. صفحه را تازه کنید.' });
    const data = progressSchema.parse(req.body);
    req.user.profile = { ...req.user.profile, ...data, lastSeen: Date.now() };
    await persist(); res.json({ ok: true });
  });
  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const { name, track } = z.object({ name: nameSchema, track: z.enum(['adult', 'kids']) }).parse(req.body);
    const created = makeUser(randomUUID(), name, track);
    audit('افزودن کاربر توسط مدیر', name); await persist();
    res.status(201).json({ profile: created.profile, recoveryCode: `${created.profile.id}:${created.accessKey}` });
  });
  app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const user = store.users.find(u => u.profile.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد.' });
    const p = req.body.profile;
    const personal = personalSchema.parse(p);
    const { track, status } = z.object({ track: z.enum(['adult', 'kids']), status: z.enum(['active', 'blocked']).default('active') }).parse(p);
    const resetting = req.body.resetProgress === true;
    user.profile = { ...user.profile, ...personal, ...(resetting ? progressSchema.parse(p) : {}), track, status, progressRevision: (user.profile.progressRevision || 0) + (resetting ? 1 : 0) };
    audit('ویرایش کاربر', user.profile.name); await persist(); res.json({ profile: user.profile });
  });
  app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const user = store.users.find(u => u.profile.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد.' });
    const files = store.files.filter(f => f.ownerId === user.profile.id && f.access === 'private');
    for (const file of files) await unlink(path.join(filesDirectory, file.id)).catch(() => undefined);
    store.files = store.files.filter(f => !files.some(old => old.id === f.id));
    store.messages = store.messages.filter(m => m.userId !== user.profile.id);
    store.users = store.users.filter(u => u !== user);
    audit('حذف کاربر و پیام‌ها', user.profile.name); await persist(); res.json({ ok: true });
  });

  app.post('/api/messages', requireUser, activeUser, messageLimit, upload(5 * 1024 * 1024, 3).array('attachments', 3), async (req, res) => {
    if (!store.content.settings.contactEnabled) return res.status(403).json({ error: 'ارسال پیام موقتاً غیرفعال است.' });
    const { subject, text } = z.object({ subject: z.string().trim().min(1).max(120), text: z.string().trim().min(1).max(5000) }).parse(req.body);
    const files = req.files || [];
    files.forEach(verifyFile);
    const attachments = [];
    for (const file of files) {
      const entry = { id: randomUUID(), name: file.originalname, mime: file.mimetype, size: file.size };
      await writeFile(path.join(filesDirectory, entry.id), file.buffer, { mode: 0o600 });
      store.files.push({ ...entry, access: 'private', ownerId: req.user.profile.id });
      attachments.push(entry);
    }
    const message = { id: randomUUID(), userId: req.user.profile.id, name: req.user.profile.name, mobile: req.user.profile.mobile || '', subject, text, createdAt: Date.now(), status: 'unread', attachments, replies: [] };
    store.messages.unshift(message); audit('پیام جدید', `${message.name}: ${subject}`); await persist();
    res.status(201).json({ message });
  });
  app.get('/api/messages/mine', requireUser, (req, res) => res.json({ messages: store.messages.filter(m => m.userId === req.user.profile.id) }));
  app.put('/api/admin/messages/:id', requireAdmin, async (req, res) => {
    const message = store.messages.find(m => m.id === req.params.id);
    if (!message) return res.status(404).json({ error: 'پیام پیدا نشد.' });
    const { status, reply } = z.object({ status: z.enum(['unread', 'read', 'replied', 'archived']), reply: z.string().trim().max(5000).optional() }).parse(req.body);
    message.status = status;
    if (reply) { message.replies.push({ id: randomUUID(), text: reply, createdAt: Date.now() }); message.status = 'replied'; audit('پاسخ به پیام', message.subject); }
    await persist(); res.json({ message });
  });
  app.get('/api/attachments/:id', (req, res) => {
    const file = store.files.find(f => f.id === req.params.id && f.access === 'private');
    const owner = identifyUser(req);
    if (!file || (!isAdmin(req) && file.ownerId !== owner?.profile.id)) return res.status(404).json({ error: 'فایل در دسترس نیست.' });
    res.set('Content-Type', 'application/octet-stream');
    res.download(path.join(filesDirectory, file.id), file.name);
  });
  app.post('/api/admin/media', requireAdmin, upload(20 * 1024 * 1024, 1).single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'فایلی ارسال نشده است.' });
    const type = z.enum(['audio', 'image']).parse(req.body.type);
    const mime = req.file.mimetype.split(';')[0];
    if (!(type === 'audio' ? audioTypes : imageTypes).has(mime)) return res.status(400).json({ error: 'نوع رسانه با فایل ارسالی تطابق ندارد.' });
    if (type === 'image' && req.file.size > 4 * 1024 * 1024) return res.status(400).json({ error: 'تصویر باید کمتر از ۴ مگابایت باشد.' });
    verifyFile(req.file);
    const id = randomUUID();
    await writeFile(path.join(filesDirectory, id), req.file.buffer, { mode: 0o600 });
    const media = { id, name: req.file.originalname, type, url: `/api/media/${id}`, size: req.file.size, mime, enabled: true, createdAt: Date.now() };
    store.files.push({ id, name: media.name, mime, size: media.size, access: 'public' });
    await persist(); res.status(201).json({ media });
  });
  app.get('/api/media/:id', (req, res) => {
    const file = store.files.find(f => f.id === req.params.id && f.access === 'public');
    if (!file) return res.status(404).json({ error: 'رسانه پیدا نشد.' });
    res.set('Content-Type', file.mime);
    res.sendFile(path.join(filesDirectory, file.id));
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر API پیدا نشد.' }));
  app.use(express.static(path.join(root, 'dist'), { index: false, dotfiles: 'deny' }));
  app.use((req, res) => {
    if (req.method !== 'GET') return res.status(404).end();
    if (!indexHTML) return res.status(503).type('text').send('Build the frontend before serving the website.');
    res.type('html').send(indexHTML);
  });
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'اطلاعات ارسال‌شده معتبر نیست.', details: error.issues.map(i => i.path.join('.')) });
    if (error instanceof multer.MulterError) return res.status(400).json({ error: 'تعداد، نوع یا حجم فایل‌ها مجاز نیست.' });
    const validation = error.message?.startsWith('محتوا ذخیره نشد:');
    if (!validation && !error.status) console.error('Request failed:', error.message);
    res.status(error.status || (validation ? 400 : 500)).json({ error: validation || error.status ? error.message : 'خطای سرور؛ درخواست ذخیره نشد. دوباره تلاش کنید.' });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApplication();
  const port = Number(process.env.PORT || 3001);
  const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Nasr University is listening on port ${port}. Use HTTPS in production.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}