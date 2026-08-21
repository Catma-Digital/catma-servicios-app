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

// Conexión dinámica optimizada para Hostinger y desarrollo local
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'u742254071_catma_db_user',
    password: process.env.DB_PASSWORD || 'Catma:2026.',
    database: process.env.DB_NAME || 'u742254071_servicios_db'
});

db.connect((err) => {
    if (err) {
        console.error('Error al conectar a la BD:', err);
        return;
    }
    console.log('¡Conectado a la base de datos exitosamente!');
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
    limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB por archivo
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

// Inicialización de tabla usuarios y admin
db.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre_usuario VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        rol VARCHAR(20) DEFAULT 'colaborador'
    )
`, async (err) => {
    if (!err) {
        db.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', ['admin'], async (err, results) => {
            if (results.length === 0) {
                const hash = await bcrypt.hash('123456', 10);
                db.query('INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, ?)',
                    ['admin', hash, 'administrador'], () => {
                        console.log('¡Usuario administrador inicializado: admin / 123456!');
                    });
            }
        });
    }
});

// Verificar y asegurar la columna fecha_registro en la tabla de servicios
db.query(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'servicios_mantenimiento_completo' 
      AND COLUMN_NAME = 'fecha_registro'
`, (err, results) => {
    if (!err && results.length === 0) {
        db.query(`ALTER TABLE servicios_mantenimiento_completo ADD COLUMN fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, (alterErr) => {
            if (!alterErr) {
                console.log('¡Columna fecha_registro agregada exitosamente a servicios_mantenimiento_completo!');
            }
        });
    }
});

// Verificar y asegurar la columna evidencia en la tabla de servicios (Tipo TEXT para guardar múltiples nombres)
db.query(`
    SELECT COLUMN_NAME, DATA_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'servicios_mantenimiento_completo' 
      AND COLUMN_NAME = 'evidencia'
`, (err, results) => {
    if (!err && results.length === 0) {
        db.query(`ALTER TABLE servicios_mantenimiento_completo ADD COLUMN evidencia TEXT NULL`, (alterErr) => {
            if (!alterErr) {
                console.log('¡Columna evidencia agregada exitosamente a servicios_mantenimiento_completo!');
            }
        });
    }
});

// --- RUTAS DE AUTENTICACIÓN ---

app.post('/login', (req, res) => {
    const { nombre_usuario, password } = req.body;
    db.query('SELECT * FROM usuarios WHERE nombre_usuario = ?', [nombre_usuario], async (err, results) => {
        if (err || results.length === 0) return res.status(401).send('Usuario no encontrado.');
        const usuario = results[0];
        const match = await bcrypt.compare(password, usuario.password_hash);
        if (!match) return res.status(401).send('Contraseña incorrecta.');
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
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});