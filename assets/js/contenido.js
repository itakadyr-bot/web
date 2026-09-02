/* ============================================================
   CONTENIDO EDITADO · lo que se cambió en modo fantasma, aplicado
   ------------------------------------------------------------
   Cada texto y cada foto de la web tiene un hueco con nombre
   (data-edit / data-edit-img). Lo que está escrito en el HTML es el
   RESPALDO: lo que se ve si la base no contesta. Este archivo pide a
   la base «¿qué se ha cambiado en esta página?» y lo pone encima.

   CONTRA EL PARPADEO: preguntar a la base tarda unas décimas, y en
   ese rato se veía el respaldo (Andrés lo notó al volver a la
   portada). Por eso la respuesta se guarda también en el navegador
   (localStorage): en la siguiente visita se aplica AL INSTANTE lo
   guardado y, mientras, se pregunta a la base por si hay algo más
   nuevo. La primera visita de un navegador nuevo es la única que no
   tiene red de seguridad.

   Va con `fetch` a pelo, sin la librería de Supabase: para leer dos
   tablas públicas no hace falta cargar 200 KB en cada visita.
   ============================================================ */
(function () {
  'use strict';
  if (!window.ITAKA) return;

  /* Qué página es esta, por la ruta. Sirve igual en local, en
     GitHub Pages (/web/campamentos/) y en itakadyr.com. */
  var CONOCIDAS = ['campamentos', 'servicios', 'nosotros', 'contacto', 'legal', 'acceso'];
  var pagina = 'inicio';
  location.pathname.split('/').forEach(function (trozo) {
    if (CONOCIDAS.indexOf(trozo) >= 0) pagina = trozo;
  });
  window.ITAKA.pagina = pagina;

  function aplicaTexto(f) {
    var el = document.querySelector('[data-edit="' + f.hueco + '"]');
    /* innerText y no textContent: conserva los saltos de línea. */
    if (el && f.valor != null) el.innerText = f.valor;
  }

  /* El encuadre guardado es «x% y%» y, si hay zoom, «x% y% 1.4». */
  function aplicaImagen(f) {
    var el = document.querySelector('[data-edit-img="' + f.hueco + '"]');
    if (!el) return;
    if (f.url && f.url !== el.getAttribute('src')) el.src = f.url;
    if (f.posicion) {
      var partes = f.posicion.trim().split(/\s+/);
      el.style.objectPosition = partes.slice(0, 2).join(' ');
      var zoom = parseFloat(partes[2]);
      el.style.objectViewBox = zoom > 1
        ? 'inset(' + (50 * (1 - 1 / zoom)).toFixed(2) + '%)'
        : '';
    }
  }

  function aplica(datos) {
    (datos.textos || []).forEach(aplicaTexto);
    (datos.imagenes || []).forEach(aplicaImagen);
  }

  var CLAVE = 'itaka-contenido-' + pagina;
  try {
    var guardado = JSON.parse(localStorage.getItem(CLAVE));
    if (guardado) aplica(guardado);
  } catch (e) { /* sin copia local: no pasa nada */ }

  var filtro = '?pagina=eq.' + pagina;
  Promise.all([
    window.ITAKA.rest('contenido_web' + filtro + '&select=hueco,valor'),
    window.ITAKA.rest('imagenes_web' + filtro + '&select=hueco,url,posicion')
  ]).then(function (r) {
    var datos = { textos: r[0] || [], imagenes: r[1] || [] };
    aplica(datos);
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch (e) { /* lleno o privado */ }
  }).catch(function (e) { console.warn('[Ítaka] contenido:', e.message); });
})();
