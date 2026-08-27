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

// Verificación y creación automática del admin
db.getConnection(async (err, connection) => {
    if (err) {
        console.error('❌ ERROR BD:', err.message);
        return;
    }
    const hashedPassword = await bcrypt.hash('admin123', 10);
    connection.query(
        'INSERT IGNORE INTO usuarios (id, nombre_usuario, password_hash, rol) VALUES (1, "admin", ?, "administrador")',
        [hashedPassword],
        (insertErr) => {
            if (!insertErr) console.log('✔ Usuario admin verificado en la BD.');
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

// --- RUTA PRINCIPAL / LOGIN FORZADA DESDE EL BACKEND ---
app.get('/login', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CATMA Safe México - Login Oficial</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        body { background-color: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-card { border: none; box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.3); border-radius: 1rem; width: 100%; max-width: 400px; background-color: #ffffff; }
        .btn-primary { background-color: #0f172a; border-color: #0f172a; }
        .btn-primary:hover { background-color: #1e293b; border-color: #1e293b; }
    </style>
</head>
<body>
<div class="card login-card p-4">
    <div class="text-center mb-4">
        <h4 class="fw-bold text-dark">CATMA Safe México</h4>
        <p class="text-muted small">Portal Operativo de Servicios</p>
    </div>
    <form id="loginForm">
        <div class="mb-3">
            <label class="form-label fw-bold small text-secondary">Usuario:</label>
            <input type="text" class="form-control" id="nombre_usuario" required value="admin">
        </div>
        <div class="mb-4">
            <label class="form-label fw-bold small text-secondary">Contraseña:</label>
            <input type="password" class="form-control" id="password" required value="admin123">
        </div>
        <button type="submit" class="btn btn-primary w-100 py-2 fw-bold shadow-sm">Ingresar al Portal</button>
        <div id="mensajeError" class="alert alert-danger mt-3 py-2 text-center small d-none" role="alert"></div>
    </form>
</div>
<script>
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const nombre_usuario = document.getElementById('nombre_usuario').value.trim();
        const password = document.getElementById('password').value;
        const alertaError = document.getElementById('mensajeError');
        alertaError.classList.add('d-none');

        try {
            const respuesta = await fetch('/login-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre_usuario, password })
            });
            const resultado = await respuesta.json();
            if (respuesta.ok) {
                localStorage.setItem('usuarioLogueado', resultado.usuario);
                localStorage.setItem('rolUsuario', resultado.rol);
                window.location.href = '/';
            } else {
                alertaError.innerText = resultado.error || 'Credenciales incorrectas.';
                alertaError.classList.remove('d-none');
            }
        } catch (err) {
            alertaError.innerText = 'Error de conexión con el servidor.';
            alertaError.classList.remove('d-none');
        }
    });
</script>
</body>
</html>`);
});

// --- RUTA POST SEPARADA PARA LOGIN ---
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

        res.json({ usuario: usuario.nombre_usuario, rol: usuario.rol || 'administrador' });
    });
});

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

// --- GUARDAR SERVICIO COMPLETO (CON DEPURACIÓN DE ERROR SQL) ---
app.post('/guardar-servicio-completo', upload.array('evidencias'), (req, res) => {
    const {
        id_cliente, nombre, pedido, remision, modelo, serie, poliza,
        telefono, ubicacion, tipo_servicio, asesor, tecnico_asignado,
        estatus, fecha_servicio_programado, fecha_confirmada,
        fecha_servicio_realizado, observaciones
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
        fecha_servicio_programado || null, fecha_confirmada || null,
        fecha_servicio_realizado || null, nombresArchivos, observaciones || ''
    ];

    db.query(query, values, (err, resultado) => {
        if (err) {
            console.error('Error al guardar servicio:', err);
            return res.status(500).json({ error: 'SQL Error: ' + err.message });
        }
        res.json({ success: true, message: 'Registro guardado correctamente', id: resultado.insertId });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});