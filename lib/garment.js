'use strict';
// Draws flat-lay garment illustrations as SVG, used as product images until
// real photos are uploaded from the admin panel.

function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function shade(hex, amt) {
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = amt < 0 ? (c) => c * (1 + amt) : (c) => c + (255 - c) * amt;
  return '#' + [r, g, b].map((c) => clamp(f(c)).toString(16).padStart(2, '0')).join('');
}
function lum(hex) {
  const n = parseInt(hex, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

const LONG = 'M140,72 L260,72 L318,94 C336,102 342,116 346,134 L378,404 L334,410 L300,200 L300,440 L100,440 L100,200 L66,410 L22,404 L54,134 C58,116 64,102 82,94 Z';
const TEE = 'M150,70 C170,92 230,92 250,70 L318,92 L372,170 L322,200 L296,166 L298,420 L102,420 L104,166 L78,200 L28,170 L82,92 Z';
const SHIRT = 'M150,66 L250,66 L318,90 C336,98 342,112 346,130 L380,400 L334,408 L300,196 L300,440 L100,440 L100,196 L66,408 L20,400 L54,130 C58,112 64,98 82,90 Z';
const TROUSER = 'M120,40 L280,40 L304,450 L218,450 L200,150 L182,450 L96,450 Z';

const SHAPES = {
  tee: (c) => `
    <path d="${TEE}" fill="${c.base}"/>
    <path d="${TEE}" fill="url(#sh)"/>
    <path d="${TEE}" fill="none" stroke="${c.line}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M150,70 C170,92 230,92 250,70 C232,106 168,106 150,70 Z" fill="${c.dark}"/>
    <path d="M156,74 C174,100 226,100 244,74" fill="none" stroke="${c.line}" stroke-width="2"/>
    <path d="M104,166 L118,96 M296,166 L282,96" stroke="${c.line}" stroke-width="1.4" opacity=".6"/>
    <path d="M104,404 L296,404 M44,178 L86,200 M356,178 L314,200" stroke="${c.line}" stroke-width="1.4" stroke-dasharray="4 4" opacity=".7"/>`,
  polo: (c) => SHAPES.tee(c) + `
    <rect x="191" y="88" width="18" height="74" rx="2" fill="${c.base}" stroke="${c.line}" stroke-width="1.5"/>
    <circle cx="200" cy="112" r="4" fill="${c.btn}"/><circle cx="200" cy="140" r="4" fill="${c.btn}"/>
    <path d="M150,70 L182,122 L200,90 Z" fill="${c.light}" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M250,70 L218,122 L200,90 Z" fill="${c.light}" stroke="${c.line}" stroke-width="1.6" stroke-linejoin="round"/>`,
  shirt: (c) => `
    <path d="${SHIRT}" fill="${c.base}"/>
    <path d="${SHIRT}" fill="url(#sh)"/>
    <path d="${SHIRT}" fill="none" stroke="${c.line}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M200,80 L200,440" stroke="${c.line}" stroke-width="1.6"/>
    <path d="M208,80 L208,440" stroke="${c.line}" stroke-width="1" opacity=".5"/>
    ${[124, 174, 224, 274, 324, 374, 418].map((y) => `<circle cx="204" cy="${y}" r="4" fill="${c.btn}" stroke="${c.line}" stroke-width=".8"/>`).join('')}
    <path d="M222,150 h46 v48 l-23,8 l-23,-8 Z" fill="none" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M24,380 L68,388 M376,380 L332,388" stroke="${c.line}" stroke-width="1.6"/>
    <path d="M150,66 L176,114 L200,80 L224,114 L250,66 L232,56 L200,72 L168,56 Z" fill="${c.light}" stroke="${c.line}" stroke-width="1.8" stroke-linejoin="round"/>`,
  hoodie: (c) => `
    <path d="M140,74 C134,8 266,8 260,74 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="2"/>
    <path d="${LONG}" fill="${c.base}"/>
    <path d="${LONG}" fill="url(#sh)"/>
    <path d="${LONG}" fill="none" stroke="${c.line}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M150,74 C158,30 242,30 250,74 C232,100 168,100 150,74 Z" fill="${c.deep}" stroke="${c.line}" stroke-width="1.6"/>
    <path d="M184,94 L180,172 M216,94 L220,172" stroke="${c.light}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="180" cy="176" r="4" fill="${c.light}"/><circle cx="220" cy="176" r="4" fill="${c.light}"/>
    <path d="M136,300 L264,300 L288,384 L112,384 Z" fill="none" stroke="${c.line}" stroke-width="1.6"/>
    <path d="M100,418 L300,418 M26,384 L70,390 M374,384 L330,390" stroke="${c.line}" stroke-width="1.6"/>
    <path d="M100,426 L300,426 M100,434 L300,434" stroke="${c.line}" stroke-width="1" opacity=".45"/>`,
  jacket: (c) => `
    <path d="${SHIRT}" fill="${c.base}"/>
    <path d="${SHIRT}" fill="url(#sh)"/>
    <path d="${SHIRT}" fill="none" stroke="${c.line}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M150,66 L150,44 C180,36 220,36 250,44 L250,66 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="1.8"/>
    <path d="M200,44 L200,440" stroke="${c.line}" stroke-width="3"/>
    <path d="M200,44 L200,440" stroke="${c.light}" stroke-width="1" stroke-dasharray="2 3"/>
    <rect x="195" y="70" width="10" height="20" rx="2" fill="${c.btn}" stroke="${c.line}"/>
    <path d="M128,140 h52 v40 h-52 Z M220,140 h52 v40 h-52 Z" fill="${c.dark}" opacity=".55" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M128,140 h52 v14 h-52 Z M220,140 h52 v14 h-52 Z" fill="${c.base}" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M122,300 L172,290 M278,300 L228,290" stroke="${c.line}" stroke-width="2"/>
    <path d="M24,380 L68,388 M376,380 L332,388 M100,420 L300,420" stroke="${c.line}" stroke-width="1.6"/>`,
  trouser: (c) => `
    <path d="${TROUSER}" fill="${c.base}"/>
    <path d="${TROUSER}" fill="url(#sh)"/>
    <path d="${TROUSER}" fill="none" stroke="${c.line}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M120,40 L280,40 L281,64 L119,64 Z" fill="${c.dark}" stroke="${c.line}" stroke-width="1.6"/>
    ${[136, 176, 224, 264].map((x) => `<rect x="${x}" y="36" width="7" height="32" rx="2" fill="${c.base}" stroke="${c.line}" stroke-width="1.2"/>`).join('')}
    <path d="M200,64 L200,150 M200,64 C216,92 216,130 204,148" fill="none" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M126,66 C138,96 150,104 164,108 M274,66 C262,96 250,104 236,108" fill="none" stroke="${c.line}" stroke-width="1.5"/>
    <path d="M152,72 L142,446 M248,72 L258,446" stroke="${c.light}" stroke-width="1.4" opacity=".7"/>
    <path d="M98,434 L182,434 M218,434 L302,434" stroke="${c.line}" stroke-width="1.3" stroke-dasharray="4 4" opacity=".7"/>`,
};

function garmentSVG(type, hex) {
  if (!SHAPES[type] || !/^[0-9a-f]{6}$/i.test(hex)) return null;
  const isLight = lum(hex) > 0.72;
  const c = {
    base: '#' + hex,
    line: shade(hex, isLight ? -0.32 : -0.45),
    dark: shade(hex, -0.18),
    deep: shade(hex, -0.42),
    light: shade(hex, isLight ? -0.06 : 0.12),
    btn: isLight ? shade(hex, -0.25) : shade(hex, 0.55),
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480">
  <defs><linearGradient id="sh" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    <stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient></defs>
  <ellipse cx="200" cy="462" rx="150" ry="10" fill="#000" opacity=".07"/>
  ${SHAPES[type](c)}
</svg>`;
}

module.exports = { garmentSVG, GARMENT_TYPES: Object.keys(SHAPES) };
