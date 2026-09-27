# LUMI Web + MySQL — Paso 3 corregido

Esta versión conecta los controles de luces del frontend con la API Node.js + MySQL.

## Antes de abrir LUMI

1. XAMPP: MySQL encendido.
2. Backend LUMI: en la carpeta del backend:

```bash
npm start
```

Debe quedar activo en `http://localhost:3000`.

3. Verifica `http://localhost:3000/api/health` y confirma `baseDatos: "conectada"`.

## Abrir la web

Abre esta carpeta en VS Code y ejecuta `lumi_control_inteligente_esp32.html` con **Go Live**.

## Login

- Correo: `demo@lumi.local`
- Contraseña: `lumi123`

## Qué se corrigió

- Encendido/apagado de luces: guarda en MySQL mediante `PATCH /api/luces/:id`.
- Intensidad principal: guarda en MySQL al cambiar el slider o los botones 0/25/50/75/100.
- Intensidad por habitación: guarda en MySQL al soltar el slider.
- Modos inteligentes: guardan la luz y el modo en MySQL.
- La interfaz muestra un aviso de **Guardado en MySQL** solo después de recibir confirmación de la API.
- Si la API no responde, el cambio se revierte y se muestra un error.
- Se usa `cache: no-store` para evitar respuestas antiguas.
- Al cargar el dashboard, los valores se vuelven a consultar desde MySQL.

## Prueba recomendada

1. Inicia el backend.
2. Abre LUMI con Go Live.
3. Inicia sesión.
4. Pon Sala en 50%.
5. Comprueba en phpMyAdmin → `lumi_db` → `luces` → ID 1 que `intensidad` sea `50`.
6. Recarga la página. Debe seguir mostrando 50%.
