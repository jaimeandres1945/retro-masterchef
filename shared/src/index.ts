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
  | { type: "CLOSE_ROOM"; playerId: string }
  | { type: "PING" };

export type ServerEvent =
  | { type: "ROOM_CREATED"; roomId: string; playerId: string; state: RoomState }
  | { type: "ROOM_JOINED"; roomId: string; playerId: string; state: RoomState }
  | { type: "ROOM_STATE_UPDATED"; state: RoomState }
  | { type: "PLAYER_JOINED"; player: Player; state: RoomState }
  | { type: "PLAYER_LEFT"; playerId: string; state: RoomState }
  | { type: "PHASE_CHANGED"; phase: GamePhase; state: RoomState }
  | { type: "ROOM_CLOSED" }
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
    name: "Comunicaci\u00f3n clara",
    color: "#7dd3fc",
    icon: "\ud83d\udcac",
    description: "Prioridades visibles, seguimiento correcto y feedback temprano.",
    isCustom: false
  },
  {
    id: "collaboration",
    type: "COLLABORATION",
    name: "Colaboraci\u00f3n",
    color: "#22c55e",
    icon: "\ud83e\udd1d",
    description: "Ayuda entre compa\u00f1eros, pairing y compartir conocimiento.",
    isCustom: false
  },
  {
    id: "light-refinement",
    type: "LIGHT_REFINEMENT",
    name: "Refinamiento ligero",
    color: "#facc15",
    icon: "\ud83d\udccb",
    description: "An\u00e1lisis t\u00e9cnico suficiente para entender tareas sin hacer reuniones pesadas.",
    isCustom: false
  },
  {
    id: "ownership",
    type: "OWNERSHIP",
    name: "Ownership claro",
    color: "#a78bfa",
    icon: "\ud83c\udfaf",
    description: "Responsabilidades claras, cobertura definida y decisiones visibles.",
    isCustom: false
  },
  {
    id: "quality",
    type: "QUALITY",
    name: "Calidad",
    color: "#fb923c",
    icon: "\u2705",
    description: "Testing, validaci\u00f3n, Definition of Done y revisi\u00f3n antes de cerrar.",
    isCustom: false
  },
  {
    id: "focus",
    type: "FOCUS",
    name: "Foco",
    color: "#f87171",
    icon: "\ud83d\udd25",
    description: "Menos interrupciones, menos multitasking y menos cambios de prioridad.",
    isCustom: false
  },
  {
    id: "flexibility",
    type: "FLEXIBILITY",
    name: "Flexibilidad",
    color: "#67e8f9",
    icon: "\ud83d\udd04",
    description: "Capacidad del equipo para adaptarse si alguien se bloquea o no est\u00e1 disponible.",
    isCustom: false
  },
  {
    id: "innovation",
    type: "INNOVATION",
    name: "Innovaci\u00f3n",
    color: "#f472b6",
    icon: "\ud83d\ude80",
    description: "Uso de IA, automatizaci\u00f3n, mejoras t\u00e9cnicas y nuevas formas de trabajar.",
    isCustom: false
  },
  {
    id: "wellbeing",
    type: "WELLBEING",
    name: "Bienestar",
    color: "#15803d",
    icon: "\ud83e\udde0",
    description: "Menos estr\u00e9s, m\u00e1s seguridad psicol\u00f3gica y mejor equilibrio.",
    isCustom: false
  },
  {
    id: "visibility",
    type: "VISIBILITY",
    name: "Visibilidad",
    color: "#9ca3af",
    icon: "\ud83d\udc40",
    description: "Estado real de tareas, bloqueos, riesgos y dependencias visibles.",
    isCustom: false
  }
];

export const CUSTOM_INGREDIENT_TEMPLATE: Ingredient = {
  id: "custom-ingredient",
  type: "CUSTOM_INGREDIENT",
  name: "Ingrediente comod\u00edn",
  color: "#111827",
  icon: "\u2b50",
  description: "Ingrediente personalizado creado por el jugador.",
  isCustom: true
};
