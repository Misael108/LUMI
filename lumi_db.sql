CREATE DATABASE IF NOT EXISTS lumi_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lumi_db;

-- 1) Usuarios de LUMI
CREATE TABLE IF NOT EXISTS usuarios (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL,
    auth_provider ENUM('lumi','google') NOT NULL DEFAULT 'lumi',
    auth_provider_id VARCHAR(191) NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_usuarios_provider (auth_provider, auth_provider_id)
) ENGINE=InnoDB;

-- 2) Dispositivos ESP32
CREATE TABLE IF NOT EXISTS dispositivos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    nombre VARCHAR(100) NOT NULL DEFAULT 'ESP32 Principal',
    ip VARCHAR(45) NULL,
    mac VARCHAR(17) NULL,
    estado ENUM('conectado','desconectado') NOT NULL DEFAULT 'desconectado',
    latencia_ms INT UNSIGNED NULL,
    rssi_dbm INT NULL,
    uptime_segundos BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ultima_sincronizacion DATETIME NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_dispositivos_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_dispositivos_usuario (usuario_id),
    INDEX idx_dispositivos_estado (estado)
) ENGINE=InnoDB;

-- 3) Habitaciones / zonas
CREATE TABLE IF NOT EXISTS habitaciones (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    icono VARCHAR(50) NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_habitaciones_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_habitaciones_usuario (usuario_id)
) ENGINE=InnoDB;

-- 4) Luces de cada habitación
CREATE TABLE IF NOT EXISTS luces (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    habitacion_id INT UNSIGNED NOT NULL,
    dispositivo_id INT UNSIGNED NULL,
    nombre VARCHAR(100) NOT NULL DEFAULT 'Luz principal',
    encendida BOOLEAN NOT NULL DEFAULT FALSE,
    intensidad TINYINT UNSIGNED NOT NULL DEFAULT 0,
    modo ENUM('manual','automatico','ahorro','lectura','noche','ausente','personalizado') NOT NULL DEFAULT 'manual',
    consumo_actual_w DECIMAL(8,2) NOT NULL DEFAULT 0,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_luces_intensidad CHECK (intensidad BETWEEN 0 AND 100),
    CONSTRAINT fk_luces_habitacion
        FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_luces_dispositivo
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_luces_habitacion (habitacion_id),
    INDEX idx_luces_dispositivo (dispositivo_id)
) ENGINE=InnoDB;

-- 5) Programaciones de encendido/apagado
CREATE TABLE IF NOT EXISTS programaciones (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    habitacion_id INT UNSIGNED NOT NULL,
    accion ENUM('Encender','Apagar') NOT NULL,
    hora TIME NOT NULL,
    dias VARCHAR(100) NOT NULL DEFAULT 'Todos',
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_programaciones_habitacion
        FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_programaciones_habitacion (habitacion_id),
    INDEX idx_programaciones_activa (activa)
) ENGINE=InnoDB;

-- 6) Lecturas para estadísticas: lux, consumo e intensidad
CREATE TABLE IF NOT EXISTS lecturas (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    dispositivo_id INT UNSIGNED NULL,
    habitacion_id INT UNSIGNED NULL,
    fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lux DECIMAL(10,2) NULL,
    consumo_w DECIMAL(10,2) NULL,
    energia_kwh DECIMAL(12,4) NULL,
    intensidad TINYINT UNSIGNED NULL,
    CONSTRAINT chk_lecturas_intensidad CHECK (intensidad IS NULL OR intensidad BETWEEN 0 AND 100),
    CONSTRAINT fk_lecturas_dispositivo
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_lecturas_habitacion
        FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_lecturas_fecha (fecha_hora),
    INDEX idx_lecturas_dispositivo_fecha (dispositivo_id, fecha_hora),
    INDEX idx_lecturas_habitacion_fecha (habitacion_id, fecha_hora)
) ENGINE=InnoDB;

-- 7) Historial de actividad de LUMI
CREATE TABLE IF NOT EXISTS historial (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    dispositivo_id INT UNSIGNED NULL,
    habitacion_id INT UNSIGNED NULL,
    tipo ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
    evento VARCHAR(150) NOT NULL,
    detalle VARCHAR(255) NULL,
    fecha_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_historial_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_historial_dispositivo
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivos(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_historial_habitacion
        FOREIGN KEY (habitacion_id) REFERENCES habitaciones(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_historial_usuario_fecha (usuario_id, fecha_hora),
    INDEX idx_historial_habitacion_fecha (habitacion_id, fecha_hora)
) ENGINE=InnoDB;

-- 8) Preferencias del usuario
CREATE TABLE IF NOT EXISTS preferencias_usuario (
    usuario_id INT UNSIGNED PRIMARY KEY,
    notificaciones BOOLEAN NOT NULL DEFAULT TRUE,
    animaciones BOOLEAN NOT NULL DEFAULT TRUE,
    tema ENUM('oscuro','claro','sistema') NOT NULL DEFAULT 'oscuro',
    CONSTRAINT fk_preferencias_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- 9) Modos personalizados (los modos base pueden seguir en el frontend)
CREATE TABLE IF NOT EXISTS modos_personalizados (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    intensidad TINYINT UNSIGNED NOT NULL DEFAULT 50,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_modos_intensidad CHECK (intensidad BETWEEN 0 AND 100),
    CONSTRAINT fk_modos_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_modos_usuario (usuario_id)
) ENGINE=InnoDB;

-- Datos iniciales opcionales para probar la estructura.
-- Se crea un usuario de prueba sin contraseña todavía; el backend la generará con hash.
INSERT INTO usuarios (nombre, email, auth_provider)
VALUES ('Usuario LUMI', 'demo@lumi.local', 'lumi')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

SET @usuario_id = (SELECT id FROM usuarios WHERE email = 'demo@lumi.local' LIMIT 1);

INSERT INTO preferencias_usuario (usuario_id)
VALUES (@usuario_id)
ON DUPLICATE KEY UPDATE usuario_id = usuario_id;

INSERT INTO habitaciones (usuario_id, nombre, icono)
SELECT @usuario_id, 'Sala', '🛋️'
WHERE NOT EXISTS (SELECT 1 FROM habitaciones WHERE usuario_id=@usuario_id AND nombre='Sala');

INSERT INTO habitaciones (usuario_id, nombre, icono)
SELECT @usuario_id, 'Recámara', '🛏️'
WHERE NOT EXISTS (SELECT 1 FROM habitaciones WHERE usuario_id=@usuario_id AND nombre='Recámara');

INSERT INTO habitaciones (usuario_id, nombre, icono)
SELECT @usuario_id, 'Cocina', '🍽️'
WHERE NOT EXISTS (SELECT 1 FROM habitaciones WHERE usuario_id=@usuario_id AND nombre='Cocina');

INSERT INTO habitaciones (usuario_id, nombre, icono)
SELECT @usuario_id, 'Exterior', '🌲'
WHERE NOT EXISTS (SELECT 1 FROM habitaciones WHERE usuario_id=@usuario_id AND nombre='Exterior');

INSERT INTO dispositivos (usuario_id, nombre, ip, estado)
SELECT @usuario_id, 'ESP32 Principal', '192.168.1.85', 'desconectado'
WHERE NOT EXISTS (SELECT 1 FROM dispositivos WHERE usuario_id=@usuario_id AND nombre='ESP32 Principal');

-- Crear una luz principal en cada habitación de prueba
INSERT INTO luces (habitacion_id, dispositivo_id, nombre, encendida, intensidad, modo)
SELECT h.id, d.id, 'Luz principal', FALSE, 0, 'manual'
FROM habitaciones h
JOIN dispositivos d ON d.usuario_id = h.usuario_id
WHERE h.usuario_id=@usuario_id
  AND NOT EXISTS (SELECT 1 FROM luces l WHERE l.habitacion_id=h.id);

SELECT 'Base de datos LUMI creada correctamente' AS mensaje;
