# Puesta en marcha — lo que hay que crear y darle a Claude

Lista de recados para encender la web nueva de Ítaka. Ninguno requiere saber
programar. Marca con ✅ lo hecho. El orden importa: cada paso desbloquea el
siguiente.

---

## ✅ 1 · GitHub (para publicar la web) — HECHO

Repo: `github.com/itakadyr-bot/web` (con `escuelaapolana` de colaboradora
para poder subir desde este ordenador). Web publicada en
https://itakadyr-bot.github.io/web/ · Pasos originales, por si hay que
repetirlos algún día:

1. Crear una cuenta nueva de GitHub para Ítaka (por ejemplo `itakadyr`),
   con el correo itakadyr@gmail.com. **Las cuentas las creas tú**, no Claude.
2. En esa cuenta, crear un repositorio público vacío llamado `web` (o el
   nombre que prefieras). Sin README ni nada: vacío.
3. Darle a Claude la dirección del repositorio. Para poder subir, hace falta
   una de estas dos cosas:
   - iniciar sesión con esa cuenta cuando git lo pida en el primer push, o
   - crear un *token* en GitHub (Settings → Developer settings →
     Fine-grained tokens, con permiso de contenido sobre ese repo) y pasárselo.
4. Cuando el repo esté subido: Settings → Pages → Deploy from branch → `main`.
   La web quedará en `https://<cuenta>.github.io/<repo>/` hasta que se
   apunte el dominio itakadyr.com.

## ✅ 2 · Supabase — HECHO (2 sep 2026)

Proyecto: `oopyndrewijbqcryfbuj.supabase.co` (Frankfurt). La web ya está
conectada. Lo que queda: seguir `SETUP-SUPABASE.md` pasos 1–5 (pegar el SQL
y crear el usuario de administración). Pasos originales:

1. En [supabase.com](https://supabase.com), crear una organización/proyecto
   nuevo para Ítaka (mejor con la cuenta de itakadyr@gmail.com, separado del
   de Apolana). Región: Central EU (Frankfurt).
2. Pasarle a Claude dos datos del proyecto (Settings → API):
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key** (esta clave es pública, va en la web sin problema)
3. Claude preparará un `SETUP-SUPABASE.md` con todo el SQL para pegar en el
   SQL Editor, como en Apolana: tablas de contenido (modo fantasma), mensajes
   del formulario, campamentos y reservas, con sus políticas de seguridad.

## ✅ 3 · Correo — HECHO (2 sep 2026). Función `correo-avisar` desplegada,
## RESEND_API_KEY en los secrets, circuito probado de punta a punta.

1. Crear cuenta gratuita en [resend.com](https://resend.com) **con
   itakadyr@gmail.com**. Sin verificar ningún dominio, Resend ya permite
   mandar correos a la propia dirección de la cuenta: justo lo que hace
   falta para recibir los avisos de la web.
2. Crear una API key en Resend y pegarla en Supabase → Edge Functions →
   Secrets como `RESEND_API_KEY`. (Mejor pegarla ahí directamente que
   pasarla por el chat.)
3. Más adelante, si se quiere que el remitente sea `web@itakadyr.com` y
   responder a las familias desde ahí, se verifica el dominio en Resend
   (dos registros DNS).

## ⬜ 4 · Stripe (señal de reserva de campamento) — LO ÚNICO PENDIENTE

1. Crear cuenta en [stripe.com](https://stripe.com) a nombre de Ítaka, con
   sus datos fiscales. Hasta el último paso se trabaja en **modo prueba**:
   no se cobra nada de verdad.
2. Pegar la clave secreta de prueba (`sk_test_…`) en Supabase → Edge
   Functions → Secrets como `STRIPE_SECRET_KEY`.
3. Claude montará el circuito igual que en Apolana: el importe de la señal
   vive en la base de datos (no en el navegador), la tarjeta se teclea en la
   página de Stripe, y la reserva se confirma con el aviso de vuelta de
   Stripe, no con lo que diga el navegador.
4. Cuando todo esté probado, se cambia la clave de prueba por la real y se
   enciende.

---

## Qué hará Claude con cada cosa

| Cuando tenga… | Hará… |
|---|---|
| el repositorio | subir la web y encender GitHub Pages |
| URL + anon key de Supabase | conectar formulario de contacto y preparar el SQL |
| el SQL ejecutado | modo fantasma: textos y fotos editables encima de la página |
| `RESEND_API_KEY` en Supabase | aviso al correo con cada mensaje y cada reserva |
| `STRIPE_SECRET_KEY` en Supabase | reserva de campamento con señal, en modo prueba |
