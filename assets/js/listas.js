/* ============================================================
   LISTAS DE CAMPAMENTOS · el panel de reservas (/admin/)
   ------------------------------------------------------------
   Para llevar el control: qué inscripciones hay en cada
   campamento, cuáles tienen la señal pagada, marcar como pagadas
   las de efectivo cuando entreguen el dinero, borrar bajas, y
   descargar la lista en CSV para abrirla en Excel.

   Solo funciona para administración: la tabla `reservas` tiene sus
   candados en la base (RLS) y a cualquier otra persona la consulta
   le vuelve vacía, vea lo que vea en pantalla.
   ============================================================ */
(function () {
  'use strict';

  var cliente = null;
  var reservas = [];
  var campamentos = {};
  var filtro = 'todos';

  var avisoAcceso = document.getElementById('aviso-acceso');
  var contenido = document.getElementById('contenido');

  var ETIQUETAS = {
    dni: 'DNI alumno/a', sip: 'SIP', sexo: 'Sexo',
    anyo_nacimiento: 'Año nacimiento', talla: 'Talla',
    hermano: '¿Hermano también?', primera_vez: '¿Primera vez?',
    grupo_nuevos: '¿Grupo de 3+ nuevos?', tutor_dni: 'DNI tutor/a',
    direccion: 'Dirección', como_nos_conocio: 'Cómo nos conoció',
    alergias: 'Alergias', autoriza_info: 'Autoriza información',
    autoriza_fotos: 'Autoriza fotos', observaciones: 'Observaciones'
  };

  var ESTADOS = {
    'pagada': { texto: 'Señal pagada', clase: 'estado-pagada' },
    'pendiente-efectivo': { texto: 'Pendiente · efectivo', clase: 'estado-efectivo' },
    'pendiente': { texto: 'Sin terminar (tarjeta)', clase: 'estado-pendiente' }
  };

  /* ------------------- entrar y cargar ------------------------ */

  window.ITAKA.conCliente().then(function (c) {
    cliente = c;
    return cliente.auth.getSession();
  }).then(function (r) {
    if (!r || !r.data || !r.data.session) {
      avisoAcceso.innerHTML = 'Para ver las listas hay que entrar con la cuenta de ' +
        'administración. <a href="../acceso/" style="font-weight:700">Ir al acceso</a> ' +
        'y después vuelve a esta página.';
      return null;
    }
    return cliente.rpc('es_admin').then(function (r2) {
      if (!r2 || r2.data !== true) {
        avisoAcceso.textContent = 'Tu cuenta no es de administración.';
        return null;
      }
      avisoAcceso.hidden = true;
      contenido.hidden = false;
      return carga();
    });
  }).catch(function (e) {
    avisoAcceso.textContent = 'No se pudo comprobar el acceso: ' + e.message;
  });

  function carga() {
    return Promise.all([
      cliente.from('campamentos').select('id,nombre').then(sinError),
      cliente.from('reservas').select('*').order('created_at', { ascending: false }).then(sinError)
    ]).then(function (r) {
      campamentos = {};
      (r[0] || []).forEach(function (c) { campamentos[c.id] = c.nombre; });
      reservas = r[1] || [];
      pintaSelector();
      pinta();
    }).catch(function (e) {
      avisoAcceso.hidden = false;
      avisoAcceso.textContent = 'No se pudieron cargar las listas: ' + e.message;
    });
  }

  function sinError(r) {
    if (r.error) throw r.error;
    return r.data;
  }

  /* ------------------- pintar ---------------------------------- */

  function pintaSelector() {
    var caja = document.getElementById('selector-camps');
    caja.innerHTML = '';
    var opciones = [['todos', 'Todos']].concat(Object.keys(campamentos).map(function (id) {
      return [id, campamentos[id]];
    }));
    opciones.forEach(function (par) {
      var b = document.createElement('button');
      b.className = 'pildora' + (filtro === par[0] ? ' activa' : '');
      b.textContent = par[1];
      b.addEventListener('click', function () { filtro = par[0]; pintaSelector(); pinta(); });
      caja.appendChild(b);
    });
  }

  function visibles() {
    return reservas.filter(function (r) {
      return filtro === 'todos' || r.campamento_id === filtro;
    });
  }

  function pinta() {
    var lista = document.getElementById('lista');
    var filas = visibles();

    var pagadas = filas.filter(function (r) { return r.estado === 'pagada'; });
    var efectivo = filas.filter(function (r) { return r.estado === 'pendiente-efectivo'; });
    var pendientes = filas.filter(function (r) { return r.estado === 'pendiente'; });
    var cobrado = pagadas.reduce(function (s, r) { return s + (r.importe_centimos || 0); }, 0);
    document.getElementById('c-pagadas').textContent = pagadas.length + ' con señal pagada';
    document.getElementById('c-efectivo').textContent = efectivo.length + ' pendientes de efectivo';
    document.getElementById('c-pendientes').textContent = pendientes.length + ' sin terminar';
    document.getElementById('c-total').textContent = 'Señales cobradas: ' + (cobrado / 100).toLocaleString('es-ES') + ' €';

    lista.innerHTML = '';
    if (!filas.length) {
      lista.innerHTML = '<p style="padding:24px;margin:0;color:#8494a4;font-size:15px">No hay ninguna inscripción todavía' +
        (filtro !== 'todos' ? ' en este campamento' : '') + '.</p>';
      return;
    }

    filas.forEach(function (r) {
      var estado = ESTADOS[r.estado] || { texto: r.estado, clase: 'estado-pendiente' };
      var fila = document.createElement('div');
      fila.className = 'fila-reserva';

      var cab = document.createElement('div');
      cab.className = 'fila-cab';
      cab.innerHTML =
        '<strong style="font-size:15.5px">' + escapa(r.participante) + '</strong>' +
        '<span class="chip ' + estado.clase + '">' + estado.texto + '</span>' +
        (filtro === 'todos' ? '<span style="font-size:13.5px;color:#8494a4">' + escapa(campamentos[r.campamento_id] || r.campamento_id) + '</span>' : '') +
        '<span style="font-size:13.5px;color:#8494a4">' + fecha(r.created_at) + '</span>' +
        '<span style="flex:1"></span>' +
        '<span style="font-size:13.5px;color:#5b6b7d">' + escapa(r.telefono || '') + '</span>';
      cab.addEventListener('click', function () { fila.classList.toggle('abierta'); });
      fila.appendChild(cab);

      var ficha = document.createElement('div');
      ficha.className = 'ficha-desplegada';
      var datos = r.datos || {};
      var piezas =
        dato('Tutor/a', r.tutor) + dato('Correo', r.email) +
        dato('Teléfono', r.telefono) + dato('Señal', (r.importe_centimos / 100).toLocaleString('es-ES') + ' €');
      Object.keys(ETIQUETAS).forEach(function (k) {
        if (datos[k]) piezas += dato(ETIQUETAS[k], datos[k]);
      });
      ficha.innerHTML = piezas +
        '<div class="dato" style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
        (r.estado === 'pendiente-efectivo'
          ? '<button class="boton-mini" data-accion="pagada">✓ Marcar señal pagada</button>' : '') +
        (r.estado === 'pagada'
          ? '<button class="boton-mini" data-accion="efectivo">↩ Volver a pendiente</button>' : '') +
        '<button class="boton-mini rojo" data-accion="borrar">🗑 Borrar inscripción</button>' +
        '</div>';
      ficha.querySelectorAll('button[data-accion]').forEach(function (b) {
        b.addEventListener('click', function () { accion(b.getAttribute('data-accion'), r); });
      });
      fila.appendChild(ficha);
      lista.appendChild(fila);
    });
  }

  function dato(nombre, valor) {
    if (valor == null || valor === '') return '';
    return '<div class="dato"><dt>' + escapa(nombre) + '</dt><dd>' + escapa(String(valor)) + '</dd></div>';
  }

  function escapa(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : t;
    return d.innerHTML;
  }

  function fecha(iso) {
    try {
      return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  /* ------------------- acciones -------------------------------- */

  function accion(cual, r) {
    if (cual === 'borrar') {
      if (!confirm('¿Borrar del todo la inscripción de «' + r.participante + '»?\n\nEsto no se puede deshacer.')) return;
      cliente.from('reservas').delete().eq('id', r.id).then(function (res) {
        if (res.error) return alert('No se pudo borrar: ' + res.error.message);
        carga();
      });
      return;
    }
    var nuevo = cual === 'pagada' ? 'pagada' : 'pendiente-efectivo';
    cliente.from('reservas').update({ estado: nuevo }).eq('id', r.id).then(function (res) {
      if (res.error) return alert('No se pudo cambiar: ' + res.error.message);
      carga();
    });
  }

  document.getElementById('btn-recargar').addEventListener('click', carga);

  /* ------------------- la lista en CSV (para Excel) ------------ */

  document.getElementById('btn-csv').addEventListener('click', function () {
    var columnas = ['Campamento', 'Estado', 'Fecha', 'Participante', 'Tutor/a', 'Correo', 'Teléfono', 'Señal (€)'];
    var clavesFicha = Object.keys(ETIQUETAS);
    columnas = columnas.concat(clavesFicha.map(function (k) { return ETIQUETAS[k]; }));

    var lineas = [columnas];
    visibles().forEach(function (r) {
      var estado = (ESTADOS[r.estado] || { texto: r.estado }).texto;
      var fila = [
        campamentos[r.campamento_id] || r.campamento_id, estado,
        new Date(r.created_at).toLocaleString('es-ES'),
        r.participante, r.tutor, r.email, r.telefono,
        (r.importe_centimos / 100).toLocaleString('es-ES')
      ];
      var datos = r.datos || {};
      clavesFicha.forEach(function (k) { fila.push(datos[k] || ''); });
      lineas.push(fila);
    });

    /* punto y coma y BOM: es lo que el Excel en español abre bien */
    var csv = '﻿' + lineas.map(function (fila) {
      return fila.map(function (celda) {
        celda = String(celda == null ? '' : celda);
        return '"' + celda.replace(/"/g, '""') + '"';
      }).join(';');
    }).join('\r\n');

    var nombre = 'lista-' + (filtro === 'todos' ? 'campamentos' : filtro) + '-' +
      new Date().toISOString().slice(0, 10) + '.csv';
    var enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  });
})();
