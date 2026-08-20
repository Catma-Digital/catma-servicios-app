const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ruta raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Conexión a la base de datos
const db = mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: '123456',
    database: 'catma_servicios_db'
});

db.connect((err) => {
    if (err) {
        console.error('Error al conectar a la BD:', err);
        return;
    }
    console.log('¡Conectado a la base de datos exitosamente!');
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
                    ['admin', hash, 'admin'], () => {
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
    WHERE TABLE_SCHEMA = 'catma_servicios_db' 
      AND TABLE_NAME = 'servicios_mantenimiento_completo' 
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

app.post('/guardar-servicio-completo', (req, res) => {
    const query = `INSERT INTO servicios_mantenimiento_completo (id_cliente, nombre, pedido, remision, poliza, modelo, serie, ubicacion, telefono, tipo_servicio, asesor, fecha_programado, fecha_confirmada, tecnico_asignado, estatus, fecha_realizado, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = Object.values(req.body);
    db.query(query, values, (err) => {
        if (err) return res.status(500).send('Error al guardar.');
        res.send('¡Servicio registrado exitosamente!');
    });
});

app.put('/actualizar-servicio/:id', (req, res) => {
    const {
        id_cliente, nombre, pedido, remision, poliza, modelo, serie,
        ubicacion, telefono, tipo_servicio, asesor, fecha_programado,
        fecha_confirmada, tecnico_asignado, estatus, fecha_realizado, observaciones
    } = req.body;

    const query = `
        UPDATE servicios_mantenimiento_completo 
        SET id_cliente = ?, nombre = ?, pedido = ?, remision = ?, poliza = ?, 
            modelo = ?, serie = ?, ubicacion = ?, telefono = ?, tipo_servicio = ?, 
            asesor = ?, fecha_programado = ?, fecha_confirmada = ?, 
            tecnico_asignado = ?, estatus = ?, fecha_realizado = ?, observaciones = ? 
        WHERE id = ?
    `;

    const values = [
        id_cliente, nombre, pedido || null, remision || null, poliza || null,
        modelo || null, serie || null, ubicacion || null, telefono || null,
        tipo_servicio, asesor, fecha_programado || null, fecha_confirmada || null,
        tecnico_asignado || null, estatus, fecha_realizado || null, observaciones || null,
        req.params.id
    ];

    db.query(query, values, (err) => {
        if (err) {
            console.error('Error al actualizar servicio:', err);
            return res.status(500).send('Error al actualizar.');
        }
        res.send('¡Servicio actualizado exitosamente!');
    });
});

app.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
});