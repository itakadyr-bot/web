// ============================================================
// plazos-cobrar · lanza los recibos SEPA del resto del campamento
// ------------------------------------------------------------
// QUÉ HACE, EN CRISTIANO
//   Desde el panel de listas, administración pulsa «Cobrar» y esta
//   función crea el cargo SEPA de cada plazo que toque, contra el
//   IBAN que la familia autorizó. El recibo queda «procesando»
//   (SEPA tarda unos días) y el webhook lo pasa a «cobrado» o
//   «devuelto» cuando el banco contesta.
//
// QUIÉN PUEDE LLAMARLA
//   Solo administración: se comprueba el usuario del token contra
//   la tabla `administradores`, en la base. A cualquier otro se le
//   dice que no, tenga la sesión que tenga.
//
// QUÉ COBRA
//   · Sin cuerpo, o {}: todos los plazos «pendientes» ya vencidos
//     (vence <= hoy) de reservas con la domiciliación autorizada.
//   · Con {plazo: "<id>"}: ese plazo concreto, aunque no haya
//     vencido (el botón «Cobrar ahora») — también sirve para
//     reintentar uno devuelto.
//
// Cómo se publica: Supabase → Edge Functions → Deploy new function
// → «via Editor» → nombre `plazos-cobrar` → pegar este archivo.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

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

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (peticion.method !== "POST") return respuesta({ error: "solo POST" }, 405);
  if (!STRIPE_KEY) return respuesta({ error: "no_activado" }, 503);

  // ¿Quién llama? El token se comprueba contra Supabase, y el correo
  // contra la tabla de administración. Nada de fiarse del navegador.
  const cabecera = peticion.headers.get("Authorization") ?? "";
  const jwt = cabecera.toLowerCase().startsWith("bearer ") ? cabecera.slice(7).trim() : "";
  const rUsuario = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!rUsuario.ok) return respuesta({ error: "sin_sesion", mensaje: "Entra con tu cuenta." }, 401);
  const correo = ((await rUsuario.json())?.email ?? "").toLowerCase();
  const esAdmin = await base(`administradores?correo=ilike.${encodeURIComponent(correo)}&select=correo`);
  if (!esAdmin.ok || !esAdmin.datos || !esAdmin.datos.length) {
    return respuesta({ error: "sin_permiso", mensaje: "Tu cuenta no es de administración." }, 403);
  }

  let plazoConcreto = "";
  try { plazoConcreto = String((await peticion.json()).plazo ?? ""); } catch (_e) { /* sin cuerpo */ }

  // Los plazos que tocan.
  const hoy = new Date().toISOString().slice(0, 10);
  const filtro = plazoConcreto
    ? `plazos?id=eq.${plazoConcreto}&estado=in.(pendiente,devuelto)&select=*`
    : `plazos?estado=eq.pendiente&vence=lte.${hoy}&select=*`;
  const busca = await base(filtro);
  const plazos = (busca.ok && busca.datos) || [];
  if (!plazos.length) return respuesta({ lanzados: 0, detalle: "No hay ningún recibo que cobrar." });

  let lanzados = 0;
  const saltados: string[] = [];
  const errores: string[] = [];

  for (const plazo of plazos) {
    const rr = await base(`reservas?id=eq.${plazo.reserva_id}&select=id,participante,campamento_id,stripe_customer_id,sepa_pm`);
    const reserva = rr.ok && rr.datos && rr.datos[0];
    if (!reserva || !reserva.sepa_pm || !reserva.stripe_customer_id) {
      saltados.push(`${plazo.concepto}: sin domiciliación autorizada`);
      continue;
    }

    const p = new URLSearchParams();
    p.set("amount", String(plazo.importe_centimos));
    p.set("currency", "eur");
    p.set("customer", reserva.stripe_customer_id);
    p.set("payment_method", reserva.sepa_pm);
    p.set("payment_method_types[0]", "sepa_debit");
    p.set("off_session", "true");
    p.set("confirm", "true");
    p.set("description", `${plazo.concepto} · ${reserva.participante} · ${reserva.campamento_id}`);
    p.set("metadata[plazo_id]", plazo.id);
    p.set("metadata[reserva_id]", reserva.id);

    const r = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // que un doble clic no cree dos recibos del mismo plazo
        "Idempotency-Key": `plazo-${plazo.id}-${plazo.estado}`,
      },
      body: p,
    });
    const pi = await r.json();
    if (!r.ok || !pi.id) {
      console.error("Stripe payment_intents dijo que no:", pi);
      errores.push(`${plazo.concepto}: ${pi?.error?.message ?? "error de Stripe"}`);
      continue;
    }
    await base(`plazos?id=eq.${plazo.id}`, {
      method: "PATCH",
      body: JSON.stringify({ estado: "procesando", stripe_payment_intent: pi.id, aviso_enviado: false }),
    });
    lanzados++;
  }

  return respuesta({ lanzados, saltados, errores });
});
