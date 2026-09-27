require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function main() {
  const email = 'demo@lumi.local';
  const password = 'lumi123';
  const hash = await bcrypt.hash(password, 10);

  const [users] = await pool.query('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email]);
  if (!users.length) {
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, auth_provider) VALUES (?, ?, ?, 'lumi')`,
      ['Usuario LUMI', email, hash]
    );
  } else {
    await pool.query(
      `UPDATE usuarios SET password_hash = ?, auth_provider = 'lumi' WHERE id = ?`,
      [hash, users[0].id]
    );
  }

  console.log('Usuario demo listo:');
  console.log('Correo: demo@lumi.local');
  console.log('Contraseña: lumi123');
  await pool.end();
}

main().catch(async (err) => {
  console.error('No se pudo preparar el usuario demo.');
  console.error(err.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
