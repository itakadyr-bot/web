/* ============================================================
   EDITAR LA PÁGINA ENCIMA DE LA PÁGINA · modo fantasma de Ítaka
   ------------------------------------------------------------
   QUÉ ES, EN CRISTIANO
   Entras en la web con tu cuenta de administración, pulsas «Editar»
   y los textos y las fotos se cambian ahí mismo, viendo cómo quedan
   de verdad. «Guardar» lo publica; «Descartar» lo deja como estaba.

   ⚠️ LO QUE ESTO NO ES
   No es WordPress: no se mueven bloques ni se crean páginas nuevas.
   Se cambia LO QUE DICE cada hueco, no dónde está. La web está hecha
   a medida, y por eso va rápida y se ve como se ve.

   TRES DECISIONES QUE EXPLICAN CÓMO ESTÁ HECHO

   1 · A QUIEN NO ES ADMINISTRACIÓN NO LE CUESTA NADA.
       Lo primero es mirar si hay sesión guardada en ESTE navegador,
       cosa que se sabe sin cargar la librería de Supabase. Si no la
       hay —una familia, Google— este archivo no hace nada más. Solo
       si hay sesión se carga la librería y se pregunta a la base
       «¿es administración?» (es_admin(), y de eso no se fía del
       navegador: lo decide la base).

   2 · LOS HUECOS LOS MARCA EL HTML, NO UNA LISTA APARTE.
       Cada texto editable lleva data-edit="nombre-del-hueco" y cada
       foto data-edit-img. Así este archivo es el mismo para las seis
       páginas y no hay que mantener una lista de selectores.

   3 · GUARDAR ES UN BOTÓN Y NO PASA SOLO.
       Nada se escribe en la base hasta pulsar «Guardar». Un guardado
       automático en la web pública sería publicar un error de dedo
       en directo. Las fotos también esperan: al elegirla se ve el
       cambio en la página, pero solo se sube al guardar.
   ============================================================ */
(function () {
  'use strict';
  if (!window.ITAKA || !window.ITAKA.haySesionGuardada()) return;

  var cliente = null;
  var editando = false;
  var originales = {};   /* hueco -> texto de antes, para descartar */
  var fotos = {};        /* hueco -> { archivo, urlAntes } */

  window.ITAKA.conCliente().then(function (c) {
    cliente = c;
    return cliente.auth.getSession();
  }).then(function (r) {
    if (!r || !r.data || !r.data.session) return null;
    return cliente.rpc('es_admin');
  }).then(function (r) {
    if (r && r.data === true) pintaBarra();
  }).catch(function (e) {
    console.warn('[Ítaka] modo fantasma:', e.message);
  });

  /* ------------------------------------------------------------
     La barra flotante: Editar → (Guardar · Descartar) · Salir
     ------------------------------------------------------------ */
  var barra, btnEditar, btnGuardar, btnDescartar, aviso;

  function pintaBarra() {
    var css = document.createElement('style');
    css.textContent =
      '.fantasma-barra{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;gap:8px;align-items:center;' +
      'background:rgba(11,18,27,.95);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.2);' +
      'border-radius:999px;padding:8px;box-shadow:0 20px 50px -12px rgba(0,0,0,.5);font:600 14px Barlow,system-ui,sans-serif}' +
      '.fantasma-barra button{border:0;border-radius:999px;padding:10px 18px;font:inherit;cursor:pointer;' +
      'background:#fff;color:#0b121b;transition:background .18s ease,color .18s ease,transform .12s ease}' +
      '.fantasma-barra button:hover{background:#0075c4;color:#fff}' +
      '.fantasma-barra button:active{transform:scale(.96)}' +
      '.fantasma-barra .secundario{background:rgba(255,255,255,.12);color:#fff}' +
      '.fantasma-barra .aviso{color:#c3d0de;padding:0 8px;max-width:260px}' +
      'body.editando [data-edit]{outline:1.5px dashed rgba(0,117,196,.6);outline-offset:2px;cursor:text}' +
      'body.editando [data-edit]:hover{background:rgba(0,117,196,.08)}' +
      'body.editando [data-edit]:focus{outline:2px solid #0075c4;background:rgba(0,117,196,.06)}' +
      'body.editando [data-edit-img]{outline:2px dashed rgba(0,117,196,.8);outline-offset:-2px;cursor:pointer}';
    document.head.appendChild(css);

    barra = document.createElement('div');
    barra.className = 'fantasma-barra';
    btnEditar = boton('✏️ Editar', function () { entra(); });
    btnGuardar = boton('Guardar', function () { guarda(); });
    btnDescartar = boton('Descartar', function () { descarta(); }, 'secundario');
    var btnSalir = boton('Salir', function () {
      cliente.auth.signOut().then(function () { location.reload(); });
    }, 'secundario');
    aviso = document.createElement('span');
    aviso.className = 'aviso';
    barra.appendChild(btnEditar);
    barra.appendChild(btnGuardar);
    barra.appendChild(btnDescartar);
    barra.appendChild(aviso);
    barra.appendChild(btnSalir);
    document.body.appendChild(barra);
    muestra(false);

    /* En modo edición, pinchar un enlace editable no debe navegar. */
    document.addEventListener('click', function (e) {
      if (!editando) return;
      var enlace = e.target.closest && e.target.closest('a');
      if (enlace && !barra.contains(e.target)) e.preventDefault();
      var img = e.target.closest && e.target.closest('[data-edit-img]');
      if (img) eligeFoto(img);
    }, true);
  }

  function boton(texto, alPulsar, clase) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    if (clase) b.className = clase;
    b.addEventListener('click', alPulsar);
    return b;
  }

  function muestra(enEdicion) {
    btnEditar.hidden = enEdicion;
    btnGuardar.hidden = !enEdicion;
    btnDescartar.hidden = !enEdicion;
    aviso.textContent = enEdicion ? 'Toca un texto o una foto' : '';
  }

  /* ------------------------------------------------------------ */

  function cadaTexto(f) {
    document.querySelectorAll('[data-edit]').forEach(f);
  }

  function entra() {
    editando = true;
    document.body.classList.add('editando');
    originales = {};
    fotos = {};
    cadaTexto(function (el) {
      originales[el.getAttribute('data-edit')] = el.innerText;
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
    });
    muestra(true);
  }

  function sal() {
    editando = false;
    document.body.classList.remove('editando');
    cadaTexto(function (el) { el.removeAttribute('contenteditable'); });
    muestra(false);
  }

  function descarta() {
    cadaTexto(function (el) {
      var antes = originales[el.getAttribute('data-edit')];
      if (antes != null && el.innerText !== antes) el.innerText = antes;
    });
    Object.keys(fotos).forEach(function (hueco) {
      var el = document.querySelector('[data-edit-img="' + hueco + '"]');
      if (el) el.src = fotos[hueco].urlAntes;
    });
    sal();
  }

  function eligeFoto(el) {
    var entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = 'image/*';
    entrada.addEventListener('change', function () {
      var archivo = entrada.files && entrada.files[0];
      if (!archivo) return;
      var hueco = el.getAttribute('data-edit-img');
      aviso.textContent = 'Preparando la foto…';
      preparaFoto(archivo).then(function (lista) {
        if (!fotos[hueco]) fotos[hueco] = { urlAntes: el.src };
        fotos[hueco].blob = lista.blob;
        fotos[hueco].ext = lista.ext;
        el.src = URL.createObjectURL(lista.blob);
        aviso.textContent = 'Foto lista; se sube al guardar';
      }).catch(function () {
        /* Chrome no sabe leer los HEIC del iPhone; Safari sí. */
        aviso.textContent = 'No puedo leer esa foto. Si es del iPhone (HEIC), ' +
          'ábrela en Fotos y exporta como JPG, o inténtalo desde Safari.';
      });
    });
    entrada.click();
  }

  /* Deja la foto lista para la web: si es enorme se encoge a 2000 px
     y se recomprime. Así nadie sube 8 MB del carrete sin querer, y de
     paso los formatos raros se convierten a JPG. Los PNG (logos con
     transparencia) se quedan en PNG. */
  function preparaFoto(archivo) {
    return createImageBitmap(archivo).then(function (bmp) {
      var MAX = 2000;
      var esPng = archivo.type === 'image/png';
      var escala = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      var yaSirve = escala === 1 && archivo.size < 800 * 1024 &&
        (esPng || archivo.type === 'image/jpeg');
      if (yaSirve) return { blob: archivo, ext: esPng ? '.png' : '.jpg' };
      var lienzo = document.createElement('canvas');
      lienzo.width = Math.round(bmp.width * escala);
      lienzo.height = Math.round(bmp.height * escala);
      lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
      return new Promise(function (listo, mal) {
        lienzo.toBlob(function (b) {
          if (b) listo({ blob: b, ext: esPng ? '.png' : '.jpg' });
          else mal(new Error('no se pudo convertir'));
        }, esPng ? 'image/png' : 'image/jpeg', 0.85);
      });
    });
  }

  /* ------------------------------------------------------------
     Guardar: solo lo que ha cambiado. Primero las fotos (subir el
     archivo y apuntar su dirección), luego los textos, todo de una
     tacada con upsert: si el hueco ya estaba, se actualiza.
     ------------------------------------------------------------ */
  function guarda() {
    var pagina = window.ITAKA.pagina || 'inicio';
    aviso.textContent = 'Guardando…';

    var textos = [];
    cadaTexto(function (el) {
      var hueco = el.getAttribute('data-edit');
      var ahora = el.innerText;
      if (originales[hueco] != null && ahora !== originales[hueco]) {
        textos.push({ pagina: pagina, hueco: hueco, valor: ahora });
      }
    });

    var subidas = Object.keys(fotos).filter(function (h) { return fotos[h].blob; })
      .map(function (hueco) {
        var foto = fotos[hueco];
        var camino = pagina + '/' + hueco + '-' + Date.now() + foto.ext;
        return cliente.storage.from('imagenes')
          .upload(camino, foto.blob, { contentType: foto.blob.type || 'image/jpeg' })
          .then(function (r) {
            if (r.error) throw r.error;
            var publica = cliente.storage.from('imagenes').getPublicUrl(camino);
            return { pagina: pagina, hueco: hueco, url: publica.data.publicUrl };
          });
      });

    Promise.all(subidas).then(function (filasImg) {
      var tareas = [];
      if (textos.length) {
        tareas.push(cliente.from('contenido_web')
          .upsert(textos, { onConflict: 'pagina,hueco' })
          .then(function (r) { if (r.error) throw r.error; }));
      }
      if (filasImg.length) {
        tareas.push(cliente.from('imagenes_web')
          .upsert(filasImg, { onConflict: 'pagina,hueco' })
          .then(function (r) { if (r.error) throw r.error; }));
      }
      return Promise.all(tareas).then(function () {
        return textos.length + filasImg.length;
      });
    }).then(function (cuantos) {
      /* Las fotos ya suben publicadas; los textos, también. Lo de la
         pantalla ya es lo guardado: se actualizan los «originales». */
      cadaTexto(function (el) {
        originales[el.getAttribute('data-edit')] = el.innerText;
      });
      fotos = {};
      sal();
      aviso.textContent = cuantos ? 'Guardado ✓' : 'No había cambios';
      setTimeout(function () { aviso.textContent = ''; }, 4000);
    }).catch(function (e) {
      aviso.textContent = 'No se pudo guardar: ' + e.message;
    });
  }
})();
