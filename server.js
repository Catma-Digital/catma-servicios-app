const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servimos archivos estáticos y la carpeta de subidas de evidencias
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

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

// Verificación y creación automática del admin por defecto
db.getConnection(async (err, connection) => {
    if (err) {
        console.error('❌ ERROR BD:', err.message);
        return;
    }
    try {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        connection.query(
            'INSERT IGNORE INTO usuarios (id, nombre_usuario, password_hash, rol) VALUES (1, "admin", ?, "admin")',
            [hashedPassword],
            (insertErr) => {
                if (!insertErr) console.log('✔ Usuario admin verificado en la BD.');
                connection.release();
            }
        );
    } catch (hashErr) {
        console.error('❌ Error al generar hash:', hashErr);
        connection.release();
    }
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

// --- RUTA LOGIN (DEVUELVE EL ARCHIVO FÍSICO login.html) ---
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- RUTA POST PARA AUTENTICACIÓN ---
app.post('/login-post', (req, res) => {
    const { nombre_usuario, password } = req.body;
    const query = 'SELECT * FROM usuarios WHERE LOWER(TRIM(nombre_usuario)) = LOWER(TRIM(?))';

    db.query(query, [nombre_usuario], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Error interno de base de datos.' });
        if (!results || results.length === 0) return res.status(401).json({ error: 'Usuario no encontrado en la BD.' });

        const usuario = results[0];
        const storedHash = usuario.password_hash || usuario.password || '';
        let match = (password === storedHash);
        if (!match) {
            try { match = await bcrypt.compare(password, storedHash); } catch (e) { match = false; }
        }

        if (!match) return res.status(401).json({ error: 'Contraseña incorrecta.' });

        res.json({ usuario: usuario.nombre_usuario, rol: usuario.rol || 'colaborador' });
    });
});

// --- RUTA PRINCIPAL (DASHBOARD) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- OBTENER SERVICIOS ---
app.get('/obtener-servicios', (req, res) => {
    db.query('SELECT * FROM servicios ORDER BY id DESC', (err, resultados) => {
        if (err) {
            console.error('Error al consultar servicios:', err);
            return res.status(500).json({ error: 'Error al consultar registros.' });
        }
        res.json(resultados);
    });
});

// --- GUARDAR SERVICIO COMPLETO ---
app.post('/guardar-servicio-completo', upload.array('evidencias'), (req, res) => {
    const {
        id_cliente, nombre, pedido, remision, modelo, serie, poliza,
        telefono, ubicacion, tipo_servicio, asesor, tecnico_asignado,
        estatus, fecha_programado, fecha_confirmada,
        fecha_realizado, observaciones
    } = req.body;

    let nombresArchivos = '';
    if (req.files && req.files.length > 0) {
        nombresArchivos = req.files.map(f => f.filename).join(',');
    }

    const query = `
        INSERT INTO servicios (
            id_cliente, nombre, pedido, remision, modelo, serie, poliza,
            telefono, ubicacion, tipo_servicio, asesor, tecnico_asignado,
            estatus, fecha_servicio_programado, fecha_confirmada,
            fecha_servicio_realizado, evidencia, observaciones
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
        id_cliente || '', nombre || '', pedido || '', remision || '',
        modelo || '', serie || '', poliza || '', telefono || '',
        ubicacion || '', tipo_servicio || '', asesor || '',
        tecnico_asignado || '', estatus || 'Proceso',
        fecha_programado || null, fecha_confirmada || null,
        fecha_realizado || null, nombresArchivos, observaciones || ''
    ];

    db.query(query, values, (err, resultado) => {
        if (err) {
            console.error('Error al guardar servicio:', err);
            return res.status(500).json({ error: 'SQL Error: ' + err.message });
        }
        res.json({ success: true, message: 'Registro guardado correctamente', id: resultado.insertId });
    });
});

// --- ACTUALIZAR SERVICIO ---
app.put('/actualizar-servicio/:id', upload.array('evidencias'), (req, res) => {
    const servicioId = req.params.id;
    const {
        id_cliente, nombre, pedido, remision, modelo, serie, poliza,
        telefono, ubicacion, tipo_servicio, asesor, tecnico_asignado,
        estatus, fecha_programado, fecha_confirmada,
        fecha_realizado, observaciones
    } = req.body;

    db.query('SELECT evidencia FROM servicios WHERE id = ?', [servicioId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error al buscar el servicio.' });

        let archivosFinales = rows.length > 0 ? (rows[0].evidencia || '') : '';
        if (req.files && req.files.length > 0) {
            const nuevosNombres = req.files.map(f => f.filename).join(',');
            archivosFinales = archivosFinales ? archivosFinales + ',' + nuevosNombres : nuevosNombres;
        }

        const query = `
            UPDATE servicios SET 
                id_cliente = ?, nombre = ?, pedido = ?, remision = ?, modelo = ?, 
                serie = ?, poliza = ?, telefono = ?, ubicacion = ?, tipo_servicio = ?, 
                asesor = ?, tecnico_asignado = ?, estatus = ?, fecha_servicio_programado = ?, 
                fecha_confirmada = ?, fecha_servicio_realizado = ?, evidencia = ?, observaciones = ?
            WHERE id = ?
        `;

        const values = [
            id_cliente || '', nombre || '', pedido || '', remision || '',
            modelo || '', serie || '', poliza || '', telefono || '',
            ubicacion || '', tipo_servicio || '', asesor || '',
            tecnico_asignado || '', estatus || 'Proceso',
            fecha_programado || null, fecha_confirmada || null,
            fecha_realizado || null, archivosFinales, observaciones || '', servicioId
        ];

        db.query(query, values, (updateErr) => {
            if (updateErr) {
                console.error('Error al actualizar servicio:', updateErr);
                return res.status(500).json({ error: 'SQL Error: ' + updateErr.message });
            }
            res.json({ success: true, message: 'Registro actualizado correctamente' });
        });
    });
});

// --- GESTIÓN DE USUARIOS (CRUD) ---
app.get('/obtener-usuarios', (req, res) => {
    db.query('SELECT id, nombre_usuario, rol FROM usuarios ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener usuarios.' });
        res.json(results);
    });
});

app.post('/guardar-usuario', async (req, res) => {
    const { nombre_usuario, password, rol } = req.body;
    if (!nombre_usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña obligatorios.' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.query(
            'INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, ?)',
            [nombre_usuario, hashedPassword, rol || 'colaborador'],
            (err) => {
                if (err) return res.status(500).json({ error: 'El usuario ya existe o error en BD.' });
                res.json({ success: true, message: 'Usuario creado exitosamente.' });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Error al procesar contraseña.' });
    }
});

app.put('/actualizar-usuario/:id', async (req, res) => {
    const userId = req.params.id;
    const { nombre_usuario, password, rol } = req.body;

    if (password && password.trim() !== '') {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            db.query(
                'UPDATE usuarios SET nombre_usuario = ?, password_hash = ?, rol = ? WHERE id = ?',
                [nombre_usuario, hashedPassword, rol, userId],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Error al actualizar usuario.' });
                    res.json({ success: true, message: 'Usuario actualizado con contraseña nueva.' });
                }
            );
        } catch (e) {
            res.status(500).json({ error: 'Error de servidor.' });
        }
    } else {
        db.query(
            'UPDATE usuarios SET nombre_usuario = ?, rol = ? WHERE id = ?',
            [nombre_usuario, rol, userId],
            (err) => {
                if (err) return res.status(500).json({ error: 'Error al actualizar usuario.' });
                res.json({ success: true, message: 'Usuario actualizado correctamente.' });
            }
        );
    }
});

app.delete('/eliminar-usuario/:id', (req, res) => {
    const userId = req.params.id;
    if (userId == 1) return res.status(400).json({ error: 'No se puede eliminar el usuario administrador principal.' });

    db.query('DELETE FROM usuarios WHERE id = ?', [userId], (err) => {
        if (err) return res.status(500).json({ error: 'Error al eliminar usuario.' });
        res.json({ success: true, message: 'Usuario eliminado correctamente.' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});