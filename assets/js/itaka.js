/* ============================================================
   Ítaka Deporte y Recreación · javascript común de la web
   ------------------------------------------------------------
   De momento hace dos cosas: el menú del móvil y parar el
   formulario de contacto hasta que esté conectado a la base.
   ============================================================ */
(function () {
  'use strict';

  /* --- Menú del móvil ------------------------------------- */
  var cab = document.querySelector('.cab');
  var burger = document.querySelector('.cab-burger');
  if (cab && burger) {
    burger.addEventListener('click', function () {
      var abierta = cab.classList.toggle('abierta');
      burger.setAttribute('aria-expanded', abierta ? 'true' : 'false');
      burger.setAttribute('aria-label', abierta ? 'Cerrar el menú' : 'Abrir el menú');
    });
    cab.querySelectorAll('.cab-nav a').forEach(function (a) {
      a.addEventListener('click', function () {
        cab.classList.remove('abierta');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* --- Ampliar imágenes al tocarlas -------------------------
     Las que llevan data-amplia (el cartel del campamento) se abren
     a pantalla completa; otro toque, o Escape, las cierra. En modo
     edición no: ahí tocar la foto es cambiarla. */
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('img[data-amplia]');
    if (!img || document.body.classList.contains('editando')) return;
    var velo = document.createElement('div');
    velo.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(11,18,27,.94);' +
      'display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;' +
      'opacity:0;transition:opacity .2s ease';
    var grande = document.createElement('img');
    grande.src = img.src;
    grande.alt = img.alt || '';
    grande.style.cssText = 'max-width:min(92vw,720px);max-height:92vh;border-radius:12px;' +
      'box-shadow:0 40px 90px -30px rgba(0,0,0,.8);transform:scale(.96);' +
      'transition:transform .22s cubic-bezier(.2,.9,.3,1)';
    velo.appendChild(grande);
    document.body.appendChild(velo);
    requestAnimationFrame(function () {
      velo.style.opacity = '1';
      grande.style.transform = 'none';
    });
    function cierra() {
      velo.style.opacity = '0';
      grande.style.transform = 'scale(.96)';
      setTimeout(function () { velo.remove(); }, 200);
      document.removeEventListener('keydown', tecla);
    }
    function tecla(ev) { if (ev.key === 'Escape') cierra(); }
    velo.addEventListener('click', cierra);
    document.addEventListener('keydown', tecla);
  });

  /* --- Abrir/descargar el archivo de una foto editable ------
     Un enlace con data-abre="hueco" abre en pestaña nueva el
     archivo actual de esa foto (aunque se haya cambiado en modo
     fantasma), para poder guardarlo. */
  document.querySelectorAll('a[data-abre]').forEach(function (a) {
    a.addEventListener('click', function () {
      var img = document.querySelector('[data-edit-img="' + a.getAttribute('data-abre') + '"]');
      /* si el hueco lleva un PDF detrás, se abre el PDF; si no, la foto */
      if (img) a.href = img.getAttribute('data-archivo') || img.currentSrc || img.src;
    });
  });

  /* --- Formulario de contacto ------------------------------
     El mensaje se guarda en la base (tabla `mensajes`) y después se
     avisa al correo del club con una función de Supabase. Si el
     aviso por correo falla, el mensaje NO se pierde: ya está
     guardado, y se ve en el panel. Solo si falla el guardado se le
     pide a la persona que escriba directamente. */
  var form = document.getElementById('form-contacto');
  if (form && window.ITAKA) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var aviso = document.getElementById('form-aviso');
      var boton = form.querySelector('button[type="submit"]');
      var datos = new FormData(form);
      boton.disabled = true;
      if (aviso) { aviso.style.color = '#8494a4'; aviso.textContent = 'Enviando…'; }

      /* El número del mensaje lo pone la propia web. Pedírselo de
         vuelta a la base exigiría dejar LEER los mensajes a cualquiera,
         y eso no: son datos de las familias. */
      var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;

      window.ITAKA.rest('mensajes', {
        method: 'POST',
        body: {
          id: id || undefined,
          nombre: (datos.get('nombre') || '').trim(),
          email: (datos.get('email') || '').trim(),
          telefono: (datos.get('telefono') || '').trim(),
          interes: datos.get('interes') || '',
          mensaje: (datos.get('mensaje') || '').trim()
        }
      }).then(function () {
        boton.textContent = '¡Mensaje enviado!';
        if (aviso) {
          aviso.style.color = '#14202e';
          aviso.textContent = 'Gracias. Te responderemos en menos de 24 horas laborables.';
        }
        /* El aviso al correo del club: si falla, no es problema de
           quien escribe, así que no se le enseña ningún error. */
        if (id) {
          fetch(window.ITAKA.URL + '/functions/v1/correo-avisar', {
            method: 'POST',
            headers: {
              apikey: window.ITAKA.KEY,
              Authorization: 'Bearer ' + window.ITAKA.KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: id })
          }).catch(function () {});
        }
      }).catch(function (err) {
        console.warn('[Ítaka] formulario:', err.message);
        boton.disabled = false;
        if (aviso) {
          aviso.style.color = '#b45309';
          aviso.textContent = 'No se pudo enviar ahora mismo. Escríbenos a ' +
            'itakadyr@gmail.com o llámanos y te atendemos igual.';
        }
      });
    });
  }
})();
