/* ─── TNZ Media · клиент ──────────────────────────────────────────────
   Контент уже в HTML: здесь только интерактив. Никаких window.load-гонок:
   всё навешивается сразу (скрипт — модуль, DOM к этому моменту готов). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = () => matchMedia('(hover: hover)').matches && matchMedia('(pointer: fine)').matches;

export const escHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── тост ─────────────────────────────────────────────────────────────── */
let toastT;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2200);
}

/* ── темы: смена через View Transitions, выбор в localStorage ─────────── */
const THEMES = ['night', 'bone', 'moss', 'clay'];
const LIGHT = ['bone', 'clay'];
function applyTheme(id) {
  const root = document.documentElement;
  root.dataset.theme = id;
  root.style.colorScheme = LIGHT.includes(id) ? 'light' : 'dark';
  $$('.sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === id)));
}
function setTheme(id) {
  if (id === document.documentElement.dataset.theme) return;
  try { localStorage.setItem('tnz:theme', id); } catch { /* приватный режим */ }
  if (document.startViewTransition && !reduce()) document.startViewTransition(() => applyTheme(id));
  else applyTheme(id);
}
function initTheme() {
  const cur = document.documentElement.dataset.theme || THEMES[0];
  $$('.sw').forEach((b) => {
    if (b.dataset.themeSet === cur) b.setAttribute('aria-pressed', 'true');
    b.addEventListener('click', () => setTheme(b.dataset.themeSet));
  });
}

/* ── шапка: граница и прогресс чтения ────────────────────────────────── */
function initHeader() {
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = window.scrollY;
      document.documentElement.toggleAttribute('data-scrolled', y > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight; // читаем в rAF, пишем в rAF
      document.documentElement.style.setProperty('--sp', max > 0 ? `${Math.min(100, (y / max) * 100)}%` : '0%');
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  onScroll();
}

/* ── мобильная нижняя панель: показываем, когда hero ушёл ────────────── */
function initMbar() {
  const hero = $('#hero');
  const bar = $('.mbar');
  if (!hero || !bar) return;
  new IntersectionObserver(
    ([e]) => document.documentElement.toggleAttribute('data-mbar', !e.isIntersecting && e.boundingClientRect.top < 0),
    { threshold: 0 },
  ).observe(hero);
}

/* ── появление блоков ─────────────────────────────────────────────────── */
function initReveal() {
  const nodes = $$('.reveal');
  if (!('IntersectionObserver' in window) || reduce()) { nodes.forEach((n) => n.classList.add('in')); return; }
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }),
    { rootMargin: '0px 0px -6% 0px', threshold: 0.12 },
  );
  nodes.forEach((n) => io.observe(n));
  return io;
}
let revealIo = null;
const observeReveals = (root = document) => {
  if (!revealIo) return;
  $$('.reveal:not(.in)', root).forEach((n) => revealIo.observe(n));
};

/* ── меню ─────────────────────────────────────────────────────────────── */
function initMenu() {
  const btn = $('#menu-btn');
  const menu = $('#menu');
  if (!btn || !menu) return;
  const open = (v) => {
    btn.setAttribute('aria-expanded', String(v));
    btn.setAttribute('aria-label', v ? 'Закрыть меню' : 'Открыть меню');
    menu.hidden = !v;
    document.documentElement.toggleAttribute('data-lock', v);
    if (v) $('.menulink', menu)?.focus();
    else btn.focus();
  };
  btn.addEventListener('click', () => open(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) open(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) open(false); });
  addEventListener('resize', () => { if (innerWidth >= 900 && !menu.hidden) open(false); }, { passive: true });
}

/* ── табы услуг: roving tabindex + стрелки ────────────────────────────── */
function initTabs() {
  const list = $('.tablist');
  if (!list) return;
  const tabs = $$('.tab', list);
  const pick = (tab, focus = true) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      if (p) { p.hidden = !on; p.classList.toggle('on', on); }
    });
    if (focus) tab.focus();
  };
  list.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) pick(t, false); });
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const map = { ArrowRight: 1, ArrowLeft: -1 };
    if (e.key in map) { e.preventDefault(); pick(tabs[(i + map[e.key] + tabs.length) % tabs.length]); }
    else if (e.key === 'Home') { e.preventDefault(); pick(tabs[0]); }
    else if (e.key === 'End') { e.preventDefault(); pick(tabs[tabs.length - 1]); }
  });
}

/* ── аккордеон: grid-template-rows, не max-height (текст не обрезается) ── */
function initRows() {
  $$('.svc-panels').forEach((panel) => {
    panel.addEventListener('click', (e) => {
      const head = e.target.closest('.row-head');
      if (!head) return;
      const row = head.closest('.row');
      const wasOpen = row.classList.contains('open');
      $$('.row.open', panel).forEach((r) => { r.classList.remove('open'); $('.row-head', r)?.setAttribute('aria-expanded', 'false'); });
      if (!wasOpen) { row.classList.add('open'); head.setAttribute('aria-expanded', 'true'); }
    });
  });
}

/* ── фильтр кейсов: скрыли через hidden + FLIP на десктопе ────────────── */
function initFilters() {
  const box = $('.chips');
  const list = $('#works-list');
  if (!box || !list) return;
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip[data-filter]');
    if (!btn || btn.classList.contains('on')) return;
    $$('.chip[data-filter]', box).forEach((b) => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const f = btn.dataset.filter;
    const cards = $$('.work', list);
    const isGrid = matchMedia('(min-width: 900px)').matches;
    const before = isGrid && !reduce() ? new Map(cards.map((c) => [c, c.getBoundingClientRect()])) : null;
    cards.forEach((c) => { c.hidden = f !== 'all' && c.dataset.cat !== f; });
    list.scrollTo?.({ top: 0, left: 0, behavior: reduce() ? 'auto' : 'smooth' });
    if (!before) return;
    requestAnimationFrame(() => {
      cards.filter((c) => !c.hidden).forEach((c) => {
        const b = before.get(c);
        const a = c.getBoundingClientRect();
        const dx = b.left - a.left;
        const dy = b.top - a.top;
        if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
      });
    });
  });
}

/* ── кейс: <dialog> даёт Esc, фокус-трап и инертный фон бесплатно ─────── */
const visibleWorks = () => $$('.work', $('#works-list')).filter((w) => !w.hidden);

function initCase() {
  const dlg = $('#case');
  const body = $('#case-body');
  const counter = $('#case-desc');
  if (!dlg || !body) return;
  let queue = [];
  let idx = 0;

  const paint = () => {
    const work = queue[idx];
    if (!work) return;
    const tpl = $('template.case-data', work);
    body.innerHTML = '';
    if (tpl) body.append(tpl.content.cloneNode(true));
    if (counter) counter.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(queue.length).padStart(2, '0')}`;
    body.scrollTop = 0;
    $('#case-next')?.focus?.({ preventScroll: true });
  };
  const open = (id) => {
    queue = visibleWorks();
    idx = Math.max(0, queue.findIndex((w) => w.dataset.id === id));
    paint();
    dlg.setAttribute('data-current', id);
    document.documentElement.setAttribute('data-lock', '');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  };
  const close = () => {
    document.documentElement.removeAttribute('data-lock');
    if (dlg.open) dlg.close();
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (t) { e.preventDefault(); open(t.dataset.open); return; }
    if (e.target === dlg) close(); // клик по подложке
  });
  dlg.addEventListener('close', () => {
    document.documentElement.removeAttribute('data-lock');
    const cur = dlg.getAttribute('data-current') || '';
    const back = cur ? document.querySelector('[data-open="' + CSS.escape(cur) + '"]') : null;
    back?.focus?.({ preventScroll: true });
  });
  $('#case-prev')?.addEventListener('click', () => { idx = (idx - 1 + queue.length) % queue.length; paint(); });
  $('#case-next')?.addEventListener('click', () => { idx = (idx + 1) % queue.length; paint(); });
  addEventListener('keydown', (e) => {
    if (!dlg.open || queue.length < 2) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); idx = (idx + 1) % queue.length; paint(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); idx = (idx - 1 + queue.length) % queue.length; paint(); }
  });
  // Esc из диалога: возврат фокуса делает natивный close
}

/* ── плавающее превью над строкой списка (десктоп, только с картинкой) ── */
function initPeek() {
  const list = $('#works-list');
  if (!list || !canHover() || !matchMedia('(min-width: 900px)').matches || reduce()) return;
  const peek = document.createElement('div');
  peek.className = 'peek';
  peek.setAttribute('aria-hidden', 'true');
  document.body.append(peek);
  let raf = 0;
  let pending = null;
  list.addEventListener('pointermove', (e) => {
    pending = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const ev = pending;
      const work = ev.target.closest('.work');
      const img = work && !work.hidden ? work.querySelector('.cover-img') : null;
      if (!img) { peek.classList.remove('on'); return; }
      peek.innerHTML = `<img src="${escHtml(img.currentSrc || img.src)}" alt="">`;
      peek.style.left = `${Math.min(innerWidth - 150, Math.max(150, ev.clientX + 170))}px`;
      peek.style.top = `${Math.max(120, Math.min(innerHeight - 120, ev.clientY))}px`;
      peek.classList.add('on');
    });
  });
  list.addEventListener('pointerleave', () => { peek.classList.remove('on'); });
}

/* ── копировать ник ───────────────────────────────────────────────────── */
function initCopy() {
  const btn = $('#copy-nick');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const text = btn.querySelector('span')?.textContent?.trim() || '';
    try {
      await navigator.clipboard.writeText(text);
      toast('Скопировано ✓');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      toast(ok ? 'Скопировано ✓' : text);
    }
  });
}

/* ── Supabase: опциональное обновление списка кейсов из базы ──────────── */
const cfg = () => window.__TNZ_CFG__ || {};

async function loadSdk() {
  if (window.supabase) return window.supabase;
  const src = cfg().sdk;
  if (!src) return null;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('sdk load failed'));
    document.head.append(s);
  });
  return window.supabase || null;
}

/** строка из БД → карточка. Всё экранируется: в старой версии данные из Supabase
    уходили прямо в innerHTML, что было XSS при доступной на запись таблице. */
function workMarkup(p, i) {
  const cover = p.image_url
    ? `<img class="cover-img" src="${escHtml(p.image_url)}" alt="Превью кейса «${escHtml(p.title)}»" loading="lazy" decoding="async" width="800" height="600">`
    : `<span class="cover-fake"><svg class="ico" aria-hidden="true"><use href="#i-${escHtml(p.icon || 'studio')}"></use></svg></span>`;
  const tags = (p.tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<i>${escHtml(t)}</i>`)
    .join('');
  const blocks = [['Задача', p.problem], ['Решение', p.solution], ['Результат', p.result]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="case-block"><b>${k}</b><p>${escHtml(v)}</p></div>`)
    .join('');
  return `<article class="work" data-id="${escHtml(p.id ?? i)}" data-cat="${escHtml(p.category || 'design')}">
  <button type="button" class="work-btn" data-open="${escHtml(p.id ?? i)}" aria-haspopup="dialog" aria-label="Открыть кейс «${escHtml(p.title)}»">
    <span class="work-num">${String(i + 1).padStart(2, '0')}</span>
    <span class="work-cover">${cover}</span>
    <span class="work-main"><span class="work-title">${escHtml(p.title)}</span><span class="work-tag">${escHtml(p.tag || '')}</span></span>
    <span class="work-services">${tags}</span>
    <span class="work-arrow" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h13M12 6l6 6-6 6"/></svg></span>
  </button>
  <template class="case-data">
    <div class="case-cover">${p.image_url ? `<img src="${escHtml(p.image_url)}" alt="Превью кейса «${escHtml(p.title)}»" width="800" height="500" decoding="async">` : `<svg class="ico" aria-hidden="true"><use href="#i-${escHtml(p.icon || 'studio')}"></use></svg>`}</div>
    <div class="case-meta"><span class="chip on">${escHtml(p.tag || '')}</span></div>
    <h3 id="case-title">${escHtml(p.title)}</h3>
    <p class="case-sum">${escHtml(p.summary || '')}</p>
    <div class="case-cols">${blocks}</div>
    ${p.link ? `<div class="case-cta"><a class="btn btn-a" href="${escHtml(p.link)}" target="_blank" rel="noreferrer noopener"><span>Открыть</span></a></div>` : ''}
  </template>
</article>`;
}

async function hydrateFromSupabase() {
  const { url, key, table = 'projects' } = cfg();
  if (!url || !key) return; // ключей нет — оставляем то, что собрал build
  try {
    const sb = await loadSdk();
    if (!sb?.createClient) return;
    const client = sb.createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.from(table).select('*').eq('published', true).order('sort_order', { ascending: true });
    if (error || !Array.isArray(data) || !data.length) return;
    const list = $('#works-list');
    if (!list) return;
    list.innerHTML = data.map(workMarkup).join('');
    observeReveals(list);
    toast(`Кейсов из базы: ${data.length}`);
  } catch {
    /* база недоступна — статичный HTML уже показывает всё нужное */
  }
}

/* ── год в подвале (статичный из сборки не устаревает посреди года) ───── */
function initYear() {
  const y = $('#year');
  if (!y) return;
  const now = new Date().getFullYear();
  if (y.textContent.trim() !== String(now)) y.textContent = now;
}

initTheme();
initHeader();
initMbar();
revealIo = initReveal();
initMenu();
initTabs();
initRows();
initFilters();
initCase();
initPeek();
initCopy();
initYear();
addEventListener('hashchange', () => { if ($('#menu') && !$('#menu').hidden) $('#menu-btn')?.click(); });
if (document.documentElement.dataset.js !== 'off') hydrateFromSupabase();
