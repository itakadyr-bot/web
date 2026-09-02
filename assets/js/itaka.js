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

      window.ITAKA.rest('mensajes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          nombre: (datos.get('nombre') || '').trim(),
          email: (datos.get('email') || '').trim(),
          telefono: (datos.get('telefono') || '').trim(),
          interes: datos.get('interes') || '',
          mensaje: (datos.get('mensaje') || '').trim()
        }
      }).then(function (filas) {
        boton.textContent = '¡Mensaje enviado!';
        if (aviso) {
          aviso.style.color = '#14202e';
          aviso.textContent = 'Gracias. Te responderemos en menos de 24 horas laborables.';
        }
        /* El aviso al correo del club: si falla, no es problema de
           quien escribe, así que no se le enseña ningún error. */
        var id = filas && filas[0] && filas[0].id;
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
