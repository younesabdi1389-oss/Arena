// ذرات نورانی ملایم پشت رابط (فقط تزئین). با «کاهش جلوه‌ها» یا حین نبرد متوقف می‌شود.
const canvas = document.getElementById('fx-bg');
const ctx = canvas?.getContext('2d');
let parts = [];
let raf = 0;
let on = false;

function resize() {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  parts = Array.from({ length: innerWidth < 500 ? 26 : 50 }, () => spawn(true));
}
function spawn(anywhere) {
  return { x: Math.random() * innerWidth, y: anywhere ? Math.random() * innerHeight : innerHeight + 10, r: 1 + Math.random() * 2.6, v: 8 + Math.random() * 22, a: 0.2 + Math.random() * 0.5, ph: Math.random() * 6 };
}
let last = 0;
function frame(ts) {
  if (!on) return;
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.y -= p.v * dt;
    p.x += Math.sin(ts / 900 + p.ph) * 6 * dt;
    if (p.y < -10) parts[i] = spawn(false);
    ctx.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(ts / 500 + p.ph));
    ctx.fillStyle = i % 3 ? '#8fd8ff' : '#ffd95a';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, 7);
    ctx.fill();
  }
  raf = requestAnimationFrame(frame);
}

let wanted = false; // آنچه رابط می‌خواهد
let held = true; // تا پایان لودینگ فیلم، حلقه‌ی ذرات اجرا نمی‌شود (زیر فیلم دیده نمی‌شود و فقط CPU می‌خورد)

function sync() {
  if (!canvas) return;
  const run = wanted && !held;
  if (run && !on) {
    on = true;
    resize();
    raf = requestAnimationFrame(frame);
  } else if (!run && on) {
    on = false;
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

export function setAmbient(enabled) {
  wanted = enabled;
  sync();
}

/** بعد از پایان لودینگ فیلم صدا بزنید. */
export function releaseAmbient() {
  held = false;
  sync();
}
addEventListener('resize', () => on && resize());
