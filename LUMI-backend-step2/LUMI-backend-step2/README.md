# LUMI Backend - Paso 2

Backend Node.js + Express + MySQL para conectar la interfaz LUMI con `lumi_db`.

## Requisitos

- Node.js 18 o superior
- XAMPP con MySQL encendido
- Base de datos `lumi_db` ya importada

## Instalación en Windows

1. Abre esta carpeta en VS Code.
2. Abre la terminal de VS Code.
3. Ejecuta:

```bash
npm install
```

4. Copia `.env.example` y cambia el nombre de la copia a `.env`.
5. Si tu MySQL de XAMPP no tiene contraseña, deja:

```text
DB_PASSWORD=
```

6. Prepara el usuario de prueba:

```bash
npm run setup
```

7. Inicia el servidor:

```bash
npm start
```

Debe aparecer:

`LUMI API ejecutándose en http://localhost:3000`

## Prueba

Abre en el navegador:

`http://localhost:3000/api/health`

Debe responder algo parecido a:

```json
{"ok":true,"servicio":"LUMI API","baseDatos":"conectada"}
```

## Usuario de prueba

Correo: `demo@lumi.local`
Contraseña: `lumi123`

## Endpoints incluidos

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/dashboard/:usuarioId`
- `PATCH /api/luces/:id`
- `POST /api/historial`
- `POST /api/lecturas`

La interfaz web se conectará a estos endpoints en el siguiente paso.
