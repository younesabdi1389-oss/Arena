// فهرست دارایی‌های گرافیکی/صوتی. در مرحله‌ی ۱ هیچ فایل تصویری یا صوتی آماده‌ای وجود ندارد؛
// همه چیز با placeholder رسم می‌شود (آیکون اموجی + اشکال Canvas).
//
// جایگزینی دارایی: فایل را زیر public/assets/ بگذارید و مسیرش را اینجا ثبت کنید، مثلاً
//   MANIFEST.card.knight = '/assets/cards/knight.png';
// رندرر و کارت‌ها به‌صورت خودکار از آن استفاده می‌کنند.
//
// ⚠️ مسیرهای ثبت‌شده باید واقعاً وجود داشته باشند؛ مسیر ناموجود را ثبت نکنید.
export const MANIFEST = {
  card: {}, // id کارت → تصویر کارت
  unit: {}, // id کارت → اسپرایت واحد روی میدان
  tower: {}, // 'princess' | 'king' → اسپرایت برج
  arena: {}, // id آرنا → تصویر زمین
  sfx: {},
  music: {},
};

export function assetUrl(kind, id) {
  return MANIFEST[kind]?.[id] ?? null;
}
