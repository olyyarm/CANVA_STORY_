export const PROJECT_SCHEMA_VERSION = 1 as const;

export type NodeType =
  | 'text'
  | 'scene'
  | 'script_input'
  | 'script_output'
  | 'association'
  | 'script_detail'
  | 'prompt_node'
  | 'split_node'
  | 'split_item'
  | 'character_registry'
  | 'pollinations_image'
  | 'chapter_timeline'
  | 'chapter_collector'
  | 'video_output';

export type DetailType = 'герои' | 'локации' | 'настроение' | 'закадр' | 'система';
export type EntityType = 'character' | 'location' | 'episode' | 'scene';
export type ProductionStatus = 'idea' | 'draft' | 'ready' | 'in_production' | 'done';
export type ImagePipeline =
  | 'sdxl'
  | 'z_image_turbo'
  | 'ernie_image_turbo'
  | 'flux2_compose'
  | 'flux2_turbo_compose'
  | 'nano_banana_2_lite_compose';
export type ImagePromptKind =
  | 'default'
  | 'scene_location'
  | 'scene_characters'
  | 'character_asset'
  | 'location_asset'
  | 'system_insert'
  | 'chapter_backdrop';
export type SplitMode = 'lines' | 'separator' | 'json_path';

export type AssetMediaKind = 'image' | 'audio' | 'video';
export type AssetKind =
  | 'character_reference'
  | 'location_reference'
  | 'scene_frame'
  | 'scene_contact_sheet'
  | 'scene_shot'
  | 'system_insert'
  | 'chapter_backdrop'
  | 'voice_reference'
  | 'narration_audio'
  | 'scene_clip'
  | 'chapter_video'
  | 'other';
export type AssetScope = 'project' | 'chapter' | 'scene' | 'character' | 'location';
export type AssetStorageDriver = 'indexeddb' | 'file';

export type SceneShotRole =
  | 'detail'
  | 'emotion'
  | 'angle'
  | 'pov'
  | 'location_establishing'
  | 'location_atmosphere'
  | 'character_context'
  | 'character_emotion';

export interface AssetReference {
  assetId: string;
  assetKind: AssetKind;
  mediaKind: AssetMediaKind;
  scope: AssetScope;
  storage: AssetStorageDriver;
  projectId?: string;
  chapterId?: string;
  sceneId?: string;
  canonicalId?: string;
  sourcePrompt?: string;
  filePath?: string;
  mimeType?: string;
  createdAt: string;
  updatedAt?: string;
}

export type NodeAssetReferences = Partial<Record<AssetMediaKind, AssetReference>>;

export type OmniVoiceMode = 'design' | 'clone';
export type OmniVoiceModel = 'OmniVoice-bf16' | 'OmniVoice';
export type OmniVoiceQuality = 'fast' | 'balanced' | 'quality';

export interface NarrationSettings {
  mode: OmniVoiceMode;
  model: OmniVoiceModel;
  quality: OmniVoiceQuality;
  seed: number;
  voiceInstruct: string;
  referenceAudio?: AssetReference;
  referenceFileName?: string;
  referenceText?: string;
}

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
  promptContextValue?: string;
  promptKnowledgeValue?: string;
  promptMemoryValue?: string;
  promptTemplateValue?: string;
  promptResultValue?: string;
  splitMode?: SplitMode;
  splitSeparator?: string;
  arrayPath?: string;
  outputNodeLabel?: string;
  themeInputValue?: string;
  systemPrompt?: string;
  selectedModel?: string;
  sceneCount?: number;
  sceneText?: string;
  isLoading?: boolean;
  loadingProvider?: 'mock' | 'mistral' | 'lmstudio' | 'comfygemini' | 'pollinations' | 'comfyui' | 'comfy_openai_image' | 'comfy_nano_banana';
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
  sceneShotNodeIds?: string[];
  assets?: NodeAssetReferences;
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

export interface CanvasWorkspaceState {
  activeChapterId?: string;
  viewports: Record<string, ViewportState>;
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
    assets?: AssetReference[];
    narration?: NarrationSettings;
    canvasWorkspaces?: CanvasWorkspaceState;
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
  | 'story_structure_edit'
  | 'brief_revision'
  | 'chapter_topic'
  | 'chapter_planner'
  | 'chapter_knowledge'
  | 'season_skeleton'
  | 'chapter_material'
  | 'chapter_facts'
  | 'chapter_summary'
  | 'season_memory_update'
  | 'character_memory'
  | 'scene_dialogue'
  | 'tts_cleanup'
  | 'system_inserts'
  | 'scene_prompt'
  | 'scene_location_prompt'
  | 'scene_character_layer_prompt'
  | 'character_asset_prompt'
  | 'location_asset_prompt'
  | 'system_insert_asset_prompt'
  | 'chapter_backdrop_prompt'
  | 'prompt_node';

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
