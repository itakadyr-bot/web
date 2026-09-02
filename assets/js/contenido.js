/* ============================================================
   CONTENIDO EDITADO · lo que se cambió en modo fantasma, aplicado
   ------------------------------------------------------------
   Cada texto y cada foto de la web tiene un hueco con nombre
   (data-edit / data-edit-img). Lo que está escrito en el HTML es el
   RESPALDO: lo que se ve si la base no contesta. Este archivo pide a
   la base «¿qué se ha cambiado en esta página?» y lo pone encima.

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

  var filtro = '?pagina=eq.' + pagina;

  window.ITAKA.rest('contenido_web' + filtro + '&select=hueco,valor')
    .then(function (filas) {
      (filas || []).forEach(function (f) {
        var el = document.querySelector('[data-edit="' + f.hueco + '"]');
        /* innerText y no textContent: conserva los saltos de línea
           que se escribieran al editar un párrafo. */
        if (el && f.valor != null) el.innerText = f.valor;
      });
    })
    .catch(function (e) { console.warn('[Ítaka] contenido_web:', e.message); });

  window.ITAKA.rest('imagenes_web' + filtro + '&select=hueco,url')
    .then(function (filas) {
      (filas || []).forEach(function (f) {
        var el = document.querySelector('[data-edit-img="' + f.hueco + '"]');
        if (el && f.url) el.src = f.url;
      });
    })
    .catch(function (e) { console.warn('[Ítaka] imagenes_web:', e.message); });
})();
