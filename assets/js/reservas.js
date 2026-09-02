/* ============================================================
   RESERVAS DE CAMPAMENTO · el formulario de la señal
   ------------------------------------------------------------
   La familia rellena sus datos en la ficha del campamento y pulsa
   «Pagar la señal». La web se lo manda a la función reserva-crear,
   que mira EN LA BASE cuánto vale la señal y devuelve la dirección
   de la pasarela de Stripe; la tarjeta se teclea allí, nunca aquí.
   La reserva se confirma cuando Stripe avisa al servidor, no cuando
   el navegador vuelve: cerrar la pestaña a mitad no rompe nada.

   Si el campamento está con las reservas cerradas (activo=false en
   la tabla campamentos), el formulario se esconde solo y en su
   lugar se ofrece el contacto.
   ============================================================ */
(function () {
  'use strict';
  var form = document.getElementById('form-reserva');
  if (!form || !window.ITAKA) return;

  var campamento = form.getAttribute('data-campamento');
  var aviso = document.getElementById('reserva-aviso');
  var boton = form.querySelector('button[type="submit"]');

  function di(texto, color) {
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.style.color = color || '#8494a4';
  }

  /* --- La vuelta de Stripe: ?reserva=ok / ?reserva=ko ---------- */
  var vuelta = new URLSearchParams(location.search).get('reserva');
  if (vuelta) {
    var caja = document.getElementById('reserva-vuelta');
    if (caja) {
      caja.hidden = false;
      if (vuelta === 'ok') {
        caja.style.background = '#eef8ee';
        caja.style.borderColor = '#bfe3bf';
        caja.innerHTML = '<strong>¡Plaza reservada!</strong> Hemos recibido tu señal. ' +
          'Te llegará el recibo de la pasarela de pago al correo, y nosotros nos ' +
          'pondremos en contacto contigo con los siguientes pasos.';
      } else {
        /* Ámbar, no rojo: un pago que se queda a medias no es una
           emergencia. Y lo primero, quitar el miedo. */
        caja.style.background = '#fdf6e7';
        caja.style.borderColor = '#ecd9a8';
        caja.innerHTML = '<strong>No se te ha cobrado nada.</strong> El pago se quedó ' +
          'a medias o se canceló. Puedes intentarlo otra vez cuando quieras, ' +
          'o llamarnos y lo hacemos juntos.';
      }
      var seccion = document.getElementById('reservar');
      if (seccion) seccion.scrollIntoView({ block: 'start' });
    }
  }

  /* --- ¿Están abiertas las reservas? --------------------------- */
  window.ITAKA.rest('campamentos?id=eq.' + campamento + '&select=activo,senal_centimos')
    .then(function (filas) {
      var camp = filas && filas[0];
      if (!camp) return; /* sin fila todavía: el formulario queda como está */
      if (!camp.activo) {
        form.hidden = true;
        var cerrado = document.getElementById('reserva-cerrado');
        if (cerrado) cerrado.hidden = false;
      } else if (camp.senal_centimos) {
        /* que el botón diga siempre el importe de verdad */
        var importe = (camp.senal_centimos / 100).toLocaleString('es-ES') + ' €';
        boton.textContent = 'Pagar la señal de ' + importe + ' con tarjeta';
      }
    })
    .catch(function () { /* si la base no contesta, el formulario sigue */ });

  /* --- Enviar: a por la pasarela ------------------------------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var datos = new FormData(form);
    boton.disabled = true;
    di('Abriendo el pago seguro…');

    fetch(window.ITAKA.URL + '/functions/v1/reserva-crear', {
      method: 'POST',
      headers: {
        apikey: window.ITAKA.KEY,
        Authorization: 'Bearer ' + window.ITAKA.KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        campamento: campamento,
        participante: (datos.get('participante') || '').trim(),
        nacimiento: (datos.get('nacimiento') || '').trim(),
        tutor: (datos.get('tutor') || '').trim(),
        email: (datos.get('email') || '').trim(),
        telefono: (datos.get('telefono') || '').trim()
      })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (r.ok && r.d.url) {
          di('Llevándote a la página segura de pago…');
          location.href = r.d.url;
          return;
        }
        boton.disabled = false;
        di(r.d.mensaje || 'No se pudo abrir el pago. Prueba en un momento o llámanos.', '#b45309');
      })
      .catch(function () {
        boton.disabled = false;
        di('No se pudo abrir el pago. Prueba en un momento o llámanos.', '#b45309');
      });
  });
})();
