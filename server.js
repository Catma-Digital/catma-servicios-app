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

// Pool de conexiones optimizado para Hostinger (evita que la conexión muera por inactividad)
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Prueba inicial del pool
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error al conectar al Pool de la BD:', err);
        return;
    }
    console.log('¡Conectado al Pool de la base de datos exitosamente!');
    connection.release();
});

// Configuración de Multer para guardar archivos de evidencias (múltiples)
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
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Solo se permiten archivos de imagen, PDF o video."));
    }
});

// --- RUTA DE AUTENTICACIÓN ROBUSTA ---

app.post('/login', (req, res) => {
    console.log('[BODY RECIBIDO]:', req.body);
    const { nombre_usuario, password } = req.body;

    db.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', [nombre_usuario], async (err, results) => {
        if (err) {
            console.error('[LOGIN ERROR DB]:', err);
            return res.status(500).send('Error de base de datos.');
        }
        console.log('[LOGIN DB] Resultados obtenidos:', results);

        if (!results || results.length === 0) {
            console.log('[LOGIN] Usuario no encontrado en el resultado de la consulta.');
            return res.status(401).send('Usuario no encontrado.');
        }

        const usuario = results[0];

        // Verificación de contraseña compatible con texto plano y bcrypt
        let match = false;
        if (password === usuario.password_hash) {
            match = true;
        } else {
            try {
                match = await bcrypt.compare(password, usuario.password_hash);
            } catch (e) {
                match = false;
            }
        }

        if (!match) {
            console.log('[LOGIN] Contraseña incorrecta.');
            return res.status(401).send('Contraseña incorrecta.');
        }

        console.log('[LOGIN EXITOSO]');
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