import {
  DEFAULT_CHAPTER_MATERIAL,
  DEFAULT_CHAPTER_KNOWLEDGE,
  DEFAULT_CHAPTER_TOPIC,
  DEFAULT_FORMAT_BIBLE,
  DEFAULT_KNOWLEDGE_BASE,
  DEFAULT_PDF_SOURCE,
  DEFAULT_SCENE_COUNT,
  DEFAULT_SEASON_MEMORY,
  MISTRAL_MODELS,
} from './constants';
import {
  ImagePipeline,
  NodeData,
  NodesState,
  NodeType,
  ProjectDocument,
  PROJECT_SCHEMA_VERSION,
  ViewportState,
} from './types';

export const PROJECT_STORAGE_KEY = 'canva-story.project.v1';

const nodeTypes = new Set<NodeType>([
  'text',
  'scene',
  'script_input',
  'script_output',
  'association',
  'script_detail',
  'pollinations_image',
  'chapter_timeline',
  'video_output',
]);

const imagePipelines = new Set<ImagePipeline>(['sdxl', 'z_image_turbo', 'flux2_compose', 'flux2_turbo_compose']);

const newId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

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
    selectedModel: MISTRAL_MODELS[0],
    metadata: {
      sourceKind: 'pdf_source',
    },
  },
  chapterTopicNode: {
    nodeType: 'script_detail',
    x: 1370,
    y: 370,
    label: 'Тема главы',
    width: 430,
    height: 340,
    isGenerated: true,
    level: 0,
    parentId: 'pdfSourceNode',
    inputValue: DEFAULT_CHAPTER_TOPIC,
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
    selectedModel: MISTRAL_MODELS[0],
    metadata: {
      sourceKind: 'chapter_knowledge',
    },
  },
  chapterMaterialNode: {
    nodeType: 'script_detail',
    x: 2280,
    y: 370,
    label: 'Материал главы',
    width: 430,
    height: 360,
    isGenerated: true,
    level: 0,
    parentId: 'chapterKnowledgeNode',
    inputValue: DEFAULT_CHAPTER_MATERIAL,
    selectedModel: MISTRAL_MODELS[0],
    sceneCount: 8,
    metadata: {
      sourceKind: 'chapter_material',
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
    },
  };
};

const sanitizeNode = (value: unknown): NodeData | null => {
  if (!isRecord(value) || !nodeTypes.has(value.nodeType as NodeType)) return null;
  if (typeof value.label !== 'string') return null;
  const node: NodeData = {
    ...(value as unknown as NodeData),
    nodeType: value.nodeType as NodeType,
    label: value.label.slice(0, 500),
    x: finiteNumber(value.x, 0),
    y: finiteNumber(value.y, 0),
    width: finiteNumber(value.width, value.nodeType === 'association' ? 180 : 300),
    height: finiteNumber(value.height, value.nodeType === 'association' ? 56 : 220),
    isLoading: false,
    isLoadingImage: false,
    error: undefined,
    statusMessage: undefined,
    pollinationsApiError: undefined,
    imageUrl: undefined,
    imagePipeline: imagePipelines.has(value.imagePipeline as ImagePipeline)
      ? value.imagePipeline as ImagePipeline
      : 'sdxl',
  };
  return node;
};

const sanitizeNodes = (value: unknown): NodesState => {
  if (!isRecord(value)) throw new Error('В файле нет объекта nodes.');
  const nodes: NodesState = {};
  Object.entries(value).forEach(([nodeId, nodeValue]) => {
    const node = sanitizeNode(nodeValue);
    if (node) nodes[nodeId] = node;
  });
  return nodes;
};

const sanitizeViewport = (value: unknown): ViewportState => {
  if (!isRecord(value)) return { x: 48, y: 48, zoom: 1 };
  return {
    x: finiteNumber(value.x, 48),
    y: finiteNumber(value.y, 48),
    zoom: Math.min(2, Math.max(0.35, finiteNumber(value.zoom, 1))),
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
    nodes: sanitizeNodes(value.nodes),
    viewport: sanitizeViewport(value.viewport),
    extensions: isRecord(value.extensions)
      ? value.extensions as ProjectDocument['extensions']
      : { characters: [], locations: [], episodes: [], assets: [] },
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

export const loadSavedProject = (): ProjectDocument | null => {
  try {
    const saved = localStorage.getItem(PROJECT_STORAGE_KEY);
    return saved ? parseProjectJson(saved) : null;
  } catch {
    return null;
  }
};

export const saveProject = (project: ProjectDocument) => {
  localStorage.setItem(PROJECT_STORAGE_KEY, projectToJson(project));
};

export const clearSavedProject = () => {
  localStorage.removeItem(PROJECT_STORAGE_KEY);
};
