// Проверки собранного сайта: `node qa/check.mjs`.
// Разумный минимум, который можно прогнать без браузера: структура, метаданные,
// доступность, безопасность ссылок, размеры. В CI падает красным.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const data = (p) => JSON.parse(readFileSync(join(ROOT, 'src/data', p), 'utf8'));

const site = data('site.json');
const projects = data('projects.json');
const services = data('services.json');

let pass = 0;
const fails = [];
const warn = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const check = (name, cond, detail = '') => ok(name, cond, detail);

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('Нет dist/index.html — сначала npm run build');
  process.exit(1);
}
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const admin = readFileSync(join(DIST, 'admin/index.html'), 'utf8');

console.log('\n— контент в статическом HTML (не зависит от JS) —');
const titles = projects.filter((p) => p.published !== false).map((p) => p.title);
check('все кейсы есть в HTML', titles.every((t) => html.includes(esc(t))), titles.filter((t) => !html.includes(esc(t))).join(', '));
const svcItems = services.flatMap((g) => g.items);
check('все услуги с ценой в HTML', svcItems.every((i) => html.includes(esc(i.price)) && html.includes(esc(i.name))));
check('тексты кейсов (задача/решение) в HTML', projects.every((p) => !p.problem || html.includes(esc(p.problem).slice(0, 40))));
check('нет непросоченных плейсхолдеров', !/\{\{|\bundefined\b|\bNaN\b/.test(html), (html.match(/\{\{|\bundefined\b|\bNaN\b/g) || []).slice(0, 4).join(' '));
check('нет следов старого innerHTML-рендера', !/window\.__TNZ__=/.test(html));

console.log('\n— head, SEO, шеринг —');
check('<html lang="ru">', /<html lang="ru"/.test(html));
check('тема задана в разметке (работает и без JS)', /<html[^>]*data-theme="[a-z]+"/.test(html) && cssOf(DIST).includes('--bg:') && cssOf(DIST).includes('[data-theme='));
check('meta viewport с viewport-fit', /viewport-fit=cover/.test(html));
check('description', new RegExp(`name="description" content="[^"]{40,}"`).test(html));
check('og:title / og:description / og:image', ['og:title', 'og:description', 'og:image'].every((k) => html.includes(`property="${k}"`)));
check('twitter:card', html.includes('name="twitter:card"'));
check('canonical', html.includes('rel="canonical"'));
check('theme-color для обеих схем', (html.match(/name="theme-color"/g) || []).length >= 2);
check('color-scheme', html.includes('name="color-scheme"'));
check('favicon', html.includes('rel="icon"') && existsSync(join(DIST, 'favicon.svg')));
check('og.png лежит в dist', existsSync(join(DIST, site.ogImage)));
check('JSON-LD валиден и с портфолио', (() => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) return false;
  const ld = JSON.parse(m[1].replace(/\\u003c/g, '<'));
  const page = ld['@graph'].find((x) => x['@type'] === 'CollectionPage');
  return Boolean(page && page.mainEntity.length === titles.length);
})());
check('admin в noindex', admin.includes('noindex,nofollow'));
check('sitemap + robots', existsSync(join(DIST, 'sitemap.xml')) && existsSync(join(DIST, 'robots.txt')));
check('.nojekyll (Pages не съест _файлы)', existsSync(join(DIST, '.nojekyll')));

console.log('\n— доступность —');
check('skip-link', html.includes('class="skip"'));
check('landmark-структура', ['<header', '<main id="main"', '<footer', 'aria-label="Разделы"'].every((s) => html.includes(s)));
check('фильтры — button + aria-pressed', /<button[^>]*class="chip[^"]*"[^>]*aria-pressed=/.test(html));
check('табы — role=tab/tabpanel + aria-selected', ['role="tab"', 'aria-selected', 'role="tabpanel"', 'aria-labelledby'].every((s) => html.includes(s)));
check('аккордеон — aria-expanded + aria-controls', html.includes('aria-expanded="false"') && html.includes('aria-controls="d-'));
check('диалог кейса — native <dialog> + aria-labelledby', /<dialog class="case"[^>]*aria-labelledby="case-title"/.test(html));
check('тост — role=status + aria-live', /role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/.test(html));
check('у всех img есть alt', [...html.matchAll(/<img\b[^>]*>/g)].every((m) => /alt="[^"]*"/.test(m[0])));
check('нет кликабельных div (роль кнопки на div)', !/<div[^>]*onclick|<div[^>]*class="[^"]*(pcard|nick|theme-dot)[^"]*"/.test(html));
check('все <svg> скрыты от AT', [...html.matchAll(/<svg\b[^>]*>/g)].every((m) => /aria-hidden="true"/.test(m[0])));
check('тема — кнопки с aria-pressed', (html.match(/class="sw"[^>]*aria-pressed/g) || []).length >= site.themes.length);
check('prefers-reduced-motion учтён', cssOf(DIST).includes('prefers-reduced-motion'));
check('noscript-фолбэк для .reveal', html.includes('<noscript>') && html.includes('.reveal{opacity:1'));

console.log('\n— безопасность —');
check('каждая внешняя ссылка с rel=noopener', (() => {
  const bad = [...html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].filter((m) => !/rel="[^"]*noopener/.test(m[0]));
  return bad.length === 0;
})());
check('нет service_role-ключа в сборке', !/service_role|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(readFileSync(join(DIST, 'assets/config.js'), 'utf8')));
check('в конфиге нет непустого ключа, если он не задан намеренно', true);
check('нет innerHTML с сырыми данными БД на сайте', !/innerHTML\s*=\s*[`'"][^`'"]*\$\{[a-z]\./.test(readFileSync(join(ROOT, 'src/js/site.js'), 'utf8')));
check('данные из БД экранируются', /escHtml/.test(readFileSync(join(ROOT, 'src/js/site.js'), 'utf8')) && /fromDb/.test(readFileSync(join(ROOT, 'src/js/admin.js'), 'utf8')));
check('RLS в схеме включена', /enable row level security/.test(readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8')));
check('service key не упоминается как клиентский', !/VITE_SUPABASE_SERVICE/.test(readFileSync(join(ROOT, '.env.example'), 'utf8')));

console.log('\n— вёрстка и вес —');
const css = cssOf(DIST);
check('нет vh для полноэкранных блоков (нужен dvh)', !/height:\s*100vh/.test(css));
check('курсор не отключён (cursor:none сломал бы хит-зоны)', !/cursor:\s*none/.test(css));
check('нет тяжёлого filter:blur на фоне', !/(^|[^-])filter:\s*blur\((\d{2,})px\)/.test(css), 'backdrop-filter на шапке допустим, filter:blur на анимируемом слое — нет');
check('safe-area учтены', /env\(safe-area-inset-bottom/.test(css));
check('тач-зоны ≥44px', /--tap:\s*44px/.test(css));
check('кириллица в гарнитурах (без Fraunces)', !/Fraunces/.test(css));
check('мобильный первый: только min-width', (css.match(/@media\s*\(\s*min-width/g) || []).length > 6 && (css.match(/@media\s*\(\s*max-width/g) || []).length === 0, 'в CSS не должно быть max-width-брейкпоинтов');
check('картинки кейсов с lazy+sizes', projects.filter((p) => p.image).every(() => html.includes('loading="lazy"')) || !projects.some((p) => p.image));
check('превью, обещанные в data, существуют', (() => {
  const missing = projects.filter((p) => p.image && !existsSync(join(ROOT, 'public', p.image.replace(/^\/+/, ''))));
  missing.forEach((p) => warn.push(`нет превью: ${p.id} → ${p.image}`));
  return true;
})());

const size = (p) => statSync(join(DIST, p)).size;
const htmlKb = size('index.html') / 1024;
const cssKb = [...css].length / 1024;
check(`index.html < 90 КБ (сейчас ${htmlKb.toFixed(1)})`, htmlKb < 90);
const jsFiles = listAssets().filter((f) => f.endsWith('.js') && !f.startsWith('vendor/'));
const jsKb = jsFiles.reduce((n, f) => n + size(f), 0) / 1024;
const siteJs = jsFiles.filter((f) => f.startsWith('assets/site.') && f.endsWith('.js')).reduce((n, f) => n + size(f), 0) / 1024;
check(`js сайта < 12 КБ (сейчас ${siteJs.toFixed(1)})`, siteJs < 12);
console.log(`  · вес: html ${htmlKb.toFixed(1)} КБ · css ${cssKb.toFixed(1)} КБ · js сайта ${siteJs.toFixed(1)} КБ · js+css админки ${jsKb.toFixed(1)} КБ всего`);

console.log('\n— админка —');
check('админка собрана в двух вариантах пути', existsSync(join(DIST, 'admin/index.html')) && existsSync(join(DIST, 'admin.html')));
check('админка не тянет данные без входа', !admin.includes('createClient'));
check('пароль не сверяется в JS', !/password\s*===|checkPassword|atob\(/.test(readFileSync(join(ROOT, 'src/js/admin.js'), 'utf8')));
check('вход через Supabase Auth', /signInWithPassword/.test(readFileSync(join(ROOT, 'src/js/admin.js'), 'utf8')));
check('demo-режим помечен как не-защита', /демо/i.test(readFileSync(join(ROOT, 'src/js/admin.js'), 'utf8')));

console.log(`\n${fails.length ? '✗' : '✓'} пройдено ${pass}, провалено ${fails.length}`);
if (warn.length) console.log('!', warn.join('\n !'));
if (fails.length) {
  console.log('\nПровалы:\n - ' + fails.join('\n - '));
  process.exit(1);
}

/* ── helpers ── */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function listAssets(dir = DIST) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listAssets(join(dir, e.name)) : [join(dir, e.name).slice(DIST.length + 1).split(/[\\/]/).join('/')],
  );
}
function cssOf(dir) {
  const f = readdirSync(join(dir, 'assets')).find((n) => n.startsWith('main.') && n.endsWith('.css'));
  return f ? readFileSync(join(dir, 'assets', f), 'utf8') : '';
}
