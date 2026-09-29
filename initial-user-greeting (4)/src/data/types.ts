// شناسهٔ فایل‌های منبع در مخزن github.com/midiovfxy-svg2/nasr
export type Src = string;

export const SOURCES: Record<Src, string> = {
  w: '0-فزکانس.docx',
  q: '00-«قانون فرکانس».docx',
  b3: '01-3 باور.docx',
  ez: '03-توضیحات.docx',
  h: '1-باورها و عمل هاي سوره حمد را بررسي ميكنيم.docx',
  hd: 'هدف.docx',
  k1: 'کوتاه-1.docx',
  k2: 'کوتاه-2.docx',
  k3: 'کوتاه-3.docx',
  s3: '3-کوتاه.docx',
  j10: '04-باور.docx',
  j11: '03-اور.docx',
  j12: '02-باور.docx',
  bl: '01-باور.docx',
};

export interface Quote {
  t: string;
  s: Src;
  ar?: boolean;
}

export type Question =
  | { kind: 'choice'; stem: string; options: string[]; answer: number; full: string; s: Src }
  | { kind: 'sort'; bins: [string, string]; items: { t: string; b: 0 | 1; e?: string }[]; full: string; s: Src }
  | { kind: 'order'; items: string[]; full: string; s: Src }
  | { kind: 'match'; pairs: [string, string][]; full: string; s: Src };

export interface Traveler {
  id: string;
  name: string;
  avatar: string;
  obstacleTitle: string;
  obstacleSrc: Src;
  obstacle: Quote[];
  whisper: Quote[];
  call: Quote[];
  beliefs: { t: string; ok?: boolean }[];
  beliefSrc: Src;
  remedy: Quote[];
  result: Quote[];
}

export type Activity = 'blessings' | 'daily' | 'repeat';

export interface Lesson {
  id: string;
  icon: string;
  title: string;
  published?: boolean;
  titleSrc: Src;
  texts: Quote[];
  quiz: Question[];
  traveler?: Traveler;
  activity?: Activity;
}

export interface Degree {
  id: string;
  name: string;
  icon?: string;
  published?: boolean;
  rank: string;
  rankLine: string;
  color: 'emerald' | 'sky' | 'amber';
  gradQuote: Quote;
  lessons: Lesson[];
}

export type Track = 'adult' | 'kids';
