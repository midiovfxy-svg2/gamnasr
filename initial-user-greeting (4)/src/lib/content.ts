import { z } from 'zod';
import { ADULT } from '../data/adult';
import { KIDS } from '../data/kids';
import * as library from '../data/library';
import { SOURCES, type Degree } from '../data/types';
import { DEFAULT_VOICES } from './voices';

export interface MediaAsset {
  id: string;
  name: string;
  type: 'audio' | 'image';
  url: string;
  fallback?: string;
  blobId?: string;
  size: number;
  mime: string;
  enabled: boolean;
  createdAt: number;
}

export interface SiteSettings {
  title: string;
  shortTitle: string;
  teacher: string;
  subtitle: string;
  logo: string;
  accent: string;
  background: string;
  backgroundImage: string;
  fontSize: number;
  roundness: number;
  motion: boolean;
  registration: boolean;
  contactEnabled: boolean;
  contactTitle: string;
  contactIntro: string;
  contactEmail: string;
  contactPhone: string;
  footer: string;
  adultPassRate: number;
  labels: Record<string, string>;
  icons: Record<string, string>;
}

export interface SiteContent {
  version: 2;
  updatedAt: number;
  settings: SiteSettings;
  adult: Degree[];
  kids: Degree[];
  library: { -readonly [K in keyof typeof library]: (typeof library)[K] };
  sources: Record<string, string>;
  media: MediaAsset[];
  voiceAssignments: Record<string, string[]>;
}

export const defaultContent: SiteContent = {
  version: 2,
  updatedAt: 0,
  settings: {
    title: 'دانشگاه تاثیر قرآن بر زندگی',
    shortTitle: 'دانشگاه نصرالله',
    teacher: 'استاد حاج نصرالله باستین',
    subtitle: 'قسمتی از کلاس های تاثیر قرآن بر زندگی',
    logo: 'icon:book-open',
    accent: '#dfbd69',
    background: '#0a0f24',
    backgroundImage: '',
    fontSize: 16,
    roundness: 16,
    motion: true,
    registration: true,
    contactEnabled: true,
    contactTitle: 'ارتباط با ما',
    contactIntro: 'پرسش، پیشنهاد یا تجربه‌تان را برای ما بفرستید. پاسخ مدیریت را در همین بخش خواهید دید.',
    contactEmail: '',
    contactPhone: '',
    footer: 'منبع مطالب آموزشی: مخزن عمومی nasr. ویرایش‌های مدیر در تاریخچهٔ محتوا نگهداری می‌شوند.',
    adultPassRate: 60,
    labels: {
      map: 'مسیر تکامل', travelers: 'رهروان', practice: 'تمرین', certs: 'مدارک',
      account: 'حساب من', admin: 'پنل مدیریت', library: 'کتابخانه باورها',
      registration: 'ثبت‌نام دانشجوی جدید', start: 'ثبت‌نام و ورود به دانشگاه',
      children: 'کودکان', adults: 'بزرگسالان',
    },
    icons: {
      map: 'icon:orbit', travelers: 'icon:user', practice: 'icon:hand-heart', certs: 'icon:graduation',
      account: 'icon:user', children: 'icon:flower', adults: 'icon:user',
      locked: 'icon:lock', complete: 'icon:sparkles', light: 'icon:sun',
    },
  },
  adult: structuredClone(ADULT),
  kids: structuredClone(KIDS),
  library: structuredClone({ ...library }),
  sources: { ...SOURCES },
  media: DEFAULT_VOICES.map(v => ({ id: v.id, name: v.name, type: 'audio', url: v.url || '', fallback: v.fallback, size: 0, mime: 'audio/ogg', enabled: true, createdAt: 0 })),
  voiceAssignments: { home: ['repo-1', 'repo-2'] },
};

const str = z.string().max(100000);
const quote = z.object({ t: str, s: z.string().min(1), ar: z.boolean().optional() });
const question = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('choice'), stem: str, options: z.array(str).min(2), answer: z.number().int().nonnegative(), full: str, s: str }).refine(q => q.answer < q.options.length, 'گزینهٔ پاسخ درست معتبر نیست.'),
  z.object({ kind: z.literal('order'), items: z.array(str).min(2), full: str, s: str }),
  z.object({ kind: z.literal('match'), pairs: z.array(z.tuple([str, str])).min(2), full: str, s: str }),
  z.object({ kind: z.literal('sort'), bins: z.tuple([str, str]), items: z.array(z.object({ t: str, b: z.union([z.literal(0), z.literal(1)]), e: str.optional() })).min(2), full: str, s: str }),
]);
const traveler = z.object({
  id: str, name: str.min(1), avatar: str, obstacleTitle: str, obstacleSrc: str,
  obstacle: z.array(quote), whisper: z.array(quote).min(1), call: z.array(quote).min(1),
  beliefs: z.array(z.object({ t: str, ok: z.boolean().optional() })).min(2).refine(b => b.filter(x => x.ok).length === 1, 'رهرو باید دقیقاً یک باور درست داشته باشد.'),
  beliefSrc: str, remedy: z.array(quote), result: z.array(quote),
});
const lesson = z.object({
  id: str.min(1), title: str.min(1), icon: str, titleSrc: str,
  texts: z.array(quote), quiz: z.array(question), traveler: traveler.optional(),
  activity: z.enum(['blessings', 'daily', 'repeat']).optional(), published: z.boolean().optional(),
}).refine(l => l.published === false || (l.texts.length > 0 && l.quiz.length > 0 && l.texts.every(q => q.t.trim()) && l.quiz.every(q => {
  if (!q.full.trim()) return false;
  if (q.kind === 'choice') return q.stem.trim() && q.options.every(o => o.trim());
  if (q.kind === 'order') return q.items.every(o => o.trim());
  if (q.kind === 'match') return q.pairs.every(pair => pair.every(o => o.trim()));
  return q.bins.every(o => o.trim()) && q.items.every(o => o.t.trim());
})), 'برای انتشار، متن درس، صورت پرسش‌ها، گزینه‌ها و پاسخ کامل نباید خالی باشند.');
const degree = z.object({
  id: str.min(1), name: str.min(1), rank: str, rankLine: str,
  icon: str.optional(),
  color: z.enum(['emerald', 'sky', 'amber']), gradQuote: quote,
  lessons: z.array(lesson), published: z.boolean().optional(),
});

export const contentSchema = z.object({
  version: z.literal(2), updatedAt: z.number(),
  settings: z.object({
    title: str.min(1), shortTitle: str.min(1), teacher: str, subtitle: str, logo: str,
    accent: z.string().regex(/^#[\da-fA-F]{6}$/), background: z.string().regex(/^#[\da-fA-F]{6}$/),
    backgroundImage: str, fontSize: z.number().min(14).max(22), roundness: z.number().min(0).max(32),
    motion: z.boolean(), registration: z.boolean(), contactEnabled: z.boolean(),
    contactTitle: str, contactIntro: str, contactEmail: str, contactPhone: str, footer: str,
    adultPassRate: z.number().min(0).max(100), labels: z.record(z.string(), str),
    icons: z.record(z.string(), str).default(defaultContent.settings.icons),
  }),
  adult: z.array(degree), kids: z.array(degree),
  library: z.object({
    MAHJOOR: z.array(quote), NOOR: quote, SURRENDER: quote, FALL: quote, REPENT: quote,
    REPENT_LABEL: str, NO_GUILT: quote, LOCKED: quote, HIGHER: quote, TWO_VOICES: quote,
    MOMENTUM_Q: quote, FEELING_Q: quote, EVOLUTION_Q: quote, FINAL_Q: quote, BISMILLAH: quote,
    REPEAT_Q: quote, REF_BELIEFS: z.array(quote).min(1), DAILY_HEAD: quote,
    DAILY_ITEMS: z.array(z.object({ id: str, t: str, e: str })).min(1), DAILY_FOOT: quote,
    SMALL_STEPS: quote, BLESSING_INTRO: quote, BLESSING_MAN_INTRO: quote, BLESSING_END: quote,
    THANKS_WORD: str, THANK_EACH: quote,
    BLESSINGS_NATURE: z.array(z.object({ t: str, e: str })),
    BLESSINGS_MAN: z.array(z.object({ t: str, e: str })), CLASS_INFO: z.array(str),
    BELIEF_LISTS: z.array(z.object({ title: str, s: str, items: z.array(str) })),
  }),
  sources: z.record(z.string(), str),
  media: z.array(z.object({ id: str, name: str, type: z.enum(['audio', 'image']), url: str, fallback: str.optional(), blobId: str.optional(), size: z.number(), mime: str, enabled: z.boolean(), createdAt: z.number() })),
  voiceAssignments: z.record(z.string(), z.array(str)),
}).superRefine((c, ctx) => {
  const ids = [...c.adult, ...c.kids].flatMap(d => [d.id, ...d.lessons.map(l => l.id)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'شناسهٔ مقاطع و درس‌ها نباید تکراری باشد.' });
  if (new Set(c.media.map(m => m.id)).size !== c.media.length) ctx.addIssue({ code: 'custom', message: 'شناسهٔ رسانه‌ها نباید تکراری باشد.' });
  for (const name of ['map', 'travelers', 'practice', 'certs', 'account', 'admin', 'library', 'registration', 'start', 'children', 'adults']) {
    if (!c.settings.labels[name]?.trim()) ctx.addIssue({ code: 'custom', message: `عنوان رابط «${name}» نباید حذف یا خالی شود.` });
  }
  for (const m of c.media) {
    if (!m.blobId && !/^(https?:\/\/|\/api\/media\/)/.test(m.url)) ctx.addIssue({ code: 'custom', message: `آدرس رسانهٔ «${m.name}» معتبر نیست.` });
  }
  const sourceFields = new Set(['s', 'titleSrc', 'obstacleSrc', 'beliefSrc']);
  const inspectSources = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(inspectSources); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (sourceFields.has(key) && typeof item === 'string' && !Object.prototype.hasOwnProperty.call(c.sources, item)) {
        ctx.addIssue({ code: 'custom', message: `منبع «${item}» در فهرست منابع وجود ندارد. ابتدا آن را اضافه کنید.` });
      } else inspectSources(item);
    }
  };
  inspectSources([c.adult, c.kids, c.library]);
});

export function validateContent(value: unknown): SiteContent {
  const result = contentSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`محتوا ذخیره نشد: ${issue.message} (${issue.path.join(' / ')})`);
  }
  return result.data as SiteContent;
}

export function publishedDegrees(degrees: Degree[]) {
  return degrees.filter(d => d.published !== false).map(d => ({ ...d, lessons: d.lessons.filter(l => l.published !== false) })).filter(d => d.lessons.length);
}

export const uid = () => crypto.randomUUID();

export const fieldNames: Record<string, string> = {
  id: 'شناسه', title: 'عنوان', name: 'نام', t: 'متن اصلی', s: 'شناسهٔ منبع', ar: 'متن عربی',
  e: 'نماد یا تصویر', icon: 'نماد یا تصویر', avatar: 'تصویر شخصیت', rank: 'مرتبه', rankLine: 'عنوان مرتبه',
  texts: 'متن‌های درس', quiz: 'پرسش‌ها', kind: 'نوع پرسش', stem: 'صورت پرسش', options: 'گزینه‌ها',
  answer: 'شمارهٔ گزینهٔ درست (از صفر)', full: 'متن کامل پاسخ', items: 'موارد', pairs: 'جفت‌ها', bins: 'دسته‌ها',
  b: 'دستهٔ درست (صفر یا یک)', ok: 'باور درست', gradQuote: 'متن مدرک', obstacle: 'متن مانع',
  obstacleTitle: 'عنوان مانع ذهنی', obstacleSrc: 'منبع مانع', whisper: 'متن نجوا', call: 'متن ندای امیدبخش',
  beliefs: 'باورهای قابل انتخاب', beliefSrc: 'منبع باورها', remedy: 'متن راهکار', result: 'متن نتیجه',
  MAHJOOR: 'متن آغاز صفحهٔ اصلی', NOOR: 'متن بالای نقشه', SURRENDER: 'متن تسلیم', FALL: 'متن بازگشت به مدار پایین',
  REPENT: 'متن توبه', REPENT_LABEL: 'عنوان دکمهٔ توبه', NO_GUILT: 'پیام تلاش دوباره', LOCKED: 'پیام مرحلهٔ قفل‌شده',
  HIGHER: 'پیام مدار بالاتر', TWO_VOICES: 'متن دو صدا', MOMENTUM_Q: 'راهنمای مومنتوم', FEELING_Q: 'راهنمای احساس',
  EVOLUTION_Q: 'متن تکامل', FINAL_Q: 'متن پایانی', BISMILLAH: 'متن آغاز مدرک', REPEAT_Q: 'راهنمای تکرار باور',
  REF_BELIEFS: 'باورهای مرجع', DAILY_HEAD: 'عنوان برنامهٔ روزانه', DAILY_ITEMS: 'فعالیت‌های روزانه',
  DAILY_FOOT: 'پایان برنامهٔ روزانه', SMALL_STEPS: 'متن گام‌های کوچک', BLESSING_INTRO: 'مقدمهٔ نعمت‌های طبیعت',
  BLESSING_MAN_INTRO: 'مقدمهٔ نعمت‌های ساختهٔ انسان', BLESSING_END: 'پایان نعمت‌یاب', THANKS_WORD: 'متن شکر',
  THANK_EACH: 'راهنمای شکرگزاری', BLESSINGS_NATURE: 'نعمت‌های طبیعت و شکل‌ها', BLESSINGS_MAN: 'نعمت‌های ساختهٔ انسان و شکل‌ها',
  CLASS_INFO: 'مشخصات کلاس', BELIEF_LISTS: 'فهرست باورها',
};