/* ─── TNZ Media · админка кейсов ───────────────────────────────────────
   Два режима, один интерфейс:
   · БАЗА  — Supabase: пароль проверяет Supabase Auth, правки летят в projects (+ загрузка картинок в Storage).
   · ДЕМО  — ключей нет: всё в localStorage, чтобы интерфейс можно было пощупать прямо сейчас.
   Пароль никогда не сверяется в JS: это было бы бутафорией. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

const CFG = window.__TNZ_CFG__ || {};
const TABLE = CFG.table || 'projects';
const BUCKET = CFG.bucket || 'portfolio';
const DB_ON = Boolean(CFG.url && CFG.key);
const LS = { rows: 'tnz:admin:rows', session: 'tnz:admin:demo' };

let sb = null;        // supabase client
let mode = DB_ON ? 'db' : 'demo';
let rows = [];        // локальное зеркало (всегда есть)
let editing = null;   // id открытой карточки
let query = '';

/* ── хелперы ──────────────────────────────────────────────────────────── */
let toastT;
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2400);
}
function setMode(text, kind) {
  const m = $('#adm-mode');
  if (!m) return;
  m.textContent = text;
  m.dataset.kind = kind || '';
}
async function loadSdk() {
  if (window.supabase) return window.supabase;
  if (!CFG.sdk) return null;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = CFG.sdk;
    s.onload = res;
    s.onerror = () => rej(new Error('не удалось загрузить supabase sdk'));
    document.head.append(s);
  });
  return window.supabase || null;
}

/* ── соответствие: колонки БД ↔ файл src/data/projects.json ──────────── */
const fromDb = (r) => ({
  id: r.slug ?? String(r.id),
  dbId: r.id,
  title: r.title || '',
  tag: r.tag || '',
  category: r.category || 'design',
  icon: r.icon || 'studio',
  summary: r.summary || '',
  problem: r.problem || '',
  solution: r.solution || '',
  result: r.result || '',
  image: r.image_url || '',
  link: r.link || '',
  year: r.year || '',
  services: String(r.tags || '').split(',').map((s) => s.trim()).filter(Boolean),
  published: r.published !== false,
  sort_order: r.sort_order ?? 0,
});
const toDb = (p, i) => ({
  slug: p.id,
  title: p.title,
  tag: p.tag,
  category: p.category,
  icon: p.icon,
  summary: p.summary,
  problem: p.problem,
  solution: p.solution,
  result: p.result,
  image_url: p.image || null,
  link: p.link || null,
  year: p.year || null,
  tags: (p.services || []).join(', '),
  published: p.published !== false,
  sort_order: p.sort_order ?? i,
  updated_at: new Date().toISOString(),
});
const toFile = (p) => ({
  id: p.id, title: p.title, tag: p.tag, category: p.category, icon: p.icon, summary: p.summary,
  problem: p.problem, solution: p.solution, result: p.result, image: p.image, link: p.link,
  year: p.year, services: p.services || [], published: p.published !== false,
});

const demoSeed = [
  { id: 'mascot-karten', title: 'Mascot: Karten', tag: 'Дизайн персонажа', category: 'design', icon: 'mascot', summary: 'Талисман бренда: характер, пластика, эмоции для соцсетей и мерча.', problem: 'Бренду нужен свой персонаж, который живёт не только на логотипе.', solution: 'Собрали библиотеку поз и эмоций.', result: '', image: '', link: '', year: '', services: ['Персонаж', 'Стикеры'], published: true, sort_order: 0 },
  { id: 'maplink', title: 'MapLink', tag: 'Telegram Mini App', category: 'app', icon: 'maplink', summary: 'Мини-приложение для шеринга мест внутри Telegram.', problem: 'Места теряются в переписках.', solution: 'Карта точек прямо в чате.', result: '', image: '', link: 'https://t.me/MapLinkAppbot/MapLink', year: '', services: ['UX', 'Mini App'], published: true, sort_order: 1 },
];

/* ── доступ к данным ──────────────────────────────────────────────────── */
async function fetchRows() {
  if (mode !== 'db') {
    try { const s = JSON.parse(localStorage.getItem(LS.rows) || 'null'); rows = Array.isArray(s) && s.length ? s : demoSeed.map((r) => ({ ...r })); }
    catch { rows = demoSeed.map((r) => ({ ...r })); }
    return;
  }
  const { data, error } = await sb.from(TABLE).select('*').order('sort_order', { ascending: true }).order('title');
  if (error) throw error;
  rows = (data || []).map(fromDb);
}
function saveDemo() {
  try { localStorage.setItem(LS.rows, JSON.stringify(rows)); } catch { toast('localStorage переполнен'); }
}
async function persist(p) {
  if (mode !== 'db') { saveDemo(); return true; }
  const payload = toDb(p, rows.indexOf(p));
  let error;
  if (p.dbId) ({ error } = await sb.from(TABLE).update(payload).eq('id', p.dbId));
  else {
    const { data, error: e2 } = await sb.from(TABLE).insert(payload).select('id').single();
    error = e2;
    if (data) p.dbId = data.id;
  }
  if (error) { toast(`Не сохранилось: ${error.message}`); return false; }
  return true;
}
async function removeRow(p) {
  if (mode === 'db') {
    if (p.dbId) {
      const { error } = await sb.from(TABLE).delete().eq('id', p.dbId);
      if (error) { toast(`Не удалилось: ${error.message}`); return false; }
    }
  }
  rows = rows.filter((r) => r !== p);
  renumber();
  if (mode !== 'db') saveDemo();
  return true;
}
const renumber = () => rows.forEach((r, i) => (r.sort_order = i));

/* ── экран входа ─────────────────────────────────────────────────────── */
function renderLogin(message = '') {
  $('#adm-actions').hidden = true;
  const main = $('#adm-main');
  main.innerHTML = '';
  const box = el('section', 'login');
  box.innerHTML = `<p class="kicker">Админка</p><h1 class="adm-h">Кейсы<br>портфолио</h1>
  <p class="adm-note">${DB_ON
    ? 'Вход по почте и паролю из Supabase. Права на запись выдаёт RLS-политика, пароль не хранится на сайте.'
    : 'Supabase не подключён: это демо-режим. Изменения останутся только в этом браузере (localStorage).'}</p>
  <form id="login-form" novalidate>
    <label class="f"><span>Почта</span><input type="email" name="email" autocomplete="username" required${DB_ON ? '' : ' value="demo@local"'}></label>
    <label class="f"><span>Пароль</span><input type="password" name="password" autocomplete="current-password" required${DB_ON ? '' : ' value="demo"'}></label>
    <p class="login-err" id="login-err" role="alert">${esc(message)}</p>
    <button class="btn btn-a" type="submit">${DB_ON ? 'Войти' : 'Открыть демо-режим'}</button>
  </form>`;
  main.append(box);
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get('email') || '').trim().toLowerCase();
    const password = String(f.get('password') || '');
    if (!email || !password) { $('#login-err').textContent = 'Нужны почта и пароль'; return; }
    if (!DB_ON) {
      try { localStorage.setItem(LS.session, '1'); } catch { /* ignore */ }
      return start();
    }
    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      start();
    } catch (err) {
      $('#login-err').textContent = err.message === 'Invalid login credentials' ? 'Неверная почта или пароль' : String(err.message || err);
    }
  });
  $('input[name=email]', box)?.focus();
}

/* ── панель ───────────────────────────────────────────────────────────── */
function renderBar() {
  const bar = el('div', 'adm-bar');
  bar.innerHTML = `<h1 class="adm-h">Кейсы <span class="u-mut">(${rows.length})</span></h1>
  <label class="f adm-search" style="gap:0"><span class="u-hidden">Поиск</span><input id="adm-q" type="search" placeholder="Поиск: название, тег, услуга" aria-label="Поиск по кейсам"></label>
  <button class="btn btn-a" id="adm-new" type="button">+ Новый кейс</button>
  <button class="btn btn-b" id="adm-import" type="button">Импорт JSON</button>
  <input type="file" id="adm-file" accept="application/json,.json" hidden>`;
  const head = el('div', '');
  head.append(bar);
  head.append(el('p', 'adm-note', mode === 'db'
    ? 'Правка в базе видна на сайте сразу. Чтобы зафиксировать её в git — «Экспорт в data», коммит, CI пересоберёт статический HTML.'
    : 'Демо-режим: данные в localStorage. Подключи Supabase (README → «Админка»), и эта страница начнёт писать в базу.'));
  return head;
}

const ICONS = ['mascot', 'fest', 'spa', 'zebra', 'studio', 'maplink', 'rashodka'];
const CATS = [['design', 'Дизайн и брендинг'], ['app', 'Telegram'], ['sites', 'Сайты']];

function thumb(p) {
  if (p.image) return `<span class="pthumb"><img src="${esc(p.image)}" alt="" loading="lazy"></span>`;
  return `<span class="pthumb"><svg class="ico" aria-hidden="true"><use href="#i-${esc(p.icon || 'studio')}"></use></svg></span>`;
}

function renderList() {
  const wrap = el('div', 'plist');
  const q = query.trim().toLowerCase();
  const shown = rows
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => !q || [p.title, p.tag, p.summary, (p.services || []).join(' ')].join(' ').toLowerCase().includes(q));
  if (!shown.length) wrap.append(el('p', 'empty', q ? 'Ничего не нашлось.' : 'Кейсов пока нет — создай первый.'));
  shown.forEach(({ p, i }) => {
    const card = el('article', `pitem${editing === p ? ' editing' : ''}`);
    card.dataset.id = String(p.id ?? i);
    card.innerHTML = `<div class="pitem-head">
      <span class="psort"><button type="button" data-mv="-1" aria-label="Выше" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-mv="1" aria-label="Ниже" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button></span>
      ${thumb(p)}
      <span class="pinfo"><b class="pname">${esc(p.title || 'без названия')}</b>
        <span class="pmeta"><span>${esc((CATS.find(([c]) => c === p.category) || [, p.category])[1] || '')}</span><span>${esc(p.tag)}</span></span></span>
      <span class="pmeta">${p.published ? '' : '<i class="badge off">черновик</i>'}
        <button class="btn btn-b sm" type="button" data-edit>${editing === p ? 'Готово' : 'Править'}</button></span>
    </div>`;
    if (editing === p) card.append(renderForm(p));
    wrap.append(card);
  });
  return wrap;
}

function field(label, name, value, type = 'text', hint = '') {
  const id = `f-${name}-${Math.random().toString(36).slice(2, 7)}`;
  const input =
    type === 'textarea'
      ? `<textarea id="${id}" name="${name}"${hint ? ` aria-describedby="${id}-h"` : ''}>${esc(value || '')}</textarea>`
      : type === 'select'
        ? `<select id="${id}" name="${name}">${value.map(([v, t, sel]) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`
        : `<input id="${id}" type="${type}" name="${name}" value="${esc(value || '')}"${hint ? ` aria-describedby="${id}-h"` : ''}>`;
  return `<label class="f"><span>${esc(label)}</span>${input}${hint ? `<span class="adm-note" id="${id}-h">${esc(hint)}</span>` : ''}</label>`;
}

function renderForm(p) {
  const f = el('form', 'pform');
  f.innerHTML = [
    field('Название', 'title', p.title),
    field('Тег', 'tag', p.tag, 'text', 'Например: «Фестивальный брендинг»'),
    field('Slug (id в data/projects.json)', 'id', p.id),
    field('Категория', 'category', CATS.map(([v, t]) => [v, t, v === p.category]), 'select'),
    field('Иконка-заглушка', 'icon', ICONS.map((v) => [v, v, v === p.icon]), 'select', 'Пока нет картинки'),
    field('Год', 'year', p.year, 'text', 'Необязательно'),
    field('Короткое описание', 'summary', p.summary, 'textarea'),
    field('Задача', 'problem', p.problem, 'textarea'),
    field('Решение', 'solution', p.solution, 'textarea'),
    field('Результат / цифры', 'result', p.result, 'textarea', 'Что изменилось после запуска'),
    field('Ссылка (Telegram-бот, сайт)', 'link', p.link, 'url'),
    field('Услуги через запятую', 'services', (p.services || []).join(', ')),
    `<div class="full">${field('Картинка-обложка: URL или путь img/…png', 'image', p.image, 'text')}</div>`,
    `<div class="full preview" id="prev">${thumb(p)}
      <div><p class="adm-note">Превью 4:3, лучше 1600×1200. Загрузи в Storage или залей файл в <code>public/img/</code> и укажи <code>img/имя.png</code>.</p>
      ${mode === 'db' ? '<button class="btn btn-b sm" type="button" id="upl">Загрузить в Storage…</button>' : '<span class="badge">Storage доступен в режиме базы</span>'}</div></div>`,
    `<div class="full check"><input type="checkbox" id="pub" ${p.published !== false ? 'checked' : ''}><label for="pub">Показывать на сайте</label></div>`,
    `<div class="full pactions"><button class="btn btn-a" type="submit">Сохранить</button>
      <button class="btn btn-b sm" type="button" data-cancel>Отмена</button><span class="spacer"></span>
      <button class="btn btn-danger sm" type="button" data-del>Удалить кейс</button></div>`,
  ].join('');
  return f;
}

function renderPanel() {
  const main = $('#adm-main');
  main.innerHTML = '';
  main.append(renderBar());
  main.append(renderList());
  $('#adm-actions').hidden = false;

  $('#adm-q').value = query;
  $('#adm-q').addEventListener('input', (e) => {
    query = e.target.value;
    const list = $('.plist', main);
    list.replaceWith(renderList());
    bindList();
  });
  $('#adm-new').addEventListener('click', () => {
    const p = { id: `case-${Date.now().toString(36).slice(-4)}`, title: '', tag: '', category: 'design', icon: 'studio', summary: '', problem: '', solution: '', result: '', image: '', link: '', year: '', services: [], published: false, sort_order: rows.length };
    rows.push(p);
    editing = p;
    draw();
    $('.pform input[name=title]')?.focus();
  });
  $('#adm-import').addEventListener('click', () => $('#adm-file').click());
  $('#adm-file').addEventListener('change', onImport);
  $('#adm-export').onclick = exportJson;
  $('#adm-logout').onclick = signOut;
  bindList();
}

function bindList() {
  $$('.pitem').forEach((card) => {
    const p = rows.find((r) => String(r.id) === card.dataset.id || r === editing);
    if (!p) return;
    card.querySelectorAll('[data-mv]').forEach((b) =>
      b.addEventListener('click', async () => {
        const i = rows.indexOf(p);
        const j = i + Number(b.dataset.mv);
        if (j < 0 || j >= rows.length) return;
        [rows[i], rows[j]] = [rows[j], rows[i]];
        renumber();
        if (mode === 'db') await Promise.all([persist(rows[j]), persist(rows[i])]);
        else saveDemo();
        draw();
      }),
    );
    card.querySelector('[data-edit]')?.addEventListener('click', () => { editing = editing === p ? null : p; draw(); });
    const form = $('form.pform', card);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      Object.assign(p, {
        title: String(f.get('title') || '').trim(),
        tag: String(f.get('tag') || '').trim(),
        category: String(f.get('category') || 'design'),
        icon: String(f.get('icon') || 'studio'),
        year: String(f.get('year') || '').trim(),
        summary: String(f.get('summary') || '').trim(),
        problem: String(f.get('problem') || '').trim(),
        solution: String(f.get('solution') || '').trim(),
        result: String(f.get('result') || '').trim(),
        link: String(f.get('link') || '').trim(),
        image: String(f.get('image') || '').trim(),
        services: String(f.get('services') || '').split(',').map((s) => s.trim()).filter(Boolean),
        published: $('#pub', form).checked,
      });
      const newId = String(f.get('id') || '').trim();
      if (newId && newId !== p.id) p.id = newId.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
      if (!p.title) { toast('Нужно название'); return; }
      renumber();
      const ok = await persist(p);
      if (ok) { editing = null; saveDemo(); draw(); toast(mode === 'db' ? 'Сохранено в базу ✓' : 'Сохранено локально ✓'); }
    });
    $('[data-cancel]', form)?.addEventListener('click', () => { editing = null; draw(); });
    $('[data-del]', form)?.addEventListener('click', async () => {
      if (!confirm(`Удалить «${p.title || 'без названия'}»?`)) return;
      if (await removeRow(p)) { editing = null; draw(); toast('Кейс удалён'); }
    });
    $('input[name=image]', form)?.addEventListener('input', (e) => {
      p.image = e.target.value.trim();
      $('#prev', form)?.firstElementChild?.replaceWith(el('span', 'pthumb', p.image ? `<img src="${esc(p.image)}" alt="">` : `<svg class="ico" aria-hidden="true"><use href="#i-${esc(p.icon)}"></use></svg>`));
    });
    $('#upl', form)?.addEventListener('click', async () => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.onchange = async () => {
        const file = inp.files?.[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) { toast('Файл больше 4 МБ — сожми сначала'); return; }
        const name = `${Date.now()}-${file.name.replace(/[^a-z0-9.]+/gi, '-').toLowerCase()}`;
        const { error } = await sb.storage.from(BUCKET).upload(name, file, { contentType: file.type, upsert: false });
        if (error) { toast(`Загрузка не вышла: ${error.message}`); return; }
        const { data } = sb.storage.from(BUCKET).getPublicUrl(name);
        p.image = data.publicUrl;
        const f2 = $('input[name=image]', form);
        if (f2) f2.value = p.image;
        draw();
        toast('Картинка загружена');
      };
      inp.click();
    });
  });
}

function draw() {
  const main = $('#adm-main');
  const list = $('.plist', main);
  if (!list) { renderPanel(); return; }
  const bar = $('.adm-bar h1', main);
  if (bar) bar.innerHTML = `Кейсы <span class="u-mut">(${rows.length})</span>`;
  list.replaceWith(renderList());
  bindList();
}

/* ── импорт/экспорт ───────────────────────────────────────────────────── */
function exportJson() {
  const data = JSON.stringify(rows.map(toFile), null, 2) + '\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = 'projects.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('projects.json — положи в src/data/ и закоммить');
}
async function onImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error('ожидался массив кейсов');
    const next = parsed.map((p, i) => ({ ...p, id: String(p.id || `case-${i}`), services: p.services || [], published: p.published !== false, sort_order: i }));
    if (mode === 'db') {
      for (const p of next) await persist({ ...p });
      await fetchRows();
    } else {
      rows = next;
      saveDemo();
    }
    draw();
    toast(`Импортировано: ${next.length}`);
  } catch (err) {
    toast(`Импорт не удался: ${err.message}`);
  } finally {
    e.target.value = '';
  }
}

async function signOut() {
  if (mode === 'db') await sb.auth.signOut();
  else localStorage.removeItem(LS.session);
  rows = [];
  editing = null;
  renderLogin();
}

/* ── вход ─────────────────────────────────────────────────────────────── */
async function start() {
  try {
    await fetchRows();
  } catch (err) {
    toast(`Не удалось прочитать базу: ${err.message}`);
    rows = [];
  }
  setMode(mode === 'db' ? `база · ${TABLE}` : 'демо · localStorage', mode === 'db' ? 'db' : '');
  renderPanel();
}

async function boot() {
  if (!DB_ON) {
    setMode('демо · Supabase не подключён');
    renderLogin();
    return;
  }
  try {
    const sup = await loadSdk();
    if (!sup?.createClient) throw new Error('supabase sdk не найден (запусти npm run build с установленными зависимостями)');
    sb = sup.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await sb.auth.getSession();
    if (data?.session) return start();
    setMode('база · нужен вход');
    renderLogin();
  } catch (err) {
    setMode('база недоступна');
    $('#adm-main').innerHTML = `<section class="adm-warn"><h1 class="adm-h">Не поднялось</h1><p class="adm-note">${esc(String(err.message || err))}</p></section>`;
  }
}
boot();
