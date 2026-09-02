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
      'body.editando [data-edit-img]{outline:2px dashed rgba(0,117,196,.8);outline-offset:-2px;cursor:grab;touch-action:none;-webkit-user-drag:none}' +
      /* Los sombreados que van encima de las fotos de los héroes se
         comían el clic: en modo edición los clics los atraviesan,
         para poder tocar la foto de debajo. */
      'body.editando [style*="position:absolute"][style*="gradient"]{pointer-events:none}' +
      '.fantasma-mango{position:absolute;transform:translateX(-100%);z-index:9998;' +
      'background:#0075c4;color:#fff;font:700 13px Barlow,system-ui,sans-serif;' +
      'padding:9px 15px;border-radius:999px;cursor:grab;touch-action:none;user-select:none;' +
      'box-shadow:0 10px 26px -8px rgba(0,0,0,.5);white-space:nowrap}' +
      '.fantasma-mango:active{cursor:grabbing}';
    document.head.appendChild(css);

    barra = document.createElement('div');
    barra.className = 'fantasma-barra';
    btnEditar = boton('✏️ Editar', function () { entra(); });
    btnGuardar = boton('Guardar', function () { guarda(); });
    btnDescartar = boton('Descartar', function () { descarta(); }, 'secundario');
    var enlaceListas = document.createElement('a');
    enlaceListas.href = window.ITAKA.BASE + 'admin/';
    enlaceListas.textContent = '📋 Listas';
    enlaceListas.style.cssText = 'background:rgba(255,255,255,.12);color:#fff;font:inherit;' +
      'padding:10px 18px;border-radius:999px;text-decoration:none';
    var btnSalir = boton('Salir', function () {
      cliente.auth.signOut().then(function () { location.reload(); });
    }, 'secundario');
    aviso = document.createElement('span');
    aviso.className = 'aviso';
    barra.appendChild(btnEditar);
    barra.appendChild(btnGuardar);
    barra.appendChild(btnDescartar);
    barra.appendChild(aviso);
    barra.appendChild(enlaceListas);
    barra.appendChild(btnSalir);
    document.body.appendChild(barra);
    muestra(false);

    /* En modo edición, pinchar un enlace editable no debe navegar. */
    document.addEventListener('click', function (e) {
      if (!editando) return;
      var enlace = e.target.closest && e.target.closest('a');
      if (enlace && !barra.contains(e.target)) e.preventDefault();
      var img = laFotoDe(e.target);
      if (img && !arrastreReciente) eligeFoto(img);
    }, true);

    /* ------------------------------------------------------------
       ENCUADRAR UNA FOTO: arrastrarla dentro de su marco mueve qué
       parte se ve (object-position). Un toque sin apenas movimiento
       (menos de 6 px) sigue siendo «cambiar la foto»; a partir de
       ahí es un arrastre y la foto sigue al dedo.
       ------------------------------------------------------------ */
    document.addEventListener('pointerdown', function (e) {
      if (!editando) return;
      var img = laFotoDe(e.target);
      if (!img) return;
      var pos = getComputedStyle(img).objectPosition.split(' ');
      arrastre = {
        el: img, x0: e.clientX, y0: e.clientY,
        px: parseFloat(pos[0]) || 50, py: parseFloat(pos[1]) || 50,
        movido: false
      };
      if (img.setPointerCapture) {
        try { img.setPointerCapture(e.pointerId); } catch (err) { /* da igual */ }
      }
      e.preventDefault();
    });
    document.addEventListener('pointermove', function (e) {
      if (!arrastre) return;
      var dx = e.clientX - arrastre.x0;
      var dy = e.clientY - arrastre.y0;
      if (!arrastre.movido && Math.hypot(dx, dy) < 6) return;
      arrastre.movido = true;
      var marco = arrastre.el.getBoundingClientRect();
      /* Arrastrar a la derecha enseña lo que quedaba por la izquierda:
         el porcentaje baja. Por eso la resta. */
      var nx = Math.max(0, Math.min(100, arrastre.px - dx / marco.width * 100));
      var ny = Math.max(0, Math.min(100, arrastre.py - dy / marco.height * 100));
      arrastre.el.style.objectPosition = nx.toFixed(1) + '% ' + ny.toFixed(1) + '%';
    });
    document.addEventListener('pointerup', function () {
      if (!arrastre) return;
      if (arrastre.movido) {
        var el = arrastre.el;
        var hueco = el.getAttribute('data-edit-img');
        if (!fotos[hueco]) fotos[hueco] = { urlAntes: el.src };
        if (!('posAntes' in fotos[hueco])) {
          fotos[hueco].posAntes = arrastre.px + '% ' + arrastre.py + '%';
          fotos[hueco].zoomAntes = zoomDe(el);
        }
        fotos[hueco].posicion = encuadreDe(el);
        aviso.textContent = 'Encuadre listo; se publica al guardar';
        /* Que el clic que llega justo después no abra el selector. */
        arrastreReciente = true;
        setTimeout(function () { arrastreReciente = false; }, 0);
      }
      arrastre = null;
    });

    /* ------------------------------------------------------------
       AMPLIAR UNA FOTO: la rueda del ratón (o dos dedos en el
       trackpad) sobre la foto acerca o aleja, de ×1 a ×3. Se apoya
       en object-view-box: un navegador viejo que no lo entienda
       simplemente no amplía, y el resto del encuadre sigue igual.
       ------------------------------------------------------------ */
    document.addEventListener('wheel', function (e) {
      if (!editando) return;
      var img = laFotoDe(e.target);
      if (!img) return;
      e.preventDefault();
      var hueco = img.getAttribute('data-edit-img');
      if (!fotos[hueco]) fotos[hueco] = { urlAntes: img.src };
      var foto = fotos[hueco];
      if (!('posAntes' in foto)) {
        foto.posAntes = getComputedStyle(img).objectPosition;
        foto.zoomAntes = zoomDe(img);
      }
      var z = zoomDe(img) * (e.deltaY < 0 ? 1.06 : 1 / 1.06);
      z = Math.max(1, Math.min(3, z));
      aplicaZoom(img, z);
      foto.posicion = encuadreDe(img);
      aviso.textContent = z > 1.001
        ? 'Zoom ×' + z.toFixed(1) + '; se publica al guardar'
        : 'Sin zoom; se publica al guardar';
    }, { passive: false });
  }

  var arrastre = null;
  var arrastreReciente = false;

  /* ------------------------------------------------------------
     EL ASA DE LAS FOTOS DE FONDO · Las fotos de los héroes van
     DEBAJO del titular y de los botones, así que apenas quedaba
     dónde tocarlas. En modo edición, cada foto de fondo recibe una
     pastilla «📷 Foto del fondo» en su esquina: tocarla cambia la
     foto, arrastrarla la encuadra y la rueda encima hace zoom. Todo
     lo que se haga sobre el asa se aplica a su foto.
     ------------------------------------------------------------ */
  var mangos = [];

  function laFotoDe(objetivo) {
    if (!objetivo || !objetivo.closest) return null;
    var mango = objetivo.closest('.fantasma-mango');
    if (mango) return mango._foto;
    return objetivo.closest('[data-edit-img]');
  }

  function pintaMangos() {
    document.querySelectorAll('[data-edit-img]').forEach(function (img) {
      if (getComputedStyle(img).position !== 'absolute') return;
      var caja = img.getBoundingClientRect();
      if (!caja.width) return;
      var mango = document.createElement('div');
      mango.className = 'fantasma-mango';
      mango.textContent = '📷 Foto del fondo';
      mango.title = 'Toca para cambiarla · arrastra para encuadrar · rueda para zoom';
      mango.style.left = (caja.right + scrollX - 16) + 'px';
      mango.style.top = (caja.top + scrollY + 16) + 'px';
      mango._foto = img;
      document.body.appendChild(mango);
      mangos.push(mango);
    });
  }

  function quitaMangos() {
    mangos.forEach(function (m) { m.remove(); });
    mangos = [];
  }

  /* El zoom guardado vive en object-view-box como inset(p%):
     p = 50·(1−1/z), así que z = 50/(50−p). */
  function zoomDe(img) {
    var m = /inset\(([\d.]+)%\)/.exec(img.style.objectViewBox || '');
    return m ? 50 / (50 - parseFloat(m[1])) : 1;
  }

  function aplicaZoom(img, z) {
    img.style.objectViewBox = z > 1.001
      ? 'inset(' + (50 * (1 - 1 / z)).toFixed(2) + '%)'
      : '';
  }

  /* El encuadre completo tal y como se guarda: «x% y%» o «x% y% 1.4». */
  function encuadreDe(img) {
    var pos = img.style.objectPosition ||
      getComputedStyle(img).objectPosition || '50% 50%';
    var z = zoomDe(img);
    return z > 1.001 ? pos + ' ' + z.toFixed(2) : pos;
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
    aviso.textContent = enEdicion ? 'Toca un texto o una foto · arrastra una foto para encuadrarla' : '';
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
    document.querySelectorAll('[data-edit-img]').forEach(function (el) {
      el.draggable = false; /* el arrastre nativo pisaría el encuadre */
    });
    pintaMangos();
    muestra(true);
  }

  function sal() {
    editando = false;
    document.body.classList.remove('editando');
    cadaTexto(function (el) { el.removeAttribute('contenteditable'); });
    quitaMangos();
    muestra(false);
  }

  function descarta() {
    cadaTexto(function (el) {
      var antes = originales[el.getAttribute('data-edit')];
      if (antes != null && el.innerText !== antes) el.innerText = antes;
    });
    Object.keys(fotos).forEach(function (hueco) {
      var el = document.querySelector('[data-edit-img="' + hueco + '"]');
      if (!el) return;
      if (fotos[hueco].blob) el.src = fotos[hueco].urlAntes;
      if ('posAntes' in fotos[hueco]) {
        el.style.objectPosition = fotos[hueco].posAntes;
        aplicaZoom(el, fotos[hueco].zoomAntes || 1);
      }
    });
    sal();
  }

  function eligeFoto(el) {
    var entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = 'image/*,application/pdf';
    entrada.addEventListener('change', function () {
      var archivo = entrada.files && entrada.files[0];
      if (!archivo) return;
      var hueco = el.getAttribute('data-edit-img');
      var esPdf = archivo.type === 'application/pdf';
      aviso.textContent = esPdf ? 'Leyendo el PDF…' : 'Preparando la foto…';
      (esPdf ? preparaPdf(archivo) : preparaFoto(archivo)).then(function (lista) {
        if (!fotos[hueco]) fotos[hueco] = { urlAntes: el.src };
        fotos[hueco].blob = lista.blob;
        fotos[hueco].ext = lista.ext;
        fotos[hueco].pdf = lista.pdf || null;
        el.src = URL.createObjectURL(lista.blob);
        aviso.textContent = esPdf
          ? 'PDF listo (se verá su primera página); se sube al guardar'
          : 'Foto lista; se sube al guardar';
      }).catch(function (e) {
        /* Chrome no sabe leer los HEIC del iPhone; Safari sí. */
        aviso.textContent = esPdf
          ? 'No pude leer ese PDF: ' + (e && e.message ? e.message : 'prueba con otro archivo.')
          : 'No puedo leer esa foto. Si es del iPhone (HEIC), ' +
            'ábrela en Fotos y exporta como JPG, o inténtalo desde Safari.';
      });
    });
    entrada.click();
  }

  /* ------------------------------------------------------------
     PDFs (el folleto del campus, los carteles): se sube el PDF tal
     cual y, para el hueco de la página, se fabrica una imagen de su
     primera página con pdf.js. La librería solo se carga aquí, en
     el momento de elegir un PDF, y solo para administración: una
     visita normal jamás la descarga.
     ------------------------------------------------------------ */
  var cargaPdfjs = null;
  function conPdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!cargaPdfjs) {
      cargaPdfjs = new Promise(function (listo, mal) {
        var s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = function () {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          listo(window.pdfjsLib);
        };
        s.onerror = function () { mal(new Error('no se pudo cargar el lector de PDF')); };
        document.head.appendChild(s);
      });
    }
    return cargaPdfjs;
  }

  function preparaPdf(archivo) {
    if (archivo.size > 15 * 1024 * 1024) {
      return Promise.reject(new Error('pesa más de 15 MB; expórtalo más ligero.'));
    }
    return conPdfjs().then(function (pdfjs) {
      return archivo.arrayBuffer().then(function (datos) {
        return pdfjs.getDocument({ data: datos }).promise;
      });
    }).then(function (doc) {
      return doc.getPage(1);
    }).then(function (pagina) {
      var vista = pagina.getViewport({ scale: 1 });
      var escala = 1200 / vista.width;
      vista = pagina.getViewport({ scale: escala });
      var lienzo = document.createElement('canvas');
      lienzo.width = Math.round(vista.width);
      lienzo.height = Math.round(vista.height);
      return pagina.render({ canvasContext: lienzo.getContext('2d'), viewport: vista })
        .promise.then(function () {
          return new Promise(function (listo, mal) {
            lienzo.toBlob(function (b) {
              if (b) listo({ blob: b, ext: '.jpg', pdf: archivo });
              else mal(new Error('no se pudo generar la vista previa'));
            }, 'image/jpeg', 0.85);
          });
        });
    });
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
        var el = document.querySelector('[data-edit-img="' + hueco + '"]');
        var sello = Date.now();
        var camino = pagina + '/' + hueco + '-' + sello + foto.ext;
        var subida = cliente.storage.from('imagenes')
          .upload(camino, foto.blob, {
            contentType: foto.blob.type || 'image/jpeg',
            /* cada guardado crea un archivo nuevo, así que el navegador
               puede quedarse esta foto un año sin miedo: es lo que quita
               el parpadeo en las visitas siguientes */
            cacheControl: '31536000'
          })
          .then(function (r) {
            if (r.error) throw r.error;
            return cliente.storage.from('imagenes').getPublicUrl(camino).data.publicUrl;
          });
        /* Si lo elegido fue un PDF, se sube también el original: la
           imagen es su portada y el PDF es lo que se descarga. */
        var subidaPdf = !foto.pdf ? Promise.resolve(null)
          : cliente.storage.from('imagenes')
            .upload(pagina + '/' + hueco + '-' + sello + '.pdf', foto.pdf, {
              contentType: 'application/pdf', cacheControl: '31536000'
            })
            .then(function (r) {
              if (r.error) throw r.error;
              return cliente.storage.from('imagenes')
                .getPublicUrl(pagina + '/' + hueco + '-' + sello + '.pdf').data.publicUrl;
            });
        return Promise.all([subida, subidaPdf]).then(function (urls) {
          /* El encuadre que se guarda es el que se está viendo. Si esta
             vez no hay PDF, `archivo` se limpia a propósito. */
          return { pagina: pagina, hueco: hueco, url: urls[0], archivo: urls[1],
                   posicion: foto.posicion || (el ? encuadreDe(el) : null) };
        });
      });

    /* Encuadres sin foto nueva: se guarda la dirección que ya tenía la
       foto (tal y como está escrita en el HTML, no la absoluta, para
       que siga valiendo cuando la web cambie de dominio). */
    Object.keys(fotos).forEach(function (hueco) {
      var foto = fotos[hueco];
      if (foto.blob || !foto.posicion) return;
      var el = document.querySelector('[data-edit-img="' + hueco + '"]');
      if (!el) return;
      subidas.push(Promise.resolve({
        pagina: pagina, hueco: hueco,
        url: el.getAttribute('src'), posicion: foto.posicion
      }));
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
