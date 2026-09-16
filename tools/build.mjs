// TNZ Media — сборщик. Zero-dep: `node tools/build.mjs` (esbuild используется, если установлен).
// src/data/*.json → статический HTML в dist/. Рантайм-рендеринга контента нет:
// кейсы, цены и тексты видны без JS — краулерам, превью в Telegram и скринридерам тоже.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'dist');

/* ──────────────────────────────────────────────────────────── helpers */

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const hash = (buf) => createHash('sha256').update(buf).digest('base64url').slice(0, 10);

/** внешняя ссылка: target + rel всегда вместе (в старой версии rel не было) */
const ext = (href, inner, cls = 'btn btn-s sm') =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noreferrer noopener">${inner}</a>`;

let esbuild = null;
try { esbuild = (await import('esbuild')).default; } catch { /* нет node_modules — отдаём без минификации */ }

async function min(code, kind, file) {
  if (!esbuild) return code;
  try {
    const r = await esbuild.transform(code, { loader: kind, minify: true, format: 'esm', target: 'es2020', charset: 'utf8', sourcefile: file });
    return r.code;
  } catch (e) {
    console.error(`! ${file}: минификация пропущена (${e.message})`);
    return code;
  }
}

/* ────────────────────────────────────────────────────────────── data */

const site = json('src/data/site.json');
const allProjects = json('src/data/projects.json');
const projects = allProjects.filter((p) => p.published !== false);
const services = json('src/data/services.json');
const packages = json('src/data/packages.json');
const themes = site.themes;
const serviceCount = services.reduce((n, g) => n + g.items.length, 0);
const C = site.contacts;

/* ──────────────────────────────────────────────────────────── markup */

const ICONS = {
  mascot: '<circle cx="32" cy="30" r="16"/><circle cx="24" cy="26" r="2.4" fill="currentColor" stroke="none"/><circle cx="40" cy="26" r="2.4" fill="currentColor" stroke="none"/><path d="M24 36c3 3.4 13 3.4 16 0"/><path d="M18 18 12 8M46 18 52 8"/>',
  fest: '<path d="M32 8v14"/><path d="M17 46h30l-5-16H22z"/><circle cx="32" cy="21" r="6"/>',
  spa: '<path d="M32 10c8 8 14 16 14 24a14 14 0 0 1-28 0c0-8 6-16 14-24z"/><path d="M25 34a7 7 0 0 0 7 7"/>',
  zebra: '<rect x="12" y="20" width="40" height="24" rx="9"/><path d="M22 20v24M32 20v24M42 20v24"/>',
  studio: '<rect x="10" y="14" width="44" height="30" rx="5"/><path d="M22 44v6h20v-6"/><circle cx="32" cy="29" r="7"/>',
  maplink: '<path d="M32 8c9 0 16 7 16 16 0 12-16 32-16 32S16 36 16 24c0-9 7-16 16-16z"/><circle cx="32" cy="24" r="6"/>',
  rashodka: '<rect x="14" y="10" width="36" height="44" rx="5"/><path d="M22 22h20M22 31h20M22 40h12"/>',
};

const sprite = `<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false">${Object.entries(ICONS)
  .map(
    ([name, d]) =>
      `<symbol id="i-${name}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`,
  )
  .join('')}</svg>`;

const I = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const ARROW = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M12 6l6 6-6 6"/></svg>';
const TG = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4 2.6 11.4c-1 .4-1 1.6.1 1.9l4.3 1.4 1.7 5.2c.3.9 1.4 1.1 2 .4l2.4-2.6 4.6 3.4c.8.6 2 .2 2.2-.8L22.9 5c.2-1-.9-1.7-1.9-1z"/><path d="M9 14.7 18.7 6.2 7 16"/></svg>';
const IG = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="6"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>';
const MAIL = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>';
const COPY = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H16"/></svg>';

// разбивка на слова — на сборке, не в JS: без скриптов текст остаётся текстом
const words = (t, step = 4) => {
  const parts = String(t).trim().split(/\s+/);
  if (parts.length > 14) return esc(t);
  return parts.map((w, i) => `<span class="w" style="--i:${i * step}">${esc(w)}</span>`).join(' ');
};

const themebar = `<div class="themebar" role="group" aria-label="Оформление">
${themes
  .map(
    (t) =>
      `<button type="button" class="sw" data-theme-set="${esc(t.id)}" aria-pressed="${t.id === site.themeDefault}"><span class="sw-dot sw-${esc(t.id)}" aria-hidden="true"></span><span class="sw-name">${esc(t.name)}</span></button>`,
  )
  .join('')}
</div>`;

const NAV = [
  ['Работы', '#works'],
  ['Услуги', '#services'],
  ['Пакеты', '#packages'],
  ['Как работаем', '#process'],
];

const header = `<a class="skip" href="#main">К содержанию</a>
<header class="top" id="top">
  <div class="wrap top-in">
    <a class="brand" href="#top"><span class="brand-mark">${esc(site.brand)}</span><span class="brand-pill"><i class="dot-live" aria-hidden="true"></i>${esc(site.status)}</span></a>
    <nav class="nav" aria-label="Разделы">${NAV.map(([t, h]) => `<a class="navlink" href="${h}">${t}</a>`).join('')}</nav>
    <div class="top-right">
      ${themebar}
      ${ext(C.telegram, `${ARROW}<span>Обсудить проект</span>`)}
      <button type="button" class="burger" id="menu-btn" aria-expanded="false" aria-controls="menu" aria-label="Открыть меню"><i></i><i></i></button>
    </div>
  </div>
</header>
<div class="menu" id="menu" hidden>
  <nav class="wrap menu-nav" aria-label="Меню">${NAV.map(([t, h]) => `<a class="menulink" href="${h}">${t}</a>`).join('')}</nav>
  <div class="wrap menu-foot">${themebar}</div>
</div>`;

const hero = `<section class="hero" id="hero" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <p class="kicker">${esc(site.hero.eyebrow)}</p>
    <h1 class="hero-lead" id="hero-title">${words(site.hero.lead, 5)}</h1>
    <p class="hero-sub">${esc(site.hero.sub)}</p>
    <div class="hero-cta">
      <a class="btn btn-a lg" href="#works">Смотреть работы${ARROW}</a>
      ${ext(C.telegram, `${TG}<span>Написать в Telegram</span>`, 'btn btn-b lg')}
    </div>
    <ul class="hero-stats">${[[projects.length, 'кейсов'], [serviceCount, 'услуг с ценой'], [packages.length, 'пакета']]
      .map(([n, l]) => `<li><b>${n}</b>${l}</li>`)
      .join('')}</ul>
    <p class="sign" aria-hidden="true">${esc(site.hero.signature)}</p>
  </div>
  <div class="ticker" aria-hidden="true"><div class="ticker-in">${[0, 1]
    .map(() => `<span class="ticker-row">${services.flatMap((g) => g.items.map((i) => `<b>${esc(i.name)}</b>·`)).join('')}</span>`)
    .join('')}</div></div>
</section>`;

const CAT_LABEL = { design: 'Дизайн и брендинг', app: 'Telegram', sites: 'Сайты' };
const cats = [...new Set(projects.map((p) => p.category))];
const coverHtml = (p) =>
  p.image
    ? `<img class="cover-img" src="${esc(p.image)}" alt="Превью кейса «${esc(p.title)}»" loading="lazy" decoding="async" width="800" height="600">`
    : `<span class="cover-fake">${I(p.icon in ICONS ? p.icon : 'studio')}</span>`;

// карточка + полные тексты кейса в DOM (hidden) → диалог просто переносит узел
const workRow = (p, i) => {
  const blocks = [
    ['Задача', p.problem],
    ['Решение', p.solution],
    ['Результат', p.result],
  ].filter(([, t]) => t);
  return `<article class="work reveal" data-id="${esc(p.id)}" data-cat="${esc(p.category)}" data-n="${i + 1}">
  <button type="button" class="work-btn" data-open="${esc(p.id)}" aria-haspopup="dialog" aria-label="Открыть кейс «${esc(p.title)}»">
    <span class="work-num">${String(i + 1).padStart(2, '0')}</span>
    <span class="work-cover">${coverHtml(p)}</span>
    <span class="work-main"><span class="work-title">${esc(p.title)}</span><span class="work-tag">${esc(p.tag)}</span></span>
    <span class="work-services">${(p.services || []).map((s) => `<i>${esc(s)}</i>`).join('')}</span>
    <span class="work-arrow" aria-hidden="true">${ARROW}</span>
  </button>
  <template class="case-data">
    <div class="case-cover">${p.image ? `<img src="${esc(p.image)}" alt="Превью кейса «${esc(p.title)}»" width="800" height="500" decoding="async">` : I(p.icon in ICONS ? p.icon : 'studio')}</div>
    <div class="case-meta"><span class="chip on">${esc(p.tag)}</span>${p.year ? `<span class="chip">${esc(p.year)}</span>` : ''}${(p.services || [])
      .map((s) => `<span class="chip">${esc(s)}</span>`)
      .join('')}</div>
    <h3 id="case-title">${esc(p.title)}</h3>
    <p class="case-sum">${esc(p.summary)}</p>
    <div class="case-cols">${blocks
      .map(([t, x]) => `<div class="case-block"><b>${t}</b><p>${esc(x)}</p></div>`)
      .join('')}</div>
    ${p.link ? `<div class="case-cta">${ext(p.link, `<span>Открыть в Telegram</span>${ARROW}`, 'btn btn-a')}` : ''}</div>
  </template>
</article>`;
};

const works = `<section class="sec" id="works" aria-labelledby="works-title">
  <div class="wrap">
    <div class="sec-head reveal"><p class="kicker">Портфолио</p>
      <h2 class="h2" id="works-title">${words('Работы, которые не стыдно показать')}</h2>
      <p class="sec-lead">Нажми на кейс — покажу задачу и что именно я делал. Превью подгружаются из админки.</p>
    </div>
    <div class="chips" role="group" aria-label="Фильтр по типу работ">
      <button type="button" class="chip on" data-filter="all" aria-pressed="true">Все <i>${projects.length}</i></button>
      ${cats.map((c) => `<button type="button" class="chip" data-filter="${esc(c)}" aria-pressed="false">${esc(CAT_LABEL[c] ?? c)} <i>${projects.filter((p) => p.category === c).length}</i></button>`).join('')}
    </div>
    <div class="works" id="works-list">${projects.map(workRow).join('')}</div>
    <p class="works-note">Нет похожего кейса? Напиши — расскажу, как делал бы твой.</p>
  </div>
</section>`;

const caseDialog = `<dialog class="case" id="case" aria-labelledby="case-title" aria-describedby="case-desc">
  <div class="case-in" id="case-body"></div>
  <form method="dialog" class="case-bar">
    <button type="button" class="icon-btn" id="case-prev" aria-label="Предыдущий кейс">←</button>
    <button type="button" class="icon-btn" id="case-next" aria-label="Следующий кейс">→</button>
    <span class="u-mut" id="case-desc">Кейс ${'' /* заполняет JS */}</span>
    <button class="icon-btn" value="cancel" aria-label="Закрыть кейс">✕</button>
  </form>
</dialog>`;

const svc = `<section class="sec sec-alt" id="services" aria-labelledby="services-title">
  <div class="wrap svc-grid">
    <div class="svc-side">
      <div class="sec-head reveal"><p class="kicker">Услуги и цены</p>
        <h2 class="h2" id="services-title">${words('Цены сразу, без «напишите мне»')}</h2>
        <p class="sec-lead">Стоимость и срок зафиксированы. Круг правок входит в цену, а не продаётся отдельно.</p>
      </div>
      <div class="tablist" role="tablist" aria-label="Категории услуг">
        ${services
          .map(
            (g, i) =>
              `<button type="button" role="tab" class="tab${i === 0 ? ' on' : ''}" id="tab-${esc(g.id)}" aria-controls="panel-${esc(g.id)}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${esc(g.id)}">${esc(g.label)}<i>${g.items.length}</i></button>`,
          )
          .join('')}
      </div>
    </div>
    <div class="svc-panels">
      ${services
        .map(
          (g, gi) => `<div role="tabpanel" class="panel${gi === 0 ? ' on' : ''}" id="panel-${esc(g.id)}" aria-labelledby="tab-${esc(g.id)}"${gi === 0 ? '' : ' hidden'}>
        ${g.items
          .map(
            (it) => `<div class="row reveal">
            <button type="button" class="row-head" aria-expanded="false" aria-controls="d-${esc(it.id)}" id="b-${esc(it.id)}">
              <span class="row-name">${esc(it.name)}</span><span class="row-price">${esc(it.price)}</span><span class="row-x" aria-hidden="true"></span>
            </button>
            <div class="row-body" id="d-${esc(it.id)}" role="region" aria-labelledby="b-${esc(it.id)}">
              <div class="row-body-in"><p>${esc(it.desc)}</p>
                <p class="row-meta">Срок: ${esc(it.time)}${ext(C.telegram, `<span>Заказать</span>${ARROW}`, 'row-order')}</p>
              </div>
            </div>
          </div>`,
          )
          .join('')}
      </div>`,
        )
        .join('')}
    </div>
  </div>
</section>`;

const pkgs = `<section class="sec" id="packages" aria-labelledby="packages-title">
  <div class="wrap">
    <div class="sec-head reveal"><p class="kicker">Пакеты</p>
      <h2 class="h2" id="packages-title">${words('Комплектом дешевле и быстрее')}</h2>
      <p class="sec-lead">Один человек ведёт проект от идеи до передачи файлов — детали не теряются между подрядчиками.</p>
    </div>
    <div class="pkgs">${packages
      .map(
        (p) => `<article class="pkg reveal${p.featured ? ' feat' : ''}">
        ${p.save ? `<p class="pkg-save">${esc(p.save)}</p>` : ''}
        <p class="pkg-lead">${esc(p.lead)}</p><h3 class="pkg-name">${esc(p.name)}</h3>
        <ul class="pkg-list">${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
        <p class="pkg-price">${esc(p.price)}</p><p class="pkg-time">${esc(p.time)}</p>
        ${ext(C.telegram, `<span>Выбрать «${esc(p.name)}»</span>${ARROW}`, `btn ${p.featured ? 'btn-a' : 'btn-b'} wide`)}
      </article>`,
      )
      .join('')}</div>
  </div>
</section>`;

const processSection = `<section class="sec sec-alt" id="process" aria-labelledby="process-title">
  <div class="wrap">
    <div class="sec-head reveal"><p class="kicker">Как работаем</p>
      <h2 class="h2" id="process-title">${words('Четыре шага, и ты видишь каждый')}</h2></div>
    <ol class="steps">${site.process
      .map((s) => `<li class="step reveal"><span class="step-n">${esc(s.n)}</span><h3 class="step-t">${esc(s.t)}</h3><p class="step-d">${esc(s.d)}</p></li>`)
      .join('')}</ol>
  </div>
</section>`;

const links = [
  { href: C.telegram, label: 'Telegram', icon: TG, handle: C.telegramHandle, main: true },
  ...(C.instagram ? [{ href: C.instagram, label: 'Instagram', icon: IG, handle: '@tengizka' }] : []),
  ...(C.email ? [{ href: `mailto:${C.email}`, label: 'Почта', icon: MAIL, handle: C.email }] : []),
];

const contact = `<section class="sec contact" id="contact" aria-labelledby="contact-title">
  <div class="wrap contact-in">
    <p class="kicker">На связи</p>
    <h2 class="h2 xl" id="contact-title">${words('Обсудим твой проект?', 6)}</h2>
    <p class="sec-lead wide">Опиши задачу — отвечу с вилкой по цене и сроку в течение дня.</p>
    <ul class="contact-list">${links
      .map(
        (c) => `<li>${ext(c.href, `${c.icon}<span class="clink-l">${esc(c.label)}</span><span class="clink-h">${esc(c.handle)}</span>${ARROW}`, `clink${c.main ? ' main' : ''}`)}</li>`,
      )
      .join('')}</ul>
    <button type="button" class="nick" id="copy-nick">${COPY}<span>${esc(site.handle)}</span></button>
  </div>
</section>`;

const footer = `<footer class="foot"><div class="wrap foot-in">
  <p>© <span id="year">${new Date().getFullYear()}</span> ${esc(site.legalName)} — дизайн и разработка</p>
  ${site.legal ? `<p class="foot-legal">${esc(site.legal)}</p>` : ''}
  <a class="foot-top" href="#top">Наверх ↑</a>
</div></footer>`;

const mbar = `<div class="mbar"><div class="wrap mbar-in">
  <p class="mbar-t"><b>${projects.length}</b> кейсов · <b>${serviceCount}</b> услуг · от 1 500 ₽</p>
  ${ext(C.telegram, `${TG}<span>Написать</span>`, 'btn btn-a sm')}
</div></div>`;

const toast = `<p class="toast" id="toast" role="status" aria-live="polite"></p>`;

/* ─────────────────────────────────────────────────────────── json-ld */

const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': `${site.baseUrl}/#person`,
      name: site.legalName,
      alternateName: site.brand,
      jobTitle: site.role,
      url: `${site.baseUrl}/`,
      sameAs: [C.telegram, C.instagram].filter(Boolean),
      knowsAbout: services.flatMap((g) => g.items.map((i) => i.name)),
      makesOffer: [
        { '@id': `${site.baseUrl}/#works` },
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${site.baseUrl}/#site`,
      url: `${site.baseUrl}/`,
      name: site.title,
      inLanguage: 'ru',
      publisher: { '@id': `${site.baseUrl}/#person` },
    },
    {
      '@type': 'CollectionPage',
      '@id': `${site.baseUrl}/#works`,
      url: `${site.baseUrl}/#works`,
      name: 'Портфолио',
      mainEntity: projects.map((p) => ({
        '@type': 'CreativeWork',
        name: p.title,
        about: p.tag,
        description: p.summary,
        url: p.link || undefined,
        image: p.image ? `${site.baseUrl}/${p.image.replace(/^\/+/, '')}` : undefined,
        creator: { '@id': `${site.baseUrl}/#person` },
      })),
    },
  ],
};

/* ─────────────────────────────────────────────────────────── document */

const FONTS =
  'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Caveat:wght@600&family=Unbounded:wght@700&display=swap';

function doc({ body, title, desc, css, js, page, robots = '', ld = '' }) {
  return `<!DOCTYPE html>
<html lang="ru" dir="ltr" data-theme="${esc(site.themeDefault)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(site.baseUrl)}${page === 'admin' ? '/admin/' : '/'}">
${robots}
<meta name="theme-color" content="#0f0e12" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#f5f2eb" media="(prefers-color-scheme: light)">
<meta name="color-scheme" content="light dark">
<meta name="format-detection" content="telephone=no">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.brand)}">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(site.baseUrl)}${page === 'admin' ? '/admin/' : '/'}">
<meta property="og:image" content="${esc(site.baseUrl)}/${esc(site.ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(site.baseUrl)}/${esc(site.ogImage)}">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="preload" href="${css}" as="style">
<link rel="stylesheet" href="${css}">
<link rel="modulepreload" href="${js}">
${ld}
<script>
/* Тема до первой отрисовки (localStorage → prefers-color-scheme → дефолт), чтобы не было вспышки. */
(function(){try{var ok=${JSON.stringify(themes.map((t) => t.id))};var d=${JSON.stringify(site.themeDefault)};
var t=localStorage.getItem('tnz:theme');if(ok.indexOf(t)<0)t=null;
if(!t)t=matchMedia('(prefers-color-scheme: light)').matches?(ok.indexOf('bone')>=0?'bone':d):(ok.indexOf(d)>=0?d:ok[0]);
var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=/bone|clay/.test(t)?'light':'dark';}catch(e){}}());
</script>
</head>
${body}
<script type="module" src="${js}"></script>
</html>
`;
}

/* ────────────────────────────────────────────────────────────── out */

function write(rel, content) {
  const abs = join(OUT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  const buf = typeof content === 'string' ? Buffer.from(content) : content;
  writeFileSync(abs, buf);
  return { size: buf.length, name: rel };
}

async function emit(rel, code, kind, file) {
  const minified = await min(code, kind, file);
  const base = rel.replace(/(\.\w+)$/, `.${hash(minified)}$1`);
  const r = write(base, minified);
  return { ...r, name: base };
}

/** копия supabase-js из node_modules (без CDN-зависимости); если пакета нет — null */
function supabaseSdk() {
  const p = join(ROOT, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

export async function build(log = true) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // public/ → dist как есть (favicon, og, robots, .nojekyll, img/)
  const pub = join(ROOT, 'public');
  if (existsSync(pub)) {
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const f of walk(pub)) {
      const rel = f.slice(pub.length + 1).split(/[\\/]/).join('/');
      copyFileSync(f, join(OUT, rel));
    }
  }

  /* ── сайт ── */
  const css = await emit(
    'assets/main.css',
    [read('src/css/tokens.css'), read('src/css/main.css'), read('src/css/motion.css')].join('\n'),
    'css',
    'main.css',
  );
  const js = await emit('assets/site.js', read('src/js/site.js'), 'js', 'site.js');

  const body = `<body data-page="site">
<div class="amb" aria-hidden="true"></div>
${sprite}
${header}
<main id="main">
${hero}
${works}
${svc}
${pkgs}
${processSection}
${contact}
</main>
${footer}
${caseDialog}
${mbar}
${toast}
<noscript><style>.reveal{opacity:1!important;transform:none!important}.hero-lead .w{opacity:1!important}</style></noscript>
</body>`;

  const index = write(
    'index.html',
    doc({
      body,
      title: site.title,
      desc: site.description,
      css: css.name,
      js: js.name,
      page: 'site',
      ld: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    }),
  );

  /* ── админка ── */
  const acss = await emit('assets/admin.css', [read('src/css/tokens.css'), read('src/css/admin.css')].join('\n'), 'css', 'admin.css');
  const ajs = await emit('assets/admin.js', read('src/js/admin.js'), 'js', 'admin.js');
  const abody = `<body data-page="admin" class="admin-body">
<a class="skip" href="#adm-main">К панели</a>
${sprite}
<header class="adm-top"><div class="wrap adm-top-in">
  <a class="brand" href="../"><span class="brand-mark">${esc(site.brand)}</span><span class="brand-pill">админка</span></a>
  <p class="adm-mode" id="adm-mode" role="status"></p>
  <div class="adm-top-r" id="adm-actions" hidden>
    <button type="button" class="btn btn-b sm" id="adm-export">Экспорт в data</button>
    <button type="button" class="btn btn-b sm" id="adm-logout">Выйти</button>
  </div>
</div></header>
<main class="adm-main" id="adm-main"></main>
${toast}
</body>`;
  const adminHtml = doc({
    body: abody,
    title: `Админка — ${esc(site.brand)}`,
    desc: 'Управление кейсами портфолио.',
    css: acss.name,
    js: ajs.name,
    page: 'admin',
    robots: '<meta name="robots" content="noindex,nofollow">',
  });
  write('admin/index.html', adminHtml.replace('href="../"', 'href="../../"'));
  write('admin.html', adminHtml);

  /* ── supabase: конфиг + локальная копия SDK ── */
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  let sdk = null;
  const sdkSrc = supabaseSdk();
  if (sdkSrc) sdk = (await emit('vendor/supabase.js', sdkSrc, 'js', 'supabase-umd.js')).name;
  write(
    'assets/config.js',
    `window.__TNZ_CFG__=${JSON.stringify({ url, key, sdk, bucket: 'portfolio', table: 'projects', built: new Date().toISOString() })};`,
  );

  /* ── sitemap/robots ── */
  const day = new Date().toISOString().slice(0, 10);
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${site.baseUrl}/</loc><lastmod>${day}</lastmod><changefreq>monthly</changefreq></url>\n</urlset>\n`);
  if (!existsSync(join(OUT, 'robots.txt')))
    write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${site.baseUrl}/sitemap.xml\n`);

  /* ── зеркало dist в корень не кладём: Pages публикует dist через workflow ── */
  const missing = allProjects.filter((p) => p.image && !existsSync(join(pub, p.image.replace(/^\/+/, '')))).map((p) => p.id);

  if (log) {
    const kb = (n) => `${(n / 1024).toFixed(1)} КБ`;
    console.log(`✓ dist · ${esbuild ? 'esbuild' : 'без минификации (npm i — и будет)'}`);
    console.log(`  index.html ${kb(index.size)}  ·  css ${kb(css.size)} + js ${kb(js.size)}  ·  admin css ${kb(acss.size)} + js ${kb(ajs.size)}`);
    console.log(`  кейсов ${projects.length}/${allProjects.length} · услуг ${serviceCount} · пакетов ${packages.length}${sdk ? ' · supabase SDK локально' : ' · supabase SDK не найден (npm i)'}`);
    if (url) console.log(`  supabase: ${url}`); else console.log('  supabase: URL/ключ не заданы → сайт без базы, админка в демо-режиме');
    if (missing.length) console.log(`  ! нет локальных превью для: ${missing.join(', ')}`);
  }
  return { out: OUT, missing, sdk: !!sdk, minified: !!esbuild };
}

if (process.argv[1]?.endsWith('build.mjs')) await build();
