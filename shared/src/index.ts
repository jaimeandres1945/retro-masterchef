export type GamePhase =
  | "LOBBY"
  | "CHALLENGE"
  | "RECIPE_BUILDING"
  | "PRESENTATION"
  | "VOTING"
  | "SUMMARY";

export type IngredientType =
  | "COMMUNICATION"
  | "COLLABORATION"
  | "LIGHT_REFINEMENT"
  | "OWNERSHIP"
  | "QUALITY"
  | "FOCUS"
  | "FLEXIBILITY"
  | "INNOVATION"
  | "WELLBEING"
  | "VISIBILITY"
  | "CUSTOM_INGREDIENT";

export interface Ingredient {
  id: string;
  type: IngredientType;
  name: string;
  description: string;
  color: string;
  icon: string;
  isCustom: boolean;
}

export interface RecipeIngredient {
  ingredient: Ingredient;
  percentage: number;
  explanation?: string;
}

export interface Recipe {
  id: string;
  playerId: string;
  playerName: string;
  recipeName: string;
  ingredients: RecipeIngredient[];
  generalExplanation: string;
  submittedAt: string;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
}

export interface Vote {
  id: string;
  voterPlayerId: string;
  targetRecipeId: string;
  category: "BALANCED" | "INNOVATIVE" | "REALISTIC";
}

export interface ActionItem {
  id: string;
  text: string;
  owner: string;
  dueDate?: string;
}

export interface RoomState {
  roomId: string;
  hostId: string;
  phase: GamePhase;
  players: Player[];
  recipes: Recipe[];
  votes: Vote[];
  actions: ActionItem[];
  createdAt: string;
  updatedAt: string;
}

export type ClientEvent =
  | { type: "CREATE_ROOM"; playerName: string }
  | { type: "JOIN_ROOM"; playerName: string; playerId?: string }
  | { type: "START_GAME"; playerId: string }
  | { type: "CHANGE_PHASE"; playerId: string; phase: GamePhase }
  | { type: "SUBMIT_RECIPE"; playerId: string; recipe: Omit<Recipe, "id" | "playerId" | "playerName" | "submittedAt"> }
  | { type: "UPDATE_RECIPE"; playerId: string; recipe: Omit<Recipe, "id" | "playerId" | "playerName" | "submittedAt"> }
  | { type: "SUBMIT_VOTE"; playerId: string; targetRecipeId: string; category: Vote["category"] }
  | { type: "ADD_ACTION"; playerId: string; action: Omit<ActionItem, "id"> }
  | { type: "REMOVE_PLAYER"; playerId: string; targetPlayerId: string }
  | { type: "PING" };

export type ServerEvent =
  | { type: "ROOM_CREATED"; roomId: string; playerId: string; state: RoomState }
  | { type: "ROOM_JOINED"; roomId: string; playerId: string; state: RoomState }
  | { type: "ROOM_STATE_UPDATED"; state: RoomState }
  | { type: "PLAYER_JOINED"; player: Player; state: RoomState }
  | { type: "PLAYER_LEFT"; playerId: string; state: RoomState }
  | { type: "PHASE_CHANGED"; phase: GamePhase; state: RoomState }
  | { type: "ERROR"; message: string }
  | { type: "PONG" };

export const PHASES: GamePhase[] = [
  "LOBBY",
  "CHALLENGE",
  "RECIPE_BUILDING",
  "PRESENTATION",
  "VOTING",
  "SUMMARY"
];

export const INGREDIENTS: Ingredient[] = [
  {
    id: "communication",
    type: "COMMUNICATION",
    name: "Comunicación clara",
    color: "#7dd3fc",
    icon: "💬",
    description: "Prioridades visibles, seguimiento correcto y feedback temprano.",
    isCustom: false
  },
  {
    id: "collaboration",
    type: "COLLABORATION",
    name: "Colaboración",
    color: "#22c55e",
    icon: "🤝",
    description: "Ayuda entre compañeros, pairing y compartir conocimiento.",
    isCustom: false
  },
  {
    id: "light-refinement",
    type: "LIGHT_REFINEMENT",
    name: "Refinamiento ligero",
    color: "#facc15",
    icon: "📋",
    description: "Análisis técnico suficiente para entender tareas sin hacer reuniones pesadas.",
    isCustom: false
  },
  {
    id: "ownership",
    type: "OWNERSHIP",
    name: "Ownership claro",
    color: "#a78bfa",
    icon: "🎯",
    description: "Responsabilidades claras, cobertura definida y decisiones visibles.",
    isCustom: false
  },
  {
    id: "quality",
    type: "QUALITY",
    name: "Calidad",
    color: "#fb923c",
    icon: "✅",
    description: "Testing, validación, Definition of Done y revisión antes de cerrar.",
    isCustom: false
  },
  {
    id: "focus",
    type: "FOCUS",
    name: "Foco",
    color: "#f87171",
    icon: "🔥",
    description: "Menos interrupciones, menos multitasking y menos cambios de prioridad.",
    isCustom: false
  },
  {
    id: "flexibility",
    type: "FLEXIBILITY",
    name: "Flexibilidad",
    color: "#67e8f9",
    icon: "🔄",
    description: "Capacidad del equipo para adaptarse si alguien se bloquea o no está disponible.",
    isCustom: false
  },
  {
    id: "innovation",
    type: "INNOVATION",
    name: "Innovación",
    color: "#f472b6",
    icon: "🚀",
    description: "Uso de IA, automatización, mejoras técnicas y nuevas formas de trabajar.",
    isCustom: false
  },
  {
    id: "wellbeing",
    type: "WELLBEING",
    name: "Bienestar",
    color: "#15803d",
    icon: "🧠",
    description: "Menos estrés, más seguridad psicológica y mejor equilibrio.",
    isCustom: false
  },
  {
    id: "visibility",
    type: "VISIBILITY",
    name: "Visibilidad",
    color: "#9ca3af",
    icon: "👀",
    description: "Estado real de tareas, bloqueos, riesgos y dependencias visibles.",
    isCustom: false
  }
];

export const CUSTOM_INGREDIENT_TEMPLATE: Ingredient = {
  id: "custom-ingredient",
  type: "CUSTOM_INGREDIENT",
  name: "Ingrediente comodín",
  color: "#111827",
  icon: "⭐",
  description: "Ingrediente personalizado creado por el jugador.",
  isCustom: true
};
