-- ─── TNZ Media · схема для Supabase ──────────────────────────────────────
-- Как применять: Supabase Dashboard → SQL Editor → вставить целиком → Run.
-- Затем: Authentication → Add user (email + пароль) и добавить этот же email
-- в таблицу admin_emails (запрос в конце). Всё, что не перечислено, — читает,
-- но не пишет.

create extension if not exists pgcrypto;

-- 1. кейсы -----------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  slug        text  not null unique,
  title       text  not null,
  tag         text,
  category    text  not null default 'design' check (category in ('design','app','sites')),
  icon        text  not null default 'studio',
  summary     text,
  problem     text,
  solution    text,
  result      text,
  tags        text,                       -- услуги через запятую
  link        text,
  image_url   text,
  year        text,
  sort_order  integer not null default 0,
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_order_idx on public.projects (published, sort_order);

-- 2. кто админ -------------------------------------------------------------
create table if not exists public.admin_emails (
  email text primary key
);

-- 3. проверка админа отдельной security definer-функцией
--    (иначе политика читает admin_emails и упирается в собственную RLS)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_emails a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 4. RLS -------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.admin_emails enable row level security;

drop policy if exists "anon видит только опубликованные" on public.projects;
create policy "anon видит только опубликованные"
  on public.projects for select
  to anon, authenticated
  using (published or public.is_admin());

drop policy if exists "админ пишет" on public.projects;
create policy "админ пишет"
  on public.projects for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "админ правит" on public.projects;
create policy "админ правит"
  on public.projects for update
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "админ удаляет" on public.projects;
create policy "админ удаляет"
  on public.projects for delete
  to authenticated
  using (public.is_admin());

-- список админов: никто не читает и не меняет его через API (только SQL-редактор)
drop policy if exists "admin_emails закрыт" on public.admin_emails;
create policy "admin_emails только админу"
  on public.admin_emails for select
  to authenticated
  using (public.is_admin());

-- 5. updated_at ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- 6. картинки: публичный бакет, запись только админу -----------------------
insert into storage.buckets (id, name, public)
values ('portfolio', 'portfolio', true)
on conflict (id) do nothing;

drop policy if exists "portfolio открыт на чтение" on storage.objects;
create policy "portfolio открыт на чтение"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'portfolio');

drop policy if exists "portfolio пишет админ" on storage.objects;
create policy "portfolio пишет админ"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'portfolio' and public.is_admin());

drop policy if exists "portfolio удаляет админ" on storage.objects;
create policy "portfolio удаляет админ"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'portfolio' and public.is_admin());

-- 7. посев: текущие кейсы сайта -------------------------------------------
insert into public.projects (slug, title, tag, category, icon, summary, problem, solution, tags, link, sort_order) values
  ('mascot-karten','Mascot: Karten','Дизайн персонажа','design','mascot','Разработка талисмана бренда: характер, форма, вариации эмоций для соцсетей и мерча.','Бренду нужен был свой персонаж, который живёт не только на логотипе.','Собрали библиотеку поз и эмоций: один рисунок читается и в 24 px, и в 3 м.','Персонаж, Стикеры, Мерч',null,0),
  ('cold-carti','COLD CARTI','Фестивальный брендинг','design','fest','Полный визуальный язык музыкального фестиваля: айдентика, афиши, оформление сцены.','Фестиваль менял площадку и аудиторию — старый визуал больше не собирал толпу.','Единая система: шрифт, цвет, модульная сетка афиш.','Айдентика, Афиши, Сцена',null,1),
  ('metallurg','Металлург','Ребрендинг санатория','design','spa','Обновление визуальной идентичности санатория — от логотипа до навигации на территории.','Санаторий с 60-летней историей и визуалом из 2005-го.','Перебрали палитру, ввели систему табличек и номеров корпусов.','Ребрендинг, Навигация, Гайд',null,2),
  ('zebra-eco','Zebra ECO','Брендинг','design','zebra','Экологичный бренд с чистой геометричной айдентикой и акцентом на упаковку.','Ниша «эко» забита одинаковой крафтовой бумагой и листьями.','Ушли от крафта в геометрию: зебра из модулей, одна краска.','Айдентика, Упаковка',null,3),
  ('rofls-studio','Rofls Studio','Брендинг студии','design','studio','Айдентика креативной студии: логотип, шрифтовая пара, гайд по использованию.','Студия росла, а визуал оставался набором разрозненных макетов.','Свели всё к одному языку: логотип, сетка, две гарнитуры.','Логотип, Шрифты, Гайд',null,4),
  ('maplink','MapLink','Telegram Mini App','app','maplink','Мини-приложение для шеринга и поиска мест внутри Telegram — от дизайна до бота.','Люди скидывают места ссылками, и половина теряется в переписках.','Карта мест прямо в Telegram, без установки приложения.','UX, Дизайн, Mini App','https://t.me/MapLinkAppbot/MapLink',5),
  ('rashodka','Rashodka','Telegram-бот','app','rashodka','Бот для учёта расходов — простой интерфейс, понятная механика, быстрый онбординг.','Приложения для учёта трат открываются, чтобы внести сумму, и закрываются от усталости.','Весь ввод — одна строка в чате: «кофе 150».','Механика, Бот, Интерфейс','https://t.me/rashodkaDCbot',6)
on conflict (slug) do nothing;

-- 8. свой email сюда (повтори для каждого админа) --------------------------
-- insert into public.admin_emails (email) values ('you@example.com')
-- on conflict (email) do nothing;

-- 9. важно: в .env только ANON key (он публичный и защищён RLS).
--    service_role key на клиент не попадает никогда.
