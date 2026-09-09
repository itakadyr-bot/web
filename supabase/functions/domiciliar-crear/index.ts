// ============================================================
// domiciliar-crear · abre la autorización del IBAN (SEPA)
// ------------------------------------------------------------
// QUÉ HACE, EN CRISTIANO
//   Tras reservar, la familia puede domiciliar el resto del
//   campamento: esta función abre la página segura de Stripe donde
//   meten su IBAN y firman el mandato UNA sola vez. Con eso, los
//   plazos se cobran después solos (plazos-cobrar), sin
//   transferencias ni justificantes.
//
//   Aquí NO se cobra nada: solo se guarda la autorización.
//
// LO QUE NO SE FÍA DEL NAVEGADOR
//   · De fuera solo llega el número de la reserva. Quién es, su
//     correo y su campamento se leen DE LA BASE.
//   · Escribir en `reservas` lo hace el webhook con la llave de
//     servicio cuando Stripe confirma el mandato, no el navegador.
//
// CLAVES · las mismas de siempre (STRIPE_SECRET_KEY, SUPABASE_*),
// ninguna está en este archivo. Opcional: PAGOS_URL_BASE.
//
// Cómo se publica: Supabase → Edge Functions → Deploy new function
// → «via Editor» → nombre `domiciliar-crear` → pegar este archivo.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
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

async function stripe(ruta: string, cuerpo: URLSearchParams) {
  const r = await fetch(`https://api.stripe.com/v1/${ruta}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: cuerpo,
  });
  return { ok: r.ok, datos: await r.json() };
}

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (peticion.method !== "POST") return respuesta({ error: "solo POST" }, 405);

  if (!STRIPE_KEY) {
    return respuesta({ error: "no_activado", mensaje: "La domiciliación todavía no está activada." }, 503);
  }

  let reservaId = "";
  try { reservaId = String((await peticion.json()).reserva ?? ""); } catch (_e) { /* nada */ }
  if (!/^[0-9a-f-]{36}$/.test(reservaId)) {
    return respuesta({ error: "falta_reserva", mensaje: "El enlace está incompleto. Escríbenos y te mandamos uno bueno." }, 400);
  }

  const busca = await base(`reservas?id=eq.${reservaId}&select=id,participante,tutor,email,campamento_id,stripe_customer_id,sepa_pm`);
  const reserva = busca.ok && busca.datos && busca.datos[0];
  if (!reserva) return respuesta({ error: "no_existe", mensaje: "No encontramos esa reserva. Escríbenos y lo miramos." }, 404);
  if (reserva.sepa_pm) return respuesta({ ya_autorizada: true });

  // El cliente de Stripe de esta familia (se crea la primera vez).
  let clienteId = reserva.stripe_customer_id as string | null;
  if (!clienteId) {
    const p = new URLSearchParams();
    p.set("email", reserva.email);
    p.set("name", reserva.tutor);
    p.set("metadata[reserva_id]", reserva.id);
    const alta = await stripe("customers", p);
    if (!alta.ok) {
      console.error("Stripe customers dijo que no:", alta.datos);
      return respuesta({ error: "stripe", mensaje: "No se pudo abrir la autorización. Prueba en un momento." }, 502);
    }
    clienteId = alta.datos.id;
    await base(`reservas?id=eq.${reservaId}`, {
      method: "PATCH", body: JSON.stringify({ stripe_customer_id: clienteId }),
    });
  }

  // La página de Stripe donde meten el IBAN y firman el mandato.
  const p = new URLSearchParams();
  p.set("mode", "setup");
  p.set("payment_method_types[0]", "sepa_debit");
  p.set("customer", clienteId!);
  p.set("success_url", `${URL_BASE}domiciliar/?r=${reserva.id}&dom=ok`);
  p.set("cancel_url", `${URL_BASE}domiciliar/?r=${reserva.id}&dom=ko`);
  p.set("metadata[reserva_id]", reserva.id);
  p.set("setup_intent_data[metadata][reserva_id]", reserva.id);
  const sesion = await stripe("checkout/sessions", p);
  if (!sesion.ok || !sesion.datos.url) {
    console.error("Stripe checkout dijo que no:", sesion.datos);
    return respuesta({ error: "stripe", mensaje: "No se pudo abrir la autorización. Prueba en un momento." }, 502);
  }

  return respuesta({ url: sesion.datos.url });
});
