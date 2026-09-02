// ============================================================
// correo-avisar · manda al correo del club cada mensaje de la web
// ------------------------------------------------------------
// QUÉ HACE, EN CRISTIANO
//   Alguien rellena el formulario de contacto. La web guarda el
//   mensaje en la base y luego llama aquí con el número del mensaje.
//   Esta función lo LEE DE LA BASE (no se fía del texto que mande el
//   navegador), se lo envía por correo al club con Resend, y deja
//   apuntado que ya avisó para no mandar el mismo dos veces.
//
// LO QUE NO SE FÍA DEL NAVEGADOR
//   · El contenido. De fuera solo llega un id. El texto del correo
//     sale de la fila guardada en la base.
//   · La repetición. Si alguien llama mil veces con el mismo id,
//     el correo sale UNA vez: la columna `aviso_enviado` lo corta.
//
// CLAVES · ninguna está en este archivo ni puede estarlo
//   RESEND_API_KEY             · la pone el club en Supabase → Secrets
//   CORREO_DESTINO             · opcional; si no está, itakadyr@gmail.com
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY · las pone Supabase sola
//
// Si falta RESEND_API_KEY, la función contesta «todavía no está
// activado» con buenos modales. El mensaje ya quedó guardado igual.
//
// Cómo se publica: Supabase → Edge Functions → Deploy new function
// → «via Editor» → nombre `correo-avisar` → pegar este archivo.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DESTINO = Deno.env.get("CORREO_DESTINO") ?? "itakadyr@gmail.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function respuesta(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* Para que un nombre o un mensaje no puedan colar HTML en el correo. */
function limpio(t: unknown): string {
  return String(t ?? "").replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c)
  );
}

Deno.serve(async (peticion) => {
  if (peticion.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (peticion.method !== "POST") return respuesta({ error: "solo POST" }, 405);

  if (!RESEND_KEY) {
    return respuesta({ aviso: "el correo todavía no está activado" });
  }

  let id = "";
  try {
    id = String((await peticion.json()).id ?? "");
  } catch (_e) { /* cuerpo vacío o roto */ }
  if (!/^[0-9a-f-]{36}$/.test(id)) return respuesta({ error: "falta el id" }, 400);

  // El mensaje, leído de la base con la llave del servidor.
  const cabecerasBase = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  const busca = await fetch(
    `${SUPABASE_URL}/rest/v1/mensajes?id=eq.${id}&select=*`,
    { headers: cabecerasBase },
  );
  const filas = busca.ok ? await busca.json() : [];
  const m = filas[0];
  if (!m) return respuesta({ error: "no existe ese mensaje" }, 404);
  if (m.aviso_enviado) return respuesta({ aviso: "ya se avisó de este mensaje" });

  const asunto = `Mensaje de la web: ${m.nombre || "sin nombre"} · ${m.interes || "consulta"}`;
  const html = `
    <h2 style="margin:0 0 12px">Nuevo mensaje desde itakadyr.com</h2>
    <p><b>Nombre:</b> ${limpio(m.nombre)}<br>
       <b>Correo:</b> ${limpio(m.email)}<br>
       <b>Teléfono:</b> ${limpio(m.telefono) || "—"}<br>
       <b>Interés:</b> ${limpio(m.interes)}</p>
    <p style="white-space:pre-wrap;border-left:3px solid #0075c4;padding-left:12px">${limpio(m.mensaje)}</p>
    <p style="color:#888">Para responder, escribe directamente a ${limpio(m.email)}
       (o pulsa responder: va puesto como remitente de respuesta).</p>`;

  const envio = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Web de Ítaka <onboarding@resend.dev>",
      to: [DESTINO],
      reply_to: m.email || undefined,
      subject: asunto,
      html,
    }),
  });

  if (!envio.ok) {
    const detalle = await envio.text();
    console.error("Resend dijo que no:", detalle);
    return respuesta({ error: "no se pudo mandar el correo" }, 502);
  }

  // Apuntar que ya se avisó, para que el mismo id no mande dos correos.
  await fetch(`${SUPABASE_URL}/rest/v1/mensajes?id=eq.${id}`, {
    method: "PATCH",
    headers: cabecerasBase,
    body: JSON.stringify({ aviso_enviado: true }),
  });

  return respuesta({ enviado: true });
});
