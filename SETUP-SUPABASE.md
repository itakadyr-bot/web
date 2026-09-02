# Configuración de Supabase — pasos manuales

Aquí está TODO lo que hay que hacer en el panel de Supabase para que la web
funcione: el SQL, el usuario de administración y la función del correo.
Marca con ✅ lo que ya hayas hecho.

> Cómo ejecutar SQL: Supabase → menú izquierdo **SQL Editor** → **New query**
> → pegar el bloque → **Run**. Si dice "Success", listo.

---

## 1. Quién es administración

Una tabla con los correos que pueden editar la web, y la pregunta
`es_admin()` que usan todos los candados de seguridad.

```sql
create table if not exists public.administradores (
  correo text primary key
);
alter table public.administradores enable row level security;

insert into public.administradores (correo) values ('itakadyr@gmail.com')
on conflict do nothing;

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.administradores a
    where lower(a.correo) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;

revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to authenticated, anon;

drop policy if exists "admin lee administradores" on public.administradores;
create policy "admin lee administradores" on public.administradores
for select to authenticated using (public.es_admin());
```

---

## 2. Contenido editable (modo fantasma)

Dos tablas: lo que dice cada hueco de texto y qué foto va en cada hueco.
Cualquiera puede LEERLAS (es lo que se ve en la web); solo administración
puede escribirlas.

```sql
create table if not exists public.contenido_web (
  pagina text not null,
  hueco  text not null,
  valor  text,
  updated_at timestamptz default now(),
  primary key (pagina, hueco)
);
alter table public.contenido_web enable row level security;

drop policy if exists "cualquiera lee contenido" on public.contenido_web;
create policy "cualquiera lee contenido" on public.contenido_web
for select to anon, authenticated using (true);

drop policy if exists "admin escribe contenido" on public.contenido_web;
create policy "admin escribe contenido" on public.contenido_web
for all to authenticated using (public.es_admin()) with check (public.es_admin());

create table if not exists public.imagenes_web (
  pagina text not null,
  hueco  text not null,
  url    text,
  posicion text,  -- encuadre elegido arrastrando la foto (object-position)
  updated_at timestamptz default now(),
  primary key (pagina, hueco)
);
-- Si la tabla ya existía de antes sin la columna del encuadre:
alter table public.imagenes_web add column if not exists posicion text;
alter table public.imagenes_web enable row level security;

drop policy if exists "cualquiera lee imagenes" on public.imagenes_web;
create policy "cualquiera lee imagenes" on public.imagenes_web
for select to anon, authenticated using (true);

drop policy if exists "admin escribe imagenes" on public.imagenes_web;
create policy "admin escribe imagenes" on public.imagenes_web
for all to authenticated using (public.es_admin()) with check (public.es_admin());
```

---

## 3. Almacén de fotos (para subir fotos en modo fantasma)

```sql
insert into storage.buckets (id, name, public) values ('imagenes','imagenes', true)
on conflict (id) do nothing;

drop policy if exists "cualquiera ve imagenes" on storage.objects;
create policy "cualquiera ve imagenes" on storage.objects
for select using (bucket_id = 'imagenes');

drop policy if exists "admin sube imagenes" on storage.objects;
create policy "admin sube imagenes" on storage.objects
for all to authenticated
using (bucket_id = 'imagenes' and public.es_admin())
with check (bucket_id = 'imagenes' and public.es_admin());
```

---

## 4. Formulario de contacto (tabla de mensajes)

Cualquiera puede ENVIAR un mensaje (es un formulario público); solo
administración puede leerlos y gestionarlos.

```sql
create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  nombre  text,
  email   text,
  telefono text,
  interes text,
  mensaje text,
  atendido boolean default false,
  aviso_enviado boolean default false,
  created_at timestamptz default now()
);
alter table public.mensajes enable row level security;

drop policy if exists "enviar mensaje" on public.mensajes;
create policy "enviar mensaje" on public.mensajes
for insert to anon, authenticated with check (true);

drop policy if exists "admin gestiona mensajes" on public.mensajes;
create policy "admin gestiona mensajes" on public.mensajes
for all to authenticated using (public.es_admin()) with check (public.es_admin());
```

---

## 5. El usuario para entrar (esto no es SQL)

1. Supabase → **Authentication** → **Users** → **Add user** → *Create new user*.
2. Correo: `itakadyr@gmail.com` · contraseña: una buena, guardadla bien.
3. Marca **Auto Confirm User** si aparece la casilla.

Con esto ya se puede entrar en la web por `/acceso/` y editar en modo
fantasma. Si algún día hay más personas editando, se les crea usuario aquí
y se añade su correo a la tabla `administradores` (paso 1).

---

## 6. La función del correo (cuando exista la cuenta de Resend)

1. Supabase → **Edge Functions** → **Deploy a new function** → *via Editor*.
2. Nombre: `correo-avisar`. Borra el ejemplo y pega el contenido del archivo
   `supabase/functions/correo-avisar/index.ts` de este repositorio. Deploy.
3. Supabase → **Edge Functions** → **Secrets** → añade `RESEND_API_KEY` con
   la clave creada en resend.com (cuenta hecha con itakadyr@gmail.com).

Sin este paso la web funciona igual: los mensajes se guardan en la base;
solo falta el aviso al correo.

---

## 7. Pendiente para la fase de pagos (todavía NO)

Las tablas de campamentos y reservas, y las funciones de Stripe, llegarán
cuando esté la cuenta de Stripe. Se añadirán aquí como paso 7 y 8.
