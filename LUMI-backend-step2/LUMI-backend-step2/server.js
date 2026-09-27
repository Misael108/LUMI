require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, servicio: 'LUMI API', baseDatos: 'conectada' });
  } catch (error) {
    res.status(500).json({ ok: false, servicio: 'LUMI API', baseDatos: 'desconectada', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Correo y contraseña son obligatorios.' });
    }

    const [rows] = await pool.query(
      `SELECT id, nombre, email, password_hash, auth_provider FROM usuarios WHERE email = ? LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales no válidas.' });
    }

    const user = rows[0];
    const valid = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales no válidas.' });
    }

    res.json({
      ok: true,
      usuario: { id: user.id, nombre: user.nombre, email: user.email, authProvider: user.auth_provider }
    });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'Error al iniciar sesión.', error: error.message });
  }
});

app.get('/api/dashboard/:usuarioId', async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return res.status(400).json({ ok: false, mensaje: 'usuarioId no válido.' });
    }

    const [[usuario]] = await pool.query(
      `SELECT id, nombre, email, auth_provider FROM usuarios WHERE id = ?`, [usuarioId]
    );
    if (!usuario) return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado.' });

    const [dispositivos] = await pool.query(
      `SELECT id, nombre, ip, estado, latencia_ms, rssi_dbm, uptime_segundos, ultima_sincronizacion
       FROM dispositivos WHERE usuario_id = ? ORDER BY id`, [usuarioId]
    );

    const [habitaciones] = await pool.query(
      `SELECT h.id, h.nombre, h.icono, h.activo,
              l.id AS luz_id, l.nombre AS luz_nombre, l.encendida, l.intensidad, l.modo, l.consumo_actual_w
       FROM habitaciones h
       LEFT JOIN luces l ON l.habitacion_id = h.id
       WHERE h.usuario_id = ? ORDER BY h.id`, [usuarioId]
    );

    const [programaciones] = await pool.query(
      `SELECT p.id, p.habitacion_id, h.nombre AS habitacion, p.accion, p.hora, p.dias, p.activa
       FROM programaciones p
       JOIN habitaciones h ON h.id = p.habitacion_id
       WHERE h.usuario_id = ? ORDER BY p.hora, p.id`, [usuarioId]
    );

    const [historial] = await pool.query(
      `SELECT id, tipo, evento, detalle, fecha_hora, habitacion_id, dispositivo_id
       FROM historial WHERE usuario_id = ? ORDER BY fecha_hora DESC LIMIT 20`, [usuarioId]
    );

    const [lecturas] = await pool.query(
      `SELECT id, dispositivo_id, habitacion_id, fecha_hora, lux, consumo_w, energia_kwh, intensidad
       FROM lecturas
       WHERE dispositivo_id IN (SELECT id FROM dispositivos WHERE usuario_id = ?)
          OR habitacion_id IN (SELECT id FROM habitaciones WHERE usuario_id = ?)
       ORDER BY fecha_hora DESC LIMIT 50`, [usuarioId, usuarioId]
    );

    res.json({ ok: true, usuario, dispositivos, habitaciones, programaciones, historial, lecturas });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'No se pudo cargar el dashboard.', error: error.message });
  }
});

app.patch('/api/luces/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { encendida, intensidad, modo, consumo_actual_w } = req.body || {};
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, mensaje: 'Id de luz no válido.' });

    const updates = [];
    const values = [];
    if (typeof encendida === 'boolean') { updates.push('encendida = ?'); values.push(encendida); }
    if (Number.isFinite(Number(intensidad))) {
      const n = Math.max(0, Math.min(100, Number(intensidad)));
      updates.push('intensidad = ?'); values.push(n);
    }
    if (typeof modo === 'string' && modo) { updates.push('modo = ?'); values.push(modo); }
    if (Number.isFinite(Number(consumo_actual_w))) { updates.push('consumo_actual_w = ?'); values.push(Number(consumo_actual_w)); }

    if (!updates.length) return res.status(400).json({ ok: false, mensaje: 'No hay cambios para guardar.' });
    values.push(id);

    await pool.query(`UPDATE luces SET ${updates.join(', ')} WHERE id = ?`, values);
    const [[luz]] = await pool.query(
      `SELECT id, habitacion_id, dispositivo_id, nombre, encendida, intensidad, modo, consumo_actual_w, actualizado_en
       FROM luces WHERE id = ?`, [id]
    );
    if (!luz) return res.status(404).json({ ok: false, mensaje: 'Luz no encontrada.' });

    res.json({ ok: true, luz });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'No se pudo actualizar la luz.', error: error.message });
  }
});

app.post('/api/historial', async (req, res) => {
  try {
    const { usuario_id, dispositivo_id = null, habitacion_id = null, tipo = 'info', evento, detalle = null } = req.body || {};
    if (!usuario_id || !evento) return res.status(400).json({ ok: false, mensaje: 'usuario_id y evento son obligatorios.' });

    const [result] = await pool.query(
      `INSERT INTO historial (usuario_id, dispositivo_id, habitacion_id, tipo, evento, detalle)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [usuario_id, dispositivo_id, habitacion_id, tipo, evento, detalle]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'No se pudo guardar el historial.', error: error.message });
  }
});

app.post('/api/lecturas', async (req, res) => {
  try {
    const { dispositivo_id = null, habitacion_id = null, lux = null, consumo_w = null, energia_kwh = null, intensidad = null } = req.body || {};
    const [result] = await pool.query(
      `INSERT INTO lecturas (dispositivo_id, habitacion_id, lux, consumo_w, energia_kwh, intensidad)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dispositivo_id, habitacion_id, lux, consumo_w, energia_kwh, intensidad]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, mensaje: 'No se pudo guardar la lectura.', error: error.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`LUMI API ejecutándose en http://localhost:${PORT}`);
  console.log(`Salud: http://localhost:${PORT}/api/health`);
});
