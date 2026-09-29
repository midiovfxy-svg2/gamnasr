import { defaultContent, uid, validateContent, type MediaAsset, type SiteContent } from './content';
import { getFile, normalizePhone, removeFile, storeFile, validateFile, validPhone } from './files';
import { loadState, newProfile, saveState, type Profile } from './storage';
import type { Track } from '../data/types';

export type StorageMode = 'checking' | 'local' | 'server';
export interface Attachment { id: string; name: string; mime: string; size: number }
export interface MessageReply { id: string; text: string; createdAt: number }
export interface ContactMessage {
  id: string; userId: string; name: string; mobile: string; subject: string; text: string;
  createdAt: number; status: 'unread' | 'read' | 'replied' | 'archived';
  attachments: Attachment[]; replies: MessageReply[];
}
export interface AuditEntry { id: string; title: string; detail: string; createdAt: number }
export interface Revision { id: string; label: string; createdAt: number; content: SiteContent }
export interface AdminSnapshot { users: Profile[]; messages: ContactMessage[]; audit: AuditEntry[]; revisions: Revision[] }

const KEY = 'nasr-content-v2';
const AUTH = 'nasr-admin-auth-v2';
const SESSION = 'nasr-admin-session-v2';
const MESSAGES = 'nasr-messages-v2';
const AUDIT = 'nasr-audit-v2';
const REVISIONS = 'nasr-revisions-v2';
const CREDENTIALS = 'nasr-profile-keys-v2';
let mode: StorageMode = 'checking';
let contentVersion = 0;

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function write(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch { throw new Error('فضای ذخیره‌سازی مرورگر پر است. ابتدا پشتیبان بگیرید و فایل‌های اضافی را حذف کنید.'); }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`/api${path}`, {
      ...init, credentials: 'same-origin', signal: controller.signal,
      headers: { 'X-Nasr-Request': '1', ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('پاسخ سرور معتبر نیست. اتصال سرور را بررسی کنید.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'درخواست انجام نشد. دوباره تلاش کنید.');
    return data as T;
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error('پاسخ سرور طول کشید. اتصال را بررسی و دوباره تلاش کنید.');
    if (error instanceof TypeError) throw new Error('ارتباط با سرور برقرار نیست؛ اطلاعات هنوز روی سرور ذخیره نشده است.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function bootstrap() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    let response: Response;
    try { response = await fetch('/api/health', { signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
      const health = await response.json();
      if (health.app === 'nasr-university') {
        mode = 'server';
        localStorage.setItem('nasr-server-bound', location.origin);
        const { content } = await request<{ content: SiteContent }>('/public');
        contentVersion = content.updatedAt;
        return { content: validateContent(content), mode };
      }
    }
  } catch (error) {
    if (mode === 'server') throw error;
  }
  if (localStorage.getItem('nasr-server-bound') === location.origin) {
    mode = 'server';
    throw new Error('سرور دانشگاه در دسترس نیست. برای جلوگیری از ذخیرهٔ جداگانهٔ اطلاعات، حالت محلی فعال نشد.');
  }
  mode = 'local';
  let content = structuredClone(defaultContent);
  const saved = read<unknown>(KEY, null);
  if (saved) content = validateContent(saved);
  else {
    content = await migrateLegacyVoices(content);
    write(KEY, content);
  }
  contentVersion = content.updatedAt;
  return { content, mode };
}

async function migrateLegacyVoices(content: SiteContent) {
  type LegacyVoice = { id: string; name: string; url?: string; fallback?: string; blob?: Blob; target?: string; createdAt: number };
  const stored = await new Promise<LegacyVoice[]>(resolve => {
    try {
      const request = indexedDB.open('nasr-voices', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('voices')) request.result.createObjectStore('voices', { keyPath: 'id' }); };
      request.onerror = () => resolve([]);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('voices')) { db.close(); resolve([]); return; }
        const transaction = db.transaction('voices', 'readonly');
        const result = transaction.objectStore('voices').getAll();
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => resolve([]);
        transaction.oncomplete = () => db.close();
      };
    } catch { resolve([]); }
  });
  const cached = read<{ list: LegacyVoice[] }>('nasr-repo-voices-v1', { list: [] }).list || [];
  const decode = (url: string) => { try { return decodeURIComponent(url); } catch { return url; } };
  const urls = new Set(content.media.map(m => decode(m.url)));
  const assignments = read<Record<string, string[]>>('nasr-voice-assign-v1', content.voiceAssignments);
  for (const voice of [...stored, ...cached]) {
    if (content.media.some(m => m.id === voice.id) || (voice.url && urls.has(decode(voice.url)))) continue;
    if (voice.blob) await storeFile(voice.id, voice.blob);
    if (!voice.blob && !voice.url) continue;
    content.media.push({ id: voice.id, name: voice.name, type: 'audio', url: voice.url || '', fallback: voice.fallback, blobId: voice.blob ? voice.id : undefined, size: voice.blob?.size || 0, mime: voice.blob?.type || 'audio/ogg', enabled: true, createdAt: voice.createdAt || 0 });
    if (voice.target) assignments[voice.target] = [...new Set([...(assignments[voice.target] || []), voice.id])];
    if (voice.url) urls.add(decode(voice.url));
  }
  return validateContent({ ...content, voiceAssignments: assignments });
}

async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 150000 }, key, 256);
  return [...new Uint8Array(result)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function localPassword() {
  let auth = read<{ salt: string; hash: string } | null>(AUTH, null);
  if (!auth) {
    const salt = uid();
    auth = { salt, hash: await derive('admin', salt) };
    write(AUTH, auth);
  }
  return auth;
}

export async function adminSession() {
  if (mode === 'server') return (await request<{ authenticated: boolean }>('/admin/session')).authenticated;
  try { return Number(sessionStorage.getItem(SESSION)) > Date.now(); } catch { return false; }
}

async function requireAdmin() {
  if (!(await adminSession())) throw new Error('نشست مدیریت پایان یافته است. دوباره وارد شوید.');
}

export async function loginAdmin(password: string) {
  if (mode === 'checking') throw new Error('لطفاً تا پایان بررسی اتصال صبر کنید.');
  if (mode === 'server') { await request('/admin/login', { method: 'POST', body: JSON.stringify({ password }) }); return; }
  const throttle = read('nasr-login-attempts', { count: 0, until: 0 });
  if (throttle.until > Date.now()) throw new Error('تعداد تلاش‌ها زیاد بود. یک دقیقه دیگر دوباره تلاش کنید.');
  const auth = await localPassword();
  if (await derive(password, auth.salt) !== auth.hash) {
    const count = throttle.count + 1;
    write('nasr-login-attempts', { count: count >= 5 ? 0 : count, until: count >= 5 ? Date.now() + 60000 : 0 });
    throw new Error('رمز عبور نادرست است. دوباره تلاش کنید.');
  }
  write('nasr-login-attempts', { count: 0, until: 0 });
  sessionStorage.setItem(SESSION, String(Date.now() + 30 * 60 * 1000));
  recordActivity('ورود به مدیریت', 'ورود مدیر در حالت محلی');
}

export async function logoutAdmin() {
  if (mode === 'server') await request('/admin/logout', { method: 'POST' });
  sessionStorage.removeItem(SESSION);
}

export async function changePassword(current: string, next: string) {
  await requireAdmin();
  if (next.length < 8) throw new Error('رمز جدید باید حداقل ۸ نویسه داشته باشد.');
  if (mode === 'server') return request('/admin/password', { method: 'PUT', body: JSON.stringify({ current, next }) });
  const auth = await localPassword();
  if (await derive(current, auth.salt) !== auth.hash) throw new Error('رمز فعلی نادرست است.');
  const salt = uid();
  write(AUTH, { salt, hash: await derive(next, salt) });
  recordActivity('تغییر رمز مدیر', 'رمز ورود به مدیریت تغییر کرد');
}

export function recordActivity(title: string, detail: string) {
  if (mode === 'server') return;
  const entries = read<AuditEntry[]>(AUDIT, []);
  try { write(AUDIT, [{ id: uid(), title, detail, createdAt: Date.now() }, ...entries].slice(0, 100)); }
  catch { console.warn('The local activity log could not be stored.'); }
}

export async function saveContent(content: SiteContent, label: string) {
  await requireAdmin();
  const valid = validateContent({ ...content, updatedAt: Date.now() });
  if (mode === 'server') {
    const result = await request<{ content: SiteContent }>('/admin/content', { method: 'PUT', body: JSON.stringify({ content: valid, label, baseUpdatedAt: contentVersion }) });
    contentVersion = result.content.updatedAt;
    return result.content;
  }
  const previous = read<SiteContent>(KEY, defaultContent);
  if (previous.updatedAt !== contentVersion) throw new Error('محتوا در تب دیگری تغییر کرده است. قبل از ادامه، صفحه را تازه کنید.');
  valid.updatedAt = Math.max(previous.updatedAt + 1, Date.now());
  const revisions = read<Revision[]>(REVISIONS, []);
  write(REVISIONS, [{ id: uid(), label, createdAt: Date.now(), content: previous }, ...revisions].slice(0, 5));
  write(KEY, valid);
  contentVersion = valid.updatedAt;
  recordActivity(label, 'محتوا و تنظیمات ذخیره شد');
  return valid;
}

export async function getAdminSnapshot(): Promise<AdminSnapshot> {
  await requireAdmin();
  if (mode === 'server') return request('/admin/overview');
  return { users: loadState().profiles, messages: read(MESSAGES, []), audit: read(AUDIT, []), revisions: read(REVISIONS, []) };
}

function updateLocalUser(profile: Profile) {
  const state = loadState();
  const exists = state.profiles.some(p => p.id === profile.id);
  saveState({ ...state, profiles: exists ? state.profiles.map(p => p.id === profile.id ? profile : p) : [...state.profiles, profile] });
  window.dispatchEvent(new Event('nasr-profiles-updated'));
}

export async function saveAdminUser(profile: Profile, resetProgress = false) {
  await requireAdmin();
  validatePersonal(profile);
  const saved = mode === 'server'
    ? (await request<{ profile: Profile }>(`/admin/users/${encodeURIComponent(profile.id)}`, { method: 'PUT', body: JSON.stringify({ profile, resetProgress }) })).profile
    : (() => {
      const current = loadState().profiles.find(p => p.id === profile.id) || profile;
      return resetProgress
        ? { ...profile, progressRevision: (current.progressRevision || 0) + 1 }
        : { ...current, name: profile.name, mobile: profile.mobile, email: profile.email, track: profile.track, status: profile.status };
    })();
  if (mode === 'local' || loadState().profiles.some(p => p.id === saved.id)) updateLocalUser(saved);
  recordActivity('ویرایش کاربر', saved.name);
  return saved;
}

export async function deleteAdminUser(id: string) {
  await requireAdmin();
  if (mode === 'server') await request(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const state = loadState();
  const user = state.profiles.find(p => p.id === id);
  saveState({ profiles: state.profiles.filter(p => p.id !== id), activeId: state.activeId === id ? null : state.activeId });
  if (mode === 'local') {
    const messages = read<ContactMessage[]>(MESSAGES, []);
    await Promise.all(messages.filter(m => m.userId === id).flatMap(m => m.attachments).map(a => removeFile(a.id)));
    write(MESSAGES, messages.filter(m => m.userId !== id));
  }
  window.dispatchEvent(new Event('nasr-profiles-updated'));
  recordActivity('حذف کاربر', user?.name || id);
}

export async function createAdminUser(name: string, track: Track) {
  await requireAdmin();
  if (mode === 'server') return request<{ profile: Profile; recoveryCode: string }>('/admin/users', { method: 'POST', body: JSON.stringify({ name, track }) });
  const profile = newProfile(name, track);
  updateLocalUser(profile);
  recordActivity('افزودن کاربر', name);
  return { profile, recoveryCode: '' };
}

function credentials() { return read<Record<string, string>>(CREDENTIALS, {}); }
function userHeaders(id: string) { return { Authorization: `Bearer ${credentials()[id] || ''}`, 'X-Profile-ID': id }; }
const registrations = new Map<string, Promise<void>>();

export async function registerProfile(profile: Profile) {
  if (mode !== 'server' || credentials()[profile.id]) return;
  if (registrations.has(profile.id)) return registrations.get(profile.id);
  const task = (async () => {
    const data = await request<{ accessKey: string }>('/profiles', { method: 'POST', body: JSON.stringify({ profile }) });
    write(CREDENTIALS, { ...credentials(), [profile.id]: data.accessKey });
  })();
  registrations.set(profile.id, task);
  try { await task; } finally { registrations.delete(profile.id); }
}

export async function restoreProfile(code: string) {
  if (mode !== 'server') throw new Error('بازیابی حساب بین دستگاه‌ها پس از اتصال به سرور فعال می‌شود.');
  const [id, accessKey] = code.trim().split(':');
  if (!id || !accessKey) throw new Error('کد بازیابی معتبر نیست.');
  const { profile } = await request<{ profile: Profile }>('/profiles/me', { headers: { Authorization: `Bearer ${accessKey}`, 'X-Profile-ID': id } });
  write(CREDENTIALS, { ...credentials(), [profile.id]: accessKey });
  updateLocalUser(profile);
  return profile;
}

export function recoveryCode(id: string) { return credentials()[id] ? `${id}:${credentials()[id]}` : ''; }

export async function syncProgress(profile: Profile) {
  if (mode !== 'server') return;
  await registerProfile(profile);
  await request('/profiles/progress', {
    method: 'PUT', headers: userHeaders(profile.id),
    body: JSON.stringify({
      expectedRevision: profile.progressRevision || 0,
      progress: profile.progress, frequency: profile.frequency,
      momentum: profile.momentum, bestMomentum: profile.bestMomentum,
      repeats: profile.repeats, daily: profile.daily,
      blessings: profile.blessings, certs: profile.certs,
    }),
  });
}

export async function saveMyProfile(profile: Profile, updates: Pick<Profile, 'name' | 'mobile' | 'email' | 'avatar' | 'consentAt'>) {
  if (profile.status === 'blocked') throw new Error('دسترسی این حساب غیرفعال شده است.');
  validatePersonal(updates);
  if (updates.mobile && !updates.consentAt) throw new Error('رضایت ثبت اطلاعات تماس لازم است.');
  let saved: Profile = { ...profile, ...updates, lastSeen: Date.now() };
  if (mode === 'server') {
    await registerProfile(profile);
    saved = (await request<{ profile: Profile }>('/profiles/me', { method: 'PUT', headers: userHeaders(profile.id), body: JSON.stringify(updates) })).profile;
  }
  updateLocalUser(saved);
  return saved;
}

export async function getMyProfile(profile: Profile) {
  if (mode !== 'server') return loadState().profiles.find(p => p.id === profile.id) || profile;
  await registerProfile(profile);
  return (await request<{ profile: Profile }>('/profiles/me', { headers: userHeaders(profile.id) })).profile;
}

export async function sendContact(profile: Profile, subject: string, text: string, files: File[]) {
  if (profile.status === 'blocked') throw new Error('ارسال پیام برای این حساب غیرفعال است.');
  if (!subject.trim() || !text.trim()) throw new Error('موضوع و متن پیام را وارد کنید.');
  if (subject.length > 120 || text.length > 5000) throw new Error('موضوع حداکثر ۱۲۰ و پیام حداکثر ۵۰۰۰ نویسه است.');
  if (files.length > 3) throw new Error('حداکثر ۳ فایل می‌توانید پیوست کنید.');
  files.forEach(f => validateFile(f, 'contact'));
  if (mode === 'server') {
    await registerProfile(profile);
    const form = new FormData();
    form.set('subject', subject); form.set('text', text);
    files.forEach(f => form.append('attachments', f));
    return (await request<{ message: ContactMessage }>('/messages', { method: 'POST', headers: userHeaders(profile.id), body: form })).message;
  }
  const attachments: Attachment[] = [];
  for (const file of files) {
    const id = uid();
    await storeFile(id, file);
    attachments.push({ id, name: file.name, mime: file.type, size: file.size });
  }
  const message: ContactMessage = { id: uid(), userId: profile.id, name: profile.name, mobile: profile.mobile || '', subject: subject.trim(), text: text.trim(), createdAt: Date.now(), status: 'unread', attachments, replies: [] };
  write(MESSAGES, [message, ...read<ContactMessage[]>(MESSAGES, [])]);
  recordActivity('پیام جدید', `${profile.name}: ${subject.trim()}`);
  return message;
}

export async function myMessages(profile: Profile) {
  if (mode !== 'server') return read<ContactMessage[]>(MESSAGES, []).filter(m => m.userId === profile.id);
  await registerProfile(profile);
  return (await request<{ messages: ContactMessage[] }>('/messages/mine', { headers: userHeaders(profile.id) })).messages;
}

export async function updateMessage(id: string, status: ContactMessage['status'], reply?: string) {
  await requireAdmin();
  if (mode === 'server') return request('/admin/messages/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ status, reply }) });
  const messages = read<ContactMessage[]>(MESSAGES, []);
  write(MESSAGES, messages.map(m => m.id !== id ? m : { ...m, status: reply?.trim() ? 'replied' : status, replies: reply?.trim() ? [...m.replies, { id: uid(), text: reply.trim(), createdAt: Date.now() }] : m.replies }));
  if (reply?.trim()) recordActivity('پاسخ به پیام', messages.find(m => m.id === id)?.subject || '');
}

export async function attachmentBlob(id: string, profileId?: string) {
  if (mode !== 'server') {
    const blob = await getFile(id);
    if (!blob) throw new Error('فایل در این دستگاه پیدا نشد.');
    return blob;
  }
  const response = await fetch(`/api/attachments/${encodeURIComponent(id)}`, { credentials: 'same-origin', headers: profileId ? userHeaders(profileId) : undefined });
  if (!response.ok) throw new Error('فایل قابل دریافت نیست یا مجوز دسترسی ندارید.');
  return response.blob();
}

export async function uploadMedia(file: File, type: MediaAsset['type']): Promise<MediaAsset> {
  await requireAdmin();
  validateFile(file, type);
  if (mode === 'server') {
    const form = new FormData(); form.set('file', file); form.set('type', type);
    return (await request<{ media: MediaAsset }>('/admin/media', { method: 'POST', body: form })).media;
  }
  const id = uid();
  await storeFile(id, file);
  return { id, name: file.name, type, url: '', blobId: id, size: file.size, mime: file.type, createdAt: Date.now(), enabled: true };
}

export const statusNames: Record<ContactMessage['status'], string> = { unread: 'خوانده‌نشده', read: 'در حال بررسی', replied: 'پاسخ داده‌شده', archived: 'بایگانی‌شده' };

function validatePersonal(p: { name: string; mobile?: string; email?: string }) {
  if (!p.name.trim() || p.name.length > 80) throw new Error('نام باید بین ۱ تا ۸۰ نویسه باشد.');
  if (!validPhone(normalizePhone(p.mobile || ''))) throw new Error('شماره موبایل معتبر نیست.');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Error('آدرس ایمیل معتبر نیست.');
}