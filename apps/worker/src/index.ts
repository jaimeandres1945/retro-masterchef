import type {
  ActionItem,
  ClientEvent,
  GamePhase,
  Recipe,
  RoomState,
  ServerEvent,
  Vote
} from "@scrumchef/shared";
import { PHASES } from "@scrumchef/shared";

interface Env {
  SCRUMCHEF_ROOM: DurableObjectNamespace<ScrumChefRoom>;
}

type SessionMeta = {
  playerId?: string;
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...init.headers
    }
  });

const newId = () => crypto.randomUUID();

const generateRoomId = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const normalizeRoomId = (roomId: string) => roomId.trim().toUpperCase();

const validName = (name: string) => name.trim().slice(0, 28);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true, service: "scrumchef-worker" });
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const roomId = generateRoomId();
      const id = env.SCRUMCHEF_ROOM.idFromName(roomId);
      const stub = env.SCRUMCHEF_ROOM.get(id);
      await stub.fetch("https://room.local/init", {
        method: "POST",
        body: JSON.stringify({ roomId })
      });
      return json({ roomId }, { status: 201 });
    }

    const wsMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9-]+)\/ws$/);
    if (request.method === "GET" && wsMatch) {
      const roomId = normalizeRoomId(wsMatch[1]);
      const id = env.SCRUMCHEF_ROOM.idFromName(roomId);
      return env.SCRUMCHEF_ROOM.get(id).fetch(request);
    }

    return json({ error: "Not found" }, { status: 404 });
  }
};

export class ScrumChefRoom {
  private state: DurableObjectState;
  private sessions = new Map<WebSocket, SessionMeta>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      const payload = (await request.json()) as { roomId?: string };
      const existing = await this.getRoomState();
      if (!existing && payload.roomId) {
        await this.saveRoomState(this.createEmptyRoom(payload.roomId));
      }
      return json({ ok: true });
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return json({ error: "Expected WebSocket" }, { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.acceptSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private acceptSocket(socket: WebSocket) {
    socket.accept();
    this.sessions.set(socket, {});

    socket.addEventListener("message", async (event) => {
      try {
        await this.handleMessage(socket, JSON.parse(String(event.data)) as ClientEvent);
      } catch (error) {
        this.send(socket, {
          type: "ERROR",
          message: error instanceof Error ? error.message : "Evento no válido"
        });
      }
    });

    socket.addEventListener("close", () => void this.disconnect(socket));
    socket.addEventListener("error", () => void this.disconnect(socket));
  }

  private async handleMessage(socket: WebSocket, event: ClientEvent) {
    if (event.type === "PING") {
      this.send(socket, { type: "PONG" });
      return;
    }

    if (event.type === "JOIN_ROOM") {
      await this.joinRoom(socket, event.playerName, event.playerId);
      return;
    }

    const state = await this.requireState();
    const playerId = "playerId" in event ? event.playerId : undefined;
    const player = playerId ? state.players.find((item) => item.id === playerId) : undefined;
    if (!player) {
      throw new Error("Jugador no encontrado en la sala.");
    }

    switch (event.type) {
      case "START_GAME":
        this.assertHost(state, player.id);
        if (state.phase !== "LOBBY") throw new Error("La cocina solo puede iniciarse desde el lobby.");
        if (state.players.filter((item) => item.connected).length < 4) {
          throw new Error("Necesitas al menos 4 jugadores conectados para iniciar.");
        }
        await this.changePhase(state, "CHALLENGE");
        break;
      case "CHANGE_PHASE":
        this.assertHost(state, player.id);
        this.assertKnownPhase(event.phase);
        await this.changePhase(state, event.phase);
        break;
      case "SUBMIT_RECIPE":
      case "UPDATE_RECIPE":
        await this.upsertRecipe(state, player.id, event.recipe);
        break;
      case "SUBMIT_VOTE":
        await this.submitVote(state, player.id, event.targetRecipeId, event.category);
        break;
      case "ADD_ACTION":
        this.assertHost(state, player.id);
        await this.addAction(state, event.action);
        break;
      case "REMOVE_PLAYER":
        this.assertHost(state, player.id);
        await this.removePlayer(state, event.targetPlayerId);
        break;
      default:
        throw new Error("Evento no soportado.");
    }
  }

  private async joinRoom(socket: WebSocket, playerName: string, providedPlayerId?: string) {
    const state = await this.requireState();
    const name = validName(playerName);
    if (!name) throw new Error("El nombre es obligatorio.");

    let player = providedPlayerId ? state.players.find((item) => item.id === providedPlayerId) : undefined;
    if (player) {
      player.connected = true;
      player.name = name;
    } else {
      if (state.players.length >= 8) throw new Error("La sala ya tiene 8 jugadores.");
      player = {
        id: newId(),
        name,
        isHost: state.players.length === 0 || state.hostId === "",
        connected: true
      };
      state.players.push(player);
      if (player.isHost) state.hostId = player.id;
    }

    this.sessions.set(socket, { playerId: player.id });
    await this.saveAndBroadcast(state, { type: "PLAYER_JOINED", player, state });
    this.send(socket, { type: "ROOM_JOINED", roomId: state.roomId, playerId: player.id, state });
  }

  private async upsertRecipe(
    state: RoomState,
    playerId: string,
    recipeInput: Omit<Recipe, "id" | "playerId" | "playerName" | "submittedAt">
  ) {
    if (state.phase !== "RECIPE_BUILDING") throw new Error("Las recetas solo se editan durante la fase de cocina.");
    const player = state.players.find((item) => item.id === playerId);
    if (!player) throw new Error("Jugador no encontrado.");
    this.validateRecipe(recipeInput);

    const existing = state.recipes.find((recipe) => recipe.playerId === playerId);
    const recipe: Recipe = {
      ...recipeInput,
      id: existing?.id ?? newId(),
      playerId,
      playerName: player.name,
      submittedAt: new Date().toISOString()
    };

    state.recipes = existing
      ? state.recipes.map((item) => (item.playerId === playerId ? recipe : item))
      : [...state.recipes, recipe];

    await this.saveAndBroadcast(state);
  }

  private validateRecipe(recipe: Omit<Recipe, "id" | "playerId" | "playerName" | "submittedAt">) {
    if (!recipe.recipeName.trim()) throw new Error("Ponle nombre a tu receta.");
    if (!recipe.generalExplanation.trim()) throw new Error("Añade al menos una explicación general.");
    if (recipe.ingredients.length === 0) throw new Error("Selecciona al menos un ingrediente.");
    if (recipe.ingredients.length > 5) throw new Error("Puedes seleccionar máximo 5 ingredientes.");
    const total = recipe.ingredients.reduce((sum, item) => sum + Number(item.percentage), 0);
    if (total !== 100) throw new Error("La suma de porcentajes debe ser exactamente 100%.");
    if (!recipe.ingredients.some((item) => item.explanation?.trim())) {
      throw new Error("Añade al menos una explicación en un ingrediente.");
    }
  }

  private async submitVote(
    state: RoomState,
    voterPlayerId: string,
    targetRecipeId: string,
    category: Vote["category"]
  ) {
    if (state.phase !== "VOTING") throw new Error("Solo se puede votar en la fase de votación.");
    const target = state.recipes.find((recipe) => recipe.id === targetRecipeId);
    if (!target) throw new Error("Receta no encontrada.");
    if (target.playerId === voterPlayerId) throw new Error("No puedes votarte a ti mismo.");
    const alreadyVoted = state.votes.some((vote) => vote.voterPlayerId === voterPlayerId && vote.category === category);
    if (alreadyVoted) throw new Error("Ya has votado en esta categoría.");

    state.votes.push({
      id: newId(),
      voterPlayerId,
      targetRecipeId,
      category
    });
    await this.saveAndBroadcast(state);
  }

  private async addAction(state: RoomState, action: Omit<ActionItem, "id">) {
    if (state.phase !== "SUMMARY") throw new Error("Las acciones finales se añaden en el resumen.");
    if (!action.text.trim()) throw new Error("La acción necesita texto.");
    if (!action.owner.trim()) throw new Error("La acción necesita responsable.");
    state.actions.push({
      id: newId(),
      text: action.text.trim(),
      owner: action.owner.trim(),
      dueDate: action.dueDate || undefined
    });
    await this.saveAndBroadcast(state);
  }

  private async removePlayer(state: RoomState, targetPlayerId: string) {
    state.players = state.players.filter((player) => player.id !== targetPlayerId);
    state.recipes = state.recipes.filter((recipe) => recipe.playerId !== targetPlayerId);
    state.votes = state.votes.filter((vote) => vote.voterPlayerId !== targetPlayerId);
    await this.saveAndBroadcast(state);
  }

  private async changePhase(state: RoomState, phase: GamePhase) {
    state.phase = phase;
    await this.saveAndBroadcast(state, { type: "PHASE_CHANGED", phase, state });
  }

  private async disconnect(socket: WebSocket) {
    const meta = this.sessions.get(socket);
    this.sessions.delete(socket);
    if (!meta?.playerId) return;

    const state = await this.getRoomState();
    if (!state) return;
    const player = state.players.find((item) => item.id === meta.playerId);
    if (!player) return;
    player.connected = false;
    await this.saveAndBroadcast(state, { type: "PLAYER_LEFT", playerId: player.id, state });
  }

  private createEmptyRoom(roomId: string): RoomState {
    const now = new Date().toISOString();
    return {
      roomId,
      hostId: "",
      phase: "LOBBY",
      players: [],
      recipes: [],
      votes: [],
      actions: [],
      createdAt: now,
      updatedAt: now
    };
  }

  private assertHost(state: RoomState, playerId: string) {
    if (state.hostId !== playerId) throw new Error("Solo el host puede hacer esta acción.");
  }

  private assertKnownPhase(phase: GamePhase) {
    if (!PHASES.includes(phase)) throw new Error("Fase no válida.");
  }

  private async requireState() {
    const state = await this.getRoomState();
    if (!state) throw new Error("Sala no encontrada.");
    return state;
  }

  private async getRoomState() {
    return this.state.storage.get<RoomState>("room");
  }

  private async saveRoomState(state: RoomState) {
    state.updatedAt = new Date().toISOString();
    await this.state.storage.put("room", state);
  }

  private async saveAndBroadcast(state: RoomState, event?: ServerEvent) {
    await this.saveRoomState(state);
    this.broadcast(event ?? { type: "ROOM_STATE_UPDATED", state });
  }

  private broadcast(event: ServerEvent) {
    for (const socket of this.sessions.keys()) {
      this.send(socket, event);
      if (event.type !== "ROOM_STATE_UPDATED") {
        this.send(socket, { type: "ROOM_STATE_UPDATED", state: event.state });
      }
    }
  }

  private send(socket: WebSocket, event: ServerEvent) {
    try {
      socket.send(JSON.stringify(event));
    } catch {
      this.sessions.delete(socket);
    }
  }
}
