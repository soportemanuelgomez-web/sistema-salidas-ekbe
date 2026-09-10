const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// -------------------------------------------------------------
// BÚSQUEDA INTELIGENTE DE ARCHIVOS (RESUELVE RUTAS AUTOMÁTICAMENTE)
// -------------------------------------------------------------
function encontrarArchivo(nombreArchivo) {
    const rutasPosibles = [
        path.join(__dirname, nombreArchivo),                     // Misma carpeta que server.js
        path.join(__dirname, 'server', nombreArchivo),             // Subcarpeta server
        path.join(process.cwd(), nombreArchivo),                  // Raíz de ejecución
        path.join(process.cwd(), 'server', nombreArchivo)          // Raíz/server
    ];
    for (const r of rutasPosibles) {
        if (fs.existsSync(r)) return r;
    }
    return path.join(__dirname, nombreArchivo);
}

const DATA_FILE = encontrarArchivo('data.json');
const TUTORES_FILE = encontrarArchivo('tutores.json');

// Servir la carpeta public (HTML, CSS, JS)
const RUTA_PUBLIC = fs.existsSync(path.join(__dirname, '..', 'public'))
    ? path.join(__dirname, '..', 'public')
    : fs.existsSync(path.join(__dirname, 'public'))
        ? path.join(__dirname, 'public')
        : path.join(process.cwd(), 'public');

app.use(express.static(RUTA_PUBLIC));

// -------------------------------------------------------------
// FUNCIONES AUXILIARES DE LECTURA Y ESCRITURA
// -------------------------------------------------------------
function cargarDatos() {
    if (!fs.existsSync(DATA_FILE)) {
        console.log("⚠️ Archivo data.json no encontrado en:", DATA_FILE);
        return { cicloEscolar: "2026-2027", alumnos: [], tutores: [], historial: [], listaVoceo: [], alertasCustodia: [] };
    }
    
    try {
        const contenido = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        if (Array.isArray(contenido)) {
            return {
                cicloEscolar: '2026-2027',
                alumnos: contenido,
                tutores: [],
                historial: [],
                listaVoceo: [],
                alertasCustodia: []
            };
        }
        return contenido;
    } catch (e) {
        console.error("Error al leer data.json:", e);
        return { cicloEscolar: "2026-2027", alumnos: [], tutores: [], historial: [], listaVoceo: [], alertasCustodia: [] };
    }
}

function cargarTutores() {
    if (!fs.existsSync(TUTORES_FILE)) return [];
    try {
        const contenido = JSON.parse(fs.readFileSync(TUTORES_FILE, 'utf-8'));
        return Array.isArray(contenido) ? contenido : (contenido.tutores || []);
    } catch (e) {
        console.error("Error al leer tutores.json:", e);
        return [];
    }
}

function guardarDatos(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Cruza alumnos de data.json con tutores de tutores.json
function obtenerDatosEnriquecidos() {
    const data = cargarDatos();
    const tutores = cargarTutores();
    const alumnos = data.alumnos || [];

    const baseCompleta = alumnos.map(alu => {
        const aluId = (alu.id || alu.codigo || alu.CODIGO || '').toString().trim();
        const aluTutorId = (alu.tutorId || alu.idFamilia || '').toString().trim();

        const tutorObj = tutores.find(t => {
            if (!t) return false;
            const tId = (t.id || '').toString().trim();
            const tAluId = (t.alumnoId || '').toString().trim();

            return (aluTutorId && tId === aluTutorId) || 
                   (aluId && tAluId === aluId) ||
                   (aluId && tId === aluId);
        });

        let nombreTut = '';
        if (tutorObj) {
            nombreTut = tutorObj.nombre || tutorObj.madre || tutorObj.padre || tutorObj.tutorNombre || tutorObj.nombreTutor || '';
        }
        if (!nombreTut) {
            nombreTut = alu.tutor || alu.tutorResponsable || alu.nombreTutor || alu.madre || alu.padre || '';
        }

        return {
            ...alu,
            tutor: nombreTut,
            tutorNombre: nombreTut,
            nombreTutor: nombreTut,
            tutorResponsable: nombreTut
        };
    });

    return { alumnos: baseCompleta, tutores: tutores, cicloEscolar: data.cicloEscolar };
}

// -------------------------------------------------------------
// API: CONFIGURACIÓN Y CONFIGURACIÓN GLOBAL
// -------------------------------------------------------------
app.get('/api/config/ciclo', (req, res) => {
    const data = cargarDatos();
    res.json({ cicloEscolar: data.cicloEscolar || '2026-2027' });
});

app.post('/api/config/ciclo', (req, res) => {
    const { cicloEscolar } = req.body;
    if (!cicloEscolar) {
        return res.status(400).json({ error: 'El ciclo escolar es requerido' });
    }
    const data = cargarDatos();
    data.cicloEscolar = cicloEscolar.trim();
    guardarDatos(data);
    res.json({ success: true, cicloEscolar: data.cicloEscolar });
});

// -------------------------------------------------------------
// API: SINCRONIZACIÓN EN TIEMPO REAL
// -------------------------------------------------------------
app.get('/api/sync', (req, res) => {
    const data = cargarDatos();
    const hoyStr = new Date().toISOString().split('T')[0];

    const entregadosHoySet = new Set(
        (data.historial || [])
            .filter(h => h.fecha === hoyStr)
            .map(h => h.alumnoNombre)
    );

    const voceoActivo = (data.listaVoceo || []).filter(item => !entregadosHoySet.has(item.alumnoNombre));

    res.json({
        cicloEscolar: data.cicloEscolar,
        listaVoceo: voceoActivo,
        historial: data.historial || []
    });
});

// -------------------------------------------------------------
// API: BÚSQUEDA DE FAMILIA
// -------------------------------------------------------------
app.post('/api/buscar-familia', (req, res) => {
    const { tutorId, fecha } = req.body;
    const data = cargarDatos();
    const tutores = cargarTutores();
    const hoyStr = fecha || new Date().toISOString().split('T')[0];

    if (!tutorId) {
        return res.status(400).json({ error: 'Código o ID de tutor requerido' });
    }

    const query = tutorId.trim().toLowerCase();

    const tutorObj = tutores.find(t => t.id && t.id.toLowerCase() === query) || {
        id: tutorId.toUpperCase(),
        nombre: 'Familia / Tutor Registrado'
    };

    let alumnosFamilia = (data.alumnos || []).filter(a => 
        (a.tutorId && a.tutorId.toLowerCase() === query) ||
        (a.id && a.id.toString().toLowerCase() === query)
    );

    if (alumnosFamilia.length === 0) {
        const alumnoEspecifico = (data.alumnos || []).find(a => a.id && a.id.toString().toLowerCase() === query);
        if (alumnoEspecifico && alumnoEspecifico.tutorId) {
            alumnosFamilia = (data.alumnos || []).filter(a => a.tutorId === alumnoEspecifico.tutorId);
        }
    }

    if (alumnosFamilia.length === 0) {
        return res.status(404).json({ error: 'No se encontraron alumnos asociados a este código.' });
    }

    const entregasHoy = (data.historial || []).filter(h => h.fecha === hoyStr);

    const alumnosConEstado = alumnosFamilia.map(alu => {
        const registroEntrega = entregasHoy.find(h => h.alumnoNombre === alu.nombre);
        return {
            id: alu.id,
            nombre: alu.nombre,
            nivel: alu.nivel || '',
            grado: alu.grado || '',
            grupo: alu.grupo || '',
            tutorId: alu.tutorId || tutorObj.id,
            tutor: alu.tutor || alu.tutorNombre || alu.tutorPrincipal || alu.tutorResponsable || '', // 👈 Mapeamos el tutor del alumno
            personaExtra: alu.personaExtra || alu.personaAutorizadaExtra || alu.autorizados || '',
            alerta: alu.alerta || alu.alertaCustodia || alu.alertaDeCustodia || null,
            entregadoHoy: !!registroEntrega,
            horaEntrega: registroEntrega ? registroEntrega.hora : null,
            puertaEntrega: registroEntrega ? registroEntrega.puerta : null
        };
    });

    const alertas = (data.alertasCustodia || []).filter(a => 
        a.tutorId && a.tutorId.toLowerCase() === tutorObj.id.toLowerCase() && a.bloquear
    );

    const alertaGlobal = alumnosConEstado.find(a => a.alerta && a.alerta.trim() !== '')?.alerta || null;

    // Obtener el tutor del primer alumno si tutorObj no lo tiene definido bien
    const primerTutor = alumnosConEstado.find(a => a.tutor && a.tutor.trim() !== '')?.tutor;
    const tutorNombreFinal = (tutorObj.nombre && tutorObj.nombre !== 'Familia / Tutor Registrado') 
        ? tutorObj.nombre 
        : (primerTutor || 'Familia / Tutor Registrado');

    res.json({
        tutorId: tutorObj.id,
        tutorNombre: tutorNombreFinal, // 👈 Enviamos el nombre real
        tutor: tutorNombreFinal,
        alumnos: alumnosConEstado,
        alerta: alertaGlobal,
        alertasCustodia: alertas,
        cicloEscolar: data.cicloEscolar
    });
});

// -------------------------------------------------------------
// API: VOCEO DE FAMILIA
// -------------------------------------------------------------
app.post('/api/vocear-familia', (req, res) => {
    const { tutorId, alumnosSeleccionados, puerta } = req.body;
    const data = cargarDatos();
    const tutores = cargarTutores();

    if (!alumnosSeleccionados || !Array.isArray(alumnosSeleccionados) || alumnosSeleccionados.length === 0) {
        return res.status(400).json({ error: 'Debes seleccionar al menos un alumno.' });
    }

    const nuevasSolicitudes = [];

    alumnosSeleccionados.forEach(nombreAlumno => {
        const alumno = (data.alumnos || []).find(a => a.nombre === nombreAlumno);
        const tutor = tutores.find(t => t.id === tutorId) || 
                      tutores.find(t => t.id === (alumno ? alumno.tutorId : null));

        if (alumno) {
            const yaVoceado = (data.listaVoceo || []).some(item => item.alumnoNombre === alumno.nombre);
            
            if (!yaVoceado) {
                const solicitud = {
                    idSolicitud: 'VOC-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                    alumnoNombre: alumno.nombre,
                    nivel: alumno.nivel || 'N/A',
                    grado: alumno.grado || 'N/A',
                    grupo: alumno.grupo || 'N/A',
                    tutorId: tutorId || alumno.tutorId,
                    tutorNombre: tutor ? tutor.nombre : 'Tutor Registrado',
                    puerta: puerta || 'Puerta Secundaria',
                    estatus: 'PENDIENTE',
                    horaSolicitud: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };

                data.listaVoceo = data.listaVoceo || [];
                data.listaVoceo.push(solicitud);
                nuevasSolicitudes.push(solicitud);
            }
        }
    });

    guardarDatos(data);
    res.json({ success: true, voceados: nuevasSolicitudes });
});

// -------------------------------------------------------------
// API: ENTREGAR ALUMNO INDIVIDUAL
// -------------------------------------------------------------
app.post('/api/entregar-alumno-individual', (req, res) => {
    const { alumnoNombre, tutorNombre, tutorId, tipo, fecha, hora, puerta } = req.body;
    const data = cargarDatos();
    const hoyStr = fecha || new Date().toISOString().split('T')[0];

    const yaEntregado = (data.historial || []).some(h => h.fecha === hoyStr && h.alumnoNombre === alumnoNombre);

    if (!yaEntregado) {
        const aluInfo = (data.alumnos || []).find(a => a.nombre === alumnoNombre) || {};

        const nuevoRegistro = {
            id: Date.now(),
            fecha: hoyStr,
            hora: hora || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            alumnoNombre,
            nivel: aluInfo.nivel || 'N/A',
            grado: aluInfo.grado || 'N/A',
            grupo: aluInfo.grupo || 'N/A',
            tutorNombre: tutorNombre || 'Tutor Registrado',
            tutorId: tutorId || aluInfo.tutorId || 'N/A',
            puerta: puerta || 'General',
            tipo: tipo || 'Escáner QR'
        };

        data.historial = data.historial || [];
        data.historial.unshift(nuevoRegistro);
        data.listaVoceo = (data.listaVoceo || []).filter(v => v.alumnoNombre !== alumnoNombre);

        guardarDatos(data);
    }

    res.json({ success: true, mensaje: 'Entrega registrada correctamente.' });
});

// -------------------------------------------------------------
// API: CONSULTAS DE ALUMNOS Y TUTORES
// -------------------------------------------------------------
app.get('/data.json', (req, res) => {
    const datos = obtenerDatosEnriquecidos();
    res.json({ alumnos: datos.alumnos, tutores: datos.tutores });
});

app.get('/api/alumnos-completo', (req, res) => {
    const datos = obtenerDatosEnriquecidos();
    res.json({ alumnos: datos.alumnos, tutores: datos.tutores });
});

app.get('/api/alumnos', (req, res) => {
    const datos = obtenerDatosEnriquecidos();
    res.json(datos.alumnos);
});

// -------------------------------------------------------------
// API: BÚSQUEDA GENERAL
// -------------------------------------------------------------
app.get('/api/buscar-general', (req, res) => {
    const { q } = req.query;
    if (!q) return res.json({ resultados: [] });

    const query = q.trim().toLowerCase();
    const data = cargarDatos();
    const tutores = cargarTutores();

    const familiasMap = new Map();

    (data.alumnos || []).forEach(alu => {
        const coincideAlumno = alu.nombre && (alu.nombre.toLowerCase().includes(query) || 
                                              (alu.id && alu.id.toString().toLowerCase().includes(query)));
        const coincideTutorId = alu.tutorId && alu.tutorId.toLowerCase().includes(query);

        if (coincideAlumno || coincideTutorId) {
            const code = alu.tutorId;
            if (!familiasMap.has(code)) {
                const tutorObj = tutores.find(t => t.id === code);
                
                let nombreTut = 'Tutor Registrado';
                if (tutorObj) {
                    nombreTut = tutorObj.nombre || tutorObj.madre || tutorObj.padre || 'Tutor Registrado';
                }

                familiasMap.set(code, {
                    tutorId: code,
                    tutorNombre: nombreTut,
                    alumnos: []
                });
            }
        }
    });

    tutores.forEach(tut => {
        const tutNombre = tut.nombre || tut.madre || tut.padre || '';
        if (tutNombre && (tutNombre.toLowerCase().includes(query) || (tut.id && tut.id.toLowerCase().includes(query)))) {
            if (!familiasMap.has(tut.id)) {
                familiasMap.set(tut.id, {
                    tutorId: tut.id,
                    tutorNombre: tutNombre || 'Tutor Registrado',
                    alumnos: []
                });
            }
        }
    });

    familiasMap.forEach((fam, code) => {
        const hermanos = (data.alumnos || []).filter(a => a.tutorId === code);
        const alumnosUnicos = [];
        const nombresVistos = new Set();

        hermanos.forEach(h => {
            if (!h || !h.nombre) return;
            const nombreLimpio = h.nombre.trim().toUpperCase();

            if (!nombresVistos.has(nombreLimpio)) {
                nombresVistos.add(nombreLimpio);

                let nivelLimpio = (h.nivel || '').trim();
                let gradoLimpio = (h.grado || '').trim();

                if (gradoLimpio.toUpperCase().includes(nivelLimpio.toUpperCase())) {
                    nivelLimpio = '';
                }

                alumnosUnicos.push({
                    id: h.id,
                    nombre: h.nombre.trim(),
                    nivel: nivelLimpio,
                    grado: gradoLimpio,
                    grupo: h.grupo || '',
                    personaExtra: h.personaExtra || h.personaAutorizadaExtra || ''
                });
            }
        });

        fam.alumnos = alumnosUnicos;
    });

    res.json({ resultados: Array.from(familiasMap.values()) });
});

// -------------------------------------------------------------
// API: REGISTRO, CUSTODIA, MIGRACIÓN Y LIMPIEZA
// -------------------------------------------------------------
// ==========================================================
// REGISTRO DE ALUMNOS (CON VINCULACIÓN Y TUTOR EN DATA.JSON)
// ==========================================================
app.post('/api/registrar', (req, res) => {
    try {
        let data = cargarDatos();
        data.tutores = data.tutores || [];
        data.alumnos = data.alumnos || [];

        // Soporta tanto las variables anteriores como las nuevas
        const { nombre, nivel, grado, grupo, tutorNombre, tutorPrincipal, tutorExistenteId, codigoFamiliar, personaAutorizadaExtra, personaExtra } = req.body;
        
        const nombreLimpio = (nombre || '').toString().trim().toUpperCase();
        const tutorNombreFinal = (tutorNombre || tutorPrincipal || '').toString().trim().toUpperCase();
        const idTutorElegido = (tutorExistenteId || codigoFamiliar || '').toString().trim().toUpperCase();
        const autorizadosFinal = (personaAutorizadaExtra || personaExtra || '').toString().trim().toUpperCase();

        if (!nombreLimpio) {
            return res.status(400).json({ error: 'El nombre del alumno es obligatorio' });
        }

        let codigoUnicoFamilia = idTutorElegido;

        // 1. Si eligió un tutor del desplegable
        if (codigoUnicoFamilia && codigoUnicoFamilia !== 'NUEVO') {
            const tutorEncontrado = data.tutores.find(t => t.id && t.id.trim().toUpperCase() === codigoUnicoFamilia);
            if (tutorEncontrado) codigoUnicoFamilia = tutorEncontrado.id;
        } else {
            codigoUnicoFamilia = "";
        }

        // 2. Si no seleccionó desplegable pero escribió el nombre de un tutor existente (Hermanos)
        if (!codigoUnicoFamilia && tutorNombreFinal) {
            const tutorPorNombre = data.tutores.find(t => {
                const nom = (t.nombre || t.madre || t.padre || '').toString().trim().toUpperCase();
                return nom.length > 3 && (nom === tutorNombreFinal || nom.includes(tutorNombreFinal) || tutorNombreFinal.includes(nom));
            });
            if (tutorPorNombre) codigoUnicoFamilia = tutorPorNombre.id;
        }

        // 3. Si es una familia nueva, generar código FAM_XXXXXX
        if (!codigoUnicoFamilia || !codigoUnicoFamilia.startsWith('FAM_')) {
            codigoUnicoFamilia = `FAM_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        }

        // 4. Registrar la familia en la lista de tutores si no existe
        if (tutorNombreFinal && !data.tutores.some(t => t.id === codigoUnicoFamilia)) {
            data.tutores.push({
                id: codigoUnicoFamilia,
                tutorId: codigoUnicoFamilia,
                nombre: tutorNombreFinal,
                madre: tutorNombreFinal
            });
        }

        // 5. Crear/Actualizar alumno GUARDANDO EL NOMBRE DEL TUTOR DIRECTO EN DATA.JSON
        const indexExistente = data.alumnos.findIndex(a => {
            const nom = (a.nombre || a.nombreAlumno || '').toString().trim().toUpperCase();
            return nom === nombreLimpio;
        });

        const datosAlumno = {
            id: indexExistente !== -1 ? data.alumnos[indexExistente].id : `ALU_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            nombre: nombreLimpio,
            nombreAlumno: nombreLimpio,
            nivel: (nivel || '').toUpperCase(),
            grado: (grado || '').toUpperCase(),
            grupo: (grupo || '').toUpperCase(),
            tutorId: codigoUnicoFamilia,
            idFamilia: codigoUnicoFamilia,
            // ⚡ CLAVE: ESTAMPA DIRECTA DEL NOMBRE DEL TUTOR DENTRO DE DATA.JSON
            tutorPrincipal: tutorNombreFinal,
            tutorNombre: tutorNombreFinal,
            tutor: tutorNombreFinal,
            personaExtra: autorizadosFinal,
            alerta: indexExistente !== -1 ? (data.alumnos[indexExistente].alerta || '') : ''
        };

        if (indexExistente !== -1) {
            data.alumnos[indexExistente] = { ...data.alumnos[indexExistente], ...datosAlumno };
        } else {
            data.alumnos.push(datosAlumno);
        }

        // Guardar todo en data.json
        guardarDatos(data);

        return res.json({ 
            status: 'ok',
            success: true, 
            mensaje: `🎉 ¡Alumno guardado con éxito! Vinculado al código: ${codigoUnicoFamilia}`,
            tutorId: codigoUnicoFamilia 
        });

    } catch (error) {
        console.error("❌ Error al registrar en data.json:", error);
        return res.status(500).json({ error: "Error al escribir en data.json" });
    }
});

app.post('/api/gestionar-bloqueo-tutor', (req, res) => {
    const data = cargarDatos();
    const { tutorId, nombrePersona, motivo, bloquear } = req.body;

    data.alertasCustodia = data.alertasCustodia || [];
    data.alertasCustodia.push({
        tutorId,
        nombre: nombrePersona,
        motivo,
        bloquear,
        fecha: new Date().toISOString()
    });

    guardarDatos(data);
    res.json({ success: true });
});

app.post('/api/migrar-grupo', (req, res) => {
    const { gradoOrigen, grupoOrigen, gradoDestino, grupoDestino } = req.body;
    const data = cargarDatos();

    let afectaciones = 0;
    (data.alumnos || []).forEach(alu => {
        if (alu.grado === gradoOrigen && alu.grupo === grupoOrigen) {
            alu.grado = gradoDestino;
            alu.grupo = grupoDestino;
            afectaciones++;
        }
    });

    guardarDatos(data);
    res.json({ success: true, afectaciones });
});

app.post('/api/limpiar-historial-dias', (req, res) => {
    const { dias } = req.body;
    const data = cargarDatos();
    const limiteMs = Date.now() - (dias * 24 * 60 * 60 * 1000);

    const totalInicial = (data.historial || []).length;
    data.historial = (data.historial || []).filter(h => new Date(h.fecha).getTime() >= limiteMs);

    guardarDatos(data);
    res.json({ success: true, borrados: totalInicial - data.historial.length });
});

app.post('/api/vaciar-historial-completo', (req, res) => {
    const data = cargarDatos();
    data.historial = [];
    guardarDatos(data);
    res.json({ success: true });
});

app.post('/api/admin/vaciar-base-datos', (req, res) => {
    const { password } = req.body;
    
    if (password !== 'ADMIN123') {
        return res.status(403).json({ error: 'Clave de seguridad incorrecta' });
    }

    const data = cargarDatos();
    data.alumnos = [];
    data.tutores = [];
    data.alertasCustodia = [];
    data.listaVoceo = [];
    
    guardarDatos(data);
    res.json({ success: true, mensaje: 'Base de datos vaciada con éxito.' });
});

app.post('/api/guardar-alumno', (req, res) => {
    try {
        const alumnoEditado = req.body;
        let data = cargarDatos();
        let lista = data.alumnos || [];

        const index = lista.findIndex(a => 
            (a.codigo && a.codigo == alumnoEditado.codigo) || 
            (a.id && a.id == alumnoEditado.id) ||
            (a.nombre && a.nombre == alumnoEditado.nombre)
        );

        if (index !== -1) {
            lista[index] = { ...lista[index], ...alumnoEditado };
        } else {
            lista.push(alumnoEditado);
        }

        data.alumnos = lista;
        guardarDatos(data);
        res.json({ status: "success", mensaje: "Guardado en servidor central" });

    } catch (err) {
        res.status(500).json({ error: "Error al guardar en el servidor" });
    }
});

// ==========================================================
// BÚSQUEDA CENTRAL EN TIEMPO REAL (TUTOR RESPONSABLE OFICIAL)
// ==========================================================
app.get('/api/buscar-alumno-servidor', (req, res) => {
    try {
        const fs = require('fs');
        const query = (req.query.q || '').trim().toLowerCase();

        if (!query) return res.json({ status: 'error', mensaje: 'Consulta vacía' });

        const rutaData = typeof DATA_FILE !== 'undefined' ? DATA_FILE : 'data.json';
        const rutaTutores = typeof TUTORES_FILE !== 'undefined' ? TUTORES_FILE : 'tutores.json';

        const rawData = fs.existsSync(rutaData) ? JSON.parse(fs.readFileSync(rutaData, 'utf-8')) : [];
        const rawTutores = fs.existsSync(rutaTutores) ? JSON.parse(fs.readFileSync(rutaTutores, 'utf-8')) : [];

        // 1. Obtener listas
        let alumnos = [];
        let tutoresEnData = [];

        if (Array.isArray(rawData)) {
            alumnos = rawData;
        } else if (rawData && typeof rawData === 'object') {
            alumnos = rawData.alumnos || rawData.data || rawData.estudiantes || [];
            tutoresEnData = rawData.tutores || rawData.familias || [];
        }

        // 2. Encontrar al alumno
        const alumno = alumnos.find(a => JSON.stringify(a).toLowerCase().includes(query));

        if (!alumno) {
            return res.json({ status: 'not_found' });
        }

        // 3. ID de la familia / tutor
        let idBusc = (alumno.tutorId || alumno.idFamilia || alumno.tutorExistenteId || alumno.idTutor || "").toString().trim();

        // 4. Consolidar lista de tutores/familias
        let listaTutores = [];
        if (Array.isArray(rawTutores)) listaTutores = listaTutores.concat(rawTutores);
        else if (rawTutores && typeof rawTutores === 'object') {
            if (Array.isArray(rawTutores.tutores)) listaTutores = listaTutores.concat(rawTutores.tutores);
            else if (Array.isArray(rawTutores.familias)) listaTutores = listaTutores.concat(rawTutores.familias);
            else listaTutores = listaTutores.concat(Object.values(rawTutores));
        }
        if (Array.isArray(tutoresEnData)) listaTutores = listaTutores.concat(tutoresEnData);

        // 5. Buscar coincidencia por idFamilia / tutorId (ignorando usuarios clave como MASTER_KEY)
        let tutorObj = listaTutores.find(t => {
            if (!t || typeof t !== 'object') return false;
            let tId = (t.id || t.idTutor || t.idFamilia || t.codigo || t.tutorId || t.key || "").toString().trim();
            return tId && tId === idBusc && t.nombre !== 'MASTER_KEY';
        });

        // 6. Obtener el nombre del Tutor Responsable (NUNCA usa personaExtra)
        let nombreTutorFinal = "";

        if (tutorObj && typeof tutorObj === 'object') {
            nombreTutorFinal = tutorObj.nombre || tutorObj.nombreCompleto || tutorObj.tutorNombre || tutorObj.nombreTutor || tutorObj.madre || tutorObj.tutorResponsable || "";
        }

        // Si no está en el listado de familias, busca en los campos de tutor del propio alumno
        if (!nombreTutorFinal) {
            nombreTutorFinal = alumno.tutorPrincipal || 
                               alumno.tutorResponsable || 
                               alumno.madre || 
                               alumno.tutorNombre || 
                               alumno.tutor || "";
        }

        // 7. Responder con la ficha limpia
        res.json({
            status: 'ok',
            alumno: {
                ...alumno,
                tutorNombreCompleto: nombreTutorFinal
            }
        });
    } catch (e) {
        console.error("Error en búsqueda central:", e);
        res.status(500).json({ status: 'error', mensaje: e.message });
    }
});

// ==========================================================
// REPARACIÓN AUTOMÁTICA EN LOTE (Pega el tutor a TODOS los alumnos)
// ==========================================================
app.get('/api/migrar-tutores-data', (req, res) => {
    try {
        const fs = require('fs');
        const rutaData = typeof DATA_FILE !== 'undefined' ? DATA_FILE : 'data.json';
        const rutaTutores = typeof TUTORES_FILE !== 'undefined' ? TUTORES_FILE : 'tutores.json';

        const rawData = fs.existsSync(rutaData) ? JSON.parse(fs.readFileSync(rutaData, 'utf-8')) : [];
        const rawTutores = fs.existsSync(rutaTutores) ? JSON.parse(fs.readFileSync(rutaTutores, 'utf-8')) : [];

        let alumnos = Array.isArray(rawData) ? rawData : (rawData.alumnos || rawData.data || []);
        let tutores = [];

        if (Array.isArray(rawTutores)) tutores = tutores.concat(rawTutores);
        else if (rawTutores && typeof rawTutores === 'object') {
            if (Array.isArray(rawTutores.tutores)) tutores = tutores.concat(rawTutores.tutores);
            else if (Array.isArray(rawTutores.familias)) tutores = tutores.concat(rawTutores.familias);
            else tutores = tutores.concat(Object.values(rawTutores));
        }

        if (rawData.tutores && Array.isArray(rawData.tutores)) {
            tutores = tutores.concat(rawData.tutores);
        }

        let actualizados = 0;

        // Recorrer a TODOS los alumnos del sistema de un solo golpe
        alumnos.forEach(alumno => {
            let idBusc = (alumno.tutorId || alumno.idFamilia || alumno.tutorExistenteId || alumno.idTutor || "").toString().trim();

            let tutorObj = tutores.find(t => {
                if (!t || typeof t !== 'object') return false;
                let tId = (t.id || t.idTutor || t.idFamilia || t.codigo || t.tutorId || "").toString().trim();
                return tId && tId === idBusc && t.nombre !== 'MASTER_KEY';
            });

            let nombreTutor = "";
            if (tutorObj) {
                nombreTutor = tutorObj.nombre || tutorObj.nombreCompleto || tutorObj.tutorNombre || tutorObj.madre || tutorObj.padre || "";
            }

            if (!nombreTutor) {
                nombreTutor = alumno.tutorPrincipal || alumno.tutorNombre || alumno.tutorResponsable || alumno.madre || "";
            }

            // Inyectar el nombre del tutor en todos los campos posibles de la ficha
            if (nombreTutor) {
                alumno.tutorPrincipal = nombreTutor;
                alumno.tutorNombre = nombreTutor;
                alumno.tutor = nombreTutor;
                alumno.tutorResponsable = nombreTutor;
                actualizados++;
            }
        });

        // Reconstruir y guardar data.json de un solo golpe
        const dataAGuardar = Array.isArray(rawData) ? alumnos : { ...rawData, alumnos: alumnos };
        fs.writeFileSync(rutaData, JSON.stringify(dataAGuardar, null, 2), 'utf-8');

        res.json({
            status: 'ok',
            mensaje: `🎉 ¡Éxito total! Se cruzaron y guardaron automáticamente ${actualizados} alumnos con sus tutores en data.json.`
        });
    } catch (e) {
        console.error("Error en migración masiva:", e);
        res.status(500).json({ status: 'error', mensaje: e.message });
    }
});

// -------------------------------------------------------------
// INICIALIZACIÓN DEL SERVIDOR
// -------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Servidor Ekbe corriendo en http://localhost:${PORT}`);
    console.log(`📁 Archivo data.json cargado desde: ${DATA_FILE}`);
    console.log(`📁 Archivo tutores.json cargado desde: ${TUTORES_FILE}`);
    console.log(`==================================================\n`);
});