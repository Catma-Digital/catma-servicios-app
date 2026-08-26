const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

// AUTO-CREACIÓN DE EMERGENCIA: Asegura que el usuario admin siempre exista en la BD remota
db.getConnection(async (err, connection) => {
    if (err) {
        console.error('❌ ERROR AL CONECTAR A LA BD:', err.message);
        return;
    }
    console.log('¡Conectado exitosamente a la base de datos!');

    // Verificamos e insertamos el usuario admin por defecto si la tabla está vacía
    const hashedPassword = await bcrypt.hash('admin123', 10);
    connection.query(
        'INSERT IGNORE INTO usuarios (id, nombre_usuario, password_hash, rol) VALUES (1, "admin", ?, "administrador")',
        [hashedPassword],
        (insertErr) => {
            if (!insertErr) console.log('✔ Usuario administrador verificado/creado en la base de datos.');
            connection.release();
        }
    );
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- RUTA DE LOGIN BLINDADA ---
app.post('/login', (req, res) => {
    const { nombre_usuario, password } = req.body;
    console.log('[LOGIN INTENTO]:', nombre_usuario);

    const query = 'SELECT * FROM usuarios WHERE LOWER(TRIM(nombre_usuario)) = LOWER(TRIM(?))';
    db.query(query, [nombre_usuario], async (err, results) => {
        if (err) {
            return res.status(500).send('Error interno de base de datos.');
        }

        if (!results || results.length === 0) {
            return res.status(401).send('Usuario no encontrado.');
        }

        const usuario = results[0];
        const storedHash = usuario.password_hash || usuario.password || '';

        let match = false;
        if (password === storedHash) {
            match = true;
        } else {
            try {
                match = await bcrypt.compare(password, storedHash);
            } catch (e) {
                match = false;
            }
        }

        if (!match) {
            return res.status(401).send('Contraseña incorrecta.');
        }

        res.json({
            usuario: usuario.nombre_usuario || 'admin',
            rol: usuario.rol || 'administrador'
        });
    });
});

// --- RUTAS DE USUARIOS Y SERVICIOS ---
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

    let nombresArchivos = req.files && req.files.length > 0 ? req.files.map(f => f.filename).join(',') : null;

    const query = `
        INSERT INTO servicios_mantenimiento_completo 
        (id_cliente, nombre, pedido, remision, poliza, modelo, serie, ubicacion, telefono, tipo_servicio, asesor, fecha_programado, fecha_confirmada, tecnico_asignado, estatus, fecha_realizado, observaciones, evidencia) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(query, [
        id_cliente, nombre, pedido || null, remision || null, poliza || null,
        modelo || null, serie || null, ubicacion || null, telefono || null,
        tipo_servicio, asesor, fecha_programado || null, fecha_confirmada || null,
        tecnico_asignado || null, estatus, fecha_realizado || null, observaciones || null, nombresArchivos
    ], (err) => {
        if (err) return res.status(500).send('Error al guardar.');
        res.send('¡Servicio registrado exitosamente!');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});