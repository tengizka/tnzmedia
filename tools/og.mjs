// Генерация og.png из тех же данных, что и сайт: `node tools/og.mjs`.
// Нужен ImageMagick (convert). Нет — положи свой 1200×630 в public/og.png, сборка его подхватит.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const site = JSON.parse(readFileSync(join(ROOT, 'src/data/site.json'), 'utf8'));
const projects = JSON.parse(readFileSync(join(ROOT, 'src/data/projects.json'), 'utf8')).filter((p) => p.published !== false);
const OUT = join(ROOT, 'public', 'og.png');

try { execFileSync('convert', ['-version'], { stdio: 'ignore' }); }
catch { console.log('! convert (ImageMagick) не найден — og.png не перегенерирован'); process.exit(0); }

const W = 1200;
const H = 630;
const PAD = 96;
const ink = '#0f0e12';
const paper = '#f1eee8';
const accent = '#bda9f0';
const muted = '#9c96ab';
const MAXW = W - PAD * 2 - 130;
const clean = (s) => String(s).replace(/'/g, '’').replace(/[<>]/g, '');
const IM = (args) => execFileSync('convert', args, { encoding: 'utf8' }).trim();

/** ширина текста в px при данном кегле — чтобы строка физически влезала в карточку */
function textWidth(text, size, font) {
  // label: + -trim даёт точную ширину отрисованной строки (проверено на IM6)
  const out = IM(['-font', font, '-pointsize', String(size), '-background', 'none', `label:${clean(text)}`, '-trim', '-format', '%w', 'info:']);
  return Number(out.split('\n').pop()) || 0;
}
function fit(text, sizes, font) {
  for (const s of sizes) if (textWidth(text, s, font) <= MAXW) return s;
  return sizes[sizes.length - 1];
}

/* фон-карточка + большой акцентный круг, срезанный углом, тонкое кольцо, метка сверху */
const shapes = [
  `fill '${ink}' stroke none`,
  `rectangle 0,0 ${W},${H}`,
  `fill '#1b1530' stroke none`,
  `circle ${W - 60},${H - 40} ${W - 60 - 270},${H - 40}`,
  `fill '${accent}' stroke none`,
  `circle ${W - PAD - 6},92 ${W - PAD - 6 + 13},92`,
  `fill none stroke '${accent}' stroke-width 2`,
  `circle -150,120 40,120`,
  `fill '${paper}' stroke none opacity 0.9`,
  `roundrectangle ${PAD},84 ${PAD + 86},100 8,8`,
].join(' ; ');

const BOLD = 'DejaVu-Sans-Bold';
const REG = 'DejaVu-Sans';
const leadLines = wrap(site.hero.lead, 30).slice(0, 3);
const leadSize = Math.min(...leadLines.map((l) => fit(l, [76, 70, 64, 58, 52, 46], BOLD)));
const leadGap = Math.round(leadSize * 1.16);
const leadTop = H - 100 - leadLines.length * leadGap - 118;

const stack = [
  { text: `${site.brand.toUpperCase()}   ·   ПОРТФОЛИО`, x: PAD, y: 148, size: 21, fill: muted, font: REG },
  ...leadLines.map((t, i) => ({ text: t, x: PAD - 4, y: leadTop + i * leadGap, size: leadSize, fill: paper, font: BOLD })),
  { text: `${projects.length} кейсов · дизайн, брендинг, сайты, mini apps`, x: PAD, y: H - 148, size: 25, fill: muted, font: REG },
  { text: `${site.contacts.telegramHandle}`, x: PAD, y: H - 98, size: 27, fill: accent, font: BOLD },
];

const args = ['-size', `${W}x${H}`, 'xc:white', '-draw', shapes];
for (const l of stack) {
  args.push('-font', l.font, '-pointsize', String(l.size), '-fill', l.fill, '-annotate', `+${l.x}+${l.y}`, clean(l.text));
}
args.push('-depth', '8', OUT);
IM(args);

console.log(`✓ public/og.png ${W}×${H} · кегл строки ${leadSize} · строк ${leadLines.length}${existsSync(OUT) ? '' : ' (!) не создан'}`);

function wrap(text, max) {
  const out = [];
  let cur = '';
  for (const w of String(text).split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur ? cur + ' ' : '') + w;
  }
  if (cur) out.push(cur);
  return out;
}
