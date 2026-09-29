import type { Track } from '../data/types';

export interface LessonProgress {
  stars: number;
  best: number;
  total: number;
  done: boolean;
  traveler?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  track: Track;
  mobile?: string;
  email?: string;
  avatar?: string;
  status?: 'active' | 'blocked';
  lastSeen?: number;
  consentAt?: number;
  progressRevision?: number;
  createdAt: number;
  progress: Record<string, LessonProgress>;
  frequency: number;
  momentum: number;
  bestMomentum: number;
  repeats: Record<string, number>;
  daily: Record<string, string[]>;
  blessings: string[];
  certs: Record<string, number>;
}

export interface AppState {
  profiles: Profile[];
  activeId: string | null;
}

const KEY = 'nasr-university-v1';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (Array.isArray(s.profiles)) return s;
    }
  } catch {
    /* ignore */
  }
  return { profiles: [], activeId: null };
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    throw new Error('اطلاعات حساب در مرورگر ذخیره نشد. فضای ذخیره‌سازی را بررسی کنید.');
  }
}

export function newProfile(name: string, track: Track): Profile {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    track,
    status: 'active',
    lastSeen: Date.now(),
    createdAt: Date.now(),
    progress: {},
    frequency: 30,
    momentum: 0,
    bestMomentum: 0,
    repeats: {},
    daily: {},
    blessings: [],
    certs: {},
  };
}

export const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, n));

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export const faNum = (n: number) => n.toLocaleString('fa-IR');

export function faDate(ts: number) {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(ts);
  } catch {
    return new Date(ts).toLocaleDateString('fa-IR');
  }
}

export function studentNo(p: Profile) {
  const base = p.createdAt.toString().slice(-6);
  return faNum(Number((p.track === 'kids' ? '2' : '1') + base)).replace(/٬/g, '');
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
