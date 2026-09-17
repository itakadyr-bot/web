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
  var plazosPorReserva = {};
  var interesados = null; /* null = la tabla aún no existe */
  var filtro = 'todos';
  var filtroPago = 'todos';

  var ESTADOS_PLAZO = {
    'pendiente':  { texto: 'Pendiente',  clase: 'estado-pendiente' },
    'procesando': { texto: 'Procesando (el banco tarda unos días)', clase: 'estado-efectivo' },
    'cobrado':    { texto: 'Cobrado ✓',  clase: 'estado-pagada' },
    'devuelto':   { texto: 'DEVUELTO ⚠', clase: 'estado-devuelto' }
  };

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
      cliente.from('reservas').select('*').order('created_at', { ascending: false }).then(sinError),
      /* los plazos SEPA pueden no existir todavía (paso 9 del manual) */
      cliente.from('plazos').select('*').order('vence')
        .then(sinError).catch(function () { return []; }),
      /* la lista de espera puede no existir todavía (paso 11 del
         manual): si falla, el panel sigue andando sin ella */
      cliente.from('interesados').select('*').order('created_at', { ascending: false })
        .then(sinError).catch(function () { return null; })
    ]).then(function (r) {
      campamentos = {};
      (r[0] || []).forEach(function (c) { campamentos[c.id] = c.nombre; });
      reservas = r[1] || [];
      plazosPorReserva = {};
      (r[2] || []).forEach(function (p) {
        (plazosPorReserva[p.reserva_id] = plazosPorReserva[p.reserva_id] || []).push(p);
      });
      interesados = r[3];
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
    pintaSelectorPago();
  }

  /* --------------- filtro por estado de los pagos --------------- */
  function pintaSelectorPago() {
    var caja = document.getElementById('selector-pago');
    if (!caja) return;
    caja.innerHTML = '';
    [['todos', 'Todos los pagos'],
     ['completo', '✓ Todo pagado'],
     ['parcial', 'A medias'],
     ['devuelto', '⚠ Devueltos'],
     ['sinplazos', 'Sin plazos'],
     ['senal', 'Señal pendiente']].forEach(function (par) {
      var b = document.createElement('button');
      b.className = 'pildora' + (filtroPago === par[0] ? ' activa' : '');
      b.style.fontSize = '13px';
      b.style.padding = '8px 16px';
      b.textContent = par[1];
      b.addEventListener('click', function () { filtroPago = par[0]; pintaSelectorPago(); pinta(); });
      caja.appendChild(b);
    });
  }

  /* --------------- el resumen de pagos de una reserva -----------
     Cuenta la señal como pago 1 (igual que los conceptos «Pago 2/3»):
     una familia con señal pagada y un plazo cobrado de dos va «2/3». */
  function resumenPago(r) {
    var plazos = plazosPorReserva[r.id] || [];
    var total = 1 + plazos.length;
    var pagados = (r.estado === 'pagada' ? 1 : 0) +
      plazos.filter(function (p) { return p.estado === 'cobrado'; }).length;
    var devuelto = plazos.some(function (p) { return p.estado === 'devuelto'; });

    if (r.estado !== 'pagada') {
      return { cat: 'senal', texto: null }; /* el chip de estado ya lo dice */
    }
    if (devuelto) {
      return { cat: 'devuelto', clase: 'estado-devuelto', texto: '⚠ Devuelto · ' + pagados + '/' + total };
    }
    if (!plazos.length) {
      return { cat: 'sinplazos', clase: 'estado-pendiente', texto: r.sepa_pm ? 'Domiciliado · sin plazos' : 'Sin plazos aún' };
    }
    if (pagados === total) {
      return { cat: 'completo', clase: 'estado-pagada', texto: '✓ Todo pagado · ' + pagados + '/' + total };
    }
    return { cat: 'parcial', clase: 'estado-efectivo', texto: 'Pagados ' + pagados + '/' + total };
  }

  function visibles() {
    return reservas.filter(function (r) {
      if (filtro !== 'todos' && r.campamento_id !== filtro) return false;
      return filtroPago === 'todos' || resumenPago(r).cat === filtroPago;
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
      var pago = resumenPago(r);
      cab.innerHTML =
        '<strong style="font-size:15.5px">' + escapa(r.participante) + '</strong>' +
        '<span class="chip ' + estado.clase + '">' + estado.texto + '</span>' +
        (pago.texto ? '<span class="chip ' + pago.clase + '">' + pago.texto + '</span>' : '') +
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
      /* --- la domiciliación y los plazos del resto ------------- */
      var plazos = plazosPorReserva[r.id] || [];
      var bloquePlazos = '<div class="dato" style="grid-column:1/-1;border-top:1px solid #eef1f4;padding-top:12px;margin-top:4px">' +
        '<dt>Resto del campamento (domiciliación)</dt>';
      bloquePlazos += r.sepa_pm
        ? '<dd style="margin-top:4px"><span class="chip estado-pagada">🏦 Domiciliación autorizada</span></dd>'
        : '<dd style="margin-top:4px"><span class="chip estado-pendiente">Sin autorizar</span> ' +
          '<button class="boton-mini" data-accion="enlace-dom">🔗 Copiar enlace para la familia</button></dd>';
      plazos.forEach(function (p) {
        var ep = ESTADOS_PLAZO[p.estado] || { texto: p.estado, clase: 'estado-pendiente' };
        bloquePlazos += '<dd style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
          '<strong>' + escapa(p.concepto) + '</strong> · ' +
          (p.importe_centimos / 100).toLocaleString('es-ES') + ' € · vence ' +
          new Date(p.vence + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) +
          ' <span class="chip ' + ep.clase + '">' + ep.texto + '</span>' +
          ((p.estado === 'pendiente' || p.estado === 'devuelto') && r.sepa_pm
            ? ' <button class="boton-mini" data-plazo-cobrar="' + p.id + '">💶 Cobrar ahora</button>' : '') +
          (p.estado === 'pendiente'
            ? ' <button class="boton-mini rojo" data-plazo-borrar="' + p.id + '">Quitar</button>' : '') +
          '</dd>';
      });
      bloquePlazos += '<dd style="margin-top:10px"><button class="boton-mini" data-accion="anadir-plazo">+ Añadir plazo</button></dd></div>';

      ficha.innerHTML = piezas + bloquePlazos +
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
      ficha.querySelectorAll('button[data-plazo-cobrar]').forEach(function (b) {
        b.addEventListener('click', function () { cobra(b.getAttribute('data-plazo-cobrar'), b); });
      });
      ficha.querySelectorAll('button[data-plazo-borrar]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (!confirm('¿Quitar este plazo?')) return;
          cliente.from('plazos').delete().eq('id', b.getAttribute('data-plazo-borrar')).then(function (res) {
            if (res.error) return alert('No se pudo: ' + res.error.message);
            carga();
          });
        });
      });
      fila.appendChild(ficha);
      lista.appendChild(fila);
    });
    pintaEspera();
  }

  /* --------------- la lista de espera --------------------------
     Correos que dejaron las familias cuando el campamento estaba
     cerrado o completo. Se filtra con las mismas píldoras. */
  function pintaEspera() {
    var caja = document.getElementById('lista-espera');
    if (!caja || interesados == null) return;
    var filas = interesados.filter(function (i) {
      return filtro === 'todos' || i.campamento_id === filtro;
    });
    caja.hidden = false;
    caja.innerHTML = '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4">' +
      '<strong style="font-size:15.5px">⏳ Lista de espera</strong>' +
      '<span class="chip estado-pendiente">' + filas.length + '</span>' +
      '<span style="flex:1"></span>' +
      (filas.length ? '<button class="boton-mini" id="btn-copiar-espera">📋 Copiar los correos</button>' : '') +
      '</div>';
    if (!filas.length) {
      caja.innerHTML += '<p style="padding:16px 20px;margin:0;color:#8494a4;font-size:14px">Nadie en espera' +
        (filtro !== 'todos' ? ' en este campamento' : '') + '.</p>';
      return;
    }
    filas.forEach(function (i) {
      var f = document.createElement('div');
      f.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:11px 20px;border-bottom:1px solid #f4f6f8;font-size:14px';
      f.innerHTML = '<span style="font-weight:600">' + escapa(i.email) + '</span>' +
        (filtro === 'todos' ? '<span style="color:#8494a4;font-size:13px">' + escapa(campamentos[i.campamento_id] || i.campamento_id) + '</span>' : '') +
        '<span style="color:#8494a4;font-size:13px">' + fecha(i.created_at) + '</span>' +
        '<span style="flex:1"></span>' +
        '<button class="boton-mini rojo">Quitar</button>';
      f.querySelector('button').addEventListener('click', function () {
        if (!confirm('¿Quitar a ' + i.email + ' de la lista de espera?')) return;
        cliente.from('interesados').delete().eq('id', i.id).then(function (res) {
          if (res.error) return alert('No se pudo: ' + res.error.message);
          carga();
        });
      });
      caja.appendChild(f);
    });
    var btnCopiar = document.getElementById('btn-copiar-espera');
    if (btnCopiar) btnCopiar.addEventListener('click', function () {
      var correos = filas.map(function (i) { return i.email; }).join(', ');
      navigator.clipboard.writeText(correos).then(function () {
        alert('Copiados ' + filas.length + ' correos. Pégalos en CCO al escribirles.');
      }, function () { prompt('Copia los correos:', correos); });
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
    if (cual === 'enlace-dom') {
      var enlace = new URL(window.ITAKA.BASE + 'domiciliar/?r=' + r.id, location.href).href;
      navigator.clipboard.writeText(enlace).then(function () {
        alert('Enlace copiado. Mándaselo a la familia (WhatsApp o correo):\n\n' + enlace);
      }, function () {
        prompt('Copia el enlace para la familia:', enlace);
      });
      return;
    }
    if (cual === 'anadir-plazo') {
      var concepto = prompt('Concepto del plazo (p. ej. «Resto 1/2 · abril»):');
      if (!concepto) return;
      var importe = parseFloat(String(prompt('Importe en euros (p. ej. 150):') || '').replace(',', '.'));
      if (!(importe > 0)) return alert('Ese importe no vale.');
      var vence = prompt('Fecha de cargo (AAAA-MM-DD):', new Date().toISOString().slice(0, 10));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vence || '')) return alert('La fecha tiene que ser AAAA-MM-DD.');
      cliente.from('plazos').insert({
        reserva_id: r.id, concepto: concepto.trim(),
        importe_centimos: Math.round(importe * 100), vence: vence
      }).then(function (res) {
        if (res.error) return alert('No se pudo añadir: ' + res.error.message);
        carga();
      });
      return;
    }
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

  /* --- lanzar recibos: uno concreto, o todos los vencidos ------- */

  function cobra(plazoId, boton) {
    if (boton) boton.disabled = true;
    cliente.auth.getSession().then(function (s) {
      var token = s && s.data && s.data.session && s.data.session.access_token;
      return fetch(window.ITAKA.URL + '/functions/v1/plazos-cobrar', {
        method: 'POST',
        headers: {
          apikey: window.ITAKA.KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(plazoId ? { plazo: plazoId } : {})
      });
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        var partes = [];
        if (d.lanzados) partes.push(d.lanzados + ' recibo(s) lanzados (quedan «procesando» unos días)');
        if (d.detalle) partes.push(d.detalle);
        (d.saltados || []).forEach(function (s) { partes.push('Saltado — ' + s); });
        (d.errores || []).forEach(function (s) { partes.push('ERROR — ' + s); });
        if (d.mensaje) partes.push(d.mensaje);
        alert(partes.join('\n') || 'Hecho.');
        carga();
      })
      .catch(function (e) { alert('No se pudo: ' + e.message); carga(); });
  }

  var btnVencidos = document.getElementById('btn-cobrar-vencidos');
  if (btnVencidos) {
    btnVencidos.addEventListener('click', function () {
      if (confirm('¿Lanzar todos los recibos pendientes que ya han vencido?')) cobra(null, btnVencidos);
    });
  }

  /* ------------------- la lista en CSV (para Excel) ------------ */

  document.getElementById('btn-csv').addEventListener('click', function () {
    var columnas = ['Campamento', 'Estado', 'Pagos', 'Fecha', 'Participante', 'Tutor/a', 'Correo', 'Teléfono', 'Señal (€)',
                    'Domiciliación', 'Resto cobrado (€)', 'Resto pendiente (€)'];
    var clavesFicha = Object.keys(ETIQUETAS);
    columnas = columnas.concat(clavesFicha.map(function (k) { return ETIQUETAS[k]; }));

    var lineas = [columnas];
    visibles().forEach(function (r) {
      var estado = (ESTADOS[r.estado] || { texto: r.estado }).texto;
      var plazos = plazosPorReserva[r.id] || [];
      var cobradoResto = plazos.filter(function (p) { return p.estado === 'cobrado'; })
        .reduce(function (s, p) { return s + p.importe_centimos; }, 0);
      var pendienteResto = plazos.filter(function (p) { return p.estado !== 'cobrado'; })
        .reduce(function (s, p) { return s + p.importe_centimos; }, 0);
      var fila = [
        campamentos[r.campamento_id] || r.campamento_id, estado,
        resumenPago(r).texto || 'Señal pendiente',
        new Date(r.created_at).toLocaleString('es-ES'),
        r.participante, r.tutor, r.email, r.telefono,
        (r.importe_centimos / 100).toLocaleString('es-ES'),
        r.sepa_pm ? 'Sí' : 'No',
        (cobradoResto / 100).toLocaleString('es-ES'),
        (pendienteResto / 100).toLocaleString('es-ES')
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
