-- PECIFA Afiliaciones · esquema de base de datos y storage
-- Pegar completo en Supabase → SQL Editor → Run (es idempotente).

create table if not exists public.afiliaciones (
  id           bigint generated always as identity primary key,
  nro_tramite  text unique,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente','en_revision','observada','aprobada','rechazada')),
  nro_afiliado text not null default '',
  apellido     text not null default '',
  nombres      text not null default '',
  dni          text not null default '',
  cuil         text not null default '',
  email        text not null default '',
  telefono     text not null default '',
  fuerza       text not null default '',
  localidad    text not null default '',
  datos        jsonb not null default '{}'::jsonb,
  archivos     jsonb not null default '[]'::jsonb,
  notas        text not null default '',
  historial    jsonb not null default '[]'::jsonb,
  token        text not null,
  ip           text not null default '',
  user_agent   text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists afiliaciones_estado_idx  on public.afiliaciones (estado);
create index if not exists afiliaciones_created_idx on public.afiliaciones (created_at desc);
create index if not exists afiliaciones_ip_idx      on public.afiliaciones (ip, created_at);
-- Una sola afiliación vigente por documento (las rechazadas no cuentan).
create unique index if not exists afiliaciones_dni_vigente on public.afiliaciones (dni) where estado <> 'rechazada';

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists afiliaciones_touch on public.afiliaciones;
create trigger afiliaciones_touch before update on public.afiliaciones
for each row execute function public.touch_updated_at();

-- Usuarios del panel (por correo; el usuario se crea en Authentication → Users).
create table if not exists public.staff (
  email      text primary key,
  nombre     text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

alter table public.afiliaciones enable row level security;
alter table public.staff enable row level security;

-- El formulario público NO escribe directo: lo hace la API con service role.
drop policy if exists "staff lee afiliaciones" on public.afiliaciones;
create policy "staff lee afiliaciones" on public.afiliaciones
  for select to authenticated using (public.is_staff());

drop policy if exists "staff actualiza afiliaciones" on public.afiliaciones;
create policy "staff actualiza afiliaciones" on public.afiliaciones
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff se ve" on public.staff;
create policy "staff se ve" on public.staff
  for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

revoke all on public.afiliaciones from anon;
revoke all on public.staff from anon;
grant select, update on public.afiliaciones to authenticated;
grant select on public.staff to authenticated;

-- Bucket privado para la documentación (máx. 8 MB, solo PDF/JPG/PNG).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('afiliaciones', 'afiliaciones', false, 8388608, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "staff lee documentacion" on storage.objects;
create policy "staff lee documentacion" on storage.objects
  for select to authenticated using (bucket_id = 'afiliaciones' and public.is_staff());

-- Usuario inicial del panel.
insert into public.staff (email, nombre) values ('guillemuhana@gmail.com', 'Guillermo Muhana')
on conflict (email) do nothing;
