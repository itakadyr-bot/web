// ============================================================
// reserva-crear · abre el pago de la señal de un campamento
// ------------------------------------------------------------
// QUÉ HACE, EN CRISTIANO
//   Una familia rellena el formulario de reserva de una ficha de
//   campamento. Esta función mira EN LA BASE cuánto vale la señal
//   de verdad (nunca se fía del importe que mande un navegador),
//   apunta la reserva como «pendiente» y devuelve la dirección de
//   la pasarela de Stripe. Los datos de la tarjeta NUNCA pasan por
//   la web de Ítaka: se teclean en la página de Stripe.
//
// LO QUE NO SE FÍA DEL NAVEGADOR
//   · El importe. Sale de la tabla `campamentos`, columna
//     senal_centimos. Lo que mande el navegador se tira.
//   · Si hay plazas. Si el campamento está con activo=false, aquí
//     se dice «reservas cerradas» y no se abre ningún pago.
//   · La reserva la escribe ESTA función con la llave de servicio:
//     desde el navegador la tabla `reservas` ni se ve ni se toca.
//
// CLAVES · ninguna está en este archivo ni puede estarlo
//   STRIPE_SECRET_KEY   · la pone el club en Supabase → Secrets
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY · las pone Supabase
//   Opcional: PAGOS_URL_BASE (por defecto, la web publicada)
//
// Si falta STRIPE_SECRET_KEY, contesta «todavía no está activado»
// con buenos modales. No revienta ni deja botones muertos.
//
// Cómo se publica: Supabase → Edge Functions → Deploy new function
// → «via Editor» → nombre `reserva-crear` → pegar este archivo.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DESTINO = Deno.env.get("CORREO_DESTINO") ?? "itakadyr@gmail.com";
const URL_BASE = (Deno.env.get("PAGOS_URL_BASE") ?? "https://itakadyr-bot.github.io/web/")
  .replace(/\/*$/, "/");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respuesta(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function base(ruta: string, opciones: RequestInit = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...((opciones.headers as Record<string, string>) ?? {}),
    },
  });
  const texto = await r.text();
  return { ok: r.ok, datos: texto ? JSON.parse(texto) : null };
}

function texto(valor: unknown, tope: number): string {
  return String(valor ?? "").trim().slice(0, tope);
}

/* Para que un nombre o una dirección no puedan colar HTML en el correo. */
function limpio(t: unknown): string {
  return String(t ?? "").replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c)
  );
}

const ETIQUETAS: Record<string, string> = {
  dni: "DNI del alumno/a", sip: "SIP", sexo: "Sexo",
  anyo_nacimiento: "Año de nacimiento", talla: "Talla de camiseta",
  hermano: "¿Viene su hermano/a también?", primera_vez: "¿Primera experiencia?",
  tutor_dni: "DNI del tutor/a", direccion: "Dirección",
  como_nos_conocio: "¿Cómo nos conoció?", grupo_nuevos: "¿Grupo de 3+ nuevos?",
  alergias: "Alergias / intolerancias", autoriza_info: "Autoriza envío de información",
  autoriza_fotos: "Autoriza fotos y vídeos", observaciones: "Observaciones",
};

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (peticion.method !== "POST") return respuesta({ error: "solo POST" }, 405);

  let datos: Record<string, unknown> = {};
  try { datos = await peticion.json(); } catch (_e) { /* cuerpo roto */ }

  const campamentoId = texto(datos.campamento, 40);
  const participante = texto(datos.participante, 160);
  const nacimiento = texto(datos.nacimiento, 20);
  const tutor = texto(datos.tutor, 120);
  const email = texto(datos.email, 200);
  const telefono = texto(datos.telefono, 40);

  // El resto de la ficha de inscripción viaja en `datos.datos` y se
  // guarda tal cual (limpio y recortado) en la columna jsonb.
  const CLAVES_FICHA = [
    "dni", "sip", "sexo", "anyo_nacimiento", "talla", "hermano",
    "primera_vez", "tutor_dni", "direccion", "como_nos_conocio",
    "grupo_nuevos", "alergias", "autoriza_info", "autoriza_fotos",
    "observaciones",
  ];
  const ficha: Record<string, string> = {};
  const crudo = (datos.datos ?? {}) as Record<string, unknown>;
  for (const clave of CLAVES_FICHA) {
    const valor = texto(crudo[clave], 600);
    if (valor) ficha[clave] = valor;
  }

  /* Cómo quieren pagar la señal: con tarjeta ahora (Stripe) o en
     efectivo en persona. Cualquier otra cosa que llegue, a tarjeta. */
  const enEfectivo = texto(datos.pago, 20) === "efectivo";

  if (!campamentoId || !participante || !tutor || !email.includes("@")) {
    return respuesta({ error: "faltan_datos", mensaje: "Revisa el nombre, el tutor y el correo." }, 400);
  }

  /* La señal en efectivo no necesita Stripe; la de tarjeta, sí. */
  if (!enEfectivo && !STRIPE_KEY) {
    return respuesta({
      error: "no_activado",
      mensaje: "El pago con tarjeta todavía no está activado. Elige «en efectivo» o escríbenos.",
    }, 503);
  }

  // El campamento y su señal, DE LA BASE.
  const busca = await base(`campamentos?id=eq.${campamentoId}&select=id,nombre,senal_centimos,activo`);
  const camp = busca.ok && busca.datos && busca.datos[0];
  if (!camp) return respuesta({ error: "no_existe", mensaje: "Ese campamento no existe." }, 404);
  if (!camp.activo) {
    return respuesta({
      error: "cerrado",
      mensaje: "Las reservas de este campamento están cerradas ahora mismo. Escríbenos y te avisamos al abrir.",
    }, 409);
  }

  // La reserva, apuntada como pendiente antes de ir al banco.
  const alta = await base("reservas", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      campamento_id: camp.id,
      participante, nacimiento, tutor, email, telefono,
      datos: ficha,
      estado: enEfectivo ? "pendiente-efectivo" : "pendiente",
      importe_centimos: camp.senal_centimos,
    }),
  });
  const reserva = alta.ok && alta.datos && alta.datos[0];
  if (!reserva) {
    console.error("No se pudo apuntar la reserva:", alta.datos);
    return respuesta({ error: "base", mensaje: "No se pudo apuntar la reserva. Prueba en un momento." }, 500);
  }

  // ---------------------------------------------------------------
  // Señal en efectivo: aquí no hay Stripe. La inscripción queda
  // apuntada como pendiente, al club le llega la ficha entera por
  // correo con el recado de quedar para cobrar, y a la familia se le
  // deja claro que la plaza NO está confirmada hasta ese pago.
  // ---------------------------------------------------------------
  if (enEfectivo) {
    if (RESEND_KEY) {
      const filasFicha = Object.keys(ETIQUETAS)
        .filter((k) => ficha[k])
        .map((k) => `<b>${ETIQUETAS[k]}:</b> ${limpio(ficha[k])}`)
        .join("<br>\n         ");
      const html = `
        <h2 style="margin:0 0 12px">🖐️ Inscripción pendiente de señal EN EFECTIVO</h2>
        <p style="background:#fdf6e7;border:1px solid #ecd9a8;border-radius:8px;padding:10px 14px">
        La familia ha elegido pagar la señal de ${(camp.senal_centimos / 100).toFixed(2)} €
        <b>en efectivo</b>. Hay que quedar con ellos para cobrarla; hasta entonces la plaza
        no está confirmada. Cuando paguen, cambiad el estado de la reserva a «pagada»
        en Supabase (Table Editor → reservas).</p>
        <p><b>Campamento:</b> ${limpio(camp.nombre)}<br>
           <b>Participante:</b> ${limpio(participante)}<br>
           <b>Tutor/a:</b> ${limpio(tutor)}<br>
           <b>Correo:</b> ${limpio(email)}<br>
           <b>Teléfono:</b> ${limpio(telefono) || "—"}</p>
        ${filasFicha ? `<h3 style="margin:16px 0 8px">Ficha de inscripción</h3><p>${filasFicha}</p>` : ""}
        <p style="color:#888">Reserva ${limpio(reserva.id)} · para responder, escribe a ${limpio(email)}.</p>`;
      const envio = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Web de Ítaka <onboarding@resend.dev>",
          to: [DESTINO],
          reply_to: email,
          subject: `Señal EN EFECTIVO pendiente: ${participante} · ${camp.nombre}`,
          html,
        }),
      });
      if (envio.ok) {
        await base(`reservas?id=eq.${reserva.id}`, {
          method: "PATCH", body: JSON.stringify({ aviso_enviado: true }),
        });
      } else {
        console.error("Resend dijo que no:", await envio.text());
      }
    }
    return respuesta({ hecho: true, efectivo: true });
  }

  // La sesión de pago de Stripe: la señal, con las vueltas a la ficha.
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", `${URL_BASE}campamentos/${camp.id}/reserva/?reserva=ok`);
  p.set("cancel_url", `${URL_BASE}campamentos/${camp.id}/reserva/?reserva=ko`);
  p.set("customer_email", email);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", "eur");
  p.set("line_items[0][price_data][unit_amount]", String(camp.senal_centimos));
  p.set("line_items[0][price_data][product_data][name]", `Señal de reserva · ${camp.nombre}`);
  p.set("line_items[0][price_data][product_data][description]",
    `Participante: ${participante}. La señal se descuenta del precio total del campamento.`);
  p.set("metadata[reserva_id]", reserva.id);
  p.set("payment_intent_data[metadata][reserva_id]", reserva.id);

  const rStripe = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: p,
  });
  const sesion = await rStripe.json();
  if (!rStripe.ok || !sesion.url) {
    console.error("Stripe dijo que no:", sesion);
    return respuesta({ error: "stripe", mensaje: "No se pudo abrir el pago. Prueba en un momento." }, 502);
  }

  // Se apunta qué sesión de Stripe corresponde a la reserva.
  await base(`reservas?id=eq.${reserva.id}`, {
    method: "PATCH",
    body: JSON.stringify({ stripe_session_id: sesion.id }),
  });

  return respuesta({ url: sesion.url });
});
