const bcrypt = require('bcryptjs');
const mysql = require('mysql2');

// Conexión directa a la base de datos de Hostinger
const db = mysql.createConnection({
    host: 'localhost', // o puedes usar el host remoto si Hostinger te lo pide
    user: 'u742254071_catma_db_user',
    password: 'Catma:2026,',
    database: 'u742254071_servicios_db'
});

async function registrarUsuario(nombreUsuario, passwordPlana, rol) {
    try {
        const hash = await bcrypt.hash(passwordPlana, 10);
        // Nota: Asegúrate de que tu tabla de usuarios use 'nombre_usuario' o 'usuario' según tu estructura
        const query = 'INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, ?)';

        db.query(query, [nombreUsuario, hash, rol], (err) => {
            if (err) {
                console.error(`Error al crear a ${nombreUsuario}:`, err.message);
            } else {
                console.log(`¡Usuario '${nombreUsuario}' (${rol}) creado exitosamente en Hostinger!`);
            }
            db.end();
        });
    } catch (error) {
        console.error('Error al cifrar contraseña:', error);
    }
}

// Creamos al administrador que estás intentando usar en la web
registrarUsuario('admin', 'TuContraseñaSeguraAdmin', 'administrador');