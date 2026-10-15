-- PECIFA: ejecutar COMPLETO en SQL Editor de hnkrtdrogkxdndquofpz.
-- Repetible, sin borrar datos. Corresponde a la versión UUID de la app.
-- El envío normal pasa por Vercel (service_role); anon tiene solo INSERT.
-- No usar .insert(...).select() con anon: no puede leer ni el registro creado.
begin;

create table if not exists public.afiliaciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  nro_tramite text unique,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','en_revision','observada','aprobada','rechazada')),
  nro_afiliado text not null default '',
  apellido text not null default '',
  nombres text not null default '',
  dni text not null default '',
  cuil text not null default '',
  email text not null default '',
  telefono text not null default '',
  fuerza text not null default '',
  localidad text not null default '',
  -- Campos de lib/schema.js: personales, laborales, CBU, afiliado_por,
  -- seccional, acepta, firma_fecha, firma_ip.
  -- datos.familiares: [{nombre, parentesco, dni, nacimiento}].
  datos jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object'),
  -- [{campo, path, nombre, mime, bytes}], sin URLs públicas.
  -- campo: adj_recibo, adj_dni, adj_familiares, adj_selfie o firma.
  archivos jsonb not null default '[]'::jsonb check (jsonb_typeof(archivos) = 'array'),
  notas text not null default '',
  historial jsonb not null default '[]'::jsonb check (jsonb_typeof(historial) = 'array'),
  token text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  ip text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No convierte ni borra una tabla anterior con IDs numéricos.
do $$ begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'afiliaciones' and column_name = 'id') <> 'uuid' then
    raise exception 'afiliaciones.id no es UUID. Se necesita migrar el esquema anterior; no se borró ningún dato.';
  end if;
end $$;

create index if not exists afiliaciones_estado_idx on public.afiliaciones (estado);
create index if not exists afiliaciones_created_idx on public.afiliaciones (created_at desc);
create index if not exists afiliaciones_ip_idx on public.afiliaciones (ip, created_at);
create unique index if not exists afiliaciones_dni_vigente on public.afiliaciones (dni) where estado <> 'rechazada';

create or replace function public.asignar_tramite() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.nro_tramite := 'AF-' || to_char(new.created_at at time zone 'America/Argentina/Buenos_Aires', 'YYYY')
    || '-' || lpad(new.numero::text, greatest(5, length(new.numero::text)), '0');
  return new;
end $$;
drop trigger if exists afiliaciones_tramite on public.afiliaciones;
create trigger afiliaciones_tramite before insert on public.afiliaciones
for each row execute function public.asignar_tramite();

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists afiliaciones_touch on public.afiliaciones;
create trigger afiliaciones_touch before update on public.afiliaciones
for each row execute function public.touch_updated_at();

create table if not exists public.staff (
  email text primary key,
  nombre text not null default '',
  created_at timestamptz not null default now()
);
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;
grant usage on schema public to anon, authenticated, service_role;
alter table public.afiliaciones enable row level security;
alter table public.staff enable row level security;

revoke all on public.afiliaciones from public, anon, authenticated;
revoke all on public.staff from public, anon, authenticated;
-- No permite elegir id, trámite, estado, token ni campos internos.
grant insert (apellido, nombres, dni, cuil, email, telefono, fuerza, localidad, datos, archivos)
  on public.afiliaciones to anon;
grant usage on sequence public.afiliaciones_numero_seq to anon, service_role;
grant select, update on public.afiliaciones to authenticated;
grant select on public.staff to authenticated;
grant all on public.afiliaciones, public.staff to service_role;

drop policy if exists "anon crea afiliaciones" on public.afiliaciones;
create policy "anon crea afiliaciones" on public.afiliaciones
  for insert to anon with check (
    estado = 'pendiente' and nro_afiliado = '' and notas = '' and historial = '[]'::jsonb
    and length(trim(apellido)) > 0 and length(trim(nombres)) > 0
    and dni ~ '^[0-9]{6,9}$' and length(trim(email)) > 0
  );
drop policy if exists "staff lee afiliaciones" on public.afiliaciones;
create policy "staff lee afiliaciones" on public.afiliaciones
  for select to authenticated using (public.is_staff());
drop policy if exists "staff actualiza afiliaciones" on public.afiliaciones;
create policy "staff actualiza afiliaciones" on public.afiliaciones
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff se ve" on public.staff;
create policy "staff se ve" on public.staff
  for select to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Un bucket privado de 8 MB por archivo. Políticas en storage.objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('afiliaciones', 'afiliaciones', false, 8388608, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
update storage.buckets set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png']
where id = 'afiliaciones';
-- Supabase ya habilita RLS y los permisos del API en storage.objects.
-- No se revocan permisos de otros buckets ni se cambia su ownership.
drop policy if exists "anon sube borradores afiliaciones" on storage.objects;
create policy "anon sube borradores afiliaciones" on storage.objects
  for insert to anon with check (
    bucket_id = 'afiliaciones'
    and name ~ '^borradores/[0-9a-fA-F-]{36}/(adj_recibo|adj_dni|adj_familiares|adj_selfie|firma)-[^/]+[.](pdf|jpg|png)$'
  );
drop policy if exists "staff lee documentacion" on storage.objects;
create policy "staff lee documentacion" on storage.objects
  for select to authenticated using (bucket_id = 'afiliaciones' and public.is_staff());

insert into public.staff (email, nombre) values ('guillemuhana@gmail.com', 'Guillermo Muhana')
on conflict (email) do nothing;
-- Crear también la cuenta en Authentication > Users, con confirmación de email.
commit;
