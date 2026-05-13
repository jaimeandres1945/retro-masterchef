import { useEffect, useMemo, useRef, useState } from "react";
import {
  CUSTOM_INGREDIENT_TEMPLATE,
  GamePhase,
  INGREDIENTS,
  Ingredient,
  Recipe,
  RecipeIngredient,
  RoomState,
  ServerEvent,
  Vote
} from "@scrumchef/shared";

const API_URL = import.meta.env.VITE_WORKER_URL ?? "http://localhost:8787";
const WS_URL = API_URL.replace(/^http/, "ws");
const ADMIN_USER = "retroAdmin";
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? "retroAdmin";

const phaseLabels: Record<GamePhase, string> = {
  LOBBY: "Lobby",
  CHALLENGE: "Reto",
  RECIPE_BUILDING: "Cocina",
  PRESENTATION: "Presentaci\u00f3n",
  VOTING: "Votaci\u00f3n",
  SUMMARY: "Resumen"
};

const phaseOrder: GamePhase[] = ["LOBBY", "CHALLENGE", "RECIPE_BUILDING", "PRESENTATION", "VOTING", "SUMMARY"];

type Connection = "idle" | "connecting" | "connected" | "disconnected";

type DraftIngredient = RecipeIngredient & {
  draftId: string;
};

const initialParams = new URLSearchParams(window.location.search);
const initialRoomId = (initialParams.get("room") ?? initialParams.get("code") ?? "").trim().toUpperCase();
const initialPlayerName = (initialParams.get("name") ?? "").trim();

const parseInvitees = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem("scrumchef.invitees") ?? "[]") as string[];
    return Array.isArray(stored) ? stored.filter(Boolean) : [];
  } catch {
    return [];
  }
};

export function App() {
  const [roomId, setRoomId] = useState(initialRoomId || sessionStorage.getItem("scrumchef.roomId") || "");
  const [playerId, setPlayerId] = useState(sessionStorage.getItem("scrumchef.playerId") ?? "");
  const [playerName, setPlayerName] = useState(initialPlayerName || localStorage.getItem("scrumchef.playerName") || "");
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<Connection>("idle");
  const [authenticated, setAuthenticated] = useState(sessionStorage.getItem("scrumchef.auth") === "true");
  const [error, setError] = useState("");
  const [invitees, setInvitees] = useState<string[]>(parseInvitees);
  const socketRef = useRef<WebSocket | null>(null);
  const inviteAutoJoinRef = useRef(false);

  const me = state?.players.find((player) => player.id === playerId);
  const isHost = Boolean(me?.isHost);

  const updateInvitees = (names: string[]) => {
    const cleaned = names.map((item) => item.trim()).filter(Boolean).slice(0, 7);
    setInvitees(cleaned);
    sessionStorage.setItem("scrumchef.invitees", JSON.stringify(cleaned));
  };

  const resetToHome = (message?: string) => {
    socketRef.current?.close();
    socketRef.current = null;
    setState(null);
    setPlayerId("");
    setConnection("idle");
    sessionStorage.removeItem("scrumchef.playerId");
    sessionStorage.removeItem("scrumchef.roomId");
    sessionStorage.removeItem("scrumchef.invitees");
    setInvitees([]);
    if (message) setError(message);
  };

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

  useEffect(() => {
    if (state && playerId && !state.players.some((player) => player.id === playerId)) {
      resetToHome("Has salido de la sala.");
    }
  }, [state, playerId]);

  const send = (payload: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    } else {
      setError("No hay conexión con la sala.");
    }
  };

  const connectRoom = (targetRoomId: string, name: string, existingPlayerId?: string) => {
    const normalizedRoom = targetRoomId.trim().toUpperCase();
    const cleanName = name.trim();
    if (!normalizedRoom || !cleanName) {
      setError("Necesitas nombre y código de sala.");
      return;
    }

    socketRef.current?.close();
    setConnection("connecting");
    setError("");
    const socket = new WebSocket(`${WS_URL}/api/rooms/${normalizedRoom}/ws`);
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "JOIN_ROOM", playerName: cleanName, playerId: existingPlayerId }));
    };
    socket.onmessage = (message) => {
      const event = JSON.parse(message.data) as ServerEvent;
      if (event.type === "ERROR") {
        setError(event.message);
        return;
      }
      if (event.type === "ROOM_CLOSED") {
        resetToHome("El host ha cerrado la sala.");
        return;
      }
      if ("state" in event) setState(event.state);
      if (event.type === "ROOM_JOINED" || event.type === "ROOM_CREATED") {
        setRoomId(event.roomId);
        setPlayerId(event.playerId);
        setPlayerName(cleanName);
        sessionStorage.setItem("scrumchef.roomId", event.roomId);
        localStorage.setItem("scrumchef.playerName", cleanName);
        localStorage.removeItem("scrumchef.playerId");
        sessionStorage.setItem("scrumchef.playerId", event.playerId);
      }
      setConnection("connected");
    };
    socket.onclose = () => setConnection("disconnected");
    socket.onerror = () => {
      setConnection("disconnected");
      setError("No se pudo conectar con el Worker.");
    };
  };

  const createRoom = async (name: string, plannedInvitees: string[]) => {
    if (!name.trim()) {
      setError("Escribe tu nombre para crear una sala.");
      return;
    }
    setConnection("connecting");
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/rooms`, { method: "POST" });
      if (!response.ok) throw new Error("No se pudo crear la sala.");
      const data = (await response.json()) as { roomId: string };
      updateInvitees(plannedInvitees);
      connectRoom(data.roomId, name);
    } catch (caught) {
      setConnection("disconnected");
      setError(caught instanceof Error ? caught.message : "Error creando la sala.");
    }
  };

  const changePhase = (phase: GamePhase) => send({ type: "CHANGE_PHASE", playerId, phase });
  const joinRoom = (name: string, code: string) => {
    const sameSession =
      Boolean(playerId) &&
      code.trim().toUpperCase() === roomId.trim().toUpperCase() &&
      name.trim() === playerName.trim();
    connectRoom(code, name, sameSession ? playerId : undefined);
  };

  const nextPhase = () => {
    if (!state) return;
    const next = phaseOrder[phaseOrder.indexOf(state.phase) + 1];
    if (next) changePhase(next);
  };

  useEffect(() => {
    if (!authenticated || inviteAutoJoinRef.current || !initialRoomId || !initialPlayerName || state) return;
    if (connection === "connecting" || connection === "connected") return;
    inviteAutoJoinRef.current = true;
    connectRoom(initialRoomId, initialPlayerName);
  }, [authenticated, connection, state]);

  const login = (username: string, password: string) => {
    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
      sessionStorage.setItem("scrumchef.auth", "true");
      setAuthenticated(true);
      setError("");
      return;
    }
    setError("Usuario o contraseña incorrectos.");
  };

  if (!authenticated) {
    return (
      <Shell error={error}>
        <AccessScreen onLogin={login} />
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell error={error}>
        <HomeScreen
          playerName={playerName}
          roomId={roomId}
          connection={connection}
          onCreate={createRoom}
          onJoin={joinRoom}
        />
      </Shell>
    );
  }

  return (
    <Shell error={error}>
      <KitchenHeader state={state} playerId={playerId} connection={connection} onCloseRoom={() => send({ type: "CLOSE_ROOM", playerId })} />
      {state.phase === "LOBBY" && (
        <LobbyScreen
          state={state}
          playerId={playerId}
          isHost={isHost}
          onStart={() => send({ type: "START_GAME", playerId })}
          onRemove={(targetPlayerId) => send({ type: "REMOVE_PLAYER", playerId, targetPlayerId })}
          onCloseRoom={() => send({ type: "CLOSE_ROOM", playerId })}
          invitees={invitees}
          onUpdateInvitees={updateInvitees}
        />
      )}
      {state.phase === "CHALLENGE" && <ChallengeScreen isHost={isHost} onNext={nextPhase} />}
      {state.phase === "RECIPE_BUILDING" && (
        <RecipeBuilderScreen
          state={state}
          playerId={playerId}
          isHost={isHost}
          onNext={nextPhase}
          onSubmit={(recipe) => send({ type: "SUBMIT_RECIPE", playerId, recipe })}
        />
      )}
      {state.phase === "PRESENTATION" && <PresentationScreen state={state} isHost={isHost} playerId={playerId} onNext={nextPhase} />}
      {state.phase === "VOTING" && (
        <VotingScreen
          state={state}
          playerId={playerId}
          isHost={isHost}
          onVote={(targetRecipeId, category) => send({ type: "SUBMIT_VOTE", playerId, targetRecipeId, category })}
          onNext={nextPhase}
        />
      )}
      {state.phase === "SUMMARY" && (
        <SummaryScreen
          state={state}
          isHost={isHost}
          onAddAction={(action) => send({ type: "ADD_ACTION", playerId, action })}
        />
      )}
    </Shell>
  );
}

function Shell({ children, error }: { children: React.ReactNode; error?: string }) {
  return (
    <main className="app-shell">
      <div className="backdrop" />
      {children}
      {error && <div className="toast">{error}</div>}
    </main>
  );
}

function AccessScreen({ onLogin }: { onLogin: (username: string, password: string) => void }) {
  const [username, setUsername] = useState("retroAdmin");
  const [password, setPassword] = useState("");

  return (
    <section className="home-grid access-grid">
      <div className="brand-panel">
        <span className="eyebrow">Acceso privado</span>
        <h1>ScrumChef</h1>
        <p>La receta del sprint ideal</p>
        <div className="chef-mark">{"\ud83c\udf73"}</div>
      </div>
      <div className="join-panel">
        <h2>Entrar</h2>
        <label>
          Usuario
          <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="retroAdmin" />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onLogin(username, password);
            }}
          />
        </label>
        <button onClick={() => onLogin(username, password)}>Acceder</button>
      </div>
    </section>
  );
}
function HomeScreen({
  playerName,
  roomId,
  connection,
  onCreate,
  onJoin
}: {
  playerName: string;
  roomId: string;
  connection: Connection;
  onCreate: (name: string, invitees: string[]) => void;
  onJoin: (name: string, code: string) => void;
}) {
  const [name, setName] = useState(playerName);
  const [code, setCode] = useState(roomId);
  const [participantText, setParticipantText] = useState("");
  const inviteeNames = participantText
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 7);

  return (
    <section className="home-grid">
      <div className="brand-panel">
        <span className="eyebrow">Retrospectivas Scrum gamificadas</span>
        <h1>ScrumChef</h1>
        <p>La receta del sprint ideal</p>
        <div className="chef-mark">{"\ud83c\udf73"}</div>
      </div>
      <div className="join-panel">
        <h2>Entrar a cocina</h2>
        <label>
          Nombre de jugador
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ada" />
        </label>
        <label>
          Participantes invitados
          <textarea
            value={participantText}
            onChange={(event) => setParticipantText(event.target.value)}
            placeholder="Un nombre por linea"
          />
        </label>
        <div className="split-actions">
          <button onClick={() => onCreate(name, inviteeNames)} disabled={connection === "connecting"}>Crear sala</button>
          <span>o</span>
        </div>
        <label>
          Código de sala
          <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC123" />
        </label>
        <button className="secondary" onClick={() => onJoin(name, code)} disabled={connection === "connecting"}>
          Unirse a sala
        </button>
        <ConnectionStatus connection={connection} />
      </div>
    </section>
  );
}

function KitchenHeader({
  state,
  playerId,
  connection,
  onCloseRoom
}: {
  state: RoomState;
  playerId: string;
  connection: Connection;
  onCloseRoom: () => void;
}) {
  const me = state.players.find((player) => player.id === playerId);
  const [copied, setCopied] = useState(false);
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(state.roomId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <header className="kitchen-header">
      <div>
        <span className="eyebrow">ScrumChef</span>
        <h1>{phaseLabels[state.phase]}</h1>
      </div>
      <div className="header-meta">
        <div className="room-code">
          <span>Sala</span>
          <strong>{state.roomId}</strong>
          <button
            type="button"
            className="icon-button"
            onClick={copyRoomId}
            aria-label="Copiar código de sala"
            title="Copiar código de sala"
          >
            {copied ? "OK" : "📋"}
          </button>
        </div>
        <span>{me?.isHost ? "Host" : "Jugador"}</span>
        {me?.isHost && (
          <button type="button" className="danger secondary small-button" onClick={onCloseRoom}>
            Cerrar sala
          </button>
        )}
        <ConnectionStatus connection={connection} />
      </div>
    </header>
  );
}

function buildInviteUrl(roomId: string, name: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  url.searchParams.set("name", name);
  return url.toString();
}

function ConnectionStatus({ connection }: { connection: Connection }) {
  return <span className={`connection ${connection}`}>{connection === "connected" ? "Conectado" : connection}</span>;
}

function LobbyScreen({
  state,
  playerId,
  isHost,
  onStart,
  onRemove,
  onCloseRoom,
  invitees,
  onUpdateInvitees
}: {
  state: RoomState;
  playerId: string;
  isHost: boolean;
  onStart: () => void;
  onRemove: (targetPlayerId: string) => void;
  onCloseRoom: () => void;
  invitees: string[];
  onUpdateInvitees: (names: string[]) => void;
}) {
  const connected = state.players.filter((player) => player.connected).length;
  const [copiedInvites, setCopiedInvites] = useState(false);
  const [inviteText, setInviteText] = useState(invitees.join("\n"));
  const inviteUrls = invitees.map((name) => ({ name, url: buildInviteUrl(state.roomId, name) }));
  useEffect(() => {
    setInviteText(invitees.join("\n"));
  }, [invitees]);
  const saveInvitees = () => {
    onUpdateInvitees(
      inviteText
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    );
  };
  const copyInviteUrls = async () => {
    const text = inviteUrls.map((invite) => `${invite.name}: ${invite.url}`).join("\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedInvites(true);
    window.setTimeout(() => setCopiedInvites(false), 1600);
  };
  return (
    <section className="screen two-column">
      <div>
        <h2>Brigada en cocina</h2>
        <p className="muted">Mínimo 4 y máximo 8 jugadores. El host inicia cuando el equipo esté listo.</p>
        {isHost && (
          <div className="invite-panel">
            <div className="invite-heading">
              <strong>URLs de invitacion</strong>
              <div className="invite-actions">
                <button className="secondary small-button" onClick={saveInvitees}>
                  Generar URLs
                </button>
                <button className="secondary small-button" disabled={inviteUrls.length === 0} onClick={copyInviteUrls}>
                  {copiedInvites ? "Copiadas" : "Copiar lista"}
                </button>
              </div>
            </div>
            <textarea
              value={inviteText}
              onChange={(event) => setInviteText(event.target.value)}
              placeholder="Un nombre por linea"
            />
            {inviteUrls.length === 0 ? (
              <p className="muted">Escribe participantes y pulsa Generar URLs.</p>
            ) : (
              inviteUrls.map((invite) => (
                <div className="invite-row" key={invite.name}>
                  <strong>{invite.name}</strong>
                  <span>{invite.url}</span>
                </div>
              ))
            )}
          </div>
        )}
        <div className="players">
          {state.players.map((player) => (
            <div className="player-row" key={player.id}>
              <span className={player.connected ? "dot online" : "dot"} />
              <strong>{player.name}</strong>
              <div className="player-actions">
                {player.isHost && <small>Host</small>}
                {isHost && player.id !== playerId && (
                  <button className="danger small-button" onClick={() => onRemove(player.id)}>
                    Sacar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="host-panel">
        <div className="big-number">{connected}/8</div>
        <p>jugadores conectados</p>
        {isHost ? (
          <button disabled={connected < 4} onClick={onStart}>Iniciar cocina</button>
        ) : (
          <p className="waiting">Esperando al host</p>
        )}
      </div>
    </section>
  );
}

function ChallengeScreen({ isHost, onNext }: { isHost: boolean; onNext: () => void }) {
  const goals = [
    "M\u00e1s Claridad",
    "Menos Estr\u00e9s",
    "Mejor Colaboraci\u00f3n",
    "M\u00e1s Calidad",
    "M\u00e1s Foco"
  ];
  return (
    <section className="screen challenge">
      <span className="eyebrow">Reto del sprint</span>
      <h2>Crear la receta del sprint ideal para este equipo</h2>
      <div className="objective-grid">
        {goals.map((goal) => (
          <div className="objective" key={goal}>{goal}</div>
        ))}
      </div>
      {isHost ? <button onClick={onNext}>Abrir despensa</button> : <p className="waiting">Esperando al host</p>}
    </section>
  );
}

function RecipeBuilderScreen({
  state,
  playerId,
  isHost,
  onNext,
  onSubmit
}: {
  state: RoomState;
  playerId: string;
  isHost: boolean;
  onNext: () => void;
  onSubmit: (recipe: Omit<Recipe, "id" | "playerId" | "playerName" | "submittedAt">) => void;
}) {
  const existing = state.recipes.find((recipe) => recipe.playerId === playerId);
  const [showHostNames, setShowHostNames] = useState(false);
  const submittedCount = state.recipes.length;
  const visibleRecipes = isHost ? state.recipes : state.recipes.filter((recipe) => recipe.playerId === playerId);
  const [recipeName, setRecipeName] = useState(existing?.recipeName ?? "Sprint al punto");
  const generalExplanation = existing?.generalExplanation ?? "";
  const [selected, setSelected] = useState<DraftIngredient[]>(
    existing?.ingredients.map((item) => ({ ...item, draftId: item.ingredient.id })) ?? []
  );
  const [customOpen, setCustomOpen] = useState(false);
  const total = selected.reduce((sum, item) => sum + Number(item.percentage), 0);
  const canSubmit =
    selected.length > 0 &&
    selected.length <= 5 &&
    total === 100 &&
    selected.some((item) => item.explanation?.trim());

  const toggleIngredient = (ingredient: Ingredient) => {
    const exists = selected.some((item) => item.ingredient.id === ingredient.id);
    if (exists) {
      setSelected(selected.filter((item) => item.ingredient.id !== ingredient.id));
      return;
    }
    if (selected.length >= 5) return;
    setSelected([...selected, { draftId: ingredient.id, ingredient, percentage: 0, explanation: "" }]);
  };

  const updateSelected = (draftId: string, patch: Partial<RecipeIngredient>) => {
    setSelected(selected.map((item) => (item.draftId === draftId ? { ...item, ...patch } : item)));
  };

  const addCustom = (name: string, description: string, percentage: number) => {
    if (selected.length >= 5) return;
    const ingredient: Ingredient = {
      ...CUSTOM_INGREDIENT_TEMPLATE,
      id: `custom-${crypto.randomUUID()}`,
      name,
      description
    };
    setSelected([...selected, { draftId: ingredient.id, ingredient, percentage, explanation: description }]);
    setCustomOpen(false);
  };

  return (
    <section className="screen builder">
      <div className="builder-main">
        <h2>Despensa Scrum</h2>
        <div className="ingredient-grid">
          {INGREDIENTS.map((ingredient) => (
            <IngredientCard
              ingredient={ingredient}
              selected={selected.some((item) => item.ingredient.id === ingredient.id)}
              onClick={() => toggleIngredient(ingredient)}
              key={ingredient.id}
            />
          ))}
          <button className="custom-card" onClick={() => setCustomOpen(true)} disabled={selected.length >= 5}>
            <span>{"\u2b50"}</span>
            {"Ingrediente comod\u00edn"}
          </button>
        </div>
      </div>
      <aside className="recipe-editor">
        <h2>Tu receta</h2>
        <label>
          Nombre
          <input value={recipeName} onChange={(event) => setRecipeName(event.target.value)} />
        </label>
        <div className={total === 100 ? "total ok" : "total"}>{total}% / 100%</div>
        {selected.map((item) => (
          <div className="selected-row" key={item.draftId}>
            <strong>{item.ingredient.icon} {item.ingredient.name}</strong>
            <input
              type="number"
              min="0"
              max="100"
              value={item.percentage}
              onChange={(event) => updateSelected(item.draftId, { percentage: Number(event.target.value) })}
            />
            <textarea
              value={item.explanation ?? ""}
              onChange={(event) => updateSelected(item.draftId, { explanation: event.target.value })}
              placeholder="Por qu\u00e9 entra en la receta"
            />
          </div>
        ))}
        {!canSubmit && (
          <p className="form-hint">Selecciona ingredientes, suma 100% y a\u00f1ade explicaci\u00f3n en al menos uno.</p>
        )}
        <button
          disabled={!canSubmit}
          onClick={() => onSubmit({ recipeName, generalExplanation, ingredients: selected })}
        >
          {existing ? "Actualizar receta" : "Enviar receta"}
        </button>
        {existing && <p className="success-hint">Receta enviada. Puedes editarla mientras el host no avance.</p>}
        <div className="submitted-panel">
          <div className="submitted-heading">
            <strong>Recetas enviadas</strong>
            <span>{submittedCount}/{state.players.length}</span>
          </div>
          {isHost && (
            <label className="inline-toggle">
              <input type="checkbox" checked={showHostNames} onChange={(event) => setShowHostNames(event.target.checked)} />
              Ver nombres
            </label>
          )}
          {visibleRecipes.length === 0 ? (
            <p className="muted">Todav\u00eda no hay recetas enviadas.</p>
          ) : (
            visibleRecipes.map((recipe, index) => (
              <RecipeSummaryCard
                recipe={recipe}
                displayName={isHost && !showHostNames ? `Receta ${index + 1}` : recipe.playerName}
                key={recipe.id}
              />
            ))
          )}
        </div>
        {isHost ? (
          <button className="secondary" disabled={state.recipes.length === 0} onClick={onNext}>
            Ver recetas para debatir
          </button>
        ) : (
          <p className="waiting">Cuando todos env\u00eden, el host pasar\u00e1 a la presentaci\u00f3n.</p>
        )}
      </aside>
      {customOpen && <CustomIngredientModal onClose={() => setCustomOpen(false)} onCreate={addCustom} />}
    </section>
  );
}

function IngredientCard({ ingredient, selected, onClick }: { ingredient: Ingredient; selected: boolean; onClick: () => void }) {
  return (
    <button className={`ingredient-card ${selected ? "selected" : ""}`} onClick={onClick}>
      <span className="ingredient-icon" style={{ background: ingredient.color }}>{ingredient.icon}</span>
      <strong>{ingredient.name}</strong>
      <small>{ingredient.description}</small>
    </button>
  );
}

function CustomIngredientModal({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (name: string, description: string, percentage: number) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [percentage, setPercentage] = useState(0);
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{"Ingrediente comod\u00edn"}</h2>
        <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Descripci\u00f3n<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Porcentaje<input type="number" value={percentage} onChange={(event) => setPercentage(Number(event.target.value))} /></label>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button disabled={!name.trim() || !description.trim()} onClick={() => onCreate(name, description, percentage)}>
            A\u00f1adir
          </button>
        </div>
      </div>
    </div>
  );
}


function RecipeSummaryCard({
  recipe,
  displayName,
  showExplanations = false
}: {
  recipe: Recipe;
  displayName: string;
  showExplanations?: boolean;
}) {
  return (
    <article className="recipe-summary-card">
      <div>
        <strong>{displayName}</strong>
        <span>{recipe.recipeName}</span>
      </div>
      <ul>
        {recipe.ingredients.map((item) => (
          <li key={item.ingredient.id}>
            <div className="recipe-summary-line">
              <span>{item.ingredient.icon} {item.ingredient.name}</span>
              <strong>{item.percentage}%</strong>
            </div>
            {showExplanations && item.explanation && <p>{item.explanation}</p>}
          </li>
        ))}
      </ul>
    </article>
  );
}
function PresentationScreen({
  state,
  isHost,
  playerId,
  onNext
}: {
  state: RoomState;
  isHost: boolean;
  playerId: string;
  onNext: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [showHostNames, setShowHostNames] = useState(false);
  const visibleRecipes = isHost ? state.recipes : state.recipes.filter((recipe) => recipe.playerId === playerId);
  const safeIndex = Math.min(index, Math.max(visibleRecipes.length - 1, 0));
  const recipe = visibleRecipes[safeIndex];
  return (
    <section className="screen presentation">
      {isHost && (
        <label className="inline-toggle">
          <input type="checkbox" checked={showHostNames} onChange={(event) => setShowHostNames(event.target.checked)} />
          Ver nombres
        </label>
      )}
      {recipe ? (
        <RecipePlate recipe={recipe} displayName={isHost && !showHostNames ? `Receta ${safeIndex + 1}` : recipe.playerName} />
      ) : (
        <p className="waiting">Todavia no hay recetas enviadas.</p>
      )}
      <div className="presentation-nav">
        <button className="secondary" onClick={() => setIndex(Math.max(0, safeIndex - 1))}>Anterior</button>
        <span>{visibleRecipes.length === 0 ? 0 : safeIndex + 1} / {visibleRecipes.length}</span>
        <button className="secondary" onClick={() => setIndex(Math.min(visibleRecipes.length - 1, safeIndex + 1))}>Siguiente</button>
      </div>
      {isHost ? <button onClick={onNext}>Pasar a votacion</button> : <p className="waiting">Esperando al host</p>}
    </section>
  );
}
function RecipePlate({ recipe, displayName }: { recipe: Recipe; displayName: string }) {
  return (
    <article className="plate-wrap">
      <div className="plate">
        {recipe.ingredients.map((item) => (
          <div className="plate-chip" style={{ borderColor: item.ingredient.color }} key={item.ingredient.id}>
            <span>{item.ingredient.icon}</span>
            <strong>{item.percentage}%</strong>
          </div>
        ))}
      </div>
      <h2>{recipe.recipeName}</h2>
      <p>por {displayName}</p>
      <div className="recipe-talk-list">
        {recipe.ingredients.map((item) => (
          <div className="recipe-talk-item" key={item.ingredient.id}>
            <div>
              <strong>{item.ingredient.icon} {item.ingredient.name}</strong>
              <span>{item.percentage}%</span>
            </div>
            {item.explanation && <p>{item.explanation}</p>}
          </div>
        ))}
      </div>
    </article>
  );
}

function VotingScreen({
  state,
  playerId,
  isHost,
  onVote,
  onNext
}: {
  state: RoomState;
  playerId: string;
  isHost: boolean;
  onVote: (targetRecipeId: string, category: Vote["category"]) => void;
  onNext: () => void;
}) {
  const categories: Array<{ id: Vote["category"]; label: string }> = [
    { id: "BALANCED", label: "Más equilibrada" },
    { id: "INNOVATIVE", label: "Más innovadora" },
    { id: "REALISTIC", label: "Más realista" }
  ];
  const ownRecipe = state.recipes.find((recipe) => recipe.playerId === playerId);
  const votableRecipes = state.recipes.filter((recipe) => recipe.playerId !== playerId);
  const recipeDisplayName = (recipe: Recipe) => {
    const player = state.players.find((item) => item.id === recipe.playerId);
    return player?.isHost ? `${recipe.playerName} (Host)` : recipe.playerName;
  };
  return (
    <section className="screen">
      <h2>Votación</h2>
      <div className="vote-grid">
        {categories.map((category) => (
          <VotingPanel
            key={category.id}
            category={category}
            recipes={votableRecipes}
            voted={state.votes.some((vote) => vote.voterPlayerId === playerId && vote.category === category.id)}
            onVote={onVote}
            getDisplayName={recipeDisplayName}
          />
        ))}
      </div>
      <div className="voting-recipes">
        <h3>Recetas disponibles para votar</h3>
        {votableRecipes.length === 0 ? (
          <p className="muted">Todavia no hay otras recetas para votar.</p>
        ) : (
          votableRecipes.map((recipe) => (
            <RecipeSummaryCard recipe={recipe} displayName={recipeDisplayName(recipe)} showExplanations key={recipe.id} />
          ))
        )}
      </div>
      {ownRecipe && (
        <div className="own-vote-recipe">
          <h3>Tu receta, no votable</h3>
          <RecipeSummaryCard recipe={ownRecipe} displayName={recipeDisplayName(ownRecipe)} showExplanations />
        </div>
      )}
      {isHost ? <button onClick={onNext}>Ver resumen</button> : <p className="waiting">Esperando al host</p>}
    </section>
  );
}

function VotingPanel({
  category,
  recipes,
  voted,
  onVote,
  getDisplayName
}: {
  category: { id: Vote["category"]; label: string };
  recipes: Recipe[];
  voted: boolean;
  onVote: (targetRecipeId: string, category: Vote["category"]) => void;
  getDisplayName: (recipe: Recipe) => string;
}) {
  return (
    <div className="vote-panel">
      <h3>{category.label}</h3>
      {recipes.map((recipe) => (
        <button className="secondary" disabled={voted} onClick={() => onVote(recipe.id, category.id)} key={recipe.id}>
          {recipe.recipeName} · {getDisplayName(recipe)}
        </button>
      ))}
      {voted && <small>Voto registrado</small>}
    </div>
  );
}

function SummaryScreen({
  state,
  isHost,
  onAddAction
}: {
  state: RoomState;
  isHost: boolean;
  onAddAction: (action: { text: string; owner: string }) => void;
}) {
  const ranking = useMemo(() => buildRanking(state), [state]);
  const ingredientStats = useMemo(() => buildIngredientStats(state), [state]);
  return (
    <section className="screen summary">
      <div>
        <h2>Ranking de recetas</h2>
        {ranking.map((item) => (
          <div className="result-row" key={item.recipe.id}>
            <strong>{item.recipe.recipeName}</strong>
            <span>{item.votes} votos</span>
          </div>
        ))}
      </div>
      <div>
        <h2>Ingredientes clave</h2>
        {ingredientStats.map((item) => (
          <div className="result-row" key={item.name}>
            <strong>{item.icon} {item.name}</strong>
            <span>{item.count} usos · {Math.round(item.average)}%</span>
          </div>
        ))}
      </div>
      <ActionPanel actions={state.actions} isHost={isHost} onAddAction={onAddAction} />
    </section>
  );
}

function ActionPanel({
  actions,
  isHost,
  onAddAction
}: {
  actions: RoomState["actions"];
  isHost: boolean;
  onAddAction: (action: { text: string; owner: string }) => void;
}) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  return (
    <div className="actions-panel">
      <h2>Acciones finales</h2>
      {actions.length === 0 && <p className="muted">Todavia no hay acciones finales.</p>}
      {actions.map((action) => (
        <div className="action-row" key={action.id}>
          <strong>{action.text}</strong>
          <span>{action.owner}</span>
        </div>
      ))}
      {isHost ? (
        <div className="action-form">
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Acción" />
          <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Responsable" />
          <button
            onClick={() => {
              onAddAction({ text, owner });
              setText("");
              setOwner("");
            }}
          >
            Añadir acción
          </button>
        </div>
      ) : (
        <p className="waiting">El host añade las acciones finales.</p>
      )}
    </div>
  );
}

function buildRanking(state: RoomState) {
  return state.recipes
    .map((recipe) => ({
      recipe,
      votes: state.votes.filter((vote) => vote.targetRecipeId === recipe.id).length
    }))
    .sort((a, b) => b.votes - a.votes);
}

function buildIngredientStats(state: RoomState) {
  const stats = new Map<string, { name: string; icon: string; count: number; total: number }>();
  for (const recipe of state.recipes) {
    for (const item of recipe.ingredients) {
      const key = item.ingredient.name;
      const current = stats.get(key) ?? { name: item.ingredient.name, icon: item.ingredient.icon, count: 0, total: 0 };
      current.count += 1;
      current.total += item.percentage;
      stats.set(key, current);
    }
  }
  return [...stats.values()]
    .map((item) => ({ ...item, average: item.total / item.count }))
    .sort((a, b) => b.count - a.count || b.average - a.average);
}
