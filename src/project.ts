import {
  DEFAULT_CHAPTER_MATERIAL,
  DEFAULT_CHAPTER_KNOWLEDGE,
  DEFAULT_CHAPTER_PLANNER,
  DEFAULT_CHAPTER_TOPIC,
  DEFAULT_FANTASY_STYLE_BIBLE,
  DEFAULT_FORMAT_BIBLE,
  DEFAULT_KNOWLEDGE_BASE,
  DEFAULT_PDF_SOURCE,
  DEFAULT_SCENE_COUNT,
  DEFAULT_SEASON_MEMORY,
  DEFAULT_SEASON_SKELETON,
  CHAPTER_KNOWLEDGE_SYSTEM_PROMPT,
  CHAPTER_MATERIAL_SYSTEM_PROMPT,
  CHAPTER_PLANNER_SYSTEM_PROMPT,
  CHAPTER_TOPIC_SYSTEM_PROMPT,
  CHARACTER_MEMORY_SYSTEM_PROMPT,
  CHAPTER_FACTS_SYSTEM_PROMPT,
  CHAPTER_SUMMARY_SYSTEM_PROMPT,
  LOCATION_DETAIL_SYSTEM_PROMPT,
  MISTRAL_MODELS,
  MOOD_DETAIL_SYSTEM_PROMPT,
  NARRATION_DETAIL_SYSTEM_PROMPT,
  SCENARIO_SYSTEM_PROMPT,
  SCENE_DIALOGUE_SYSTEM_PROMPT,
  SEASON_MEMORY_UPDATE_SYSTEM_PROMPT,
  SEASON_SKELETON_SYSTEM_PROMPT,
  STRICT_HERO_DETAIL_SYSTEM_PROMPT,
  SYSTEM_INSERTS_DETAIL_SYSTEM_PROMPT,
  ISEKAI_PROLOG_REQUIREMENT,
} from './constants';
import { createDefaultNarrationSettings, sanitizeNarrationSettings } from './narrationSettings';
import {
  AssetKind,
  AssetMediaKind,
  AssetReference,
  AssetScope,
  AssetStorageDriver,
  ImagePipeline,
  NodeData,
  NodeAssetReferences,
  NodesState,
  NodeType,
  ProjectDocument,
  PROJECT_SCHEMA_VERSION,
  ViewportState,
} from './types';
import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';

export const PROJECT_STORAGE_KEY = 'canva-story.project.v1';
const COMPRESSED_PROJECT_PREFIX = 'canva-story.project.deflate-base64.v1:';
const STORAGE_COMPRESSION_LEVEL = 3;
let preferCompressedProjectStorage = false;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const compressProjectJson = (json: string) =>
  `${COMPRESSED_PROJECT_PREFIX}${bytesToBase64(zlibSync(strToU8(json), { level: STORAGE_COMPRESSION_LEVEL }))}`;

const readStoredProjectJson = (value: string) => {
  if (!value.startsWith(COMPRESSED_PROJECT_PREFIX)) return value;
  preferCompressedProjectStorage = true;
  const compressed = base64ToBytes(value.slice(COMPRESSED_PROJECT_PREFIX.length));
  return strFromU8(unzlibSync(compressed));
};

const nodeTypes = new Set<NodeType>([
  'text',
  'scene',
  'script_input',
  'script_output',
  'association',
  'script_detail',
  'prompt_node',
  'split_node',
  'split_item',
  'character_registry',
  'pollinations_image',
  'chapter_timeline',
  'chapter_collector',
  'video_output',
]);

const imagePipelines = new Set<ImagePipeline>([
  'sdxl',
  'z_image_turbo',
  'ernie_image_turbo',
  'flux2_compose',
  'flux2_turbo_compose',
  'nano_banana_2_lite_compose',
]);

const assetKinds = new Set<AssetKind>([
  'character_reference',
  'location_reference',
  'scene_frame',
  'scene_contact_sheet',
  'scene_shot',
  'system_insert',
  'chapter_backdrop',
  'voice_reference',
  'narration_audio',
  'scene_clip',
  'chapter_video',
  'other',
]);
const assetMediaKinds = new Set<AssetMediaKind>(['image', 'audio', 'video']);
const assetScopes = new Set<AssetScope>(['project', 'chapter', 'scene', 'character', 'location']);
const assetStorageDrivers = new Set<AssetStorageDriver>(['indexeddb', 'file']);
const LEGACY_ASSET_CREATED_AT = '1970-01-01T00:00:00.000Z';

const newId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const optionalString = (value: unknown) => typeof value === 'string' && value.trim()
  ? value.trim()
  : undefined;

const sanitizeAssetReference = (value: unknown): AssetReference | null => {
  if (!isRecord(value)) return null;
  const assetId = optionalString(value.assetId);
  const createdAt = optionalString(value.createdAt);
  if (
    !assetId
    || !createdAt
    || !assetKinds.has(value.assetKind as AssetKind)
    || !assetMediaKinds.has(value.mediaKind as AssetMediaKind)
    || !assetScopes.has(value.scope as AssetScope)
    || !assetStorageDrivers.has(value.storage as AssetStorageDriver)
  ) {
    return null;
  }

  return {
    assetId,
    assetKind: value.assetKind as AssetKind,
    mediaKind: value.mediaKind as AssetMediaKind,
    scope: value.scope as AssetScope,
    storage: value.storage as AssetStorageDriver,
    ...(optionalString(value.projectId) ? { projectId: optionalString(value.projectId) } : {}),
    ...(optionalString(value.chapterId) ? { chapterId: optionalString(value.chapterId) } : {}),
    ...(optionalString(value.sceneId) ? { sceneId: optionalString(value.sceneId) } : {}),
    ...(optionalString(value.canonicalId) ? { canonicalId: optionalString(value.canonicalId) } : {}),
    ...(optionalString(value.sourcePrompt) ? { sourcePrompt: optionalString(value.sourcePrompt) } : {}),
    ...(optionalString(value.filePath) ? { filePath: optionalString(value.filePath) } : {}),
    ...(optionalString(value.mimeType) ? { mimeType: optionalString(value.mimeType) } : {}),
    createdAt,
    ...(optionalString(value.updatedAt) ? { updatedAt: optionalString(value.updatedAt) } : {}),
  };
};

const inferLegacyAssetKind = (
  metadata: Record<string, unknown>,
  mediaKind: AssetMediaKind,
  nodeType: NodeType,
): AssetKind => {
  if (mediaKind === 'audio') return 'narration_audio';
  if (mediaKind === 'video') return nodeType === 'video_output' ? 'chapter_video' : 'scene_clip';
  const legacyKind = optionalString(metadata.assetKind) ?? '';
  if (legacyKind.startsWith('character_asset')) return 'character_reference';
  if (legacyKind.startsWith('location_asset') || legacyKind === 'scene_location') return 'location_reference';
  if (legacyKind === 'scene_contact_sheet') return 'scene_contact_sheet';
  if (legacyKind.startsWith('scene_shot')) return 'scene_shot';
  if (legacyKind.startsWith('system_insert')) return 'system_insert';
  if (legacyKind === 'chapter_backdrop') return 'chapter_backdrop';
  if (legacyKind.includes('frame')) return 'scene_frame';
  return 'other';
};

const inferLegacyAssetScope = (assetKind: AssetKind, nodeType: NodeType): AssetScope => {
  if (assetKind === 'character_reference') return 'character';
  if (assetKind === 'location_reference') return 'location';
  if (assetKind === 'chapter_backdrop' || assetKind === 'chapter_video') return 'chapter';
  if (
    nodeType === 'scene'
    || assetKind === 'scene_frame'
    || assetKind === 'scene_contact_sheet'
    || assetKind === 'scene_shot'
    || assetKind === 'system_insert'
  ) return 'scene';
  return 'project';
};

const getLegacyAssetReference = (
  value: Record<string, unknown>,
  metadata: Record<string, unknown>,
  nodeId: string,
  mediaKind: AssetMediaKind,
): AssetReference | null => {
  const idKey = mediaKind === 'image'
    ? 'localAssetId'
    : mediaKind === 'audio' ? 'localAudioAssetId' : 'localVideoAssetId';
  const savedAtKey = mediaKind === 'image'
    ? 'localAssetSavedAt'
    : mediaKind === 'audio' ? 'localAudioAssetSavedAt' : 'localVideoAssetSavedAt';
  const assetId = optionalString(metadata[idKey]);
  if (!assetId) return null;

  const nodeType = value.nodeType as NodeType;
  const assetKind = inferLegacyAssetKind(metadata, mediaKind, nodeType);
  const parentId = optionalString(value.parentId);
  const sceneId = optionalString(metadata.sceneId)
    ?? (nodeType === 'scene' ? nodeId : undefined)
    ?? ((
      assetKind === 'scene_frame'
      || assetKind === 'scene_contact_sheet'
      || assetKind === 'scene_shot'
      || assetKind === 'system_insert'
    ) ? parentId : undefined);
  const sourcePrompt = optionalString(value.assetPrompt) ?? optionalString(value.masterPrompt);
  const canonicalId = optionalString(metadata.canonicalId) ?? optionalString(metadata.characterTag);

  return {
    assetId,
    assetKind,
    mediaKind,
    scope: inferLegacyAssetScope(assetKind, nodeType),
    storage: 'indexeddb',
    ...(optionalString(metadata.projectId) ? { projectId: optionalString(metadata.projectId) } : {}),
    ...(optionalString(metadata.chapterId) ? { chapterId: optionalString(metadata.chapterId) } : {}),
    ...(sceneId ? { sceneId } : {}),
    ...(canonicalId ? { canonicalId } : {}),
    ...(sourcePrompt ? { sourcePrompt } : {}),
    ...(optionalString(metadata.filePath) ? { filePath: optionalString(metadata.filePath) } : {}),
    createdAt: optionalString(metadata[savedAtKey]) ?? LEGACY_ASSET_CREATED_AT,
  };
};

const sanitizeNodeAssetReferences = (
  value: unknown,
  nodeValue: Record<string, unknown>,
  metadata: Record<string, unknown>,
  nodeId: string,
): NodeAssetReferences | undefined => {
  const source = isRecord(value) ? value : {};
  const assets: NodeAssetReferences = {};
  assetMediaKinds.forEach((mediaKind) => {
    const reference = sanitizeAssetReference(source[mediaKind])
      ?? getLegacyAssetReference(nodeValue, metadata, nodeId, mediaKind);
    if (reference) assets[mediaKind] = reference;
  });
  return Object.keys(assets).length > 0 ? assets : undefined;
};

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const getStoredImagePipeline = (value: Record<string, unknown>) => {
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const directPipeline = imagePipelines.has(value.imagePipeline as ImagePipeline)
    ? value.imagePipeline as ImagePipeline
    : undefined;
  const metadataPipeline = imagePipelines.has(metadata.imagePipeline as ImagePipeline)
    ? metadata.imagePipeline as ImagePipeline
    : undefined;
  return value.nodeType === 'pollinations_image'
    ? metadataPipeline ?? directPipeline
    : directPipeline ?? metadataPipeline;
};

const getDefaultSystemPrompt = (value: Record<string, unknown>) => {
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const sourceKind = typeof metadata.sourceKind === 'string' ? metadata.sourceKind : '';
  const label = typeof value.label === 'string' ? value.label : '';

  if (sourceKind === 'pdf_source') return CHAPTER_TOPIC_SYSTEM_PROMPT;
  if (sourceKind === 'chapter_planner') return CHAPTER_PLANNER_SYSTEM_PROMPT;
  if (sourceKind === 'chapter_plan') return CHAPTER_MATERIAL_SYSTEM_PROMPT;
  if (sourceKind === 'chapter_topic') return CHAPTER_KNOWLEDGE_SYSTEM_PROMPT;
  if (sourceKind === 'chapter_knowledge') return SEASON_SKELETON_SYSTEM_PROMPT;
  if (sourceKind === 'season_skeleton') return CHAPTER_MATERIAL_SYSTEM_PROMPT;
  if (sourceKind === 'chapter_material') return SCENARIO_SYSTEM_PROMPT;
  if (sourceKind === 'season_memory') return SEASON_MEMORY_UPDATE_SYSTEM_PROMPT;
  if (sourceKind === 'character_memory') return CHARACTER_MEMORY_SYSTEM_PROMPT;
  if (sourceKind === 'chapter_facts') return CHAPTER_FACTS_SYSTEM_PROMPT;
  if (sourceKind === 'chapter_summary') return CHAPTER_SUMMARY_SYSTEM_PROMPT;
  if (sourceKind === 'scene_dialogue') return SCENE_DIALOGUE_SYSTEM_PROMPT;
  if (value.nodeType === 'prompt_node') return 'Ты — универсальная LLM-нода. Выполни пользовательский шаблон, используя входной текст и подключённый контекст. Верни только полезный результат без пояснений о процессе.';
  if (value.nodeType === 'script_input') return SCENARIO_SYSTEM_PROMPT;
  if (value.nodeType === 'script_output') return SCENARIO_SYSTEM_PROMPT;
  if (value.nodeType === 'scene') return SCENE_DIALOGUE_SYSTEM_PROMPT;
  if (value.nodeType === 'script_detail' && label === 'Герои') return STRICT_HERO_DETAIL_SYSTEM_PROMPT;
  if (value.nodeType === 'script_detail' && label === 'Локации') return LOCATION_DETAIL_SYSTEM_PROMPT;
  if (value.nodeType === 'script_detail' && label === 'Настроение') return MOOD_DETAIL_SYSTEM_PROMPT;
  if (value.nodeType === 'script_detail' && label === 'Закадр') return NARRATION_DETAIL_SYSTEM_PROMPT;
  if (value.nodeType === 'script_detail' && label === 'Системные вставки') return SYSTEM_INSERTS_DETAIL_SYSTEM_PROMPT;
  return undefined;
};

const getStoredSystemPrompt = (value: Record<string, unknown>) => {
  const systemPrompt = typeof value.systemPrompt === 'string'
    ? value.systemPrompt
    : getDefaultSystemPrompt(value);
  return systemPrompt
    ?.replace(ISEKAI_PROLOG_REQUIREMENT, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
};

const ensureManagedPromptSnippetNodes = (nodes: NodesState): NodesState => {
  const hasIsekaiSnippet = Object.values(nodes).some((node) =>
    node.nodeType === 'script_detail'
    && node.metadata?.sourceKind === 'system_prompt_snippet'
    && node.metadata?.promptSnippetKey === 'isekai_prolog');
  if (hasIsekaiSnippet) return nodes;

  const parentId = nodes.formatBibleNode ? 'formatBibleNode' : undefined;
  const anchor = parentId ? nodes[parentId] : Object.values(nodes)[0];
  return {
    ...nodes,
    systemPromptSnippetIsekaiNode: {
      nodeType: 'script_detail',
      x: (anchor?.x ?? 40) + 470,
      y: (anchor?.y ?? 40) + 340,
      label: 'Системное правило · исекай-пролог',
      width: 460,
      height: 420,
      isGenerated: true,
      level: 0,
      parentId,
      inputValue: ISEKAI_PROLOG_REQUIREMENT,
      statusMessage: 'Подключено к: зерно, планировщик и материал глав.',
      metadata: {
        sourceKind: 'system_prompt_snippet',
        promptSnippetKey: 'isekai_prolog',
        appliesTo: 'pdf_source,chapter_topic,chapter_planner,chapter_plan,chapter_material',
        enabled: true,
      },
    },
  };
};

export const createStarterNodes = (): NodesState => ({
  ideaNode: {
    nodeType: 'text',
    x: 40,
    y: 40,
    label: 'АССОЦИАЦИИ',
    hasInput: true,
    hasButton: true,
    buttonLabel: 'Найти ассоциации',
    inputValue: '',
    width: 360,
    height: 230,
    isLoading: false,
    level: 0,
    selectedModel: MISTRAL_MODELS[0],
  },
  scriptInputNode: {
    nodeType: 'script_input',
    x: 40,
    y: 310,
    label: 'ИСХОДНЫЙ СЦЕНАРИЙ',
    hasInput: true,
    isLongInput: true,
    hasButton: true,
    buttonLabel: 'Создать сцены',
    inputValue: '',
    themeInputValue: '',
    width: 400,
    height: 560,
    isLoading: false,
    level: 0,
    outputNodeLabel: 'СЦЕНАРИЙ ВИЗУАЛИЗАЦИИ',
    selectedModel: MISTRAL_MODELS[0],
    sceneCount: DEFAULT_SCENE_COUNT,
  },
  formatBibleNode: {
    nodeType: 'script_detail',
    x: 480,
    y: 40,
    label: 'Библия формата',
    width: 420,
    height: 300,
    isGenerated: true,
    level: 0,
    parentId: 'scriptInputNode',
    inputValue: DEFAULT_FORMAT_BIBLE,
    metadata: {
      sourceKind: 'format_bible',
    },
  },
  knowledgeBaseNode: {
    nodeType: 'script_detail',
    x: 920,
    y: 40,
    label: 'База знаний',
    width: 430,
    height: 300,
    isGenerated: true,
    level: 0,
    parentId: 'formatBibleNode',
    inputValue: DEFAULT_KNOWLEDGE_BASE,
    metadata: {
      sourceKind: 'knowledge_base',
    },
  },
  fantasyStyleBibleNode: {
    nodeType: 'script_detail',
    x: 1360,
    y: 40,
    label: 'Библия фэнтези-стиля',
    width: 450,
    height: 360,
    isGenerated: true,
    level: 0,
    parentId: 'formatBibleNode',
    inputValue: DEFAULT_FANTASY_STYLE_BIBLE,
    metadata: {
      sourceKind: 'fantasy_style_bible',
    },
  },
  systemPromptSnippetIsekaiNode: {
    nodeType: 'script_detail',
    x: 1820,
    y: 40,
    label: 'Системное правило · исекай-пролог',
    width: 460,
    height: 420,
    isGenerated: true,
    level: 0,
    parentId: 'formatBibleNode',
    inputValue: ISEKAI_PROLOG_REQUIREMENT,
    statusMessage: 'Подключено к: зерно, планировщик и материал глав.',
    metadata: {
      sourceKind: 'system_prompt_snippet',
      promptSnippetKey: 'isekai_prolog',
      appliesTo: 'pdf_source,chapter_topic,chapter_planner,chapter_plan,chapter_material',
      enabled: true,
    },
  },
  seasonMemoryNode: {
    nodeType: 'script_detail',
    x: 480,
    y: 370,
    label: 'Сезонная память',
    width: 420,
    height: 300,
    isGenerated: true,
    level: 0,
    parentId: 'knowledgeBaseNode',
    inputValue: DEFAULT_SEASON_MEMORY,
    metadata: {
      sourceKind: 'season_memory',
    },
  },
  pdfSourceNode: {
    nodeType: 'script_detail',
    x: 920,
    y: 370,
    label: 'PDF / сырьё сезона',
    width: 430,
    height: 360,
    isGenerated: true,
    level: 0,
    parentId: 'knowledgeBaseNode',
    inputValue: DEFAULT_PDF_SOURCE,
    systemPrompt: CHAPTER_TOPIC_SYSTEM_PROMPT,
    selectedModel: MISTRAL_MODELS[0],
    metadata: {
      sourceKind: 'pdf_source',
    },
  },
  chapterTopicNode: {
    nodeType: 'script_detail',
    x: 1370,
    y: 370,
    label: 'Зерно истории',
    width: 430,
    height: 340,
    isGenerated: true,
    level: 0,
    parentId: 'pdfSourceNode',
    inputValue: DEFAULT_CHAPTER_TOPIC,
    systemPrompt: CHAPTER_KNOWLEDGE_SYSTEM_PROMPT,
    selectedModel: MISTRAL_MODELS[0],
    metadata: {
      sourceKind: 'chapter_topic',
    },
  },
  chapterKnowledgeNode: {
    nodeType: 'script_detail',
    x: 1820,
    y: 370,
    label: 'База главы',
    width: 440,
    height: 420,
    isGenerated: true,
    level: 0,
    parentId: 'chapterTopicNode',
    inputValue: DEFAULT_CHAPTER_KNOWLEDGE,
    systemPrompt: SEASON_SKELETON_SYSTEM_PROMPT,
    selectedModel: MISTRAL_MODELS[0],
    metadata: {
      sourceKind: 'chapter_knowledge',
    },
  },
  chapterPlannerNode: {
    nodeType: 'script_detail',
    x: 1820,
    y: 830,
    label: 'Планировщик глав',
    width: 460,
    height: 380,
    isGenerated: true,
    level: 0,
    parentId: 'chapterTopicNode',
    inputValue: DEFAULT_CHAPTER_PLANNER,
    systemPrompt: CHAPTER_PLANNER_SYSTEM_PROMPT,
    selectedModel: MISTRAL_MODELS[0],
    metadata: {
      sourceKind: 'chapter_planner',
    },
  },
  chapterMaterialNode: {
    nodeType: 'script_detail',
    x: 2760,
    y: 370,
    label: 'Материал главы',
    width: 430,
    height: 360,
    isGenerated: true,
    level: 0,
    parentId: 'seasonSkeletonNode',
    inputValue: DEFAULT_CHAPTER_MATERIAL,
    systemPrompt: SCENARIO_SYSTEM_PROMPT,
    selectedModel: MISTRAL_MODELS[0],
    sceneCount: 8,
    metadata: {
      sourceKind: 'chapter_material',
    },
  },
  seasonSkeletonNode: {
    nodeType: 'script_detail',
    x: 2280,
    y: 370,
    label: 'Скелет сезона',
    width: 460,
    height: 430,
    isGenerated: true,
    level: 0,
    parentId: 'chapterKnowledgeNode',
    inputValue: DEFAULT_SEASON_SKELETON,
    systemPrompt: CHAPTER_MATERIAL_SYSTEM_PROMPT,
    selectedModel: MISTRAL_MODELS[0],
    sceneCount: 8,
    metadata: {
      sourceKind: 'season_skeleton',
    },
  },
});

export const createProjectDocument = (title = 'Новый проект'): ProjectDocument => {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId(),
    title,
    createdAt: now,
    updatedAt: now,
    nodes: createStarterNodes(),
    viewport: { x: 48, y: 48, zoom: 1 },
    extensions: {
      characters: [],
      locations: [],
      episodes: [],
      assets: [],
      narration: createDefaultNarrationSettings(),
    },
  };
};

const sanitizeNode = (value: unknown, nodeId: string): NodeData | null => {
  if (!isRecord(value) || !nodeTypes.has(value.nodeType as NodeType)) return null;
  if (typeof value.label !== 'string') return null;
  const imagePipeline = getStoredImagePipeline(value);
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const assets = sanitizeNodeAssetReferences(value.assets, value, metadata, nodeId);
  const sourceKind = typeof metadata.sourceKind === 'string' ? metadata.sourceKind : '';
  const label = sourceKind === 'chapter_topic' && value.label === 'Тема главы'
    ? 'Зерно истории'
    : value.label;
  const node: NodeData = {
    ...(value as unknown as NodeData),
    nodeType: value.nodeType as NodeType,
    label: label.slice(0, 500),
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    width: finiteNumber(value.width, value.nodeType === 'association' ? 180 : 300),
    height: finiteNumber(value.height, value.nodeType === 'association' ? 56 : 220),
    isLoading: false,
    isLoadingImage: false,
    isLoadingAudio: false,
    isLoadingVideo: false,
    isSpeaking: false,
    loadingProvider: undefined,
    error: undefined,
    statusMessage: undefined,
    pollinationsApiError: undefined,
    imageUrl: undefined,
    audioUrl: undefined,
    videoUrl: undefined,
    assets,
    systemPrompt: getStoredSystemPrompt(value),
    ...(imagePipeline ? { imagePipeline } : {}),
  };
  return node;
};

const sanitizeNodes = (value: unknown): NodesState => {
  if (!isRecord(value)) throw new Error('В файле нет объекта nodes.');
  const nodes: NodesState = {};
  Object.entries(value).forEach(([nodeId, nodeValue]) => {
    const node = sanitizeNode(nodeValue, nodeId);
    if (node) nodes[nodeId] = node;
  });
  return nodes;
};

const repairLegacyChapterMaterialBranches = (nodes: NodesState): NodesState => {
  let changed = false;
  const nextNodes = { ...nodes };
  Object.entries(nodes).forEach(([nodeId, node]) => {
    if (node.nodeType !== 'script_detail' || node.metadata?.sourceKind !== 'chapter_material') return;
    if (!node.parentId || node.label !== 'Материал главы') return;
    const parentNode = nodes[node.parentId];
    if (!parentNode || parentNode.metadata?.sourceKind !== 'chapter_plan') return;
    const chapterNumber = Number(parentNode.metadata?.chapterNumber);
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return;
    changed = true;
    nextNodes[nodeId] = {
      ...node,
      x: parentNode.x + (parentNode.width ?? 440) + 28,
      y: parentNode.y,
      label: `Материал главы ${chapterNumber}`,
      metadata: {
        ...node.metadata,
        sourceChapterPlanId: node.parentId,
        chapterNumber,
      },
    };
  });
  return changed ? nextNodes : nodes;
};

const sanitizeViewport = (value: unknown): ViewportState => {
  if (!isRecord(value)) return { x: 48, y: 48, zoom: 1 };
  return {
    x: finiteNumber(value.x, 48),
    y: finiteNumber(value.y, 48),
    zoom: Math.min(2, Math.max(0.35, finiteNumber(value.zoom, 1))),
  };
};

const sanitizeCanvasWorkspaces = (value: unknown) => {
  if (!isRecord(value)) return undefined;
  const rawViewports = isRecord(value.viewports) ? value.viewports : {};
  const viewports = Object.fromEntries(
    Object.entries(rawViewports).map(([workspaceId, viewport]) => [
      workspaceId.slice(0, 240),
      sanitizeViewport(viewport),
    ]),
  );
  const activeChapterId = optionalString(value.activeChapterId);
  return {
    ...(activeChapterId ? { activeChapterId } : {}),
    viewports,
  };
};

const sanitizeProjectExtensions = (value: unknown): ProjectDocument['extensions'] => {
  const extensions = isRecord(value) ? value : {};
  const assets = Array.isArray(extensions.assets)
    ? extensions.assets
      .map(sanitizeAssetReference)
      .filter((asset): asset is AssetReference => Boolean(asset))
    : [];
  const narrationValue = isRecord(extensions.narration) ? extensions.narration : {};
  const narrationReference = sanitizeAssetReference(narrationValue.referenceAudio);
  return {
    characters: Array.isArray(extensions.characters) ? extensions.characters : [],
    locations: Array.isArray(extensions.locations) ? extensions.locations : [],
    episodes: Array.isArray(extensions.episodes) ? extensions.episodes : [],
    assets,
    narration: sanitizeNarrationSettings(
      narrationValue,
      narrationReference?.mediaKind === 'audio' ? narrationReference : undefined,
    ),
    canvasWorkspaces: sanitizeCanvasWorkspaces(extensions.canvasWorkspaces),
  };
};

export const parseProjectJson = (json: string): ProjectDocument => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }
  if (!isRecord(value)) throw new Error('Корень файла проекта должен быть объектом.');
  if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`Версия проекта не поддерживается. Ожидалась версия ${PROJECT_SCHEMA_VERSION}.`);
  }
  if (typeof value.id !== 'string' || typeof value.title !== 'string') {
    throw new Error('В проекте отсутствуют id или title.');
  }

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: value.id,
    title: value.title.slice(0, 120) || 'Импортированный проект',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: ensureManagedPromptSnippetNodes(repairLegacyChapterMaterialBranches(sanitizeNodes(value.nodes))),
    viewport: sanitizeViewport(value.viewport),
    extensions: sanitizeProjectExtensions(value.extensions),
  };
};

export const projectSnapshot = (
  base: ProjectDocument,
  nodes: NodesState,
  viewport: ViewportState,
  title: string,
): ProjectDocument => ({
  ...base,
  title: title.trim().slice(0, 120) || 'Без названия',
  updatedAt: new Date().toISOString(),
  nodes: sanitizeNodes(nodes),
  viewport: sanitizeViewport(viewport),
});

export const projectToJson = (project: ProjectDocument) =>
  JSON.stringify(projectSnapshot(project, project.nodes, project.viewport, project.title), null, 2);

const projectToStorageJson = (project: ProjectDocument) =>
  JSON.stringify(projectSnapshot(project, project.nodes, project.viewport, project.title));

export const loadSavedProject = (): ProjectDocument | null => {
  try {
    const saved = localStorage.getItem(PROJECT_STORAGE_KEY);
    return saved ? parseProjectJson(readStoredProjectJson(saved)) : null;
  } catch {
    return null;
  }
};

export const saveProject = (project: ProjectDocument) => {
  const json = projectToStorageJson(project);
  if (preferCompressedProjectStorage) {
    localStorage.setItem(PROJECT_STORAGE_KEY, compressProjectJson(json));
    return;
  }

  try {
    localStorage.setItem(PROJECT_STORAGE_KEY, json);
  } catch (plainStorageError) {
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, compressProjectJson(json));
      preferCompressedProjectStorage = true;
    } catch {
      throw plainStorageError;
    }
  }
};

export const clearSavedProject = () => {
  localStorage.removeItem(PROJECT_STORAGE_KEY);
  preferCompressedProjectStorage = false;
};
