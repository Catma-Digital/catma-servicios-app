const mysql = require('mysql2');

const db = mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: '123456',
    database: 'catma_servicios_db'
});

const query = `
CREATE TABLE IF NOT EXISTS servicios_mantenimiento_completo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente VARCHAR(50) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    pedido VARCHAR(50),
    remision VARCHAR(50),
    poliza VARCHAR(50),
    modelo VARCHAR(100),
    serie VARCHAR(100),
    ubicacion TEXT,
    telefono VARCHAR(20),
    tipo_servicio ENUM('Preventivo', 'Correctivo', 'Póliza', 'Garantía') NOT NULL,
    asesor ENUM('Carla Sánchez', 'Ana Sánchez', 'Mayra Selene', 'Alejandro Daniel') NOT NULL,
    fecha_programado DATE,
    fecha_confirmada DATE,
    tecnico_asignado VARCHAR(100),
    estatus ENUM('Pendiente', 'Proceso', 'Finalizado') DEFAULT 'Pendiente',
    fecha_realizado DATE,
    observaciones TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

db.query(query, (err, result) => {
    if (err) {
        console.error('Error al crear la tabla:', err);
    } else {
        console.log('¡Tabla "servicios_mantenimiento_completo" creada o verificada con éxito!');
    }
    db.end();
});
