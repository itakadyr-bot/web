# Web de Ítaka Deporte y Recreación

Web oficial: **[itakarecreacion.com](https://itakarecreacion.com)** (itakadyr.com
redirige aquí). HTML estático servido desde GitHub Pages con Supabase de base de
datos: contenido editable en vivo, formularios, reservas de campamento con señal
(tarjeta o efectivo), resto por domiciliación SEPA, lista de espera y panel de
gestión. Todo conectado y en producción.

## Páginas

| Ruta | Qué hay |
|---|---|
| `/` | portada: héroe, cifras, campamentos con plazas en vivo, servicios, opiniones, contacto |
| `/campamentos/` | fichas de Riópar, Palancares y Alcossebre, cómo funciona la inscripción y FAQ |
| `/campamentos/<x>/reserva/` | ficha de inscripción completa + pago de la señal |
| `/campus/` | campus de verano |
| `/servicios/` | escuelas, campus, fiestas, eventos, excursiones y alquiler |
| `/nosotros/` | equipo, cómo trabajamos, garantías LOPIVI, números |
| `/contacto/` | formulario de consulta + teléfonos y correo |
| `/legal/` | aviso legal, privacidad, cookies y protección del menor |

## Cómo está hecho

- Los estilos de cada bloque van **en línea en el HTML** (así salió del diseño).
  Lo común (base, cabecera, chips de plazas, pasos) vive en `assets/css/itaka.css`;
  el javascript común, en `assets/js/itaka.js`.
- El contenido es editable en vivo por administración (modo fantasma):
  `contenido.js` aplica lo guardado y `editar-en-vivo.js` edita.
- Los correos automáticos salen por Resend con remite del dominio propio.
- Las claves que aparecen en el código son **públicas por diseño** (la
  publishable de Supabase); las secretas viven solo en los secretos del
  servidor. La base de datos está protegida con RLS.

`SETUP-SUPABASE.md` y `PUESTA-EN-MARCHA.md` son el manual de montaje histórico,
conservado como documentación.
