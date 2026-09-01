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
     Todavía no está conectado a la base de datos. Hasta entonces
     no se traga el mensaje en silencio: avisa y da el correo. */
  var form = document.getElementById('form-contacto');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var aviso = document.getElementById('form-aviso');
      if (aviso) {
        aviso.textContent = 'El formulario todavía no está activado. Mientras tanto, ' +
          'escríbenos a itakadyr@gmail.com o llámanos y te atendemos igual.';
        aviso.style.color = '#b45309';
      }
    });
  }
})();
