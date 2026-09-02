/* ============================================================
   CONEXIÓN A SUPABASE · base de datos de la web de Ítaka
   ------------------------------------------------------------
   La clave "publishable" es PÚBLICA por diseño: va en el navegador
   y no es secreta. La seguridad de verdad la dan las reglas RLS
   configuradas en Supabase (qué puede leer/escribir cada quién).

   A DIFERENCIA DE LA WEB DE APOLANA, aquí la librería grande de
   Supabase (assets/js/supabase.js, 200 KB) NO se carga en todas las
   páginas: una visita normal solo LEE contenido y ENVÍA el
   formulario, y para eso basta con `fetch` a la API REST. La
   librería solo se carga cuando hace falta de verdad: en la página
   de acceso y cuando quien navega es administración (modo fantasma).
   Así las familias no pagan 200 KB por algo que nunca usarán.
   ============================================================ */
(function () {
  'use strict';

  var URL = 'https://oopyndrewijbqcryfbuj.supabase.co';
  var KEY = 'sb_publishable_PQJRDuZ-hYUsjsk1aq-8PA_jI9kQ_q7';

  /* La ruta base de la web ('' en local, '/web' en GitHub Pages).
     Se calcula mirando dónde está este script, que siempre vive en
     assets/js/, así los enlaces funcionan igual en los dos sitios. */
  var script = document.currentScript;
  var BASE = script ? script.src.replace(/assets\/js\/db\.js.*$/, '') : './';

  /* Qué página es esta, por la ruta. Sirve igual en local, en
     GitHub Pages (/web/campamentos/) y en itakadyr.com. */
  var CONOCIDAS = ['campamentos', 'riopar', 'palancares', 'alcossebre',
                   'campus', 'servicios', 'nosotros', 'contacto', 'legal', 'acceso'];
  var pagina = 'inicio';
  location.pathname.split('/').forEach(function (trozo) {
    if (CONOCIDAS.indexOf(trozo) >= 0) pagina = trozo;
  });

  /* CONTRA EL PARPADEO, PARTE 2 · Las fotos que están escritas en el
     HTML empiezan a descargarse en cuanto el navegador lee la página;
     las editadas, en cambio, solo se conocen cuando corre el script, y
     ese retraso se veía como un pestañeo. Este archivo va en la
     CABECERA, así que aquí se mira la copia local y se le ordena al
     navegador precargar esas fotos desde el primer instante, igual que
     las fijas. */
  try {
    var copia = JSON.parse(localStorage.getItem('itaka-contenido-' + pagina));
    ((copia && copia.imagenes) || []).slice(0, 12).forEach(function (f) {
      if (f.url && /^https?:/.test(f.url)) {
        var l = document.createElement('link');
        l.rel = 'preload';
        l.as = 'image';
        l.href = f.url;
        document.head.appendChild(l);
      }
    });
  } catch (e) { /* sin copia local: no pasa nada */ }

  /* --- Lectura y escritura sencillas por REST (sin librería) ---- */

  function rest(camino, opciones) {
    opciones = opciones || {};
    var cab = {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json'
    };
    if (opciones.headers) {
      for (var k in opciones.headers) cab[k] = opciones.headers[k];
    }
    return fetch(URL + '/rest/v1/' + camino, {
      method: opciones.method || 'GET',
      headers: cab,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('Supabase ' + r.status + ': ' + t);
        });
      }
      /* Un alta sin «devuélvemelo» responde con el cuerpo vacío:
         eso no es un error, es un «hecho, y no hay nada que contar». */
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }

  /* --- Cargar la librería grande solo cuando toca --------------- */

  var cargaLibreria = null;
  function conLibreria() {
    if (window.supabase && window.supabase.createClient) {
      return Promise.resolve();
    }
    if (!cargaLibreria) {
      cargaLibreria = new Promise(function (listo, mal) {
        var s = document.createElement('script');
        s.src = BASE + 'assets/js/supabase.js';
        s.onload = listo;
        s.onerror = function () { mal(new Error('No se pudo cargar supabase.js')); };
        document.head.appendChild(s);
      });
    }
    return cargaLibreria;
  }

  var cliente = null;
  function conCliente() {
    return conLibreria().then(function () {
      if (!cliente) cliente = window.supabase.createClient(URL, KEY);
      return cliente;
    });
  }

  /* ¿Hay una sesión guardada en este navegador? Se mira sin cargar
     la librería: supabase-js la deja en localStorage con una clave
     que empieza por "sb-" y termina en "-auth-token". */
  function haySesionGuardada() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('sb-') === 0 && k.indexOf('-auth-token') > 0) return true;
      }
    } catch (e) { /* modo privado estricto: pues no hay sesión */ }
    return false;
  }

  window.ITAKA = {
    URL: URL,
    KEY: KEY,
    BASE: BASE,
    pagina: pagina,
    rest: rest,
    conCliente: conCliente,
    haySesionGuardada: haySesionGuardada
  };
})();
