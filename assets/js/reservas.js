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
        caja.innerHTML = '<strong>¡Plaza reservada!</strong> Hemos recibido tu señal y ' +
          'la ficha de inscripción. En 24-48 horas laborables te enviaremos un correo ' +
          'con las instrucciones para el resto del pago.';
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

  /* --- El botón dice lo que va a pasar según el modo de pago --- */
  var textoTarjeta = boton.textContent;
  form.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'pago') {
      boton.textContent = e.target.value === 'efectivo'
        ? 'Enviar la inscripción (señal en efectivo)'
        : textoTarjeta;
    }
  });

  /* --- Enviar: a por la pasarela (o inscripción en efectivo) --- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var datos = new FormData(form);
    var enEfectivo = datos.get('pago') === 'efectivo';
    boton.disabled = true;
    di(enEfectivo ? 'Enviando la inscripción…' : 'Abriendo el pago seguro…');

    fetch(window.ITAKA.URL + '/functions/v1/reserva-crear', {
      method: 'POST',
      headers: {
        apikey: window.ITAKA.KEY,
        Authorization: 'Bearer ' + window.ITAKA.KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        campamento: campamento,
        pago: enEfectivo ? 'efectivo' : 'tarjeta',
        /* el nombre completo se compone de las tres casillas */
        participante: [datos.get('nombre'), datos.get('apellido1'), datos.get('apellido2')]
          .map(function (t) { return (t || '').trim(); })
          .filter(Boolean).join(' '),
        nacimiento: (datos.get('anyo_nacimiento') || '').trim(),
        tutor: (datos.get('tutor') || '').trim(),
        email: (datos.get('email') || '').trim(),
        telefono: (datos.get('telefono') || '').trim(),
        /* el resto de la ficha viaja junto y se guarda tal cual */
        datos: {
          dni: (datos.get('dni') || '').trim(),
          sip: (datos.get('sip') || '').trim(),
          sexo: datos.get('sexo') || '',
          anyo_nacimiento: (datos.get('anyo_nacimiento') || '').trim(),
          talla: datos.get('talla') || '',
          hermano: datos.get('hermano') || '',
          primera_vez: datos.get('primera_vez') || '',
          grupo_nuevos: datos.get('grupo_nuevos') || '',
          tutor_dni: (datos.get('tutor_dni') || '').trim(),
          direccion: (datos.get('direccion') || '').trim(),
          como_nos_conocio: datos.get('como_nos_conocio') || '',
          alergias: (datos.get('alergias') || '').trim(),
          autoriza_info: datos.get('autoriza_info') || '',
          autoriza_fotos: datos.get('autoriza_fotos') || '',
          observaciones: (datos.get('observaciones') || '').trim()
        }
      })
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (r) {
        if (r.ok && r.d.url) {
          di('Llevándote a la página segura de pago…');
          location.href = r.d.url;
          return;
        }
        /* Inscripción con señal en efectivo: no hay pasarela. Queda
           apuntada y se le dice a la familia, con letras claras, que
           la plaza no está confirmada hasta pagar. */
        if (r.ok && r.d.efectivo) {
          var caja = document.getElementById('reserva-vuelta');
          if (caja) {
            caja.hidden = false;
            caja.style.background = '#fdf6e7';
            caja.style.borderColor = '#ecd9a8';
            caja.innerHTML = '<strong>Hemos recibido tu inscripción.</strong> Te contactaremos ' +
              'muy pronto para quedar y cobrar la señal de 150 € en efectivo. ' +
              '<strong>Ojo: la plaza no queda confirmada hasta ese pago.</strong> ' +
              'Si lo prefieres, llámanos al 604 93 59 85 y lo cerramos antes.';
            caja.scrollIntoView({ block: 'center' });
          }
          form.hidden = true;
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
