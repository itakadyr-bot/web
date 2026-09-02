// ============================================================
// pago-webhook · Stripe avisa de que una señal se ha pagado
// ------------------------------------------------------------
// QUÉ HACE, EN CRISTIANO
//   Cuando una familia termina de pagar en la página de Stripe,
//   STRIPE (no el navegador) llama aquí. Se comprueba la firma
//   para asegurarse de que es Stripe de verdad, se marca la
//   reserva como PAGADA y se avisa al correo del club.
//
//   La reserva se confirma con este aviso de Stripe, nunca con lo
//   que diga el navegador de la familia: cerrar la pestaña a mitad
//   no confirma ni rompe nada.
//
// CLAVES · ninguna está en este archivo ni puede estarlo
//   STRIPE_WEBHOOK_SECRET · el «signing secret» del endpoint
//                           (whsec_…), en Supabase → Secrets
//   RESEND_API_KEY        · la del correo, la misma de siempre
//   CORREO_DESTINO        · opcional; si no está, itakadyr@gmail.com
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY · las pone Supabase
//
// ⚠️ AL DESPLEGAR: desactivar «Verify JWT» en la configuración de
//   esta función. La llama Stripe, que no tiene claves de Supabase;
//   su identidad la garantiza la firma que se comprueba aquí.
//
// Cómo se publica: Supabase → Edge Functions → Deploy new function
// → «via Editor» → nombre `pago-webhook` → pegar este archivo.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const FIRMA_SECRETA = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const DESTINO = Deno.env.get("CORREO_DESTINO") ?? "itakadyr@gmail.com";

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

/* La firma de Stripe: HMAC-SHA256 de «tiempo.cuerpo» con el secreto
   del endpoint. Si no cuadra, o el aviso es viejo, no es Stripe. */
async function firmaValida(cuerpo: string, cabecera: string | null): Promise<boolean> {
  if (!cabecera || !FIRMA_SECRETA) return false;
  const partes: Record<string, string> = {};
  for (const trozo of cabecera.split(",")) {
    const [k, v] = trozo.split("=");
    if (k && v && !(k in partes)) partes[k.trim()] = v.trim();
  }
  const t = partes["t"];
  const v1 = partes["v1"];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;

  const clave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(FIRMA_SECRETA),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "HMAC", clave, new TextEncoder().encode(`${t}.${cuerpo}`),
  );
  const hex = [...new Uint8Array(firma)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

function limpio(t: unknown): string {
  return String(t ?? "").replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] ?? c)
  );
}

Deno.serve(async (peticion) => {
  if (peticion.method !== "POST") return new Response("solo POST", { status: 405 });

  const cuerpo = await peticion.text();
  if (!(await firmaValida(cuerpo, peticion.headers.get("stripe-signature")))) {
    return new Response("firma inválida", { status: 400 });
  }

  const evento = JSON.parse(cuerpo);
  if (evento.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ ignorado: evento.type }), { status: 200 });
  }

  const sesion = evento.data?.object ?? {};
  const reservaId = sesion.metadata?.reserva_id ?? "";
  if (!/^[0-9a-f-]{36}$/.test(reservaId) || sesion.payment_status !== "paid") {
    return new Response(JSON.stringify({ ignorado: "sin reserva o sin pagar" }), { status: 200 });
  }

  // Marcar la reserva pagada (comprobando que la sesión coincide).
  const marca = await base(
    `reservas?id=eq.${reservaId}&stripe_session_id=eq.${sesion.id}&select=*`,
    { method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ estado: "pagada" }) },
  );
  const reserva = marca.ok && marca.datos && marca.datos[0];
  if (!reserva) {
    console.error("Aviso de pago sin reserva que cuadre:", reservaId, sesion.id);
    return new Response(JSON.stringify({ error: "reserva no encontrada" }), { status: 200 });
  }

  // El aviso al correo del club (una sola vez por reserva).
  if (RESEND_KEY && !reserva.aviso_enviado) {
    const nombreCamp = limpio(reserva.campamento_id);

    // La ficha completa de inscripción, con nombres en cristiano.
    const ETIQUETAS: Record<string, string> = {
      dni: "DNI del alumno/a", sip: "SIP", sexo: "Sexo",
      anyo_nacimiento: "Año de nacimiento", talla: "Talla de camiseta",
      hermano: "¿Viene su hermano/a también?", primera_vez: "¿Primera experiencia?",
      tutor_dni: "DNI del tutor/a", direccion: "Dirección",
      como_nos_conocio: "¿Cómo nos conoció?", grupo_nuevos: "¿Grupo de 3+ nuevos?",
      alergias: "Alergias / intolerancias", autoriza_info: "Autoriza envío de información",
      autoriza_fotos: "Autoriza fotos y vídeos", observaciones: "Observaciones",
    };
    const ficha = (reserva.datos ?? {}) as Record<string, string>;
    const filasFicha = Object.keys(ETIQUETAS)
      .filter((k) => ficha[k])
      .map((k) => `<b>${ETIQUETAS[k]}:</b> ${limpio(ficha[k])}`)
      .join("<br>\n         ");

    const html = `
      <h2 style="margin:0 0 12px">💶 Señal pagada · reserva de campamento</h2>
      <p><b>Campamento:</b> ${nombreCamp}<br>
         <b>Participante:</b> ${limpio(reserva.participante)} ${reserva.nacimiento ? `(nac. ${limpio(reserva.nacimiento)})` : ""}<br>
         <b>Tutor/a:</b> ${limpio(reserva.tutor)}<br>
         <b>Correo:</b> ${limpio(reserva.email)}<br>
         <b>Teléfono:</b> ${limpio(reserva.telefono) || "—"}<br>
         <b>Señal cobrada:</b> ${(reserva.importe_centimos / 100).toFixed(2)} €</p>
      ${filasFicha ? `<h3 style="margin:16px 0 8px">Ficha de inscripción</h3><p>${filasFicha}</p>` : ""}
      <p style="color:#888">Recuerda enviarle a la familia las instrucciones del resto del pago.
      Reserva ${limpio(reserva.id)} · para responder, escribe a ${limpio(reserva.email)}.</p>`;
    const envio = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Web de Ítaka <onboarding@resend.dev>",
        to: [DESTINO],
        reply_to: reserva.email || undefined,
        subject: `Señal pagada: ${reserva.participante} · ${nombreCamp}`,
        html,
      }),
    });
    if (envio.ok) {
      await base(`reservas?id=eq.${reservaId}`, {
        method: "PATCH", body: JSON.stringify({ aviso_enviado: true }),
      });
    } else {
      console.error("Resend dijo que no:", await envio.text());
    }
  }

  return new Response(JSON.stringify({ hecho: true }), { status: 200 });
});
