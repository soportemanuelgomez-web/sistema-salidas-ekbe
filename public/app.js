let html5QrcodeScanner = null;
let datosCache = { cicloEscolar: '2026-2027', alumnos: [], tutores: [], historial: [], listaVoceo: [], alertasCustodia: [] };
let nivelFiltroActual = "TODOS";
let ultimoTutorBuscadoId = null;

document.addEventListener("DOMContentLoaded", () => {
    // Sincronización inicial y ciclo periódico
    sincronizarServidor();
    setInterval(sincronizarServidor, 3000);

    // Configurar la fecha actual por defecto en el filtro de reportes
    const filtroFecha = document.getElementById("filtro-fecha");
    if (filtroFecha) filtroFecha.valueAsDate = new Date();

    // Event Listeners y Conexiones Directas
    conectar("btn-iniciar-camara", "click", iniciarCamara);
    conectar("btn-manual", "click", buscarManual);
    conectar("form-registro", "submit", registrarAlumno);
    conectar("filtro-fecha", "change", renderizarReporte);
    conectar("btn-exportar-excel", "click", exportarExcel);
    conectar("btn-migrar-grupo", "click", migrarGrupo);
    conectar("btn-imprimir-ficha", "click", () => window.print());
    conectar("btn-descargar-imagen-qr", "click", descargarTarjetaPNG);
    conectar("btn-cerrar-modal", "click", () => document.getElementById("modal-qr").style.display = "none");
    conectar("panel-search-input", "input", buscarRegistrado);
    
    // CORRECCIÓN: Se agrega ejecutarBusquedaDirecta al botón de búsqueda del panel
    conectar("panel-search-btn", "click", ejecutarBusquedaDirecta);

    // Escuchar la tecla Enter en la caja de búsqueda para abrir la ventana modal
    const inputBusqueda = document.getElementById("panel-search-input");
    if (inputBusqueda) {
        inputBusqueda.addEventListener("keypress", (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                ejecutarBusquedaDirecta();
            }
        });
    }
    const btnBusqueda = document.getElementById("panel-search-btn");
    if (btnBusqueda) {
        btnBusqueda.addEventListener("click", ejecutarBusquedaDirecta);
    }
});

// Helper para conectar eventos de manera segura
function conectar(id, ev, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
}

function cambiarPestana(idTab, elementoBoton) {
    // 1. Ocultar todos los elementos con la clase tab-content
    const pestanas = document.querySelectorAll('.tab-content');
    pestanas.forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active');
    });

    // 2. Ocultar explícitamente las secciones conocidas por si no tienen la clase .tab-content
    ['tab-entrega', 'tab-voceo', 'tab-registro', 'tab-gestion', 'tab-reporte'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    });

    // 3. Mostrar la pestaña solicitada
    const activa = document.getElementById(idTab);
    if (activa) {
        activa.style.display = 'block';
        activa.classList.add('active');
        
        // Forzar visibilidad directa en el DOM por si algún CSS la bloqueaba
        activa.style.setProperty('display', 'block', 'important');
    } else {
        alert("⚠️ No se encontró la pestaña con ID: " + idTab);
    }

    // 4. Actualizar estado visual de los botones
    const botones = document.querySelectorAll('.nav-item');
    botones.forEach(b => b.classList.remove('active'));
    if (elementoBoton) {
        elementoBoton.classList.add('active');
    }
}

// Opciones dinámicas de Grado según Nivel Escolar
function actualizarOpcionesGrado() {
    const nivelSelect = document.getElementById("reg-nivel");
    const selectGrado = document.getElementById("reg-grado");
    if (!nivelSelect || !selectGrado) return;

    const nivel = nivelSelect.value;
    selectGrado.innerHTML = '<option value="">-- Seleccionar Grado --</option>';

    let opciones = [];
    if (nivel === "PREESCOLAR") {
        opciones = ["Maternal", "Kínder 1", "Kínder 2", "Kínder 3"];
    } else if (nivel === "PRIMARIA") {
        opciones = ["1° Primaria", "2° Primaria", "3° Primaria", "4° Primaria", "5° Primaria", "6° Primaria"];
    } else if (nivel === "SECUNDARIA") {
        opciones = ["1° Secundaria", "2° Secundaria", "3° Secundaria"];
    }

    opciones.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.innerText = g;
        selectGrado.appendChild(opt);
    });
}

function cambiarFiltroNivel(nivel) {
    nivelFiltroActual = nivel;
    document.querySelectorAll('.btn-filtro-nivel').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.nivel === nivel);
    });
    renderizarGestion();
}

// Sincronización en tiempo real con el backend
function sincronizarServidor() {
    fetch('/api/sync')
        .then(r => r.json())
        .then(d => {
            datosCache.listaVoceo = d.listaVoceo || [];
            datosCache.historial = d.historial || [];
            datosCache.cicloEscolar = d.cicloEscolar || '2026-2027';

            // Actualizar vistas dependientes
            renderizarGestion();
            renderizarReporte();

            if (document.getElementById("modal-bd-completa") && document.getElementById("modal-bd-completa").style.display === "flex") {
                cargarBaseDatosCompleta();
            }

            if (ultimoTutorBuscadoId && document.getElementById("resultCard") && document.getElementById("resultCard").style.display !== "none") {
                procesarEscaneo(ultimoTutorBuscadoId, false);
            }
        })
        .catch(e => console.error("Error al sincronizar con el servidor:", e));
}

function buscarManual() {
    const codeInput = document.getElementById("manual-code");
    const code = codeInput ? codeInput.value.trim() : "";
    if (code) procesarEscaneo(code, true);
}

// Lector de Código QR
function iniciarCamara() {
    const readerDiv = document.getElementById("reader");
    if (!readerDiv) return;
    readerDiv.style.display = "block";
    if (html5QrcodeScanner) html5QrcodeScanner.clear();

    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
    html5QrcodeScanner.render((text) => {
        procesarEscaneo(text, true);
        html5QrcodeScanner.clear();
        readerDiv.style.display = "none";
    });
}

function obtenerNivelDeGrado(grado) {
    const g = String(grado).toLowerCase();
    if (g.includes("sec") || g.includes("7") || g.includes("8") || g.includes("9")) return "SECUNDARIA";
    if (g.includes("kin") || g.includes("k") || g.includes("pre") || g.includes("mat")) return "PREESCOLAR";
    return "PRIMARIA";
}

function renderHermanos(alumnos, tutorNombre, tutorId) {
    const cont = document.getElementById("lista-hermanos-escaneo");
    if (!cont) return;
    
    cont.innerHTML = "";

    // 1. DESTRUIR DUPLICADOS (Dejar solo un alumno por nombre)
    const alumnosUnicos = [];
    const nombresVistos = new Set();

    (alumnos || []).forEach(alu => {
        if (!alu || !alu.nombre) return;
        const nombreLimpio = alu.nombre.trim().toUpperCase();
        
        // Si el alumno no ha sido procesado, lo agregamos a la lista limpia
        if (!nombresVistos.has(nombreLimpio)) {
            nombresVistos.add(nombreLimpio);
            alumnosUnicos.push(alu);
        }
    });

    // 2. DIBUJAR ÚNICAMENTE A LOS HERMANOS ÚNICOS
    alumnosUnicos.forEach(alu => {
        const div = document.createElement("div");
        div.style.cssText = "padding:10px; background:#fff; margin-top:8px; border-radius:6px; border:1px solid #ddd; display:flex; justify-content:space-between; align-items:center;";
        
        const nombreEscapado = alu.nombre.replace(/'/g, "\\'");
        const tutorEscapado = (tutorNombre || '').replace(/'/g, "\\'");

        let btn = alu.entregadoHoy 
            ? `<span style="color:#28a745; font-weight:bold; font-size:12px;">✅ ENTREGADO (${alu.horaEntrega || ''})</span>`
            : `<button onclick="entregar('${nombreEscapado}', '${tutorEscapado}', '${tutorId}')" class="btn-action" style="padding:6px 12px; width:auto; background:#28a745; color:#fff; border:none; border-radius:4px; cursor:pointer;">Confirmar Salida</button>`;
            
        // 3. LIMPIAR EL TEXTO PARA EVITAR "PRIMARIA Primaria"
        let nivelTexto = (alu.nivel || '').trim();
        let gradoTexto = (alu.grado || '').trim();

        if (gradoTexto.toUpperCase().includes(nivelTexto.toUpperCase())) {
            nivelTexto = ''; 
        }
        
        let infoGrado = `${nivelTexto} ${gradoTexto}`.trim();
        if (alu.grupo) infoGrado += ` "${alu.grupo}"`;

        div.innerHTML = `<div><strong>${alu.nombre}</strong> (${infoGrado})</div><div>${btn}</div>`;
        cont.appendChild(div);
    });
}

function entregar(alumnoNombre, tutorNombre, tutorId) {
    // 1. Hora local garantizada en formato de México (12 horas con AM/PM)
    const hoy = new Date().toISOString().split('T')[0];
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });

    // 2. UI OPTIMISTA: Oculta el botón/tarjeta al instante al hacer clic
    if (window.event && window.event.target) {
        const boton = window.event.target;
        boton.disabled = true;
        boton.innerText = "✅ Entregado";
        boton.style.background = "#6c757d";
    }

    fetch('/api/entregar-alumno-individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            alumnoNombre, 
            tutorNombre, 
            tutorId, 
            tipo: "Escáner / Salida Directa", 
            fecha: hoy, 
            hora,
            puerta: "Principal"
        })
    }).then(() => {
        sincronizarServidor();
    });
}

// Monitor de Voceo en Vivo (Actualizado para filtrar por PUERTA de salida)
function renderizarGestion() {
    const cont = document.getElementById("lista-voceo");
    if (!cont) return;
    cont.innerHTML = "";

    const listaVoceoValida = datosCache.listaVoceo || [];

    if (listaVoceoValida.length === 0) {
        cont.innerHTML = '<p class="empty-text" style="color:#666; font-size:13px; text-align:center;">No hay solicitudes pendientes en pantalla.</p>';
        return;
    }

    const listaFiltrada = listaVoceoValida.filter(v => {
        if (nivelFiltroActual === "TODOS") return true;

        // Normalizamos el valor de la puerta (ej: "Puerta Secundaria" -> "SECUNDARIA")
        const puertaAsignada = String(v.puerta || "").toUpperCase();
        const filtro = String(nivelFiltroActual).toUpperCase();

        // Si la puerta incluye el nombre del filtro (PREESCOLAR, PRIMARIA o SECUNDARIA)
        return puertaAsignada.includes(filtro);
    });

    if (listaFiltrada.length === 0) {
        cont.innerHTML = `<p class="empty-text" style="color:#666; font-size:13px; text-align:center;">No hay solicitudes pendientes para ${nivelFiltroActual}.</p>`;
        return;
    }

    listaFiltrada.forEach(v => {
        const d = document.createElement("div");
        d.style.cssText = `padding:12px; border-radius:8px; margin-bottom:10px; border-left: 5px solid #ffc107; background:#fff3cd;`;

        let botonAccion = `<button onclick="entregar('${v.alumnoNombre}', 'Tutor Registrado', '${v.tutorId}')" class="btn-action" style="background:#28a745; color:white; border:none; border-radius:4px; margin-top:5px; padding:6px 12px; cursor:pointer;">Confirmar Salida</button>`;

        d.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="font-size:15px; color:#1b2680; margin:0;">${v.alumnoNombre} (${v.grado}"${v.grupo}")</h3>
                <small style="color:#666;">${v.horaSolicitud || ''}</small>
            </div>
            <p style="margin:4px 0; font-size:13px;">
                Código Tutor: <strong>${v.tutorId || 'N/A'}</strong> 
                ${v.puerta ? `<span style="background:#1b2680; color:white; padding:2px 6px; border-radius:4px; font-size:11px; margin-left:8px;">📍 ${v.puerta}</span>` : ''}
            </p>
            <div style="margin-top:5px;">${botonAccion}</div>
        `;
        cont.appendChild(d);
    });
}

function cargarBaseDatosCompleta() {
    fetch('/api/alumnos-completo')
        .then(r => r.json())
        .then(data => {
            datosCache.alumnos = data.alumnos || [];
            datosCache.tutores = data.tutores || [];
            renderizarTablaBDCompleta();
            actualizarSelectTutores();
        });
}

function abrirModalBD() {
    cargarBaseDatosCompleta();
    document.getElementById("modal-bd-completa").style.display = "flex";
}

function cerrarModalBD() {
    document.getElementById("modal-bd-completa").style.display = "none";
}

function renderizarTablaBDCompleta() {
    const tbody = document.getElementById("tbody-bd-alumnos");
    if (!tbody) return;

    tbody.innerHTML = "";
    const alumnos = datosCache.alumnos || [];

    if (alumnos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#777; padding:15px;">No hay alumnos registrados en la base de datos.</td></tr>`;
        return;
    }

    alumnos.forEach(alu => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${alu.nombre}</strong></td>
            <td>${alu.nivel || ''} ${alu.grado || ''} "${alu.grupo || ''}"</td>
            <td><code>${alu.id}</code></td>
            <td>${alu.tutorPrincipal || alu.tutorNombre || alu.tutor || 'Sin Tutor'}</td>
            <td><code>${alu.tutorId || 'N/A'}</code></td>
        `;
        tbody.appendChild(tr);
    });
}

function registrarAlumno(e) {
    e.preventDefault();
    const nombre = document.getElementById("reg-nombre").value.trim();
    const nivel = document.getElementById("reg-nivel") ? document.getElementById("reg-nivel").value : "";
    const grado = document.getElementById("reg-grado").value.trim();
    const grupo = document.getElementById("reg-grupo").value.trim();
    const tutorNombre = document.getElementById("reg-tutor").value.trim();
    const tutorExistenteId = document.getElementById("reg-tutor-existente").value;
    const personaAutorizadaExtra = document.getElementById("reg-autorizado-extra") ? document.getElementById("reg-autorizado-extra").value.trim() : "";

    fetch('/api/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, nivel, grado, grupo, tutorNombre, tutorExistenteId, personaAutorizadaExtra })
    }).then(() => {
        alert("Alumno y tutor registrados correctamente.");
        document.getElementById("form-registro").reset();
        sincronizarServidor();
    });
}

// 1. Función que se activa al presionar Enter o dar clic en Buscar
function ejecutarBusquedaDirecta() {
    const input = document.getElementById("panel-search-input");
    if (!input) return;

    const query = input.value.trim().toLowerCase();
    if (!query) {
        alert("Por favor escribe un nombre o código para buscar.");
        return;
    }

    fetch('/api/alumnos-completo')
        .then(res => res.json())
        .then(data => {
            const lista = data.alumnos || (Array.isArray(data) ? data : []);

            if (lista.length === 0) {
                alert("No hay alumnos cargados en la base de datos.");
                return;
            }

            const encontrado = lista.find(alu => 
                JSON.stringify(alu).toLowerCase().includes(query)
            );

            if (!encontrado) {
                alert(`No se encontraron registros para "${input.value.trim()}".`);
                return;
            }

            mostrarModalDetalleAlumno(encontrado);
        })
        .catch(err => {
            console.error("Error en la búsqueda:", err);
            alert("Ocurrió un error al realizar la búsqueda.");
        });
}
// 2. Abre la ventana modal con los datos formateados
function mostrarModalDetalleAlumno(familiaData) {
    let modal = document.getElementById("modal-detalle-alumno");
    
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "modal-detalle-alumno";
        modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center;";
        modal.innerHTML = `
            <div style="background:#fff; width:90%; max-width:480px; padding:25px; border-radius:12px; position:relative; box-shadow:0 10px 25px rgba(0,0,0,0.3); text-align:center;">
                <button onclick="cerrarModalDetalleAlumno()" style="position:absolute; top:12px; right:15px; border:none; background:none; font-size:22px; cursor:pointer; color:#888;">✕</button>
                <h2 style="color:#1b2680; margin-top:0; border-bottom:2px solid #ffcc00; padding-bottom:10px;">📄 Expediente del Alumno</h2>
                <div id="detalle-alumno-contenido" style="text-align:left; margin-top:15px; font-size:14px; color:#333;"></div>
                <div id="qr-modal-expediente" style="margin:20px auto; display:flex; justify-content:center;"></div>
                <div style="margin-top:20px; display:flex; gap:10px; justify-content:center;">
                    <button id="btn-descargar-tarjeton-modal" style="background:#28a745; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:bold;">🎴 Descargar Tarjetón</button>
                    <button onclick="cerrarModalDetalleAlumno()" style="background:#6c757d; color:white; border:none; padding:10px 20px; border-radius:6px; cursor:pointer;">Cerrar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const contenedorDetalles = document.getElementById("detalle-alumno-contenido");
    const qrDiv = document.getElementById("qr-modal-expediente");
    const btnDescargar = document.getElementById("btn-descargar-tarjeton-modal");

    // Normalizar datos para asegurar compatibilidad si viene 1 alumno o lista de hermanos
    const tutorId = familiaData.tutorId || familiaData.idAlumno || familiaData.id || 'N/A';
    const tutorNombre = familiaData.tutorPrincipal || familiaData.tutorNombre || familiaData.tutor || 'Sin Tutor';
    
    // Si viene la lista 'alumnos' la usa, de lo contrario envuelve los datos individuales
    let listaAlumnos = [];
    if (familiaData.alumnos && Array.isArray(familiaData.alumnos) && familiaData.alumnos.length > 0) {
        listaAlumnos = familiaData.alumnos;
    } else {
        listaAlumnos = [{
            nombre: familiaData.nombre || familiaData.alumnoNombre || 'Sin Nombre',
            grado: familiaData.grado || '',
            grupo: familiaData.grupo || '',
            nivel: familiaData.nivel || '',
            alerta: familiaData.alerta || '',
            personaExtra: familiaData.personaExtra || familiaData.personaAutorizadaExtra || ''
        }];
    }

    // Actualizar objeto guardado para la descarga del canvas
    modal.dataset.familiaJson = JSON.stringify({
        tutorId,
        tutorNombre,
        alumnos: listaAlumnos
    });

    // Renderizar tarjetas de alumnos
    let htmlAlumnos = listaAlumnos.map(a => {
        const detGrado = `${a.nivel || ''} ${a.grado || ''} "${a.grupo || ''}"`.trim();
        return `
            <div style="background:#f8f9fa; padding:10px; border-radius:6px; border-left:4px solid #1b2680; margin-bottom:8px;">
                🎓 <strong>Alumno:</strong> ${a.nombre}<br>
                🏫 <strong>Grado / Grupo:</strong> ${detGrado || 'No asignado'}
            </div>
        `;
    }).join('');

    // --- SEPARAR ALERTAS DE PERSONAS AUTORIZADAS EXTRAS ---
    let listaAlertas = [];
    let extrasPermitidos = [];

    listaAlumnos.forEach(a => {
        // Extraer texto de alerta (si existe)
        const txtAlerta = a.alerta || familiaData.alerta || '';
        if (txtAlerta && txtAlerta.trim() !== "") {
            listaAlertas.push(txtAlerta);
        }

        // Extraer persona extra y filtrar si está bloqueada
        const extra = a.personaExtra || a.personaAutorizadaExtra || '';
        if (extra && extra.trim() !== "") {
            // Solo agregar a autorizados si NO es la misma persona de la alerta
            if (!txtAlerta || !txtAlerta.includes(extra)) {
                extrasPermitidos.push(extra);
            }
        }
    });

    // Formatear textos
    const alertaTextoHtml = listaAlertas.length > 0 
        ? `<p style="margin:3px 0; color:#dc2626; font-weight:bold;">🚨 <strong>Alerta de Custodia:</strong> ${[...new Set(listaAlertas)].join(', ')}</p>` 
        : `<p style="margin:3px 0; color:#dc2626; font-weight:bold;">🚨 <strong>Alerta de Custodia:</strong> </p>`;

    const personasAutorizadasTexto = extrasPermitidos.length > 0 ? [...new Set(extrasPermitidos)].join(', ') : 'Ninguna registrada';

    contenedorDetalles.innerHTML = `
        <div style="margin-bottom:12px;">
            ${htmlAlumnos}
        </div>

        <div style="background:#fff9e6; padding:12px; border-radius:8px; border-left:4px solid #ffcc00; font-size:13px;">
            <p style="margin:3px 0;">👨‍👩‍👦 <strong>Tutor Responsable:</strong> ${tutorNombre}</p>
            <p style="margin:3px 0;">🔑 <strong>Código / Tarjeta ID:</strong> <code>${tutorId}</code></p>
            ${alertaTextoHtml}
            <p style="margin:3px 0;">🛡️ <strong>Personas Autorizadas Extras:</strong> ${personasAutorizadasTexto}</p>
        </div>
    `;

    // Renderizar QR en azul
    if (qrDiv) {
        qrDiv.innerHTML = "";
        if (typeof QRCode !== 'undefined' && tutorId !== 'N/A') {
            new QRCode(qrDiv, { 
                text: tutorId, 
                width: 160, 
                height: 160,
                colorDark : "#1D71B8",
                colorLight : "#ffffff"
            });
        }
    }

    if (btnDescargar) {
        btnDescargar.onclick = () => {
            descargarTarjetaPNG();
        };
    }

    modal.style.display = "flex";

}

// 3. Cerrar la ventana modal
function cerrarModalDetalleAlumno() {
    const modal = document.getElementById("modal-detalle-alumno");
    if (modal) modal.style.display = "none";
}

// ==========================================================
// 1. EXPEDIENTE FAMILIAR MULTI-ALUMNO (FILTRO FLEXIBLE CUSTODIA)
// ==========================================================
window.abrirExpedienteFamiliar = function(criterio) {
    if (!criterio) return alert("⚠️ Por favor ingresa un nombre o código.");
    const term = criterio.toString().trim().toUpperCase();

    fetch('/api/alumnos-completo')
        .then(res => res.json())
        .then(data => {
            const todosLosAlumnos = data.alumnos || [];
            const todosLosTutores = data.tutores || [];

            // 1. Coincidencia principal
            const alumnoBase = todosLosAlumnos.find(a => {
                const nom = (a.nombre || a.nombreAlumno || '').toUpperCase();
                const id = (a.id || a.codigo || '').toUpperCase();
                const tut = (a.tutorId || a.idFamilia || '').toUpperCase();
                return nom.includes(term) || id.includes(term) || tut.includes(term);
            });

            if (!alumnoBase) return alert("⚠️ No se encontraron registros para: " + criterio);

            // 2. Agrupar hermanos por tutorId / idFamilia
            const tutorIdBase = (alumnoBase.tutorId || alumnoBase.idFamilia || '').toString().trim().toUpperCase();
            const listaAlumnos = todosLosAlumnos.filter(a => (a.tutorId || a.idFamilia || '').toString().trim().toUpperCase() === tutorIdBase);
            const tutorObj = todosLosTutores.find(t => (t.id || t.tutorId || '').toString().trim().toUpperCase() === tutorIdBase) || {};
            const nombreTutor = alumnoBase.tutorPrincipal || alumnoBase.tutorNombre || alumnoBase.tutor || tutorObj.nombre || tutorObj.madre || "Tutor No Registrado";
            
            let personaExtra = alumnoBase.personaExtra || alumnoBase.personaAutorizadaExtra || tutorObj.personaExtra || "Ninguna";
            const alerta = alumnoBase.alerta || tutorObj.alerta || "";

            // ⚡ FILTRO ULTRA FLEXIBLE
            if (alerta && (alerta.toUpperCase().includes("CUSTODIA") || alerta.toUpperCase().includes("BLOQUEO")) && personaExtra !== "Ninguna") {
                const alertaUpper = alerta.toUpperCase();
                let listaAutorizados = personaExtra.split(',').map(p => p.trim());
                
                let listaFiltrada = listaAutorizados.filter(persona => {
                    const pUpper = persona.toUpperCase();
                    // Dividimos en palabras (ej. CARLOS, DANIEL, GUTIERREZ)
                    const palabras = pUpper.split(' ').filter(word => word.length > 2);
                    
                    // Si la alerta contiene las palabras clave del nombre, la descartamos
                    const coincide = palabras.some(palabra => alertaUpper.includes(palabra));
                    return !coincide;
                });

                personaExtra = listaFiltrada.length > 0 ? listaFiltrada.join(', ') : "Sin personas autorizadas extras (Restricción por Custodia)";
            }

            // 3. Generar HTML en el modal
            const contenedor = document.getElementById("detalle-alumno-contenido");
            if (contenedor) {
                let htmlAlumnos = "";
                if (listaAlumnos.length <= 1) {
                    const alu = listaAlumnos[0] || alumnoBase;
                    htmlAlumnos = `
                        <div style="background:#f8f9fa; padding:10px; border-radius:6px; border-left:4px solid #1b2680; margin-bottom:8px;">
                            🎓 <strong>Alumno:</strong> ${alu.nombre || alu.nombreAlumno}<br>
                            🏫 <strong>Grado / Grupo:</strong> ${alu.nivel || ''} ${alu.grado || ''} "${alu.grupo || ''}"
                        </div>`;
                } else {
                    htmlAlumnos = `
                        <div style="background:#f8f9fa; padding:10px; border-radius:6px; border-left:4px solid #1b2680; margin-bottom:8px;">
                            <strong style="color:#1b2680;">👨‍👩‍👧‍👦 Alumnos Registrados en esta Familia (${listaAlumnos.length}):</strong>
                            <ul style="margin: 6px 0 0 15px; padding: 0;">`;
                    listaAlumnos.forEach(h => {
                        htmlAlumnos += `<li style="margin-bottom: 4px;">🎓 <b>${h.nombre || h.nombreAlumno}</b> — <span style="color:#d97706; font-weight:bold;">${h.nivel || ''} ${h.grado || ''} "${h.grupo || ''}"</span></li>`;
                    });
                    htmlAlumnos += `</ul></div>`;
                }

                contenedor.innerHTML = `
                    <div style="margin-bottom:12px;">${htmlAlumnos}</div>
                    <div style="background:#fff9e6; padding:12px; border-radius:8px; border-left:4px solid #ffcc00; font-size:13px;">
                        <p style="margin:3px 0;">👨‍👩‍👦 <strong>Tutor Responsable:</strong> ${nombreTutor}</p>
                        <p style="margin:3px 0;">🔑 <strong>Código / Tarjeta ID:</strong> <code>${tutorIdBase}</code></p>
                        ${alerta ? `<p style="margin:3px 0; color:#dc2626; font-weight:bold;">🚨 <strong>Alerta de Custodia:</strong> ${alerta}</p>` : ''}
                        <p style="margin:3px 0;">🛡️ <strong>Personas Autorizadas Extras:</strong> ${personaExtra}</p>
                    </div>`;
            }

            // 4. Mostrar modal y renderizar QR
            const modal = document.getElementById("modal-detalle-alumno");
            if (modal) {
                modal.dataset.familiaJson = JSON.stringify({
                    tutorId: tutorIdBase,
                    tutorNombre: nombreTutor,
                    alumnos: listaAlumnos
                });

                const qrDiv = document.getElementById("qr-modal-expediente");
                if (qrDiv) {
                    qrDiv.innerHTML = "";
                    qrDiv.title = tutorIdBase;
                    if (window.QRCode) {
                        new QRCode(qrDiv, { text: tutorIdBase, width: 160, height: 160, colorDark: "#1D71B8", colorLight: "#ffffff" });
                    }
                }
                modal.style.display = "flex";
            }
        })
        .catch(err => console.error("Error al desplegar expediente:", err));
};

// ==========================================================
// 2. FUNCIÓN DE BÚSQUEDA DEL ENTER
// ==========================================================
function buscarRegistrado(e) {
    const evento = e || window.event;

    // Si viene de una tecla y NO es Enter, ignoramos
    if (evento && evento.key && evento.key !== 'Enter') {
        return;
    }

    // Si es un evento 'input', ignoramos
    if (evento && evento.type === 'input') {
        return;
    }

    // 🛑 FRENO DE MANO: Detiene cualquier otro script viejo o envío de formulario
    if (evento) {
        if (typeof evento.preventDefault === 'function') evento.preventDefault();
        if (typeof evento.stopPropagation === 'function') evento.stopPropagation();
        if (typeof evento.stopImmediatePropagation === 'function') evento.stopImmediatePropagation();
    }

    const input = document.getElementById("panel-search-input") || document.getElementById("manual-code");
    if (!input) return;

    const valor = input.value.trim();
    if (!valor) {
        alert("⚠️ Por favor ingresa un nombre o código.");
        return;
    }

    // Abre el expediente familiar unificado
    if (typeof window.abrirExpedienteFamiliar === "function") {
        window.abrirExpedienteFamiliar(valor);
    }
}
// ==========================================================
// 3. SELECT DE TUTORES
// ==========================================================
function actualizarSelectTutores() {
    const sel = document.getElementById("reg-tutor-existente");
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Crear Nuevo Código Familiar --</option>';
    const tutores = datosCache.tutores || [];
    
    tutores.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id; 
        opt.innerText = `${t.nombre} (${t.id})`;
        sel.appendChild(opt);
    });
}

// MODAL QR CON DATOS INTEGRADOS
function abrirModalQR(tutorId, alumnoNombre = "", grado = "") {
    const modal = document.getElementById("modal-qr");
    const qrDiv = document.getElementById("qrcode-container");
    const info = document.getElementById("qr-info-alumnos");
    if (!modal || !qrDiv) return;

    qrDiv.innerHTML = ""; 
    
    modal.dataset.tutorId = tutorId;
    modal.dataset.alumnoNombre = alumnoNombre;
    modal.dataset.grado = grado;

    if (info) {
        info.innerHTML = `
            <p style="margin:2px 0;"><strong>Alumno:</strong> ${alumnoNombre || 'Registro General'}</p>
            <p style="margin:2px 0;"><strong>Grado:</strong> ${grado || '-'}</p>
            <p style="margin:2px 0;"><strong>ID Tarjeta:</strong> ${tutorId}</p>
        `;
    }

    if (typeof QRCode !== 'undefined') {
        new QRCode(qrDiv, { text: tutorId, width: 180, height: 180 });
    }
    modal.style.display = "flex";
}

function descargarTarjetaPNG() {
    const modalExpediente = document.getElementById("modal-detalle-alumno");
    let familiaData = null;

    if (modalExpediente && modalExpediente.dataset.familiaJson) {
        try {
            familiaData = JSON.parse(modalExpediente.dataset.familiaJson);
        } catch(e) {
            console.error("Error al parsear datos de familia:", e);
        }
    }

    if (!familiaData || !familiaData.tutorId) {
        alert("No se encontraron los datos del alumno para generar el tarjetón.");
        return;
    }

    const templateImg = new Image();
    templateImg.src = "/plantilla-tarjeton.jpeg"; 

    templateImg.onload = function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Dimensiones base de la plantilla
        canvas.width = templateImg.width || 1320;
        canvas.height = templateImg.height || 905;

        // 1. Dibujar la plantilla de fondo limpia
        ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

        // ==========================================================
        // 🛠️ PARTE 1: TILDE / ACENTO EXACTO SOBRE LA "o" DE Tarjetón
        // ==========================================================
        ctx.save();
        ctx.fillStyle = "#1c1c1c"; // Color idéntico a las letras
        ctx.translate(313, 208);   // Coordenadas corregidas a la letra 'o'
        ctx.rotate(-15 * Math.PI / 180); // Inclinación suave
        
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
            ctx.roundRect(0, 0, 15, 6, 2);
        } else {
            ctx.rect(0, 0, 15, 6);
        }
        ctx.fill();
        ctx.restore();
        // ==========================================================

        // 2. Generar QR en Azul exacto
        const tempQrDiv = document.createElement("div");
        const qrSize = 310;
        
        new QRCode(tempQrDiv, {
            text: familiaData.tutorId,
            width: qrSize,
            height: qrSize,
            colorDark: "#1D71B8",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        setTimeout(() => {
            const qrCanvas = tempQrDiv.querySelector("canvas");
            const qrImg = tempQrDiv.querySelector("img");

            const qrX = 880;
            const qrY = 310;

            if (qrCanvas) {
                ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
            } else if (qrImg) {
                ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
            }

            // 3. Dibujar Datos de Alumnos
            ctx.fillStyle = "#111111";
            ctx.textAlign = "center";

            const alumnos = familiaData.alumnos || [];
            const centerX = 420;
            const totalAlumnos = alumnos.length;

            if (totalAlumnos === 1) {
                const alu = alumnos[0];
                const nombreAlumno = alu.nombre || 'Alumno Registrado';
                
                // 🛠️ PARTE 2: NIVEL + GRADO (SIN GRUPO)
                const nivel = (alu.nivel || alu.NIVEL || '').toString().trim().toUpperCase();
                const grado = (alu.grado || alu.GRADO || '').toString().trim().toUpperCase();
                const textoNivelGrado = grado ? `${nivel} ${grado}` : nivel;

                ctx.fillStyle = "#1b2680";
                ctx.font = "bold 26px Arial, sans-serif";
                ctx.fillText(nombreAlumno, centerX, 450);

                ctx.fillStyle = "#FF6600";
                ctx.font = "italic bold 22px 'Georgia', serif";
                ctx.fillText(textoNivelGrado, centerX, 485);

            } else {
                let startY = 390;
                let fontSizeNombre = 22;
                let fontSizeNivel = 17;
                let espaciado = 75;

                if (totalAlumnos >= 4) {
                    fontSizeNombre = 18;
                    fontSizeNivel = 14;
                    espaciado = 60;
                    startY = 360;
                } else if (totalAlumnos === 3) {
                    fontSizeNombre = 20;
                    fontSizeNivel = 15;
                    espaciado = 68;
                    startY = 375;
                }

                alumnos.forEach((alu, index) => {
                    const currentY = startY + (index * espaciado);
                    
                    // 🛠️ PARTE 2: NIVEL + GRADO (SIN GRUPO)
                    const nivel = (alu.nivel || alu.NIVEL || '').toString().trim().toUpperCase();
                    const grado = (alu.grado || alu.GRADO || '').toString().trim().toUpperCase();
                    const textoNivelGrado = grado ? `${nivel} ${grado}` : nivel;

                    // Nombre
                    ctx.fillStyle = "#1b2680";
                    ctx.font = `bold ${fontSizeNombre}px Arial, sans-serif`;
                    ctx.fillText(alu.nombre, centerX, currentY);

                    // Nivel + Grado
                    ctx.fillStyle = "#FF6600";
                    ctx.font = `italic bold ${fontSizeNivel}px 'Georgia', serif`;
                    ctx.fillText(textoNivelGrado, centerX, currentY + Math.round(fontSizeNombre * 1.15));
                });
            }

            // 4. Descargar la imagen
            const primerNombre = alumnos[0] ? alumnos[0].nombre : 'Tarjeton';
            const link = document.createElement("a");
            link.download = `Tarjeton_${primerNombre.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();

        }, 200);
    };

    templateImg.onerror = function () {
        alert("Error: No se pudo cargar 'plantilla-tarjeton.jpeg'. Asegúrate de que la imagen esté guardada en la carpeta 'public'.");
    };
}

// 2. CONECTOR DEL BOTÓN (AGRÉGALO JUSTO AQUÍ DEBAJO)
window.descargarTarjetaPNG = descargarTarjetaPNG;
window.descargarTarjeton = descargarTarjetaPNG;
window.descargarTarjetonPDF = descargarTarjetaPNG;
window.generarTarjeton = descargarTarjetaPNG;

document.addEventListener("click", function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    const texto = (btn.innerText || btn.textContent || "").toLowerCase();
    
    if (texto.includes("tarjetón") || texto.includes("tarjeton")) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log("🟢 Clic en botón Tarjetón detectado");
        descargarTarjetaPNG();
    }
}, true);

function migrarGrupo() {
    const gO = document.getElementById("mig-grado-origen").value;
    const grO = document.getElementById("mig-grupo-origen").value;
    const gD = document.getElementById("mig-grado-destino").value;
    const grD = document.getElementById("mig-grupo-destino").value;

    fetch('/api/migrar-grupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradoOrigen: gO, grupoOrigen: grO, gradoDestino: gD, grupoDestino: grD })
    })
    .then(r => r.json())
    .then(d => { 
        alert(`Alumnos promovidos con éxito (${d.afectaciones} registros actualizados).`); 
        sincronizarServidor(); 
    });
}

function renderizarReporte() {
    const filtro = document.getElementById("filtro-fecha");
    if (!filtro) return;
    
    const f = filtro.value;
    const cont = document.getElementById("tabla-reporte-container");
    if (!cont) return;

    const filtrados = (datosCache.historial || []).filter(h => h.fecha === f);
    
    if (filtrados.length === 0) {
        cont.innerHTML = `<p style="text-align:center; color:#777; padding:15px;">No hay registros de entregas para la fecha seleccionada (${f}).</p>`;
        return;
    }

    let html = `<table style="width:100%; margin-top:10px; font-size:12px; border-collapse:collapse; background:white;">
                  <thead>
                    <tr style="background:#1b2680; color:white;">
                      <th style="padding:8px; text-align:left;">Hora</th>
                      <th style="padding:8px; text-align:left;">Alumno</th>
                      <th style="padding:8px; text-align:left;">Grado / Grupo</th>
                      <th style="padding:8px; text-align:left;">Entregado A</th>
                      <th style="padding:8px; text-align:left;">Vía</th>
                    </tr>
                  </thead>
                  <tbody>`;
    filtrados.forEach(x => {
        html += `<tr style="border-bottom:1px solid #ddd;">
                    <td style="padding:8px;">${x.hora}</td>
                    <td style="padding:8px;"><strong>${x.alumnoNombre}</strong></td>
                    <td style="padding:8px;">${x.nivel || ''} ${x.grado || ''} "${x.grupo || ''}"</td>
                    <td style="padding:8px;">${x.tutorNombre || 'N/A'}</td>
                    <td style="padding:8px;">${x.tipo || 'Escáner'}</td>
                 </tr>`;
    });
    html += `</tbody></table>`;
    cont.innerHTML = html;
}

function exportarExcel() {
    const f = document.getElementById("filtro-fecha").value;
    const filtrados = (datosCache.historial || []).filter(h => h.fecha === f);
    
    if (filtrados.length === 0) {
        alert("No hay registros para exportar en esta fecha.");
        return;
    }

    const datosFormateados = filtrados.map(h => ({
        "Fecha": h.fecha,
        "Hora": h.hora,
        "Nombre del Alumno": h.alumnoNombre,
        "Nivel": h.nivel || "N/A",
        "Grado": h.grado || "N/A",
        "Grupo": h.grupo || "N/A",
        "Tutor / Persona que recibe": h.tutorNombre,
        "Medio de Registro": h.tipo
    }));

    const ws = XLSX.utils.json_to_sheet(datosFormateados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Salidas");
    XLSX.writeFile(wb, `Reporte_Salidas_Ekbe_${f}.xlsx`);
}

function limpiarHistorialManual(dias) {
    if (confirm(`¿Estás seguro de que deseas eliminar todas las salidas registradas con más de ${dias} días de antigüedad?`)) {
        fetch('/api/limpiar-historial-dias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dias })
        })
        .then(r => r.json())
        .then(res => {
            alert(`Se eliminaron ${res.borrados} registros de historial antiguos.`);
            sincronizarServidor();
        });
    }
}

function vaciarHistorialCompleto() {
    const confirmacion = prompt('⚠️ ¡ATENCIÓN! Esta acción borrará TODO el historial de registros de salida.\n\nEscribe "BORRAR" para confirmar:');
    
    if (confirmacion && confirmacion.trim().toUpperCase() === "BORRAR") {
        fetch('/api/vaciar-historial-completo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(r => r.json())
        .then(() => {
            alert("Historial de salidas vaciado correctamente.");
            sincronizarServidor();
        });
    } else if (confirmacion !== null) {
        alert("Palabra de confirmación incorrecta. No se realizó ningún cambio.");
    }
}

function descargarExcelBaseDatos() {
    fetch('/api/alumnos-completo')
        .then(r => r.json())
        .then(data => {
            const alumnos = data.alumnos || [];
            if (alumnos.length === 0) {
                alert("No hay alumnos ni tutores registrados para exportar.");
                return;
            }

            const datosExcel = alumnos.map(a => ({
                "Nombre del Alumno": a.nombre,
                "Nivel": a.nivel || "",
                "Grado": a.grado || "",
                "Grupo": a.grupo || "",
                "ID Alumno": a.id,
                "Nombre del Tutor": a.tutorPrincipal || a.tutorNombre || a.tutor || "",
                "ID / Código Tutor": a.tutorId || ""
            }));

            const ws = XLSX.utils.json_to_sheet(datosExcel);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "BaseDeDatos");
            XLSX.writeFile(wb, `Base_de_Datos_Ekbe_${new Date().toISOString().split('T')[0]}.xlsx`);
        })
        .catch(e => {
            console.error(e);
            alert("Error al intentar obtener los datos para Excel.");
        });
}

function vaciarBaseDatosAdmin() {
    const password = prompt("⚠️ ATENCIÓN: Esta acción eliminará a TODOS los Alumnos y Tutores del sistema.\n\nIngresa la clave de administrador para confirmar:");

    if (!password) return;

    fetch('/api/admin/vaciar-base-datos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    })
    .then(async r => {
        const res = await r.json();
        if (r.ok) {
            alert("✅ " + (res.message || "La base de datos se ha limpiado correctamente."));
            sincronizarServidor();
            if (document.getElementById("modal-bd-completa")) {
                cerrarModalBD();
            }
        } else {
            alert("❌ Error: " + (res.error || "Clave incorrecta o no autorizada."));
        }
    })
    .catch(e => {
        console.error(e);
        alert("Ocurrió un error al intentar vaciar la base de datos.");
    });
}

// Variable global temporal para el modal de voceo
let datosFamiliaEscaneada = null;

function procesarEscaneo(tutorId, limpiarCampoManual = true) {
    const hoy = new Date().toISOString().split('T')[0];
    
    fetch('/api/buscar-familia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorId, fecha: hoy })
    })
    .then(r => r.json().then(data => ({ status: r.status, body: data })))
    .then(res => {
        if (res.status !== 200) {
            alert("⚠️ " + (res.body.error || "Código no encontrado"));
            return;
        }

        // 🚨 VERIFICACIÓN Y LIMPIEZA DE ALERTA DE CUSTODIA
        // Si el backend envía null, undefined o string vacío, forzamos null explícito
        if (res.body) {
            if (!res.body.alerta || res.body.alerta.trim() === "") {
                res.body.alerta = null;
            }
            if (Array.isArray(res.body.alumnos)) {
                res.body.alumnos.forEach(alu => {
                    if (!alu.alerta || alu.alerta.trim() === "") {
                        alu.alerta = null;
                    }
                });
            }
        }

        datosFamiliaEscaneada = res.body;
        abrirModalVoceo(res.body);

        if (limpiarCampoManual) {
            const manualInput = document.getElementById("manual-code");
            if (manualInput) manualInput.value = "";
        }
    })
    .catch(e => {
        console.error(e);
        alert("Ocurrió un error al consultar el código.");
    });
}

// 2. Función principal del Modal de Voceo (VERSIÓN DIAGNÓSTICO)
async function abrirModalVoceo(data) {
    const modal = document.getElementById("modal-voceo-calle");
    const alertaBox = document.getElementById("voceo-alerta-box");
    const listaAutorizados = document.getElementById("voceo-lista-autorizados");
    const listaAlumnos = document.getElementById("voceo-lista-alumnos");

    if (!modal) return;

    // Normalizar lista de alumnos
    let alumnos = data.alumnos || [];
    if (alumnos.length === 0 && (data.nombre || data.nombreAlumno)) {
        alumnos = [data];
    }

    // 🔍 VENTANA TEMPORAL DE DIAGNÓSTICO EN EL CELULAR:
    // Nos mostrará en pantalla la estructura exacta de lo que llegó de la API
    alert("📦 DATOS RECIBIDOS EN CELULAR:\n" + JSON.stringify({
        dataAlerta: data.alerta,
        primerAlumnoAlerta: alumnos[0] ? alumnos[0].alerta : "Sin alumno",
        totalAlumnos: alumnos.length
    }, null, 2));

    // 1. EXTRAER ALERTA / RESTRICCIÓN DIRECTAMENTE DEL JSON
    let personaBloqueada = "";

    if (data.alerta && typeof data.alerta === 'string' && data.alerta.trim() !== "") {
        personaBloqueada = data.alerta.trim();
    }

    if (!personaBloqueada && Array.isArray(alumnos)) {
        for (let alu of alumnos) {
            if (alu && alu.alerta && typeof alu.alerta === 'string' && alu.alerta.trim() !== "") {
                personaBloqueada = alu.alerta.trim();
                break;
            }
        }
    }

    const primerAlumno = alumnos[0] || {};
    let extraTexto = primerAlumno.personaExtra || primerAlumno.autorizados || data.personaExtra || data.autorizados || "";
    personaBloqueada = String(personaBloqueada || "").trim();

    // 2. MOSTRAR U OCULTAR LA CAJA ROJA DE ALERTA
    if (alertaBox) {
        if (personaBloqueada !== "") {
            alertaBox.style.cssText = "display: block !important; background: #f8d7da; color: #721c24; border: 2px solid #f5c6cb; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 14px;";
            alertaBox.innerHTML = `⚠️ <b style="color:#721c24;">ALERTA DE CUSTODIA / RESTRICCIÓN:</b><br><span style="color:#c82333; font-weight:bold; font-size:15px;">🚫 NO ENTREGAR A: ${personaBloqueada}</span>`;
        } else {
            alertaBox.innerHTML = "";
            alertaBox.style.cssText = "display: none !important;";
        }
    }

    // 3. MOSTRAR AUTORIZADOS A RECOGER
    let autorizadosTexto = `• <strong>Tutor Principal:</strong> ${data.tutorNombre || data.tutor || primerAlumno.tutorNombre || primerAlumno.tutor || 'Familia / Tutor Registrado'}<br>`;
    
    if (extraTexto && extraTexto.trim() !== "") {
        autorizadosTexto += `• <strong>Otros Autorizados:</strong> ${extraTexto}`;
    } else {
        autorizadosTexto += `• <strong>Otros Autorizados:</strong> Ninguno adicional`;
    }

    if (listaAutorizados) listaAutorizados.innerHTML = autorizadosTexto;

    // 4. SELECCIÓN DE PUERTA Y LISTA DE ALUMNOS
    let contenedorPuerta = document.getElementById("contenedor-select-puerta");
    if (!contenedorPuerta) {
        contenedorPuerta = document.createElement("div");
        contenedorPuerta.id = "contenedor-select-puerta";
        contenedorPuerta.style.cssText = "margin: 10px 0 15px 0; text-align: left;";
        contenedorPuerta.innerHTML = `
            <label for="select-puerta-entrega" style="font-weight: bold; display: block; margin-bottom: 5px; color:#1b2680;">
                📍 ¿En qué puerta se entregará?:
            </label>
            <select id="select-puerta-entrega" style="width: 100%; padding: 8px; font-weight: bold; border-radius: 6px; border: 1px solid #1b2680; color: #1b2680;">
                <option value="Puerta Secundaria">Puerta Secundaria</option>
                <option value="Puerta Primaria">Puerta Primaria</option>
                <option value="Puerta Preescolar">Puerta Preescolar</option>
            </select>
        `;
        if (listaAlumnos && listaAlumnos.parentNode) {
            listaAlumnos.parentNode.insertBefore(contenedorPuerta, listaAlumnos);
        }
    }

    if (listaAlumnos) {
        listaAlumnos.innerHTML = "";
        if (alumnos.length === 0) {
            listaAlumnos.innerHTML = "<p style='color:#777;'>No hay alumnos asociados a este código.</p>";
        } else {
            alumnos.forEach(alu => {
                const div = document.createElement("label");
                div.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; background: #fff; margin-top: 5px;";

                const nom = alu.nombre || alu.nombreAlumno || "Alumno";

                if (alu.entregadoHoy) {
                    div.style.background = "#e9ecef";
                    div.innerHTML = `
                        <div>
                            <strong>${nom}</strong> (${alu.nivel || ''} ${alu.grado || ''} "${alu.grupo || ''}")
                            <div style="font-size:11px; color:#28a745; font-weight:bold;">✅ Entregado a las ${alu.horaEntrega || ''}</div>
                        </div>
                        <span style="font-size:12px; color:#6c757d;">Ya salió</span>
                    `;
                } else {
                    div.innerHTML = `
                        <div>
                            <strong>${nom}</strong>
                            <div style="font-size:12px; color:#666;">${alu.nivel || ''} ${alu.grado || ''} "${alu.grupo || ''}"</div>
                        </div>
                        <input type="checkbox" name="alumno-voceo-check" value="${nom}" style="width: 20px; height: 20px;" checked>
                    `;
                }
                listaAlumnos.appendChild(div);
            });
        }
    }

    modal.style.display = "flex";
}
// 2. Función principal del Modal de Voceo (VERSIÓN FINAL CON TUTOR CORREGIDO)
async function abrirModalVoceo(data) {
    const modal = document.getElementById("modal-voceo-calle");
    const alertaBox = document.getElementById("voceo-alerta-box");
    const listaAutorizados = document.getElementById("voceo-lista-autorizados");
    const listaAlumnos = document.getElementById("voceo-lista-alumnos");

    if (!modal) return;

    // Normalizar lista de alumnos
    let alumnos = data.alumnos || [];
    if (alumnos.length === 0 && (data.nombre || data.nombreAlumno)) {
        alumnos = [data];
    }

    const primerAlumno = alumnos[0] || {};

    // 1. EXTRAER ALERTA / RESTRICCIÓN DIRECTAMENTE DEL JSON
    let personaBloqueada = "";

    if (data.alerta && typeof data.alerta === 'string' && data.alerta.trim() !== "") {
        personaBloqueada = data.alerta.trim();
    }

    if (!personaBloqueada && Array.isArray(alumnos)) {
        for (let alu of alumnos) {
            if (alu && alu.alerta && typeof alu.alerta === 'string' && alu.alerta.trim() !== "") {
                personaBloqueada = alu.alerta.trim();
                break;
            }
        }
    }

    personaBloqueada = String(personaBloqueada || "").trim();

    // 2. MOSTRAR U OCULTAR LA CAJA ROJA DE ALERTA
    if (alertaBox) {
        if (personaBloqueada !== "") {
            alertaBox.style.cssText = "display: block !important; background: #f8d7da; color: #721c24; border: 2px solid #f5c6cb; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-size: 14px;";
            alertaBox.innerHTML = `⚠️ <b style="color:#721c24;">ALERTA DE CUSTODIA / RESTRICCIÓN:</b><br><span style="color:#c82333; font-weight:bold; font-size:15px;">🚫 NO ENTREGAR A: ${personaBloqueada}</span>`;
        } else {
            alertaBox.innerHTML = "";
            alertaBox.style.cssText = "display: none !important;";
        }
    }

    // 3. OBTENER Y MOSTRAR TUTOR PRINCIPAL Y AUTORIZADOS (CORREGIDO)
    let nombreTutorReal = data.tutorNombre || 
                          data.tutor || 
                          primerAlumno.tutorNombre || 
                          primerAlumno.tutor || 
                          primerAlumno.tutorPrincipal || 
                          primerAlumno.tutorResponsable;

    // Si viene el genérico "Familia / Tutor Registrado", busca fallback en el alumno
    if (!nombreTutorReal || nombreTutorReal === 'Familia / Tutor Registrado') {
        nombreTutorReal = primerAlumno.tutor || primerAlumno.tutorNombre || primerAlumno.tutorPrincipal || primerAlumno.tutorResponsable || 'Familia / Tutor Registrado';
    }

    let extraTexto = primerAlumno.personaExtra || primerAlumno.autorizados || data.personaExtra || data.autorizados || "";

    let autorizadosTexto = `• <strong>Tutor Principal:</strong> ${nombreTutorReal}<br>`;
    
    if (extraTexto && extraTexto.trim() !== "") {
        autorizadosTexto += `• <strong>Otros Autorizados:</strong> ${extraTexto}`;
    } else {
        autorizadosTexto += `• <strong>Otros Autorizados:</strong> Ninguno adicional`;
    }

    if (listaAutorizados) listaAutorizados.innerHTML = autorizadosTexto;

    // 4. SELECCIÓN DE PUERTA Y LISTA DE ALUMNOS
    let contenedorPuerta = document.getElementById("contenedor-select-puerta");
    if (!contenedorPuerta) {
        contenedorPuerta = document.createElement("div");
        contenedorPuerta.id = "contenedor-select-puerta";
        contenedorPuerta.style.cssText = "margin: 10px 0 15px 0; text-align: left;";
        contenedorPuerta.innerHTML = `
            <label for="select-puerta-entrega" style="font-weight: bold; display: block; margin-bottom: 5px; color:#1b2680;">
                📍 ¿En qué puerta se entregará?:
            </label>
            <select id="select-puerta-entrega" style="width: 100%; padding: 8px; font-weight: bold; border-radius: 6px; border: 1px solid #1b2680; color: #1b2680;">
                <option value="Puerta Secundaria">Puerta Secundaria</option>
                <option value="Puerta Primaria">Puerta Primaria</option>
                <option value="Puerta Preescolar">Puerta Preescolar</option>
            </select>
        `;
        if (listaAlumnos && listaAlumnos.parentNode) {
            listaAlumnos.parentNode.insertBefore(contenedorPuerta, listaAlumnos);
        }
    }

    if (listaAlumnos) {
        listaAlumnos.innerHTML = "";
        if (alumnos.length === 0) {
            listaAlumnos.innerHTML = "<p style='color:#777;'>No hay alumnos asociados a este código.</p>";
        } else {
            alumnos.forEach(alu => {
                const div = document.createElement("label");
                div.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; background: #fff; margin-top: 5px;";

                const nom = alu.nombre || alu.nombreAlumno || "Alumno";

                if (alu.entregadoHoy) {
                    div.style.background = "#e9ecef";
                    div.innerHTML = `
                        <div>
                            <strong>${nom}</strong> (${alu.nivel || ''} ${alu.grado || ''} "${alu.grupo || ''}")
                            <div style="font-size:11px; color:#28a745; font-weight:bold;">✅ Entregado a las ${alu.horaEntrega || ''}</div>
                        </div>
                        <span style="font-size:12px; color:#6c757d;">Ya salió</span>
                    `;
                } else {
                    div.innerHTML = `
                        <div>
                            <strong>${nom}</strong>
                            <div style="font-size:12px; color:#666;">${alu.nivel || ''} ${alu.grado || ''} "${alu.grupo || ''}"</div>
                        </div>
                        <input type="checkbox" name="alumno-voceo-check" value="${nom}" style="width: 20px; height: 20px;" checked>
                    `;
                }
                listaAlumnos.appendChild(div);
            });
        }
    }

    modal.style.display = "flex";
}

function cerrarModalVoceo() {
    const modal = document.getElementById("modal-voceo-calle");
    if (modal) modal.style.display = "none";
}

function confirmarEnviarVoceo() {
    const checks = document.querySelectorAll('input[name="alumno-voceo-check"]:checked');
    const seleccionados = Array.from(checks).map(c => c.value);

    if (seleccionados.length === 0) {
        alert("Por favor selecciona al menos un alumno para vocear.");
        return;
    }

    if (!datosFamiliaEscaneada) return;

    const selectPuerta = document.getElementById("select-puerta-entrega");
    const puertaSeleccionada = selectPuerta ? selectPuerta.value : "Puerta Secundaria";

    localStorage.setItem('ultimaPuertaSeleccionada', puertaSeleccionada);

    fetch('/api/vocear-familia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            tutorId: datosFamiliaEscaneada.tutorId,
            alumnosSeleccionados: seleccionados,
            puerta: puertaSeleccionada
        })
    })
    .then(r => r.json())
    .then(res => {
        alert(`📣 Se enviaron a voceo ${seleccionados.length} alumno(s) para la ${puertaSeleccionada}.`);
        cerrarModalVoceo();
        sincronizarServidor();
    })
    .catch(e => {
        console.error(e);
        alert("Error al enviar la solicitud de voceo.");
    });
    // ==========================================================
// IMPORTACIÓN AUTOMÁTICA DESDE EXCEL (CORREGIDA Y SINCRONIZADA)
// ==========================================================
function importarDesdeExcel() {
    const fileInput = document.getElementById('input-excel-import');
    const file = fileInput ? fileInput.files[0] : null;

    if (!file) {
        alert("⚠️ Selecciona el archivo de Excel primero.");
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const filas = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

            if (filas.length === 0) {
                alert("❌ El archivo Excel parece estar vacío.");
                return;
            }

            let bdActual = JSON.parse(localStorage.getItem('bd_alumnos')) || [];
            let contadorNuevos = 0;

            const mapaTutores = {};
            bdActual.forEach(reg => {
                const tutorNom = reg.tutorPrincipal || reg.tutor || reg.tutorNombre || "";
                const tutorId = reg.idTutor || reg.tutorId || "";
                if (tutorNom && tutorId) {
                    mapaTutores[tutorNom.trim().toUpperCase()] = tutorId;
                }
            });

            filas.forEach((fila) => {
                // Lectura de los nombres de columna de tu Excel
                const nombreAlumno = (fila['NOMBRE COMPLETO DEL ALUMNO'] || fila['NOMBRE'] || fila['nombre'] || '').toString().trim().toUpperCase();
                const nivelRaw = (fila['NIVEL EDUCATIVO'] || fila['NIVEL ACADEMICO'] || fila['nivel'] || '').toString().trim().toUpperCase();
                const gradoRaw = (fila['GRADO'] || fila['grado'] || '').toString().trim();
                const grupoRaw = (fila['GRUPO'] || fila['grupo'] || 'A').toString().trim().toUpperCase();
                const tutorNombre = (fila['NOMBRE DEL TUTOR PRINCIPAL'] || fila['tutor'] || '').toString().trim().toUpperCase();
                const adicionalesRaw = (fila['PERSONAS ADICIONALES'] || fila['personaExtra'] || '').toString().trim().toUpperCase();
                const alertaRaw = (fila['ALERTA DE CUSTODIA'] || fila['ALERTA'] || fila['alerta'] || '').toString().trim().toUpperCase();

                if (nombreAlumno && tutorNombre) {
                    let nivel = 'PRIMARIA';
                    if (nivelRaw.includes('PRE')) nivel = 'PREESCOLAR';
                    else if (nivelRaw.includes('SEC')) nivel = 'SECUNDARIA';
                    else if (nivelRaw.includes('MAT')) nivel = 'MATERNAL';

                    let grado = gradoRaw;
                    const numGrado = gradoRaw.replace(/[^0-9]/g, '');
                    if (numGrado) grado = `${numGrado}°`;

                    const tutorKey = tutorNombre.toUpperCase();
                    let idTutor = mapaTutores[tutorKey];

                    if (!idTutor) {
                        idTutor = 'FAM_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                        mapaTutores[tutorKey] = idTutor;
                    }

                    const idAlumno = 'ALU_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4);

                    // REGISTRO UNIFICADO: Llena todas las variantes de nombres para que ninguna pantalla falle
                    const nuevoAlumno = {
                        id: idAlumno,
                        idAlumno: idAlumno,
                        codigo: idAlumno,

                        nombre: nombreAlumno,
                        nombreAlumno: nombreAlumno,

                        nivel: nivel,
                        grado: grado,
                        grupo: grupoRaw || 'A',

                        tutorId: idTutor,
                        idTutor: idTutor,
                        tutorPrincipal: tutorNombre,
                        tutorNombre: tutorNombre,
                        tutor: tutorNombre,

                        // Personas adicionales sincronizadas
                        personaExtra: adicionalesRaw,
                        personaAutorizadaExtra: adicionalesRaw,
                        autorizados: adicionalesRaw,

                        // Alerta de Custodia sincronizada desde la nueva columna del Excel
                        tieneCustodia: alertaRaw !== "",
                        alerta: alertaRaw,
                        alertaCustodia: alertaRaw,
                        alertasCustodia: alertaRaw
                    };

                    bdActual.push(nuevoAlumno);
                    contadorNuevos++;
                }
            });

            localStorage.setItem('bd_alumnos', JSON.stringify(bdActual));

            fileInput.value = '';
            alert(`🎉 ¡Importación Exitosa!\nSe cargaron ${contadorNuevos} registros correctamente con datos sincronizados.`);

            if (typeof cargarSelectoresTutores === 'function') cargarSelectoresTutores();
            if (typeof actualizarTablaBD === 'function') actualizarTablaBD();

        } catch (error) {
            console.error(error);
            alert("❌ Ocurrió un error al procesar el archivo. Asegúrate de subir un archivo .xlsx válido.");
        }
    };

    reader.readAsArrayBuffer(file);
}

async function abrirModalEditarAlumno(idAlumno) {
    // 1. Obtener la lista que la APP tiene cargada en memoria actualmente
    let bdActual = window.alumnos || window.bdAlumnos || window.listaAlumnos || JSON.parse(localStorage.getItem('bd_alumnos')) || [];

    // 💡 SI EL CELULAR NO TIENE LA LISTA DE ALUMNOS, LA PIDE AL SERVIDOR
    if (!Array.isArray(bdActual) || bdActual.length === 0) {
        try {
            const res = await fetch('/api/alumnos-completo');
            const data = await res.json();
            bdActual = data.alumnos || data.data || [];
            window.alumnos = bdActual;
            localStorage.setItem('bd_alumnos', JSON.stringify(bdActual));
        } catch (e) {
            console.warn("Error consultando lista de alumnos al servidor:", e);
        }
    }

    if (!Array.isArray(bdActual) || bdActual.length === 0) {
        alert("⚠️ No se encontró la lista de alumnos en la memoria activa.");
        return;
    }

    // 2. Buscar al alumno seleccionado por ID
    let alumno = bdActual.find(a => (a.idAlumno == idAlumno || a.id == idAlumno));

    if (!alumno) {
        alert("⚠️ No se encontró la información del alumno seleccionado.");
        return;
    }

    // 3. OBTENCIÓN DIRECTA DEL TUTOR DESDE LA MEMORIA DEL SISTEMA
    let idBuscar = alumno.tutorId || alumno.idFamilia;
    
    // Busca en todas las variables donde tu app guarda el JSON al iniciar
    let listaTutores = window.tutores || 
                       (window.datosGuardados && window.datosGuardados.tutores) || 
                       (window.datos && window.datos.tutores) || 
                       JSON.parse(localStorage.getItem('tutores')) || [];

    // ⚡ SI EL CELULAR NO TIENE TUTORES EN MEMORIA, SE LOS PIDE AL SERVIDOR CENTRAL EN VIVO
    if (!Array.isArray(listaTutores) || listaTutores.length === 0) {
        try {
            const res = await fetch('/api/alumnos-completo');
            const data = await res.json();
            if (data.tutores && data.tutores.length > 0) {
                listaTutores = data.tutores;
                window.tutores = data.tutores;
                localStorage.setItem('tutores', JSON.stringify(data.tutores));
            }
        } catch (e) {
            console.warn("Error consultando tutores al servidor:", e);
        }
    }

    let tutorObj = listaTutores.find(t => (t.id === idBuscar || t.idTutor === idBuscar));
    let nombreTutorTexto = tutorObj ? (tutorObj.nombre || tutorObj.tutorNombre || tutorObj.padre || tutorObj.madre) : (alumno.tutorPrincipal || alumno.tutorResponsable || alumno.tutor || '');

    let nomTutor = nombreTutorTexto.toUpperCase();
    let nomAlumno = (alumno.nombreAlumno || alumno.nombre || alumno.nombreCompleto || '').toUpperCase();

    // Palabras clave de más de 3 letras
    let palabrasClave = nomAlumno.split(' ').concat(nomTutor.split(' ')).filter(p => p.length > 3);

    // 4. Filtrar hermanos
    let hermanos = bdActual.filter(a => {
        if (idBuscar && (a.tutorId === idBuscar || a.idFamilia === idBuscar)) return true;
        let textoOtro = JSON.stringify(a).toUpperCase();
        return palabrasClave.some(palabra => palabra.length > 3 && textoOtro.includes(palabra));
    });

    if (hermanos.length === 0) hermanos = [alumno];

    // 5. Ocultar los campos antiguos individuales del modal
    ['edit-nombre', 'edit-nivel', 'edit-grado', 'edit-grupo'].forEach(id => {
        let el = document.getElementById(id);
        if (el && el.closest('div')) el.closest('div').style.display = 'none';
    });

    let modal = document.getElementById('modal-editar-alumno');
    if (!modal) return;

    // 🔓 DESBLOQUEAR Y RELLENAR EL CAMPO DEL TUTOR:
    let campoTutor = document.getElementById('edit-tutor');
    if (campoTutor) {
        campoTutor.removeAttribute('readonly');        // 1. Quita el bloqueo de 'solo lectura'
        campoTutor.readOnly = false;                    // 2. Habilita el teclado
        campoTutor.style.backgroundColor = '#ffffff';   // 3. Cambia el fondo de gris a blanco

        if (nombreTutorTexto) {
            campoTutor.value = nombreTutorTexto;        // 4. Escribe el nombre de la mamá/papá
        }
    }

    // 6. Insertar o limpiar el contenedor de la familia
    let contenedorHermanos = document.getElementById('contenedor-hermanos-edit');
    if (!contenedorHermanos) {
        contenedorHermanos = document.createElement('div');
        contenedorHermanos.id = 'contenedor-hermanos-edit';
        let cuerpoModal = modal.querySelector('.modal-body') || modal.querySelector('div') || modal;
        cuerpoModal.insertBefore(contenedorHermanos, cuerpoModal.firstChild);
    }

    // 7. Renderizar a Armina, León y cualquier hermano encontrado
    contenedorHermanos.style.display = 'block';
    contenedorHermanos.innerHTML = `
        <div style="font-weight:bold; font-size:12px; color:#1e293b; margin-bottom:8px; background:#e2e8f0; padding:6px 10px; border-radius:4px; text-align:left;">
            👨‍👩‍👧‍👦 Expediente Familiar (${hermanos.length} Alumno/s):
        </div>
    `;

    hermanos.forEach((h, index) => {
        let idVal = h.idAlumno || h.id || '';
        let nombreVal = h.nombreAlumno || h.nombre || h.nombreCompleto || '';
        let nivelVal = (h.nivel || h.nivelEducativo || 'PRIMARIA').toUpperCase();
        let gradoVal = h.grado || '';
        let grupoVal = h.grupo || '';

        let div = document.createElement('div');
        div.className = 'bloque-hermano-edit';
        div.style.cssText = 'background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; margin-bottom: 8px; border-radius: 6px; text-align: left;';
        div.innerHTML = `
            <input type="hidden" class="edit-hermano-id" value="${idVal}">
            <div style="margin-bottom: 4px;">
                <label style="font-weight: bold; font-size: 11px; color: #1e293b;">Alumno/a ${index + 1}:</label>
                <input type="text" class="edit-hermano-nombre" value="${nombreVal}" style="width: 100%; padding: 5px; font-weight: bold; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
            </div>
            <div style="display: flex; gap: 6px;">
                <div style="flex: 1;">
                    <label style="font-size: 10px;">Nivel:</label>
                    <select class="edit-hermano-nivel" style="width: 100%; padding: 3px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px;">
                        <option value="PREESCOLAR" ${nivelVal.includes('PRE') ? 'selected' : ''}>PREESCOLAR</option>
                        <option value="PRIMARIA" ${nivelVal.includes('PRI') ? 'selected' : ''}>PRIMARIA</option>
                        <option value="SECUNDARIA" ${nivelVal.includes('SEC') ? 'selected' : ''}>SECUNDARIA</option>
                    </select>
                </div>
                <div style="flex: 1;">
                    <label style="font-size: 10px;">Grado:</label>
                    <input type="text" class="edit-hermano-grado" value="${gradoVal}" style="width: 100%; padding: 3px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="flex: 1;">
                    <label style="font-size: 10px;">Grupo:</label>
                    <input type="text" class="edit-hermano-grupo" value="${grupoVal}" style="width: 100%; padding: 3px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
                </div>
            </div>
        `;
        contenedorHermanos.appendChild(div);
    });

    // 8. Cargar Tutor y Autorizados en las casillas correspondientes
    if (document.getElementById('edit-tutor')) {
        document.getElementById('edit-tutor').value = alumno.tutorPrincipal || alumno.tutorNombre || alumno.tutor || '';
    }
    if (document.getElementById('edit-autorizados')) {
        let aut = alumno.personaAutorizadaExtra || alumno.autorizadosExtra || alumno.autorizados || '';
        document.getElementById('edit-autorizados').value = Array.isArray(aut) ? aut.join(' / ') : aut;
    }

    modal.style.display = 'flex';
}
function cerrarModalEditar() {
    const modal = document.getElementById('modal-editar-alumno');
    if (modal) modal.style.display = 'none';
}

function guardarEdicionAlumno() {
    let bloques = document.querySelectorAll('.bloque-hermano-edit');
    let tutorNombreVal = document.getElementById('edit-tutor') ? document.getElementById('edit-tutor').value.trim() : '';
    let autorizadosVal = document.getElementById('edit-autorizados') ? document.getElementById('edit-autorizados').value.trim() : '';
    let idFamilia = document.getElementById('edit-id-alumno') ? document.getElementById('edit-id-alumno').value : '';
    let tieneCustodia = document.getElementById('edit-custodia-check') ? document.getElementById('edit-custodia-check').checked : false;
    let alertaCustodia = document.getElementById('edit-custodia-texto') ? document.getElementById('edit-custodia-texto').value.trim() : '';

    let promesas = [];

    bloques.forEach(bloque => {
        let idAlumno = bloque.querySelector('.edit-hermano-id').value;
        let nombre = bloque.querySelector('.edit-hermano-nombre').value.trim();
        let nivel = bloque.querySelector('.edit-hermano-nivel').value;
        let grado = bloque.querySelector('.edit-hermano-grado').value.trim();
        let grupo = bloque.querySelector('.edit-hermano-grupo').value.trim();

        if (nombre) {
            let datos = {
                id: idAlumno,
                idAlumno: idAlumno,
                nombre: nombre,
                nombreAlumno: nombre,
                nivel: nivel,
                grado: grado,
                grupo: grupo,
                tutorNombre: tutorNombreVal,
                tutorPrincipal: tutorNombreVal,
                tutorExistenteId: idFamilia,
                
                // Actualiza todas las claves posibles del JSON
                personaExtra: autorizadosVal,
                personaAutorizadaExtra: autorizadosVal,
                autorizados: autorizadosVal,
                
                alerta: tieneCustodia ? (alertaCustodia || "RESTRICCIÓN DE CUSTODIA") : '',
                tieneCustodia: tieneCustodia,
                alertaCustodia: alertaCustodia
            };

            promesas.push(
                fetch('/api/registrar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                })
            );
        }
    });

    localStorage.removeItem('bd_alumnos');

    Promise.all(promesas)
        .then(() => {
            alert("✅ ¡Información actualizada correctamente!");
            cerrarModalEditar();
            location.reload();
        })
        .catch(err => {
            cerrarModalEditar();
            location.reload();
        });
}

// Alias de respaldo para mantener compatibilidad total con el HTML
function abrirModalEditar(id) { abrirModalEditarAlumno(id); }
function guardarFormularioManual() { guardarEdicionAlumno(); }
function cargarDatosYEditar() { abrirModalEditarAlumno(); }
function prepararYEditarAlumno() { abrirModalEditarAlumno(); }
function abrirEditarDesdeExpediente() { abrirModalEditarAlumno(); }

function procesarExcelAlumnos(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
        alert("❌ Error: La librería de lectura de Excel (SheetJS) no está cargada en el HTML.");
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            const primeraHoja = workbook.SheetNames[0];
            const hoja = workbook.Sheets[primeraHoja];
            const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

            if (filas.length === 0) {
                alert("⚠️ El archivo de Excel está vacío.");
                return;
            }

            let bdAlumnos = [];

            filas.forEach((fila, index) => {
                let nombre = fila["NOMBRE COMPLETO DEL ALUMNO"] || fila["NOMBRE"] || fila["ALUMNO"] || "";
                
                if (nombre.toString().trim().length > 0) {
                    let alumnoObj = {
                        idAlumno: "ALU_" + (index + 1),
                        id: "ALU_" + (index + 1),
                        nombreAlumno: nombre.toString().trim(),
                        nombre: nombre.toString().trim(),
                        nivel: fila["NIVEL EDUCATIVO"] || "PRIMARIA",
                        grado: fila["GRADO"] || "",
                        grupo: fila["GRUPO"] || "",
                        tutorPrincipal: fila["NOMBRE DEL TUTOR PRINCIPAL."] || fila["NOMBRE DEL TUTOR PRINCIPAL"] || "",
                        tutorNombre: fila["NOMBRE DEL TUTOR PRINCIPAL."] || fila["NOMBRE DEL TUTOR PRINCIPAL"] || "",
                        personaAutorizadaExtra: fila["PERSONAS AUTORIZADAS"] || fila["NOMBRE DEL TUTOR ADICIONAL"] || "",
                        autorizadosExtra: fila["PERSONAS AUTORIZADAS"] || fila["NOMBRE DEL TUTOR ADICIONAL"] || "",
                        tieneCustodia: false,
                        alertaCustodia: ""
                    };
                    bdAlumnos.push(alumnoObj);

                    fetch('/api/registrar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(alumnoObj)
                    }).catch(e => console.error("Error sincronizando fila Excel:", e));
                }
            });

            localStorage.setItem('bd_alumnos', JSON.stringify(bdAlumnos));
            alert(`✅ ¡Base de datos cargada y enviada al servidor! Se procesaron ${bdAlumnos.length} alumnos.`);
            setTimeout(() => { location.reload(); }, 1000);

        } catch (error) {
            console.error("Error al procesar Excel:", error);
            alert("❌ Ocurrió un error al leer el archivo. Verifica que sea un archivo de Excel válido.");
        }
    };

    reader.readAsArrayBuffer(file);
}
// ==========================================================
// IMPORTACIÓN LIMPIA DE EXCEL: ESTRUCTURA PERFECTA + VOCEO HERMANOS
// ==========================================================
window.procesarExcelAlumnos = function(event) {
    const input = event.target;
    const file = input.files ? input.files[0] : null;

    if (!file) return;

    if (typeof XLSX === 'undefined') {
        alert("❌ Error: No se encontró la librería XLSX para leer Excel.");
        input.value = '';
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            const nombreHoja = workbook.SheetNames[0]; 
            const hoja = workbook.Sheets[nombreHoja];
            const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

            if (!filas || filas.length === 0) {
                alert("⚠️ El archivo de Excel está vacío.");
                return;
            }

            // 1. Limpiamos la memoria local vieja
            ['bd_alumnos', 'alumnos', 'db_alumnos', 'lista_alumnos', 'alumnos_db'].forEach(key => {
                localStorage.removeItem(key);
            });

            let bdAlumnos = [];
            let promesasFetch = [];
            
            // Mapa para asignar el mismo ID de familia a los hermanos (según nombre del tutor)
            let mapaFamilias = {};
            let contadorFamilias = 1;

            // 2. Mapeamos cada fila creando la estructura LIMPIA Y COMPLETA
            filas.forEach((fila, index) => {
                let nombre = fila["NOMBRE COMPLETO DEL ALUMNO"] || fila["NOMBRE"] || fila["ALUMNO"] || "";
                nombre = nombre.toString().trim();

                if (nombre.length > 0) {
                    // ID UNIFICADO DE ALUMNO
                    let idUnico = "ALU_" + (index + 1);
                    
                    let tutor = fila["NOMBRE DEL TUTOR PRINCIPAL"] || fila["TUTOR"] || "";
                    tutor = tutor.toString().trim();

                    // GENERACIÓN / ASIGNACIÓN DE ID FAMILIAR PARA VOCEO DE HERMANOS
                    let tutorId = "";
                    if (tutor.length > 0) {
                        let tutorClave = tutor.toUpperCase();
                        if (!mapaFamilias[tutorClave]) {
                            mapaFamilias[tutorClave] = "FAM_" + contadorFamilias;
                            contadorFamilias++;
                        }
                        tutorId = mapaFamilias[tutorClave];
                    } else {
                        tutorId = "FAM_IND_" + (index + 1);
                    }

                    let autorizados = fila["PERSONAS ADICIONALES"] || fila["PERSONAS AUTORIZADAS"] || fila["AUTORIZADOS"] || "";
                    let nivel = (fila["NIVEL EDUCATIVO"] || fila["NIVEL"] || "PRIMARIA").toString().trim().toUpperCase();
                    let grado = fila["GRADO"] || "";
                    let grupo = fila["GRUPO"] || "";
                    let ciclo = fila["CICLO ESCOLAR"] || "2026-2027";

                    // ESTRUCTURA ESTÁNDAR COMPLETA
                    let alumnoLimpio = {
                        // IDs idénticos de alumno para QR / Expedientes
                        id: idUnico,
                        idAlumno: idUnico,
                        codigo: idUnico,

                        // Nombre estandarizado
                        nombre: nombre,
                        nombreAlumno: nombre,
                        "NOMBRE COMPLETO DEL ALUMNO": nombre,

                        // Nivel, Grado y Grupo
                        nivel: nivel,
                        "NIVEL EDUCATIVO": nivel,
                        grado: grado,
                        "GRADO": grado,
                        grupo: grupo,
                        "GRUPO": grupo,

                        // Tutor e ID Familiar para el Voceo
                        tutorId: tutorId,
                        idFamilia: tutorId,
                        tutorPrincipal: tutor,
                        tutorNombre: tutor,
                        tutor: tutor,
                        "NOMBRE DEL TUTOR PRINCIPAL": tutor,

                        // Personas autorizadas
                        personaAutorizadaExtra: autorizados,
                        personaExtra: autorizados,
                        autorizadosExtra: autorizados,
                        autorizados: autorizados,
                        "PERSONAS ADICIONALES": autorizados,

                        // Ciclo Escolar
                        ciclo: ciclo,
                        "CICLO ESCOLAR": ciclo,

                        // CAMPOS DE CUSTODIA Y ALERTA (Inicializados desde el origen)
                        tieneCustodia: false,
                        alertaCustodia: "",
                        alerta: ""
                    };

                    bdAlumnos.push(alumnoLimpio);

                    // Sincronizar con el backend
                    promesasFetch.push(
                        fetch('/api/registrar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(alumnoLimpio)
                        }).catch(e => console.log("Guardando localmente..."))
                    );
                }
            });

            // 3. Guardamos la estructura limpia en LocalStorage
            const bdString = JSON.stringify(bdAlumnos);
            localStorage.setItem('bd_alumnos', bdString);
            localStorage.setItem('alumnos', bdString);
            localStorage.setItem('db_alumnos', bdString);

            Promise.all(promesasFetch).then(() => {
                alert(`🎉 ¡ÉXITO!\n\nSe procesaron ${bdAlumnos.length} alumnos con ID familiar de voceo, estructura limpia y sin duplicados.`);
                location.reload();
            }).catch(() => {
                alert(`🎉 Importación procesada correctamente.`);
                location.reload();
            });

        } catch (err) {
            console.error("Error al procesar el Excel:", err);
            alert("❌ Ocurrió un error al leer el archivo: " + err.message);
        } finally {
            input.value = '';
        }
    };

    reader.readAsArrayBuffer(file);
};
// ==========================================================
// VÍNCULO AUTOMÁTICO AL BOTÓN "GUARDAR CAMBIOS"
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {
    // Buscar todos los botones de la página
    const botones = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
    
    botones.forEach(btn => {
        // Si el botón dice "GUARDAR CAMBIOS" o "GUARDAR"
        if (btn.innerText && btn.innerText.toUpperCase().includes('GUARDAR CAMBIOS')) {
            btn.onclick = (e) => {
                e.preventDefault(); // Evitar recargas bruscas
                guardarEdicionAlumno(); // Ejecutar nuestra función con la misma lógica de Registro
            };
        }
    });
});
// ==========================================================
// EDICIÓN EXCLUSIVA DE ALUMNOS / HERMANOS EXISTENTES
// ==========================================================

async function abrirYLlenarEditar() {
    // 1. Obtener listas de la memoria activa
    let bdActual = window.alumnos || JSON.parse(localStorage.getItem('bd_alumnos')) || [];
    let listaTutores = window.tutores || JSON.parse(localStorage.getItem('tutores')) || [];

    // ⚡ SI EL CELULAR NO TIENE DATOS, LOS TRAE DEL SERVIDOR EN VIVO
    if (!Array.isArray(bdActual) || bdActual.length === 0 || !Array.isArray(listaTutores) || listaTutores.length === 0) {
        try {
            const res = await fetch('/api/alumnos-completo');
            const data = await res.json();
            if (data.alumnos) {
                bdActual = data.alumnos;
                window.alumnos = data.alumnos;
            }
            if (data.tutores) {
                listaTutores = data.tutores;
                window.tutores = data.tutores;
            }
        } catch (e) {
            console.warn("Error trayendo datos del servidor central:", e);
        }
    }

    // 2. Obtener el texto que está abierto en la ventana del Expediente
    let modalExpediente = document.querySelector('#modal-expediente-alumno') || document.querySelector('.modal-content') || document.body;
    let textoCompletoExpediente = modalExpediente.innerText || modalExpediente.textContent || '';

    // 3. Intentar obtener el ID o Tutor guardado en los inputs ocultos
    let idFamilia = document.getElementById('edit-id-alumno') ? document.getElementById('edit-id-alumno').value : '';
    let tutorInput = document.getElementById('edit-tutor') ? document.getElementById('edit-tutor').value.trim().toUpperCase() : '';

    // 4. BUSCAR A TODOS LOS HERMANOS DE LA FAMILIA
    let hermanos = bdActual.filter(a => {
        let nombreAlumno = (a.nombreAlumno || a.nombre || '').toString().toUpperCase();
        
        let idBusc = a.tutorId || a.idFamilia || a.tutorExistenteId;
        let tutorObj = listaTutores.find(t => (t.id === idBusc || t.idTutor === idBusc));
        let tutorAlumno = (tutorObj ? (tutorObj.nombre || tutorObj.tutorNombre) : (a.tutorPrincipal || a.tutorNombre || a.tutor || '')).toString().toUpperCase();
        let famA = (a.tutorId || a.tutorExistenteId || a.codigoTutor || '').toString().trim();

        if (idFamilia && famA === idFamilia) return true;
        if (tutorAlumno && tutorAlumno.length > 3 && textoCompletoExpediente.toUpperCase().includes(tutorAlumno)) return true;
        if (tutorInput && tutorAlumno && tutorAlumno === tutorInput) return true;
        if (nombreAlumno && nombreAlumno.length > 3 && textoCompletoExpediente.toUpperCase().includes(nombreAlumno)) return true;

        return false;
    });

    // Búsqueda inteligente por apellidos si sólo encontró a 1
    if (hermanos.length === 1) {
        let primerAlumno = hermanos[0];
        let partesNombre = (primerAlumno.nombreAlumno || primerAlumno.nombre || '').trim().split(' ');
        if (partesNombre.length >= 2) {
            let apellidos = partesNombre.slice(-2).join(' ').toUpperCase();
            if (apellidos.length > 4) {
                let hermanosPorApellido = bdActual.filter(a => {
                    let nom = (a.nombreAlumno || a.nombre || '').toUpperCase();
                    return nom.includes(apellidos);
                });
                if (hermanosPorApellido.length > 1) {
                    hermanos = hermanosPorApellido;
                }
            }
        }
    }

    // 5. PREPARAR EL CONTENEDOR EN EL MODAL DE EDICIÓN
    let modalInterior = document.querySelector('#modal-editar-alumno > div');
    let contenedorHermanos = document.getElementById('contenedor-lista-hermanos');

    if (!contenedorHermanos && modalInterior) {
        contenedorHermanos = document.createElement('div');
        contenedorHermanos.id = 'contenedor-lista-hermanos';
        
        ['edit-nombre', 'edit-nivel', 'edit-grado', 'edit-grupo'].forEach(id => {
            let el = document.getElementById(id);
            if (el) {
                let padre = el.closest('div');
                if (padre) padre.style.display = 'none';
            }
        });

        let campoTutorParent = document.getElementById('edit-tutor')?.parentElement;
        if (campoTutorParent) {
            modalInterior.insertBefore(contenedorHermanos, campoTutorParent);
        } else {
            modalInterior.appendChild(contenedorHermanos);
        }
    }

    // 6. RENDERIZAR TODOS LOS HERMANOS ENCONTRADOS
    if (contenedorHermanos) {
        contenedorHermanos.innerHTML = `<div style="font-weight:bold; font-size:13px; color:#1e293b; margin-bottom:8px;">👨‍👩‍👧‍👦 Alumnos en este expediente (${hermanos.length}):</div>`;
        
        hermanos.forEach((h, index) => {
            let div = document.createElement('div');
            div.className = 'bloque-hermano-item';
            div.style.cssText = 'background:#f8fafc; border:1px solid #cbd5e1; padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;';
            div.innerHTML = `
                <input type="hidden" class="edit-hermano-id" value="${h.idAlumno || h.id || ''}">
                <div style="margin-bottom:6px;">
                    <label style="font-weight:bold; font-size:11px; color:#334155;">Alumno/a ${index + 1}:</label>
                    <input type="text" class="edit-hermano-nombre" value="${h.nombreAlumno || h.nombre || ''}" style="width:100%; padding:6px; font-weight:bold; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;" placeholder="Nombre completo">
                </div>
                <div style="display:flex; gap:6px;">
                    <div style="flex:1;">
                        <label style="font-size:10px; color:#64748b;">Nivel:</label>
                        <select class="edit-hermano-nivel" style="width:100%; padding:4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;">
                            <option value="PREESCOLAR" ${h.nivel === 'PREESCOLAR' ? 'selected' : ''}>PREESCOLAR</option>
                            <option value="PRIMARIA" ${h.nivel === 'PRIMARIA' ? 'selected' : ''}>PRIMARIA</option>
                            <option value="SECUNDARIA" ${h.nivel === 'SECUNDARIA' ? 'selected' : ''}>SECUNDARIA</option>
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:10px; color:#64748b;">Grado:</label>
                        <input type="text" class="edit-hermano-grado" value="${h.grado || ''}" style="width:100%; padding:4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:10px; color:#64748b;">Grupo:</label>
                        <input type="text" class="edit-hermano-grupo" value="${h.grupo || ''}" style="width:100%; padding:4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
                    </div>
                </div>
            `;
            contenedorHermanos.appendChild(div);
        });
    }

    // 7. ASIGNAR EL NOMBRE DEL TUTOR (CRUZANDO CON TUTORES.JSON SI ES NECESARIO)
    let inputTutor = document.getElementById('edit-tutor');
    if (hermanos.length > 0 && inputTutor) {
        let primerT = hermanos[0];
        
        let idBusc = primerT.tutorId || primerT.idFamilia || primerT.tutorExistenteId;
        let tutorObj = listaTutores.find(t => (t.id === idBusc || t.idTutor === idBusc));
        
        let nombreTutorFinal = tutorObj ? (tutorObj.nombre || tutorObj.tutorNombre || tutorObj.padre || tutorObj.madre) : (primerT.tutorPrincipal || primerT.tutorNombre || primerT.tutor || '');

        inputTutor.value = nombreTutorFinal;
    }
}

    // 6. CERRAR EXPEDIENTE Y ABRIR MODAL
    cerrarModalDetalleAlumno();
    const modalEdit = document.getElementById('modal-editar-alumno');
    if (modalEdit) modalEdit.style.display = 'flex';


// Función para guardar únicamente los cambios de los alumnos editados
function guardarEdicionAlumno() {
    let bloques = document.querySelectorAll('.bloque-hermano-item');
    let tutor = document.getElementById('edit-tutor') ? document.getElementById('edit-tutor').value.trim() : '';
    let autorizados = document.getElementById('edit-autorizados') ? document.getElementById('edit-autorizados').value.trim() : '';
    let tieneCustodia = document.getElementById('edit-custodia-check') ? document.getElementById('edit-custodia-check').checked : false;
    let alertaCustodia = document.getElementById('edit-custodia-texto') ? document.getElementById('edit-custodia-texto').value.trim() : '';

    if (bloques.length === 0) {
        document.getElementById('modal-editar-alumno').style.display = 'none';
        return;
    }

    let bdActual = JSON.parse(localStorage.getItem('bd_alumnos')) || [];
    let promesas = [];

    bloques.forEach(bloque => {
        let idAlumno = bloque.querySelector('.edit-hermano-id').value;
        let nombre = bloque.querySelector('.edit-hermano-nombre').value.trim();
        let nivel = bloque.querySelector('.edit-hermano-nivel').value;
        let grado = bloque.querySelector('.edit-hermano-grado').value.trim();
        let grupo = bloque.querySelector('.edit-hermano-grupo').value.trim();

        if (idAlumno && nombre) {
            let datos = {
                id: idAlumno,
                idAlumno: idAlumno,
                nombre: nombre,
                nombreAlumno: nombre,
                nivel: nivel,
                grado: grado,
                grupo: grupo,
                tutorNombre: tutor,
                tutorPrincipal: tutor,
                
                // ⚡ CORRECCIÓN CLAVE: Enviamos las 3 variantes para sincronizar con data.json
                personaExtra: autorizados,
                personaAutorizadaExtra: autorizados,
                autorizados: autorizados,
                
                // ⚡ ALERTA: Envía el texto o lo borra si no tiene custodia
                alerta: tieneCustodia ? (alertaCustodia || "RESTRICCIÓN DE CUSTODIA") : "",
                tieneCustodia: tieneCustodia,
                alertaCustodia: tieneCustodia ? alertaCustodia : ""
            };

            // Enviar al servidor
            promesas.push(
                fetch('/api/registrar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                }).catch(e => console.log("Guardando datos en local..."))
            );

            // Actualizar en LocalStorage
            let idx = bdActual.findIndex(a => (a.idAlumno == idAlumno || a.id == idAlumno));
            if (idx !== -1) {
                bdActual[idx] = { ...bdActual[idx], ...datos };
            }
        }
    });

    localStorage.setItem('bd_alumnos', JSON.stringify(bdActual));

    Promise.all(promesas).then(() => {
        alert("✅ ¡Datos actualizados con éxito!");
        document.getElementById('modal-editar-alumno').style.display = 'none';
        location.reload();
    });
}

// ==========================================================
// BÚSQUEDA Y EDICIÓN DE ALUMNOS (CONEXIÓN CENTRAL EN TIEMPO REAL)
// ==========================================================

window.buscarAlumnoParaEditar = function() {
    const input = document.getElementById("edit-buscar-input");
    if (!input) return;

    const textoBusqueda = input.value.trim().toLowerCase();
    if (!textoBusqueda) {
        alert("⚠️ Por favor escribe el nombre o código del alumno.");
        return;
    }

    // ⚡ CONEXIÓN DIRECTA A LA RUTA INTELIGENTE DEL SERVIDOR
    fetch(`/api/buscar-alumno-servidor?q=${encodeURIComponent(textoBusqueda)}`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'ok' && data.alumno) {
                const alumno = data.alumno;

                const container = document.getElementById("form-edicion-container");
                if (container) container.style.display = "block";

                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) el.value = val || "";
                };

                // 1. Rellenar datos del alumno
                setVal("edit-id-alumno", alumno.codigo || alumno.CODIGO || alumno.id || "");
                setVal("edit-nivel", alumno.nivel || alumno.NIVEL || "");
                setVal("edit-grado", alumno.grado || alumno.GRADO || "");
                setVal("edit-grupo", alumno.grupo || alumno.GRUPO || "");
                setVal("edit-nombre-alumno", alumno.nombreAlumno || alumno.nombre || alumno.NOMBRE || "");
                
                // Carga cualquiera de las tres claves de autorizados que contenga datos
                setVal("edit-autorizados", alumno.personaExtra || alumno.autorizados || alumno.personaAutorizadaExtra || "");
                setVal("edit-alerta", alumno.alerta || alumno.ALERTA || alumno.custodia || "");

                // 2. Asignar el Tutor Responsable devuelto por el servidor
                const campoTutor = document.getElementById("edit-tutor");
                if (campoTutor) {
                    campoTutor.removeAttribute('readonly');
                    campoTutor.readOnly = false;
                    campoTutor.disabled = false;
                    campoTutor.style.backgroundColor = "#ffffff";
                    campoTutor.value = alumno.tutorNombreCompleto || alumno.tutorPrincipal || alumno.tutorNombre || "";
                }

            } else {
                alert("❌ No se encontró ningún alumno con ese término de búsqueda.");
            }
        })
        .catch(err => console.error("Error al consultar el servidor central:", err));
};
// ==========================================================
// 1. LLENAR EL DESPLEGABLE CON LOS TUTORES EXISTENTES
// ==========================================================
window.cargarTutoresEnSelect = function() {
    const select = document.getElementById("reg-tutor-existente");
    if (!select) return;

    fetch('/api/alumnos-completo')
        .then(res => res.json())
        .then(data => {
            const tutores = data.tutores || [];
            
            select.innerHTML = '<option value="">-- Crear Nuevo Código Familiar --</option>';

            const familiasProcesadas = new Set();

            tutores.forEach(t => {
                const id = t.id || t.tutorId || t.idFamilia;
                const nombre = t.nombre || t.madre || t.padre || t.tutorNombre || "";

                if (id && nombre && !familiasProcesadas.has(id) && nombre !== 'MASTER_KEY') {
                    familiasProcesadas.add(id);
                    const option = document.createElement("option");
                    option.value = id;
                    option.textContent = `${nombre} (${id})`;
                    select.appendChild(option);
                }
            });
        })
        .catch(err => console.error("Error al cargar tutores en el selector:", err));
};

// Cargar la lista automáticamente al iniciar
document.addEventListener("DOMContentLoaded", () => {
    if (window.cargarTutoresEnSelect) {
        window.cargarTutoresEnSelect();
    }
});

// ==========================================================
// 2. GUARDAR EL REGISTRO
// ==========================================================
window.guardarRegistroAlumno = function(event) {
    if (event) event.preventDefault();

    const nombre = document.getElementById("reg-nombre")?.value || "";
    const nivel = document.getElementById("reg-nivel")?.value || "";
    const grado = document.getElementById("reg-grado")?.value || "";
    const grupo = document.getElementById("reg-grupo")?.value || "";
    const tutorNombre = document.getElementById("reg-tutor")?.value || "";
    const tutorExistenteId = document.getElementById("reg-tutor-existente")?.value || "";
    const personaAutorizadaExtra = document.getElementById("reg-autorizado-extra")?.value || "";

    if (!nombre.trim()) {
        alert("⚠️ Por favor escribe el Nombre del Alumno.");
        return;
    }

    if (!tutorNombre.trim() && !tutorExistenteId) {
        alert("⚠️ Por favor escribe el Nombre del Tutor o selecciona una Familia existente.");
        return;
    }

    fetch('/api/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nombre,
            nivel,
            grado,
            grupo,
            tutorNombre,
            tutorExistenteId,
            personaAutorizadaExtra
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success || data.status === 'ok') {
            alert(`🎉 ¡Alumno registrado con éxito!\nCódigo QR Familiar asignado: ${data.tutorId}`);
            
            // Limpiar el formulario
            document.getElementById("form-registro")?.reset();
            
            // Recargar la lista de familias
            window.cargarTutoresEnSelect();
        } else {
            alert("❌ Error al guardar: " + (data.error || data.mensaje || "Error desconocido"));
        }
    })
    .catch(err => {
        console.error("Error al enviar el registro:", err);
        alert("❌ Ocurrió un error al conectar con el servidor.");
    });
};

// ==========================================================
// 2. ENVIAR FORMULARIO DE REGISTRO AL SERVIDOR
// ==========================================================
window.guardarRegistroAlumno = function(event) {
    if (event) event.preventDefault();

    const inputs = document.querySelectorAll("#seccion-registro input, form input");
    const selects = document.querySelectorAll("#seccion-registro select, form select");

    const nombre = document.getElementById("reg-nombre")?.value || (inputs[0] ? inputs[0].value : "");
    const nivel = document.getElementById("reg-nivel")?.value || (selects[0] ? selects[0].value : "");
    const grado = document.getElementById("reg-grado")?.value || (selects[1] ? selects[1].value : "");
    const grupo = document.getElementById("reg-grupo")?.value || (selects[2] ? selects[2].value : "");
    const tutorNombre = document.getElementById("reg-tutor")?.value || (inputs[1] ? inputs[1].value : "");
    
    const selectFamilia = document.getElementById("vincular-familia-select") || selects[3];
    const tutorExistenteId = selectFamilia ? selectFamilia.value : "";
    
    const personaAutorizadaExtra = document.getElementById("reg-autorizado")?.value || (inputs[2] ? inputs[2].value : "");

    if (!nombre.trim()) {
        alert("⚠️ Por favor escribe el Nombre del Alumno.");
        return;
    }

    if (!tutorNombre.trim() && (!tutorExistenteId || tutorExistenteId === 'NUEVO')) {
        alert("⚠️ Por favor escribe el Nombre del Tutor o selecciona una Familia existente.");
        return;
    }

    fetch('/api/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nombre,
            nivel,
            grado,
            grupo,
            tutorNombre,
            tutorExistenteId,
            personaAutorizadaExtra
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success || data.status === 'ok') {
            alert(`🎉 ¡Alumno registrado con éxito!\nCódigo QR Familiar asignado: ${data.tutorId}`);
            
            inputs.forEach(i => i.value = "");
            window.cargarTutoresEnSelect();
        } else {
            alert("❌ Error al guardar: " + (data.error || data.mensaje || "Error desconocido"));
        }
    })
    .catch(err => {
        console.error("Error al enviar el registro:", err);
        alert("❌ Ocurrió un error al conectar con el servidor.");
    });
};
// ==========================================================
// EXPEDIENTE FAMILIAR DEFINITIVO (CORREGIDO)
// ==========================================================
window.abrirExpedienteFamiliar = function(criterio) {
    fetch('/api/alumnos-completo')
        .then(res => res.json())
        .then(data => {
            const todosLosAlumnos = data.alumnos || [];
            const todosLosTutores = data.tutores || [];
            let term = (criterio || '').toString().trim().toUpperCase();

            // 1. Buscar alumno (coincidencia parcial)
            const alumnoBase = todosLosAlumnos.find(a => {
                const nom = (a.nombre || a.nombreAlumno || '').toUpperCase();
                const id = (a.id || a.codigo || '').toUpperCase();
                const tut = (a.tutorId || a.idFamilia || '').toUpperCase();
                return nom.includes(term) || id.includes(term) || tut.includes(term);
            });

            if (!alumnoBase) return alert("⚠️ No se encontraron registros para: " + term);

            // 2. Filtrar hermanos por tutorId
            const tutorIdBase = (alumnoBase.tutorId || alumnoBase.idFamilia || '').toString().trim().toUpperCase();
            const listaAlumnos = todosLosAlumnos.filter(a => (a.tutorId || a.idFamilia || '').toString().trim().toUpperCase() === tutorIdBase);
            const tutorObj = todosLosTutores.find(t => (t.id || t.tutorId || '').toString().trim().toUpperCase() === tutorIdBase) || {};
            
            // EL TUTOR PRINCIPAL PERMANECE SIEMPRE IGUAL
            const nombreTutor = alumnoBase.tutorPrincipal || alumnoBase.tutorNombre || alumnoBase.tutor || tutorObj.nombre || tutorObj.madre || "Tutor No Registrado";
            
            // ⚡ CORRECCIÓN: Lee únicamente los campos del alumno sin ir a revivir datos viejos del tutor
            const extraVal = (alumnoBase.personaExtra !== undefined ? alumnoBase.personaExtra : 
                             (alumnoBase.personaAutorizadaExtra !== undefined ? alumnoBase.personaAutorizadaExtra : 
                             (alumnoBase.autorizados !== undefined ? alumnoBase.autorizados : ""))).toString().trim();
                             
            const personaExtra = extraVal !== "" ? extraVal : "Ninguna";

            // Alerta de custodia
            const alerta = (alumnoBase.alerta || alumnoBase.alertaCustodia || tutorObj.alerta || "").toString().trim();

            // 3. Renderizar HTML
            const contenedor = document.getElementById("detalle-alumno-contenido");
            if (contenedor) {
                let htmlAlumnos = "";
                if (listaAlumnos.length <= 1) {
                    const alu = listaAlumnos[0] || alumnoBase;
                    htmlAlumnos = `
                        <div style="background:#f8f9fa; padding:10px; border-radius:6px; border-left:4px solid #1b2680; margin-bottom:8px;">
                            🎓 <strong>Alumno:</strong> ${alu.nombre || alu.nombreAlumno}<br>
                            🏫 <strong>Grado / Grupo:</strong> ${alu.nivel || ''} ${alu.grado || ''} "${alu.grupo || ''}"
                        </div>`;
                } else {
                    htmlAlumnos = `
                        <div style="background:#f8f9fa; padding:10px; border-radius:6px; border-left:4px solid #1b2680; margin-bottom:8px;">
                            <strong style="color:#1b2680;">👨‍👩‍👧‍👦 Alumnos Registrados en esta Familia (${listaAlumnos.length}):</strong>
                            <ul style="margin: 6px 0 0 15px; padding: 0;">`;
                    listaAlumnos.forEach(h => {
                        htmlAlumnos += `<li style="margin-bottom: 4px;">🎓 <b>${h.nombre || h.nombreAlumno}</b> — <span style="color:#d97706; font-weight:bold;">${h.nivel || ''} ${h.grado || ''} "${h.grupo || ''}"</span></li>`;
                    });
                    htmlAlumnos += `</ul></div>`;
                }

                contenedor.innerHTML = `
                    <div style="margin-bottom:12px;">${htmlAlumnos}</div>
                    <div style="background:#fff9e6; padding:12px; border-radius:8px; border-left:4px solid #ffcc00; font-size:13px;">
                        <p style="margin:3px 0;">👨‍👩‍👦 <strong>Tutor Responsable:</strong> ${nombreTutor}</p>
                        <p style="margin:3px 0;">🔑 <strong>Código / Tarjeta ID:</strong> <code>${tutorIdBase}</code></p>
                        ${alerta ? `<p style="margin:3px 0; color:#dc2626; font-weight:bold;">🚨 <strong>Alerta de Custodia:</strong> ${alerta}</p>` : ''}
                        <p style="margin:3px 0;">🛡️ <strong>Personas Autorizadas Extras:</strong> ${personaExtra}</p>
                    </div>`;
            }

            // 4. Guardar datos en el Modal para el Tarjetón
            const modal = document.getElementById("modal-detalle-alumno");
            if (modal) {
                modal.dataset.familiaJson = JSON.stringify({
                    tutorId: tutorIdBase,
                    tutorNombre: nombreTutor,
                    alumnos: listaAlumnos
                });

                const qrDiv = document.getElementById("qr-modal-expediente");
                if (qrDiv) {
                    qrDiv.innerHTML = "";
                    qrDiv.title = tutorIdBase;
                    if (window.QRCode) {
                        new QRCode(qrDiv, { text: tutorIdBase, width: 160, height: 160, colorDark: "#1D71B8", colorLight: "#ffffff" });
                    }
                }
                modal.style.display = "flex";
            }
        })
        .catch(err => console.error("Error al cargar expediente:", err));
};
// Sobrescribir funciones viejas y conectar buscador
window.abrirExpedienteAlumno = window.abrirExpedienteFamiliar;
window.verDetalleAlumno = window.abrirExpedienteFamiliar;
window.mostrarDetalleAlumno = window.abrirExpedienteFamiliar;
window.verExpediente = window.abrirExpedienteFamiliar;

window.buscarAlumno = function(term) {
    const input = document.querySelector("input[placeholder*='nombre']") || document.querySelector("input[placeholder*='código']") || document.getElementById("input-filtro-bd");
    const valor = term || (input ? input.value : '');
    if (valor) window.abrirExpedienteFamiliar(valor);
};  
// ==========================================================
// VINCULAR EXCLUSIVAMENTE LA TECLA ENTER DEL INPUT #manual-code
// ==========================================================
(function() {
    function prepararBuscador() {
        const input = document.getElementById("manual-code");
        if (!input) return;

        // 1. Quitar cualquier evento viejo del HTML
        input.removeAttribute("onkeydown");
        input.removeAttribute("onkeyup");
        input.removeAttribute("onkeypress");

        // 2. Clonar el elemento para limpiar eventos JavaScript viejos
        const nuevoInput = input.cloneNode(true);
        if (input.parentNode) {
            input.parentNode.replaceChild(nuevoInput, input);
        }

        // 3. Asignar el nuevo evento ENTER con máxima prioridad
        nuevoInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter" || e.keyCode === 13) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // Evita que se ejecute la función vieja
                
                const valor = this.value.trim();
                if (valor) {
                    window.abrirExpedienteFamiliar(valor);
                }
            }
        }, true);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", prepararBuscador);
    } else {
        prepararBuscador();
    }
    setTimeout(prepararBuscador, 800);
})();
// CONECTOR AUTOMÁTICO PARA EL BOTÓN DESCARGAR TARJETÓN
document.addEventListener("click", function(e) {
    // Si se hace clic en el botón de descargar tarjetón dentro del modal
    if (e.target && (e.target.innerText.includes("Descargar Tarjetón") || e.target.closest("button")?.innerText.includes("Descargar Tarjetón"))) {
        if (typeof descargarTarjetaPNG === "function") {
            descargarTarjetaPNG();
        } else {
            console.error("No se encontró la función descargarTarjetaPNG");
        }
    }
});
async function consultarSalidaAlumno() {
    console.log("👉 Botón/Enter presionado");
    alert("🔍 Iniciando búsqueda..."); // Esto nos confirmará que la función SÍ se ejecuta

    const input = document.getElementById('input-busqueda-salida-alumno');
    const contenedor = document.getElementById('resultado-consulta-alumno');
    
    if (!input || !contenedor) {
        alert("🚨 Error: No se encontró el input o el contenedor en el HTML");
        return;
    }

    const query = input.value.trim();
    if (!query) {
        contenedor.innerHTML = `<div style="padding:10px; background:#fff3cd;">⚠️ Escribe algo para buscar.</div>`;
        return;
    }

    contenedor.innerHTML = `<p style="color:#666;">Buscando...</p>`;

    try {
        // Intenta obtener la lista de alumnos
        const res = await fetch('/api/alumnos');
        const data = await res.json();
        
        // Si data es un array o viene dentro de una propiedad
        const lista = Array.isArray(data) ? data : (data.alumnos || data.registros || []);

        const normalizar = s => s ? s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
        const qNorm = normalizar(query);

        const encontrado = lista.find(a => {
            const txt = normalizar(JSON.stringify(a));
            return txt.includes(qNorm);
        });

        if (encontrado) {
            contenedor.innerHTML = `
                <div style="background: #e8f4f8; border-left: 4px solid #1b2680; padding: 12px; border-radius: 6px; margin-top: 10px;">
                    <strong style="color: #1b2680; font-size: 15px;">👤 ${encontrado.nombre || encontrado.alumno || 'Registro Encontrado'}</strong>
                    <p style="margin: 4px 0 0 0; font-size: 13px;"><strong>Detalles:</strong> ${encontrado.grado || ''} ${encontrado.grupo || ''} - Tutor: ${encontrado.tutor || encontrado.tutorNombre || 'N/A'}</p>
                </div>`;
        } else {
            contenedor.innerHTML = `<div style="padding:10px; background:#f8d7da; color:#721c24; margin-top:10px;">❌ No se encontró nada con: "<strong>${query}</strong>"</div>`;
        }
    } catch (err) {
        alert("Error de red o API: " + err.message);
        contenedor.innerHTML = `<div style="padding:10px; background:#f8d7da; color:#721c24; margin-top:10px;">🚨 Error: ${err.message}</div>`;
    }
}
}
