export const PROJECT_SCHEMA_VERSION = 1 as const;

export type NodeType =
  | 'text'
  | 'scene'
  | 'script_input'
  | 'script_output'
  | 'association'
  | 'script_detail'
  | 'pollinations_image'
  | 'chapter_timeline'
  | 'video_output';

export type DetailType = 'герои' | 'локации' | 'настроение' | 'закадр' | 'система';
export type EntityType = 'character' | 'location' | 'episode' | 'scene';
export type ProductionStatus = 'idea' | 'draft' | 'ready' | 'in_production' | 'done';
export type ImagePipeline = 'sdxl' | 'z_image_turbo' | 'flux2_compose' | 'flux2_turbo_compose';
export type ImagePromptKind = 'default' | 'scene_location' | 'scene_characters' | 'character_asset' | 'location_asset';

export interface NodeData {
  x: number;
  y: number;
  label: string;
  nodeType: NodeType;
  width?: number;
  height?: number;
  parentId?: string;
  level?: number;
  hasInput?: boolean;
  isLongInput?: boolean;
  hasButton?: boolean;
  buttonLabel?: string;
  inputValue?: string;
  outputNodeLabel?: string;
  themeInputValue?: string;
  selectedModel?: string;
  sceneCount?: number;
  sceneText?: string;
  isLoading?: boolean;
  loadingProvider?: 'mock' | 'mistral' | 'lmstudio' | 'pollinations' | 'comfyui';
  isSpeaking?: boolean;
  isGenerated?: boolean;
  canContinue?: boolean;
  fullAssociations?: string[];
  nextAssociationIndex?: number;
  hasGenerationButton?: boolean;
  masterPrompt?: string;
  assetPrompt?: string;
  isLoadingImage?: boolean;
  isLoadingAudio?: boolean;
  isLoadingVideo?: boolean;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  imagePipeline?: ImagePipeline;
  error?: string;
  statusMessage?: string;
  pollinationsApiError?: string;

  // Reserved extension points for the future video-manhwa production model.
  entityRef?: { type: EntityType; id: string };
  productionStatus?: ProductionStatus;
  motionPrompt?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface NodesState {
  [id: string]: NodeData;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface ProjectDocument {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  nodes: NodesState;
  viewport: ViewportState;
  extensions?: {
    characters?: unknown[];
    locations?: unknown[];
    episodes?: unknown[];
    assets?: unknown[];
  };
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
}

interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason?: string;
}

export interface ChatApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type GenerationOperation =
  | 'associations'
  | 'scenario'
  | 'heroes'
  | 'locations'
  | 'mood'
  | 'narration'
  | 'narration_edit'
  | 'brief_revision'
  | 'chapter_summary'
  | 'season_memory_update'
  | 'tts_cleanup'
  | 'system_inserts'
  | 'scene_prompt'
  | 'scene_location_prompt'
  | 'scene_character_layer_prompt'
  | 'character_asset_prompt'
  | 'location_asset_prompt';

export interface GenerationRequest {
  operation: GenerationOperation;
  prompt: string;
  systemPrompt: string;
  model: string;
  sceneCount?: number;
  sceneLabel?: string;
}

export interface AppNotice {
  id: number;
  tone: 'info' | 'success' | 'error';
  message: string;
}
