# ScrumChef - La receta del sprint ideal

Aplicación web multiplayer para retrospectivas Scrum gamificadas. Un equipo de 4 a 8 personas crea recetas del sprint ideal, presenta propuestas, vota y cierra acciones para el siguiente sprint.

## Estructura

```text
/apps/web       React + TypeScript + Vite
/apps/worker    Cloudflare Worker + Durable Object + WebSockets
/shared         Tipos TypeScript e ingredientes compartidos
```

## Requisitos

- Node.js 20+
- Cuenta de Cloudflare para desplegar Worker y Pages
- Wrangler autenticado para despliegue

## Instalación

```bash
npm install
```

## Desarrollo local

Levanta el Worker en una terminal:

```bash
npm run dev:worker
```

Levanta el frontend en otra terminal:

```bash
npm run dev
```

Por defecto el frontend usa `http://localhost:8787` como backend. Para cambiarlo:

```bash
VITE_WORKER_URL=https://tu-worker.workers.dev npm run dev
```

## Build

```bash
npm run build
```

## Deploy

Worker:

```bash
npm run deploy
```

Frontend en Cloudflare Pages:

- Proyecto: `apps/web`
- Build command: `npm run build -w @scrumchef/web`
- Build output directory: `apps/web/dist`
- Variable recomendada: `VITE_WORKER_URL=https://tu-worker.workers.dev`

## Rutas del Worker

- `GET /api/health`
- `POST /api/rooms`
- `GET /api/rooms/:roomId/ws`

## Flujo

1. El host crea una sala.
2. Los jugadores entran con nombre y código.
3. El host inicia la cocina cuando hay al menos 4 jugadores.
4. Cada jugador prepara una receta con máximo 5 ingredientes y total exacto de 100%.
5. El equipo presenta recetas.
6. Cada jugador vota una vez por categoría y no puede votarse a sí mismo.
7. El resumen muestra ranking, ingredientes clave y acciones finales.

## Notas MVP

- No usa base de datos externa.
- El estado de sala vive en `ScrumChefRoom`, un Durable Object.
- Si el host se desconecta, la sala sigue activa y no se reasigna host automáticamente.
- No incluye login, chat, pagos, IA real ni reglas competitivas adicionales.
