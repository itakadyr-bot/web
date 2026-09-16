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
-- …ni la del PDF (cuando el hueco lleva un folleto o cartel en PDF,
-- aquí se guarda su dirección; lo que se ve es su primera página):
alter table public.imagenes_web add column if not exists archivo text;
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

## 7. Reservas de campamento (tablas para la fase de pagos)

El catálogo de campamentos (con la señal que se cobra: la lee el SERVIDOR,
nunca el navegador) y las reservas. Las reservas NO pueden crearse ni leerse
desde el navegador: solo las funciones (con la llave de servicio) y
administración.

```sql
create table if not exists public.campamentos (
  id text primary key,
  nombre text not null,
  senal_centimos integer not null check (senal_centimos > 0),
  activo boolean not null default true,
  created_at timestamptz default now()
);
alter table public.campamentos enable row level security;

drop policy if exists "cualquiera lee campamentos" on public.campamentos;
create policy "cualquiera lee campamentos" on public.campamentos
for select to anon, authenticated using (true);

drop policy if exists "admin gestiona campamentos" on public.campamentos;
create policy "admin gestiona campamentos" on public.campamentos
for all to authenticated using (public.es_admin()) with check (public.es_admin());

insert into public.campamentos (id, nombre, senal_centimos) values
  ('riopar',     'San Juan de Riópar',  15000),
  ('palancares', 'Palancares',          15000),
  ('alcossebre', 'Alcossebre · Jaime I', 15000)
on conflict (id) do nothing;

create table if not exists public.reservas (
  id uuid primary key default gen_random_uuid(),
  campamento_id text not null references public.campamentos(id),
  participante text not null,
  nacimiento text,
  tutor text not null,
  email text not null,
  telefono text,
  estado text not null default 'pendiente',
  importe_centimos integer not null,
  stripe_session_id text,
  aviso_enviado boolean default false,
  created_at timestamptz default now()
);
alter table public.reservas enable row level security;

drop policy if exists "admin gestiona reservas" on public.reservas;
create policy "admin gestiona reservas" on public.reservas
for all to authenticated using (public.es_admin()) with check (public.es_admin());
```

La ficha de inscripción completa (talla, alergias, autorizaciones…) se guarda
en una columna aparte. Si la tabla ya existía de antes, hay que añadirla:

```sql
alter table public.reservas add column if not exists datos jsonb;
```

Para CERRAR las reservas de un campamento (o de todos), sin tocar nada más:

```sql
update public.campamentos set activo = false;              -- todos
-- update public.campamentos set activo = false where id = 'riopar';
-- y para abrirlas: set activo = true
```

## 9. Domiciliación del resto del campamento (SEPA)

La familia autoriza una sola vez el cargo en su cuenta (IBAN, en la página
segura de Stripe) y los plazos del resto se cobran desde el panel de listas,
a ~0,35 € el recibo. Cada plazo vive en su fila, con su estado: pendiente →
procesando → cobrado (o devuelto).

```sql
alter table public.reservas add column if not exists stripe_customer_id text;
alter table public.reservas add column if not exists sepa_pm text;

create table if not exists public.plazos (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas(id) on delete cascade,
  concepto text not null,
  importe_centimos integer not null check (importe_centimos > 0),
  vence date not null,
  estado text not null default 'pendiente',
  stripe_payment_intent text,
  aviso_enviado boolean default false,
  created_at timestamptz default now()
);
alter table public.plazos enable row level security;

drop policy if exists "admin gestiona plazos" on public.plazos;
create policy "admin gestiona plazos" on public.plazos
for all to authenticated using (public.es_admin()) with check (public.es_admin());
```

## 10. Las funciones de la domiciliación

1. Desplegar por el editor (como siempre, nombres exactos):
   - `domiciliar-crear` — abre la autorización del IBAN (verificación JWT
     normal, como viene).
   - `plazos-cobrar` — lanza los recibos (verificación JWT normal; además
     comprueba por dentro que quien llama es administración).
2. RE-pegar `pago-webhook` con la versión nueva (aprende a apuntar la
   autorización SEPA y el resultado de cada recibo).
3. En Stripe → Webhooks → vuestro destino → **añadir dos eventos** a los que
   escucha: `payment_intent.succeeded` y `payment_intent.payment_failed`
   (sin quitar el `checkout.session.completed` que ya tiene).

Para probar sin banco de verdad: IBAN de pruebas `AT61 1904 3002 3457 3201`
(cualquier nombre y correo). El recibo tarda unos minutos en pasar de
«procesando» a «cobrado» en modo prueba.

## 8. Las funciones de Stripe (cuando esté la clave)

1. Stripe → **Developers → API keys** → copia la **Secret key** de PRUEBA
   (`sk_test_…`) → pégala en Supabase → Edge Functions → **Secrets** como
   `STRIPE_SECRET_KEY`.
2. Despliega por el editor (como `correo-avisar`) estas dos funciones del
   repositorio:
   - `reserva-crear` (verificación JWT normal, como viene)
   - `pago-webhook` — ⚠️ en su configuración hay que **desactivar
     «Verify JWT»**: a esta función la llama Stripe, no el navegador.
3. Stripe → **Developers → Webhooks → Add endpoint**:
   - URL: `https://oopyndrewijbqcryfbuj.supabase.co/functions/v1/pago-webhook`
   - Evento: `checkout.session.completed`
   - Crea el endpoint y copia su **Signing secret** (`whsec_…`) → Supabase →
     Edge Functions → Secrets como `STRIPE_WEBHOOK_SECRET`.
4. Para probar sin cobrar nada: tarjeta `4242 4242 4242 4242`, cualquier
   fecha futura y cualquier CVC. Cuando todo esté visto, se cambia la clave
   de prueba por la real (`sk_live_…`) y el webhook se recrea en modo real.

## 11. Plazas a la vista y lista de espera (14 sep 2026)

Dos cosas nuevas en la web: el chip de «Quedan X plazas» en las tarjetas de
campamento, y la lista de espera («avísame al abrir») cuando un campamento
está cerrado o completo. Hasta pegar este SQL, la web funciona igual pero
sin chips y con el aviso de espera dando el correo de contacto.

Supabase → SQL Editor → pegar TODO el bloque → Run:

```sql
-- El cupo (plazas totales) de cada campamento. Cámbialo cuando quieras.
alter table public.campamentos add column if not exists cupo integer;
update public.campamentos set cupo = 110 where id = 'riopar'     and cupo is null;
update public.campamentos set cupo = 70  where id = 'palancares' and cupo is null;
update public.campamentos set cupo = 70  where id = 'alcossebre' and cupo is null;

-- Vista pública de plazas: SOLO números (cupo y libres), nunca datos
-- de familias. Las plazas ocupadas son las señales pagadas más las
-- pendientes de efectivo.
create or replace view public.plazas_web as
select c.id, c.activo, c.cupo,
       greatest(coalesce(c.cupo, 0) - (
         select count(*)::int from public.reservas r
         where r.campamento_id = c.id
           and r.estado in ('pagada', 'pendiente-efectivo')
       ), 0) as libres
from public.campamentos c;
grant select on public.plazas_web to anon, authenticated;

-- La lista de espera: cualquiera puede APUNTARSE, pero leerla o borrar
-- solo administración (los correos son datos de familias).
create table if not exists public.interesados (
  id uuid primary key,
  campamento_id text not null references public.campamentos(id),
  email text not null,
  created_at timestamptz default now()
);
alter table public.interesados enable row level security;

drop policy if exists "apuntarse cualquiera" on public.interesados;
create policy "apuntarse cualquiera" on public.interesados
for insert to anon, authenticated with check (true);

drop policy if exists "admin lee interesados" on public.interesados;
create policy "admin lee interesados" on public.interesados
for select to authenticated using (public.es_admin());

drop policy if exists "admin borra interesados" on public.interesados;
create policy "admin borra interesados" on public.interesados
for delete to authenticated using (public.es_admin());
```

Después de esto:
- Las tarjetas de la portada y del catálogo enseñan el chip con las plazas
  reales (verde con hueco, ámbar con 10 o menos, «completo» sin hueco,
  gris si las reservas están cerradas).
- Si un campamento está cerrado o completo, la página de inscripción ofrece
  dejar el correo, y esos correos salen en el panel de listas (/admin/),
  abajo, con su botón de «copiar los correos» para escribirles en CCO.
- Para cambiar un cupo: `update public.campamentos set cupo = 120 where id = 'riopar';`
