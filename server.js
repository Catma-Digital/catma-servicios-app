const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Pool de conexiones optimizado (Cambiado a 127.0.0.1 según tu captura de phpMyAdmin)
const db = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'u742254071_catma_db_user',
    password: process.env.DB_PASSWORD || 'Catma:2026.',
    database: process.env.DB_NAME || 'u742254071_servicios_db',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Prueba inicial detallada del pool
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ ERROR CRÍTICO AL CONECTAR A LA BD:', err.message);
        return;
    }
    console.log('¡Conectado exitosamente al Pool de la base de datos!');
    connection.release();
});

// Configuración de Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|pdf|mp4|mov|avi/;
        if (filetypes.test(file.mimetype) && filetypes.test(path.extname(file.originalname).toLowerCase())) {
            return cb(null, true);
        }
        cb(new Error("Solo se permiten archivos de imagen, PDF o video."));
    }
});

// --- RUTA DE AUTENTICACIÓN: MODO DIAGNÓSTICO EXTREMO ---

app.post('/login', (req, res) => {
    const { nombre_usuario, password } = req.body;

    // 1. Validar si el frontend realmente está enviando los datos
    if (!nombre_usuario || !password) {
        return res.status(400).json({
            error: "Datos incompletos",
            mensaje: "El servidor Node.js recibió los datos en blanco.",
            body_recibido: req.body
        });
    }

    // 2. Buscar usando TRIM y LOWER para evitar errores de mayúsculas o espacios accidentales
    const query = 'SELECT * FROM usuarios WHERE LOWER(TRIM(nombre_usuario)) = LOWER(TRIM(?))';

    db.query(query, [nombre_usuario], async (err, results) => {
        if (err) {
            return res.status(500).json({
                error: 'Error interno de base de datos.',
                detalle: err.message
            });
        }

        // 3. Si no encuentra nada, devuelve exactamente qué fue lo que buscó
        if (!results || results.length === 0) {
            return res.status(401).json({
                error: 'Usuario no encontrado en la base de datos.',
                usuario_que_buscaste: nombre_usuario,
                datos_recibidos_del_frontend: req.body
            });
        }

        const usuario = results[0];

        // 4. Verificación de contraseña robusta
        let match = false;
        if (password === usuario.password_hash) {
            match = true; // Coincide en texto plano
        } else {
            try {
                match = await bcrypt.compare(password, usuario.password_hash);
            } catch (e) {
                match = false;
            }
        }

        if (!match) {
            return res.status(401).json({
                error: 'Contraseña incorrecta.',
                hash_en_db_detectado: usuario.password_hash
            });
        }

        // 5. ¡Éxito!
        res.json({ usuario: usuario.nombre_usuario, rol: usuario.rol });
    });
});

// --- RUTAS DE GESTIÓN DE USUARIOS ---

app.get('/obtener-usuarios', (req, res) => {
    db.query('SELECT id, nombre_usuario, rol FROM usuarios ORDER BY id ASC', (err, resultados) => {
        if (err) return res.status(500).send('Error al consultar usuarios.');
        res.json(resultados);
    });
});

app.post('/crear-usuario', async (req, res) => {
    const { nombre_usuario, password, rol } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        db.query('INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, ?)',
            [nombre_usuario, hash, rol], (err) => {
                if (err) return res.status(500).send('Error: El usuario ya existe.');
                res.send('¡Usuario creado exitosamente!');
            });
    } catch (e) { res.status(500).send('Error al procesar.'); }
});

app.put('/actualizar-usuario/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_usuario, password, rol } = req.body;

    if (password && password.trim() !== '') {
        const hash = await bcrypt.hash(password, 10);
        db.query('UPDATE usuarios SET nombre_usuario = ?, password_hash = ?, rol = ? WHERE id = ?',
            [nombre_usuario, hash, rol, id], (err) => {
                if (err) return res.status(500).send('Error al actualizar.');
                res.send('¡Usuario actualizado exitosamente!');
            });
    } else {
        db.query('UPDATE usuarios SET nombre_usuario = ?, rol = ? WHERE id = ?',
            [nombre_usuario, rol, id], (err) => {
                if (err) return res.status(500).send('Error al actualizar.');
                res.send('¡Usuario actualizado exitosamente!');
            });
    }
});

app.delete('/eliminar-usuario/:id', (req, res) => {
    db.query('DELETE FROM usuarios WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).send('Error al eliminar.');
        res.send('¡Usuario eliminado!');
    });
});

// --- RUTAS DE SERVICIOS ---

app.get('/obtener-servicios', (req, res) => {
    db.query('SELECT * FROM servicios_mantenimiento_completo ORDER BY id DESC', (err, resultados) => {
        if (err) return res.status(500).send('Error al consultar registros.');
        res.json(resultados);
    });
});

app.post('/guardar-servicio-completo', upload.array('evidencias', 10), (req, res) => {
    const {
        id_cliente, nombre, pedido, remision, poliza, modelo, serie,
        ubicacion, telefono, tipo_servicio, asesor, fecha_programado,
        fecha_confirmada, tecnico_asignado, estatus, fecha_realizado, observaciones
    } = req.body;

    let nombresArchivos = null;
    if (req.files && req.files.length > 0) {
        nombresArchivos = req.files.map(file => file.filename).join(',');
    }

    const query = `
        INSERT INTO servicios_mantenimiento_completo 
        (id_cliente, nombre, pedido, remision, poliza, modelo, serie, ubicacion, telefono, tipo_servicio, asesor, fecha_programado, fecha_confirmada, tecnico_asignado, estatus, fecha_realizado, observaciones, evidencia) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        id_cliente, nombre, pedido || null, remision || null, poliza || null,
        modelo || null, serie || null, ubicacion || null, telefono || null,
        tipo_servicio, asesor, fecha_programado || null, fecha_confirmada || null,
        tecnico_asignado || null, estatus, fecha_realizado || null, observaciones || null, nombresArchivos
    ];

    db.query(query, values, (err) => {
        if (err) {
            console.error('Error al guardar servicio:', err);
            return res.status(500).send('Error al guardar.');
        }
        res.send('¡Servicio registrado exitosamente con sus evidencias!');
    });
});

app.put('/actualizar-servicio/:id', upload.array('evidencias', 10), (req, res) => {
    const servicioId = req.params.id;
    const {
        id_cliente, nombre, pedido, remision, poliza, modelo, serie,
        ubicacion, telefono, tipo_servicio, asesor, fecha_programado,
        fecha_confirmada, tecnico_asignado, estatus, fecha_realizado, observaciones
    } = req.body;

    db.query('SELECT evidencia FROM servicios_mantenimiento_completo WHERE id = ?', [servicioId], (err, rows) => {
        if (err) {
            console.error('Error al consultar servicio:', err);
            return res.status(500).send('Error al actualizar.');
        }

        let evidenciasFinales = rows[0]?.evidencia || '';

        if (req.files && req.files.length > 0) {
            const nuevosArchivos = req.files.map(file => file.filename).join(',');
            evidenciasFinales = evidenciasFinales ? `${evidenciasFinales},${nuevosArchivos}` : nuevosArchivos;
        }

        const query = `
            UPDATE servicios_mantenimiento_completo 
            SET id_cliente = ?, nombre = ?, pedido = ?, remision = ?, poliza = ?, 
                modelo = ?, serie = ?, ubicacion = ?, telefono = ?, tipo_servicio = ?, 
                asesor = ?, fecha_programado = ?, fecha_confirmada = ?, 
                tecnico_asignado = ?, estatus = ?, fecha_realizado = ?, observaciones = ?, evidencia = ? 
            WHERE id = ?
        `;

        const values = [
            id_cliente, nombre, pedido || null, remision || null, poliza || null,
            modelo || null, serie || null, ubicacion || null, telefono || null,
            tipo_servicio, asesor, fecha_programado || null, fecha_confirmada || null,
            tecnico_asignado || null, estatus, fecha_realizado || null, observaciones || null,
            evidenciasFinales || null, servicioId
        ];

        db.query(query, values, (err2) => {
            if (err2) {
                console.error('Error al actualizar servicio:', err2);
                return res.status(500).send('Error al actualizar.');
            }
            res.send('¡Servicio actualizado exitosamente!');
        });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});