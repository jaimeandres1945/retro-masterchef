# ScrumChef

## La receta del sprint ideal

ScrumChef es una retrospectiva Scrum multiplayer con sabor a cocina de autor. El equipo entra en una sala, elige sus ingredientes de trabajo, prepara una receta del sprint ideal, la presenta, vota y termina con acciones concretas para el siguiente sprint.

Piensa en una retro clásica, pero con despensa, plato final, brigada, votación y un punto friki de concurso culinario. Sin marcas reales, sin humo, sin base de datos externa.

---

## El Plato

**Objetivo:** ayudar a equipos de 4 a 8 personas a conversar sobre cómo mejorar el próximo sprint.

Cada jugador construye una receta repartiendo exactamente **100%** entre un máximo de **5 ingredientes Scrum**:

- Comunicación Clara
- Colaboración
- Refinamiento Ligero
- Ownership Claro
- Calidad
- Foco
- Flexibilidad
- Innovación
- Bienestar
- Visibilidad
- Ingrediente Comodín

Al final, el equipo vota por:

- Receta Más Equilibrada
- Receta Más Innovadora
- Receta Más Realista

Y el host cierra la sesión con acciones finales.

---

## Modo de Juego

1. El host crea una sala.
2. ScrumChef genera un código de sala.
3. El host puede preparar URLs de invitación por participante.
4. Los jugadores entran con nombre + código o con su URL directa.
5. El host inicia la cocina.
6. Cada jugador crea su receta.
7. Se presentan las recetas.
8. Todos votan.
9. Se revisa el ranking, los ingredientes clave y las acciones finales.

---

## Stack

```text
Frontend
React + TypeScript + Vite + CSS simple

Backend
Cloudflare Workers + Durable Objects + WebSockets

Estado
Durable Object storage, sin base de datos externa

Deploy
Cloudflare Pages + Cloudflare Workers
```

---

## Estructura del Proyecto

```text
retro-masterchef/
  apps/
    web/       Interfaz React, pantallas y estilos
    worker/    Worker, Durable Object y WebSocket server
  shared/      Tipos TypeScript e ingredientes compartidos
```

---

## Requisitos

- Node.js 20+
- npm
- Cuenta de Cloudflare
- Wrangler autenticado si vas a desplegar desde terminal

---

## Instalación

```bash
npm install
```

---

## Desarrollo Local

Levanta el Worker:

```bash
npm run dev:worker
```

Levanta el frontend:

```bash
npm run dev
```

Por defecto, el frontend espera el Worker en:

```text
http://localhost:8787
```

Si necesitas apuntar a otro Worker:

```bash
VITE_WORKER_URL=https://tu-worker.workers.dev npm run dev
```

En PowerShell:

```powershell
$env:VITE_WORKER_URL="https://tu-worker.workers.dev"
npm run dev
```

---

## Build

```bash
npm run build
```

Este comando compila:

- `@scrumchef/shared`
- `@scrumchef/web`
- `@scrumchef/worker`

---

## Deploy

### Worker

```bash
npm run deploy
```

El Worker expone:

```text
GET  /api/health
POST /api/rooms
GET  /api/rooms/:roomId/ws
```

### Frontend en Cloudflare Pages

Configuración recomendada:

```text
Framework preset: None
Build command: npm run build -w @scrumchef/web
Build output directory: apps/web/dist
```

Variable de entorno:

```text
VITE_WORKER_URL=https://tu-worker.workers.dev
```

---

## Durable Object

El corazón multiplayer vive en `ScrumChefRoom`.

Cada sala guarda:

```text
roomId
hostId
phase
players
recipes
votes
actions
createdAt
updatedAt
```

El Durable Object se encarga de:

- aceptar conexiones WebSocket
- mantener el estado de sala
- persistir cambios
- validar fases
- validar máximo 8 jugadores
- validar mínimo 4 jugadores para iniciar
- emitir actualizaciones en tiempo real

---

## Variables Importantes

Frontend:

```text
VITE_WORKER_URL
VITE_ADMIN_PASSWORD
```

Si no defines `VITE_ADMIN_PASSWORD`, la contraseña por defecto es:

```text
retroAdmin
```

Usuario de acceso:

```text
retroAdmin
```

---

## Reglas del Restaurante

- Mínimo 4 jugadores para iniciar.
- Máximo 8 jugadores por sala.
- El host controla el avance de fases.
- Cada jugador puede enviar una receta.
- La receta puede editarse mientras el host no avance de fase.
- Máximo 5 ingredientes por receta.
- La suma debe ser exactamente 100%.
- Cada jugador vota una vez por categoría.
- Nadie puede votarse a sí mismo.
- El host puede cerrar la sala.
- El host puede sacar jugadores antes de iniciar.

---

## Lo Que No Hay En El MVP

- Login real con usuarios persistentes
- Base de datos externa
- Chat
- Pagos
- Grabación
- IA real
- Roles complejos
- Reglas competitivas pesadas

Esto es una cocina ligera: rápida de servir, fácil de desplegar y centrada en conversar mejor.

---

## Guía Rápida Para Una Retro

1. Abre la app.
2. Entra con el acceso de facilitador.
3. Crea la sala.
4. Añade los nombres de participantes.
5. Copia la lista de URLs.
6. Pégala en Teams.
7. Espera a que entren.
8. Inicia cocina.
9. Deja que cada persona prepare su receta.
10. Presentad, votad y convertid el resultado en acciones.

---

## Estado Del Proyecto

MVP funcional:

- salas multiplayer
- sincronización por WebSocket
- recetas colaborativas
- presentación
- votación
- resumen
- acciones finales
- despliegue en Cloudflare

Listo para probar con equipos reales y seguir afinando la salsa.
