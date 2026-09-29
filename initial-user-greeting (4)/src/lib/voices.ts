// سامانهٔ صدای استاد: فایل‌های صوتی مخزن + فایل‌های آپلودی/ضبط‌شده (IndexedDB) + لینک‌ها

export interface Voice {
  id: string;
  name: string;
  kind: 'repo' | 'file' | 'rec' | 'url';
  url?: string;
  fallback?: string;
  blob?: Blob;
  createdAt: number;
  target?: string; // اختصاص خودکار از روی نام فایل در مخزن (مثلاً a2-....ogg)
}

const REPO_CDN = 'https://cdn.jsdelivr.net/gh/midiovfxy-svg2/nasr@main/';
const REPO_RAW = 'https://raw.githubusercontent.com/midiovfxy-svg2/nasr/main/';
const F1 = 'WhatsApp%20Audio%202026-09-27%20at%2023.43.09.ogg';
const F2 = 'WhatsApp%20Audio%202026-09-27%20at%2023.43.09%20%281%29.ogg';

export const DEFAULT_VOICES: Voice[] = [
  { id: 'repo-1', name: 'صدای استاد — فایل ۱ (مخزن nasr)', kind: 'repo', url: REPO_CDN + F1, fallback: REPO_RAW + F1, createdAt: 0 },
  { id: 'repo-2', name: 'صدای استاد — فایل ۲ (مخزن nasr)', kind: 'repo', url: REPO_CDN + F2, fallback: REPO_RAW + F2, createdAt: 1 },
];

const DB = 'nasr-voices';
const STORE = 'voices';
const memory = new Map<string, Voice>();

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

// ——— کشف خودکار فایل‌های صوتی جدید در مخزن گیت‌هاب استاد ———
const API = 'https://api.github.com/repos/midiovfxy-svg2/nasr/contents/';
const AUDIO_RE = /\.(ogg|opus|mp3|m4a|wav|aac|webm)$/i;
const ID_RE = /^(home|a[1-6]|b[1-6]|c[1-6]|k[1-9])(?=[\s_\-.)(])/i;
const CACHE = 'nasr-repo-voices-v1';
type GhItem = { name: string; path: string; type: string };
const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');
const samePath = (u?: string) => {
  try {
    return decodeURIComponent(u || '').replace(REPO_CDN, '').replace(REPO_RAW, '');
  } catch {
    return u || '';
  }
};

async function fetchDir(path: string): Promise<GhItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(API + encPath(path), { signal: controller.signal, headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('github');
    return r.json();
  } finally { clearTimeout(timer); }
}

export async function repoVoices(force = false): Promise<Voice[]> {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c && Date.now() - c.at < 20 * 60 * 1000) return c.list as Voice[];
    } catch {
      /* ignore */
    }
  }
  try {
    const root = await fetchDir('');
    let files = root.filter((f) => f.type === 'file' && AUDIO_RE.test(f.name));
    const dirs = root.filter((f) => f.type === 'dir' && /صدا|صوت|audio|voice|sound/i.test(f.name));
    for (const d of dirs) {
      try {
        const sub = await fetchDir(d.path);
        files = files.concat(sub.filter((f) => f.type === 'file' && AUDIO_RE.test(f.name)));
      } catch {
        /* ignore */
      }
    }
    const list: Voice[] = files.map((f, i) => {
      const m = f.name.match(ID_RE);
      return {
        id: 'gh-' + f.path,
        name: 'صدای استاد — ' + f.name.replace(AUDIO_RE, ''),
        kind: 'repo',
        url: REPO_CDN + encPath(f.path),
        fallback: REPO_RAW + encPath(f.path),
        createdAt: 10 + i,
        target: m ? m[1].toLowerCase() : undefined,
      };
    });
    localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), list }));
    return list;
  } catch {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c) return c.list as Voice[];
    } catch {
      /* ignore */
    }
    return [];
  }
}

export async function listVoices(force = false): Promise<Voice[]> {
  const known = new Set(DEFAULT_VOICES.map((v) => samePath(v.url)));
  const gh = (await repoVoices(force)).filter((v) => !known.has(samePath(v.url)));
  let stored: Voice[] = [];
  try {
    const db = await openDB();
    stored = await new Promise<Voice[]>((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).getAll();
      r.onsuccess = () => res(r.result as Voice[]);
      r.onerror = () => rej(r.error);
    });
  } catch {
    stored = Array.from(memory.values());
  }
  stored.sort((a, b) => a.createdAt - b.createdAt);
  return [...DEFAULT_VOICES, ...gh, ...stored];
}

export async function saveVoice(v: Voice) {
  try {
    const db = await openDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    memory.set(v.id, v);
  }
}

export async function deleteVoice(id: string) {
  memory.delete(id);
  try {
    const db = await openDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* ignore */
  }
  const a = getAssign();
  for (const k of Object.keys(a)) a[k] = a[k].filter((x) => x !== id);
  setAssign(a);
}

// ——— اختصاص صدا به درس‌ها ———
const AKEY = 'nasr-voice-assign-v1';
export const HOME_TARGET = 'home';

export function getAssign(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(AKEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { [HOME_TARGET]: ['repo-1', 'repo-2'] };
}

export function setAssign(a: Record<string, string[]>) {
  try {
    localStorage.setItem(AKEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
}

// لینک صفحهٔ گیت‌هاب را به لینک مستقیم قابل پخش تبدیل می‌کند
export function normalizeUrl(u: string): string {
  const s = u.trim();
  const m = s.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/);
  if (m) return `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}/${m[4].split('?')[0]}`;
  return s;
}

const objectUrls = new Map<string, { blob: Blob; url: string }>();
export function voiceSrc(v: Voice): string {
  if (v.blob) {
    let cached = objectUrls.get(v.id);
    if (!cached || cached.blob !== v.blob) {
      if (cached) URL.revokeObjectURL(cached.url);
      cached = { blob: v.blob, url: URL.createObjectURL(v.blob) };
      objectUrls.set(v.id, cached);
    }
    return cached.url;
  }
  const old = objectUrls.get(v.id);
  if (old) { URL.revokeObjectURL(old.url); objectUrls.delete(v.id); }
  return v.url || '';
}

export const newId = () => 'v-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
