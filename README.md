# TNZ Media — портфолио

Статический сайт (свой сборщик, zero-dep) + админка кейсов на Supabase.
Прежняя одностраничная версия лежит в [`archive/legacy-2026.html`](archive/legacy-2026.html).

```
src/data/*.json   контент (кейсы, услуги, пакеты, тексты)   ← правится здесь или в админке
src/css/*.css     токены тем, вёрстка, анимации
src/js/*.js       интерактив сайта и логика админки
tools/build.mjs   JSON → статический HTML в dist/  (node, без зависимостей)
tools/serve.mjs   локальный сервер + пересборка на изменения + live reload
supabase/schema.sql   таблица, RLS, бакет для картинок
qa/check.mjs      55 проверок собранного сайта
```

## Запуск

```bash
npm run dev      # http://localhost:8000 — пересобирает на правку src/
npm run build    # dist/
npm run qa       # проверки (структура, a11y, метаданные, вес)
npm run check    # build + qa
```

`npm install` не обязателен: сборщик работает на голом Node ≥20. npm нужен только для
минификации (esbuild) и локальной копии Supabase SDK — с ними dist получается легче и без
зависимости от CDN.

## Контент

Все тексты и цены — в `src/data/`:

| файл | что внутри |
| --- | --- |
| `site.json` | название, описание, контакты, hero-тексты, темы, шаги процесса, `baseUrl` |
| `projects.json` | кейсы: `title`, `tag`, `category`, `summary`, `problem`, `solution`, `result`, `image`, `link`, `services[]`, `published` |
| `services.json` | услуги по группам: `name`, `desc`, `price`, `time` |
| `packages.json` | пакеты: `name`, `items[]`, `price`, `save`, `featured` |

Картинки кейсов — в `public/img/`, в данных путь `img/название.png`. Превью берётся 4:3,
лучше 1600×1200. Для превью в Telegram/WhatsApp перегенерируй `npm run og` (нужен ImageMagick)
или положи свой `public/og.png` 1200×630.

После правки данных: `npm run check && git commit && git push` — GitHub Actions пересоберёт и зальёт сайт.

## Дизайн

Четыре темы вместо пяти пастельных: **Ночь** и **Мох** (тёмные), **Кость** и **Глина** (светлые) — переключаются
в шапке, выбор в `localStorage`, до первой отрисовки тему ставит маленький инлайн-скрипт (без вспышки).
Тёмная тема выбирается по `prefers-color-scheme`.

Типографика — только гарнитуры с кириллицей: Playfair Display (заголовки), Golos Text (текст и UI),
Unbounded (логотип), Caveat (подпись). Все пары «текст/фон» посчитаны до контраста ≥4.5:1 (обычно 7:1 и выше).

Мобильная версия — первичная: кейсы листаются карточкой с snap, нижняя липкая панель с кнопкой
«Написать» появляется после hero, все зоны нажатия ≥44 px, учтены `safe-area` и `100dvh`.
Анимации (появление слов, бегущая строка, hover-превью) полностью выключаются при
`prefers-reduced-motion`.

## Админка

Страница `/admin/` (в поиске не индексируется). Редактирует кейсы: порядок, черновик/публикация,
тексты, ссылка, обложка, услуги тегами. Экспорт в `projects.json` — чтобы фиксировать правки в git.

### Включить работу с базой

1. Создать проект на [supabase.com](https://supabase.com).
2. В проекте: **SQL Editor** → вставить целиком [`supabase/schema.sql`](supabase/schema.sql) → Run.
   Создаст таблицу `projects`, политику RLS, бакет `portfolio` и засеет текущие 7 кейсов.
3. **Authentication → Users → Add user**: почта + пароль (Provide manually). Отдельно включить
   провайдер Email/Password, если выключен.
4. В **SQL Editor** добавить свой email в админы:
   ```sql
   insert into public.admin_emails (email) values ('ты@example.com');
   ```
5. Локально: `cp .env.example .env` и вписать `SUPABASE_URL` / `SUPABASE_ANON_KEY`
   (Settings → API). Для продакшена — те же значения в **Settings → Secrets** репозитория
   с именами `SUPABASE_URL` и `SUPABASE_ANON_KEY` (workflow подхватит на сборке).
6. `npm run build` — в `dist/assets/config.js` попадут URL и anon-ключ, а `supabase-js`
   будет лежать локально в `dist/vendor/` (никаких CDN).

Готово: вход по почте и паролю, правки сразу видны на сайте (клиент подтягивает `published`
кейсы из базы), картинки грузятся в Storage.

**Что важно про безопасность**

- Пароль не сверяется в JS и нигде не хранится на сайте — проверка только на стороне Supabase Auth.
- В клиент попадает только `anon`-ключ. `service_role`/secret ключ на клиент не идёт никогда:
  с ним любой посетитель смог бы писать в базу.
- RLS: `anon` видит только `published = true`; изменять строки может только аутентифицированный
  пользователь, чей email есть в `admin_emails`.
- Данные из базы проходят экранирование перед вставкой в DOM — строка вида
  `<img src=x onerror=...>` в описании кейса не выполнится.

Без ключей админка работает в демо-режиме: тот же интерфейс, данные в `localStorage`,
в шапке честно написано «демо · Supabase не подключён». Это не защита, а способ пощупать UI.

## Деплой

В репозитории: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Дальше любой пуш в `main` собирает и публикует сайт; PR получает отчёт о проверках.
Кастомный домен: там же в Pages → Custom domain, и обнови `baseUrl` в `src/data/site.json`
(нужен для `canonical`, `og:image` и `sitemap.xml`).
