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

const phaseLabels: Record<GamePhase, string> = {
  LOBBY: "Lobby",
  CHALLENGE: "Reto",
  RECIPE_BUILDING: "Cocina",
  PRESENTATION: "Presentación",
  VOTING: "Votación",
  SUMMARY: "Resumen"
};

const phaseOrder: GamePhase[] = ["LOBBY", "CHALLENGE", "RECIPE_BUILDING", "PRESENTATION", "VOTING", "SUMMARY"];

type Connection = "idle" | "connecting" | "connected" | "disconnected";

type DraftIngredient = RecipeIngredient & {
  draftId: string;
};

export function App() {
  const [roomId, setRoomId] = useState(localStorage.getItem("scrumchef.roomId") ?? "");
  const [playerId, setPlayerId] = useState(sessionStorage.getItem("scrumchef.playerId") ?? "");
  const [playerName, setPlayerName] = useState(localStorage.getItem("scrumchef.playerName") ?? "");
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<Connection>("idle");
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);

  const me = state?.players.find((player) => player.id === playerId);
  const isHost = Boolean(me?.isHost);

  useEffect(() => {
    return () => socketRef.current?.close();
  }, []);

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
      if ("state" in event) setState(event.state);
      if (event.type === "ROOM_JOINED" || event.type === "ROOM_CREATED") {
        setRoomId(event.roomId);
        setPlayerId(event.playerId);
        setPlayerName(cleanName);
        localStorage.setItem("scrumchef.roomId", event.roomId);
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

  const createRoom = async (name: string) => {
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
      <KitchenHeader state={state} playerId={playerId} connection={connection} />
      {state.phase === "LOBBY" && (
        <LobbyScreen state={state} isHost={isHost} onStart={() => send({ type: "START_GAME", playerId })} />
      )}
      {state.phase === "CHALLENGE" && <ChallengeScreen isHost={isHost} onNext={nextPhase} />}
      {state.phase === "RECIPE_BUILDING" && (
        <RecipeBuilderScreen
          state={state}
          playerId={playerId}
          onSubmit={(recipe) => send({ type: "SUBMIT_RECIPE", playerId, recipe })}
        />
      )}
      {state.phase === "PRESENTATION" && <PresentationScreen state={state} isHost={isHost} onNext={nextPhase} />}
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
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}) {
  const [name, setName] = useState(playerName);
  const [code, setCode] = useState(roomId);

  return (
    <section className="home-grid">
      <div className="brand-panel">
        <span className="eyebrow">Retrospectivas Scrum gamificadas</span>
        <h1>ScrumChef</h1>
        <p>La receta del sprint ideal</p>
        <div className="chef-mark">🍳</div>
      </div>
      <div className="join-panel">
        <h2>Entrar a cocina</h2>
        <label>
          Nombre de jugador
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ada" />
        </label>
        <div className="split-actions">
          <button onClick={() => onCreate(name)} disabled={connection === "connecting"}>Crear sala</button>
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

function KitchenHeader({ state, playerId, connection }: { state: RoomState; playerId: string; connection: Connection }) {
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
        <ConnectionStatus connection={connection} />
      </div>
    </header>
  );
}

function ConnectionStatus({ connection }: { connection: Connection }) {
  return <span className={`connection ${connection}`}>{connection === "connected" ? "Conectado" : connection}</span>;
}

function LobbyScreen({ state, isHost, onStart }: { state: RoomState; isHost: boolean; onStart: () => void }) {
  const connected = state.players.filter((player) => player.connected).length;
  return (
    <section className="screen two-column">
      <div>
        <h2>Brigada en cocina</h2>
        <p className="muted">Mínimo 4 y máximo 8 jugadores. El host inicia cuando el equipo esté listo.</p>
        <div className="players">
          {state.players.map((player) => (
            <div className="player-row" key={player.id}>
              <span className={player.connected ? "dot online" : "dot"} />
              <strong>{player.name}</strong>
              {player.isHost && <small>Host</small>}
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
  return (
    <section className="screen challenge">
      <span className="eyebrow">Reto del sprint</span>
      <h2>Crear la receta del sprint ideal para este equipo</h2>
      <div className="objective-grid">
        {["más claridad", "menos estrés", "mejor colaboración", "más calidad", "más foco"].map((goal) => (
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
  onSubmit
}: {
  state: RoomState;
  playerId: string;
  onSubmit: (recipe: Omit<Recipe, "id" | "playerId" | "playerName" | "submittedAt">) => void;
}) {
  const existing = state.recipes.find((recipe) => recipe.playerId === playerId);
  const [recipeName, setRecipeName] = useState(existing?.recipeName ?? "Sprint al punto");
  const [generalExplanation, setGeneralExplanation] = useState(existing?.generalExplanation ?? "");
  const [selected, setSelected] = useState<DraftIngredient[]>(
    existing?.ingredients.map((item) => ({ ...item, draftId: item.ingredient.id })) ?? []
  );
  const [customOpen, setCustomOpen] = useState(false);
  const total = selected.reduce((sum, item) => sum + Number(item.percentage), 0);
  const canSubmit =
    selected.length > 0 &&
    selected.length <= 5 &&
    total === 100 &&
    generalExplanation.trim().length > 0 &&
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
            <span>⭐</span>
            Ingrediente comodín
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
              placeholder="Por qué entra en la receta"
            />
          </div>
        ))}
        <label>
          Explicación general
          <textarea value={generalExplanation} onChange={(event) => setGeneralExplanation(event.target.value)} />
        </label>
        <button
          disabled={!canSubmit}
          onClick={() => onSubmit({ recipeName, generalExplanation, ingredients: selected })}
        >
          Enviar receta
        </button>
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
        <h2>Ingrediente comodín</h2>
        <label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Descripción<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Porcentaje<input type="number" value={percentage} onChange={(event) => setPercentage(Number(event.target.value))} /></label>
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button disabled={!name.trim() || !description.trim()} onClick={() => onCreate(name, description, percentage)}>
            Añadir
          </button>
        </div>
      </div>
    </div>
  );
}

function PresentationScreen({ state, isHost, onNext }: { state: RoomState; isHost: boolean; onNext: () => void }) {
  const [index, setIndex] = useState(0);
  const recipe = state.recipes[index];
  return (
    <section className="screen presentation">
      {recipe ? <RecipePlate recipe={recipe} /> : <p className="waiting">Todavía no hay recetas enviadas.</p>}
      <div className="presentation-nav">
        <button className="secondary" onClick={() => setIndex(Math.max(0, index - 1))}>Anterior</button>
        <span>{Math.min(index + 1, state.recipes.length)} / {state.recipes.length}</span>
        <button className="secondary" onClick={() => setIndex(Math.min(state.recipes.length - 1, index + 1))}>Siguiente</button>
      </div>
      {isHost ? <button onClick={onNext}>Pasar a votación</button> : <p className="waiting">Esperando al host</p>}
    </section>
  );
}

function RecipePlate({ recipe }: { recipe: Recipe }) {
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
      <p>por {recipe.playerName}</p>
      <p className="muted">{recipe.generalExplanation}</p>
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
  return (
    <section className="screen">
      <h2>Votación</h2>
      <div className="vote-grid">
        {categories.map((category) => (
          <VotingPanel
            key={category.id}
            category={category}
            recipes={state.recipes.filter((recipe) => recipe.playerId !== playerId)}
            voted={state.votes.some((vote) => vote.voterPlayerId === playerId && vote.category === category.id)}
            onVote={onVote}
          />
        ))}
      </div>
      {isHost ? <button onClick={onNext}>Ver resumen</button> : <p className="waiting">Esperando al host</p>}
    </section>
  );
}

function VotingPanel({
  category,
  recipes,
  voted,
  onVote
}: {
  category: { id: Vote["category"]; label: string };
  recipes: Recipe[];
  voted: boolean;
  onVote: (targetRecipeId: string, category: Vote["category"]) => void;
}) {
  return (
    <div className="vote-panel">
      <h3>{category.label}</h3>
      {recipes.map((recipe) => (
        <button className="secondary" disabled={voted} onClick={() => onVote(recipe.id, category.id)} key={recipe.id}>
          {recipe.recipeName} · {recipe.playerName}
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
  onAddAction: (action: { text: string; owner: string; dueDate?: string }) => void;
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
  onAddAction: (action: { text: string; owner: string; dueDate?: string }) => void;
}) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  return (
    <div className="actions-panel">
      <h2>Acciones finales</h2>
      {actions.map((action) => (
        <div className="action-row" key={action.id}>
          <strong>{action.text}</strong>
          <span>{action.owner}{action.dueDate ? ` · ${action.dueDate}` : ""}</span>
        </div>
      ))}
      {isHost ? (
        <div className="action-form">
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Acción" />
          <input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="Responsable" />
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          <button
            onClick={() => {
              onAddAction({ text, owner, dueDate: dueDate || undefined });
              setText("");
              setOwner("");
              setDueDate("");
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
