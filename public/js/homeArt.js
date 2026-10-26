// تصویرسازی اختصاصی میدان برای صفحه‌ی خانه (SVG برداری، کاملاً اورجینال و بدون فایل خارجی).
// برای جایگزینی با تصویر نهایی: MANIFEST.arena.meadow در assets.js را مقداردهی کنید.
import { assetUrl } from './assets.js';

const tower = (x, y, s, team, king = false) => {
  const body = king ? 22 : 15;
  const h = king ? 30 : 22;
  const c1 = team === 'red' ? '#ff7a85' : '#6db4ff';
  const c2 = team === 'red' ? '#b32535' : '#1b55c9';
  return `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="3" rx="${body + 4}" ry="6" fill="#000" opacity=".3"/>
    <rect x="${-body / 2}" y="${-h}" width="${body}" height="${h}" rx="2" fill="url(#stone)" stroke="#2b2a35" stroke-width="1.2"/>
    ${[-1, 0, 1].map((i) => `<rect x="${i * (body / 3) - 2}" y="${-h - 4}" width="4" height="5" fill="#cfc9bd" stroke="#2b2a35" stroke-width=".8"/>`).join('')}
    <path d="M0 ${-h - 4} V${-h - 16} L${king ? 11 : 9} ${-h - 12} L0 ${-h - 8}Z" fill="${c1}" stroke="${c2}" stroke-width="1"/>
    <line x1="0" y1="${-h - 4}" x2="0" y2="${-h - 17}" stroke="#3a2f22" stroke-width="1.2"/>
    ${king ? `<text x="0" y="${-h / 2 + 4}" font-size="13" text-anchor="middle">👑</text>` : `<rect x="-2.5" y="${-h / 2 - 1}" width="5" height="8" rx="2.5" fill="#2b2a35"/>`}
    <ellipse cx="0" cy="3" rx="${body / 2 + 3}" ry="3.6" fill="none" stroke="${c1}" stroke-width="1.8"/>
  </g>`;
};

const tree = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="2" rx="7" ry="2.5" fill="#000" opacity=".25"/>
    <rect x="-1.2" y="-3" width="2.4" height="5" fill="#6b4423"/>
    <path d="M0 -22 L8 -8 H-8Z" fill="#1f7a3a"/><path d="M0 -17 L10 -2 H-10Z" fill="#2a9a4a"/>
  </g>`;

const bridge = (x) => `
  <g transform="translate(${x} 0)">
    <rect x="-17" y="117" width="34" height="27" rx="3" fill="#000" opacity=".25" transform="translate(2 3)"/>
    <rect x="-17" y="115" width="34" height="27" rx="3" fill="url(#wood)" stroke="#4a2c12" stroke-width="1.5"/>
    ${[0, 1, 2, 3, 4].map((i) => `<line x1="-17" y1="${120 + i * 5}" x2="17" y2="${120 + i * 5}" stroke="#5b3a1f" stroke-width=".9"/>`).join('')}
    <circle cx="-17" cy="116" r="2.6" fill="#ffd34d"/><circle cx="17" cy="116" r="2.6" fill="#ffd34d"/>
    <circle cx="-17" cy="141" r="2.6" fill="#ffd34d"/><circle cx="17" cy="141" r="2.6" fill="#ffd34d"/>
  </g>`;

export function renderArenaArt(container) {
  const custom = assetUrl('arena', 'meadow');
  if (custom) {
    container.innerHTML = `<img src="${custom}" alt="" draggable="false" style="width:100%;height:100%;object-fit:contain">`;
    return;
  }
  container.innerHTML = `
<svg viewBox="0 0 300 250" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fc25c"/><stop offset="1" stop-color="#3a9a47"/></linearGradient>
    <linearGradient id="side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4a2a"/><stop offset="1" stop-color="#3b2314"/></linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fd3ff"/><stop offset="1" stop-color="#2c86d8"/></linearGradient>
    <linearGradient id="stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e6e0d2"/><stop offset=".55" stop-color="#bdb6a6"/><stop offset="1" stop-color="#8a8475"/></linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d2a068"/><stop offset="1" stop-color="#9a6a3a"/></linearGradient>
    <radialGradient id="rim" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#ffd34d" stop-opacity="0"/><stop offset="1" stop-color="#ffd34d" stop-opacity=".9"/></radialGradient>
  </defs>
  <!-- پایه‌ی شناور -->
  <ellipse cx="150" cy="232" rx="100" ry="12" fill="#000" opacity=".35"/>
  <path d="M30 188 L270 188 L262 214 Q150 244 38 214Z" fill="url(#side)" stroke="#1d1008" stroke-width="2"/>
  <path d="M30 188 L270 188 L268 196 L32 196Z" fill="#a8723f" opacity=".7"/>
  <!-- زمین -->
  <path d="M70 66 L230 66 L270 190 L30 190Z" fill="url(#grass)" stroke="#1d4d26" stroke-width="2.5" stroke-linejoin="round"/>
  ${Array.from({ length: 7 }, (_, i) => `<path d="M${70 - i * 6.6} ${66 + i * 17.6} L${230 + i * 6.6} ${66 + i * 17.6}" stroke="#ffffff" stroke-opacity=".07" stroke-width="9"/>`).join('')}
  <!-- مسیر خاکی -->
  <path d="M78 70 L100 70 L110 190 L82 190Z M200 70 L222 70 L218 190 L190 190Z" fill="#d9b878" opacity=".5"/>
  <!-- رودخانه -->
  <path d="M51 114 L249 114 L254 144 L46 144Z" fill="url(#water)" stroke="#1f5fa0" stroke-width="1.5"/>
  <path d="M70 124 q8 -4 16 0 t16 0 M150 134 q8 -4 16 0 t16 0 M210 122 q8 -4 16 0" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>
  ${bridge(96)}${bridge(204)}
  <!-- درخت‌ها -->
  ${tree(52, 168, 0.9)}${tree(258, 90, 0.8)}${tree(60, 88, 0.7)}${tree(252, 170, 1)}${tree(150, 108, 0.6)}
  <!-- برج‌ها: بالا قرمز، پایین آبی -->
  ${tower(98, 96, 0.9, 'red')}${tower(202, 96, 0.9, 'red')}${tower(150, 82, 0.85, 'red', true)}
  ${tower(92, 178, 1.05, 'blue')}${tower(208, 178, 1.05, 'blue')}${tower(150, 186, 1.2, 'blue', true)}
  <!-- چراغ‌های تزئینی لبه -->
  ${Array.from({ length: 12 }, (_, i) => `<circle cx="${34 + i * 21.5}" cy="${194 + Math.sin(i / 1.4) * 2}" r="2.4" fill="#ffe27a"><animate attributeName="opacity" values="1;.4;1" dur="${2 + (i % 4) * 0.4}s" repeatCount="indefinite"/></circle>`).join('')}
</svg>`;
}
