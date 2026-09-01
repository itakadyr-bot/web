# Web de Ítaka Deporte y Recreación

Web nueva de [itakadyr.com](https://itakadyr.com), hecha con el mismo esquema que la
del Club Atletismo Apolana: HTML estático servido desde GitHub Pages y Supabase de
base de datos (contenido editable, formularios, reservas y pagos).

## Páginas

| Ruta | Qué hay |
|---|---|
| `/` | portada: héroe, campamentos, servicios, nosotros, garantías, contacto |
| `/campamentos/` | fichas de Riópar, Palancares y Alcossebre, día tipo, precios y FAQ |
| `/servicios/` | escuelas, campus, fiestas, eventos, excursiones y alquiler |
| `/nosotros/` | equipo, cómo trabajamos, garantías LOPIVI, números |
| `/contacto/` | formulario de consulta + teléfonos y correo |
| `/legal/` | aviso legal, privacidad, cookies y protección del menor |

## Cómo está hecho

- Los estilos de cada bloque van **en línea en el HTML** (así salió del diseño).
  Lo común (base, cabecera con menú móvil, estados hover) vive en
  `assets/css/itaka.css`; el javascript común, en `assets/js/itaka.js`.
- El diseño original está en `Rediseño web itakadyr.com.zip` (maquetas `.dc.html`);
  la conversión a estas páginas se hizo con un script una sola vez.

## Qué falta por conectar (por este orden)

1. **Supabase**: proyecto nuevo + SQL de `SETUP-SUPABASE.md` (cuando exista).
2. **Modo fantasma**: editar textos y fotos encima de la página, como en Apolana.
3. **Correo**: los mensajes del formulario llegan a itakadyr@gmail.com (Resend).
4. **Pagos**: reserva de plaza de campamento con señal (Stripe Checkout).

Los detalles y lo que tiene que hacer el dueño están en `PUESTA-EN-MARCHA.md`.
