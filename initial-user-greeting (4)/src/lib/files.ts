const DB_NAME = 'nasr-admin-assets-v2';

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error('فضای ذخیره‌سازی فایل در این مرورگر در دسترس نیست.'));
  });
}

export async function storeFile(id: string, file: Blob) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(file, id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(new Error('فایل ذخیره نشد؛ فضای مرورگر را بررسی کنید.')); };
  });
}

export async function getFile(id: string) {
  const db = await database();
  return new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const r = tx.objectStore('files').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}

export async function removeFile(id: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function downloadJSON(value: unknown, name: string) {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), name);
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/aac', 'audio/flac'];
export const CONTACT_TYPES = [...IMAGE_TYPES, ...AUDIO_TYPES, 'application/pdf', 'text/plain'];

export function validateFile(file: File, kind: 'contact' | 'image' | 'audio') {
  const allowed = kind === 'contact' ? CONTACT_TYPES : kind === 'image' ? IMAGE_TYPES : AUDIO_TYPES;
  if (!allowed.includes(file.type.split(';')[0])) throw new Error('نوع فایل مجاز نیست. از تصویر، PDF، متن ساده یا فایل صوتی پشتیبانی‌شده استفاده کنید.');
  if (!/\.(png|jpe?g|webp|gif|mp3|ogg|opus|wav|m4a|mp4|webm|aac|flac|pdf|txt)$/i.test(file.name.trim())) throw new Error('پسوند فایل مجاز نیست. فایل HTML، SVG یا اجرایی قابل ارسال نیست.');
  if (file.name.length > 200) throw new Error('نام فایل بیش از حد طولانی است؛ آن را کوتاه‌تر کنید.');
  const limit = kind === 'contact' ? 5 : kind === 'image' ? 4 : 20;
  if (!file.size || file.size > limit * 1024 * 1024) throw new Error(`حجم فایل باید بیشتر از صفر و کمتر از ${limit} مگابایت باشد.`);
}

export function normalizePhone(input: string) {
  let value = input.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s()-]/g, '');
  if (value.startsWith('+98')) value = '0' + value.slice(3);
  if (value.startsWith('0098')) value = '0' + value.slice(4);
  return value;
}

export const validPhone = (phone: string) => !phone || /^09\d{9}$/.test(phone) || /^\+[1-9]\d{7,14}$/.test(phone);