const bcrypt = require('bcryptjs');
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: '123456',
    database: 'catma_servicios_db'
});

async function registrarUsuario(nombreUsuario, passwordPlana, rol) {
    try {
        const hash = await bcrypt.hash(passwordPlana, 10);
        const query = 'INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, ?)';

        db.query(query, [nombreUsuario, hash, rol], (err) => {
            if (err) {
                console.error(`Error al crear a ${nombreUsuario}:`, err.message);
            } else {
                console.log(`¡Usuario '${nombreUsuario}' (${rol}) creado exitosamente!`);
            }
            db.end();
        });
    } catch (error) {
        console.error('Error al cifrar contraseña:', error);
    }
}

// Cambia estos datos para crear nuevos usuarios:
registrarUsuario('carla.sanchez', 'miPassword123', 'colaborador');