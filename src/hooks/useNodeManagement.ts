import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  DetailAssetImageProvider,
  Flux2CharacterReference,
  generateComfyFlux2ComposeImage,
  generateComfyOpenAiGptImage2LowImage,
  generateComfyNanoBanana2LiteImage,
  generateComfyNanoBanana2LiteComposeImage,
  generateComfyNanoBanana2LiteShotGrid,
  generateComfyOmniVoiceAudio,
  generateImage,
  generateText,
  GenerationSettings,
  ImageGenerationSettings,
  unloadLmStudioModels,
} from '../api';
import { loadLocalAssetRecord } from '../assetStorage';
import {
  ASSOCIATE_SYSTEM_PROMPT,
  CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT,
  CHARACTER_MEMORY_SYSTEM_PROMPT,
  CHAPTER_FACTS_SYSTEM_PROMPT,
  CHAPTER_KNOWLEDGE_SYSTEM_PROMPT,
  CHAPTER_MATERIAL_SYSTEM_PROMPT,
  CHAPTER_PLANNER_SYSTEM_PROMPT,
  CHAPTER_SUMMARY_SYSTEM_PROMPT,
  CHAPTER_TOPIC_SYSTEM_PROMPT,
  CHAPTER_BACKDROP_ASSET_PROMPT_SYSTEM_PROMPT,
  DEFAULT_FANTASY_STYLE_BIBLE,
  DEFAULT_CHAPTER_MATERIAL,
  DEFAULT_CHAPTER_KNOWLEDGE,
  DEFAULT_CHAPTER_PLANNER,
  DEFAULT_CHAPTER_TOPIC,
  DEFAULT_FORMAT_BIBLE,
  DEFAULT_KNOWLEDGE_BASE,
  DEFAULT_PDF_SOURCE,
  DEFAULT_SEASON_MEMORY,
  DEFAULT_SEASON_SKELETON,
  ISEKAI_PROLOG_REQUIREMENT,
  LOCATION_ASSET_PROMPT_SYSTEM_PROMPT,
  LOCATION_DETAIL_SYSTEM_PROMPT,
  MISTRAL_MODELS,
  MOOD_DETAIL_SYSTEM_PROMPT,
  NARRATION_DETAIL_SYSTEM_PROMPT,
  NARRATION_EDIT_SYSTEM_PROMPT,
  SCENARIO_SYSTEM_PROMPT,
  SCENE_CHARACTER_LAYER_PROMPT_SYSTEM_PROMPT,
  SCENE_DIALOGUE_SYSTEM_PROMPT,
  SCENE_LOCATION_PROMPT_SYSTEM_PROMPT,
  SCENE_MASTER_PROMPT_SYSTEM_PROMPT,
  SEASON_MEMORY_UPDATE_SYSTEM_PROMPT,
  SEASON_SKELETON_SYSTEM_PROMPT,
  STORY_STRUCTURE_EDIT_SYSTEM_PROMPT,
  STORY_BRIEF_REVISION_SYSTEM_PROMPT,
  STRICT_HERO_DETAIL_SYSTEM_PROMPT,
  SYSTEM_INSERT_ASSET_PROMPT_SYSTEM_PROMPT,
  SYSTEM_INSERTS_DETAIL_SYSTEM_PROMPT,
  TTS_CLEANUP_SYSTEM_PROMPT,
} from '../constants';
import { getNextNarrationSeed, getOmniVoiceSteps } from '../narrationSettings';
import { SCENE_WRITER_CHARACTER_TAG_CONTRACT, SCENE_WRITER_SHOT_SCALE_CONTRACT, SCENE_WRITER_SPLIT_SYSTEM_PROMPT } from '../promptPresets';
import {
  AppNotice,
  DetailType,
  GenerationOperation,
  GenerationRequest,
  ImagePipeline,
  ImagePromptKind,
  NarrationSettings,
  NodeData,
  NodesState,
} from '../types';
import { extractTextFromDocumentFile } from '../pdfImport';
import { buildChapterVideoFromClips, buildStillImagesVideoClip } from '../services/videoGeneration';
import { isNativeVideoRendererAvailable } from '../services/nativeVideoRenderer';
import { buildSceneShotGridPrompt, splitSceneShotGrid } from '../services/sceneShotGrid';
import {
  CHARACTER_REGISTRY_SOURCE_KIND,
  createCharacterTag,
  createCharacterTagVariants,
  extractRequiredCharacterTagGroups,
  findCharacterRegistryNodeEntry,
  formatCharacterRegistryText,
  getCharacterAliasCandidatesFromDescription,
  getCombinedCharacterRegistryEntryMap,
  getCharacterTagVariantsFromDescription,
  getNewCharacterDescriptions,
  isCharacterAssetNode,
  normalizeCharacterTag,
  parseCharacterRegistryEntries,
  serializeCharacterRegistryEntries,
} from '../characterRegistry';
import {
  calculateTextWidth,
  clampSceneCount,
  errorMessage,
  generateNodeId,
  isAbortError,
  parseSceneBlocks,
} from '../utils';

interface UseNodeManagementReturn {
  nodes: NodesState;
  setNodes: Dispatch<SetStateAction<NodesState>>;
  notice: AppNotice | null;
  clearNotice: () => void;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handleThemeInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handleSystemPromptChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handlePromptContextChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handlePromptKnowledgeChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handlePromptMemoryChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handlePromptTemplateChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handleCreatePromptNode: (sourceNodeId?: string) => void;
  handleCreateSceneWriterPromptNode: (sourceNodeId?: string) => void;
  handleRunPromptNode: (nodeId: string) => Promise<void>;
  handleAssemblePromptResultScenario: (nodeId: string) => Promise<void>;
  handleCreateSplitNode: (sourceNodeId?: string) => void;
  handleEnsureCharacterRegistry: () => void;
  handleSplitModeChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleSplitSeparatorChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  handleArrayPathChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  handleRunSplitNode: (nodeId: string) => void;
  handleTogglePromptSnippet: (nodeId: string) => void;
  handleModelChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleImagePipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleDetailAssetImageProviderChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleTimelineAssetPipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleTimelineSystemInsertPipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleTimelineMasterChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  handleSceneCountChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  handleContinueAssociation: (sourceNodeId: string) => Promise<void>;
  handleScriptVisualization: (sourceNodeId: string) => Promise<void>;
  handleBuildScenarioFromBrief: (briefNodeId: string) => Promise<void>;
  handleImportReferenceFile: (nodeId: string, file: File) => Promise<void>;
  handleExtractChapterTopic: (sourceNodeId: string) => Promise<void>;
  handlePlanChapters: (plannerNodeId: string) => Promise<void>;
  handleCreateChapterPlanNodes: (plannerNodeId: string) => void;
  handleBuildChapterKnowledge: (topicNodeId: string) => Promise<void>;
  handleBuildSeasonSkeleton: (knowledgeNodeId: string) => Promise<void>;
  handleBuildChapterMaterial: (knowledgeNodeId: string) => Promise<void>;
  handleAutoBuildChapter: (chapterMaterialNodeId: string) => Promise<void>;
  handleEnsureStoryReferenceNodes: () => void;
  handleEnsureChapterTimeline: (sourceNodeId?: string) => void;
  handleScenarioDetailClick: (sourceNodeId: string, detailType: DetailType, modelOverride?: string) => Promise<void>;
  handleCreateSceneNodes: (sourceNodeId: string) => void;
  handleBuildCharacterMemory: (heroesNodeId: string) => Promise<void>;
  handleBuildSceneDialogue: (sceneNodeId: string) => Promise<void>;
  handleGenerateScenePrompt: (sceneNodeId: string) => Promise<void>;
  handleGenerateSceneLocationAsset: (sceneNodeId: string, pipelineOverride?: ImagePipeline, modelOverride?: string, providerOverride?: DetailAssetImageProvider) => Promise<void>;
  handleGenerateSceneCharacterLayer: (sceneNodeId: string) => Promise<void>;
  handleComposeSceneFlux2: (sceneNodeId: string, pipeline?: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose' | 'nano_banana_2_lite_compose'>) => Promise<void>;
  handleGenerateDetailAsset: (detailNodeId: string, pipelineOverride?: ImagePipeline, modelOverride?: string, providerOverride?: DetailAssetImageProvider) => Promise<void>;
  handleEditNarration: (detailNodeId: string) => Promise<void>;
  handleStoryStructureEdit: (detailNodeId: string) => Promise<void>;
  handleNarrationEditorialLoop: (detailNodeId: string) => Promise<void>;
  handlePrepareNarrationTts: (detailNodeId: string) => Promise<void>;
  handleSpeakNarration: (detailNodeId: string) => void;
  handleStopSpeech: () => void;
  handleGenerateOmniVoiceNarration: (detailNodeId: string) => Promise<void>;
  handleGenerateAlternateOmniVoiceNarration: (detailNodeId: string) => Promise<void>;
  handleGenerateSceneOmniVoiceNarration: (sceneNodeId: string) => Promise<void>;
  handleGenerateAlternateSceneOmniVoiceNarration: (sceneNodeId: string) => Promise<void>;
  handleGenerateSceneShotGrid: (sceneNodeId: string) => Promise<void>;
  handleBuildSceneVideoClip: (sceneNodeId: string) => Promise<void>;
  handleGenerateChapterBackdrop: (timelineNodeId: string) => Promise<void>;
  handleGenerateTimelineMissingAssets: (timelineNodeId: string) => Promise<boolean>;
  handleCompleteChapter: (timelineNodeId: string) => Promise<void>;
  handleBuildChapterSceneClips: (timelineNodeId: string) => Promise<void>;
  handleBuildChapterVideo: (timelineNodeId: string, options?: { requireFfmpeg?: boolean }) => Promise<void>;
  handleEnsureChapterCollector: () => void;
  handleBuildSeasonVideo: (collectorNodeId: string) => Promise<void>;
  handleCopyToClipboard: (textToCopy: string) => Promise<void>;
  handleGeneratePollinationsImage: (nodeId: string) => Promise<void>;
  handleRegenerateImageNode: (nodeId: string) => Promise<void>;
  handleToggleReferenceImage: (nodeId: string) => void;
  handleSetCharacterCanonicalAsset: (nodeId: string) => void;
  handleCancelGeneration: (nodeId: string) => void;
}

const detailConfig: Record<DetailType, {
  label: string;
  operation: GenerationOperation;
  systemPrompt: string;
  column: number;
}> = {
  герои: { label: 'Герои', operation: 'heroes', systemPrompt: STRICT_HERO_DETAIL_SYSTEM_PROMPT, column: 0 },
  локации: { label: 'Локации', operation: 'locations', systemPrompt: LOCATION_DETAIL_SYSTEM_PROMPT, column: 1 },
  настроение: { label: 'Настроение', operation: 'mood', systemPrompt: MOOD_DETAIL_SYSTEM_PROMPT, column: 2 },
  закадр: { label: 'Закадр', operation: 'narration', systemPrompt: NARRATION_DETAIL_SYSTEM_PROMPT, column: 3 },
  система: { label: 'Системные вставки', operation: 'system_inserts', systemPrompt: SYSTEM_INSERTS_DETAIL_SYSTEM_PROMPT, column: 4 },
};

const getExistingChild = (nodes: NodesState, parentId: string, predicate: (node: NodeData) => boolean) =>
  Object.entries(nodes).find(([, node]) => node.parentId === parentId && predicate(node));

const referenceSourceKinds = new Set(['format_bible', 'knowledge_base', 'chapter_planner', 'chapter_plan', 'chapter_knowledge', 'season_skeleton', 'season_memory', 'character_memory']);
const promptSnippetSourceKind = 'system_prompt_snippet';
const fantasyStyleSourceKind = 'fantasy_style_bible';

const getSourceKind = (node?: NodeData) =>
  typeof node?.metadata?.sourceKind === 'string' ? node.metadata.sourceKind : '';

const getNodeSystemPrompt = (node: NodeData | undefined, fallback: string) =>
  node?.systemPrompt?.trim() || fallback;

const legacyNarrationPromptPrefixes = [
  'Ты — закадровый рассказчик манхвы. Твоя задача — ясно рассказать историю по сценам',
  'Напиши закадровый текст рассказчика для озвучки по сценам',
];

const shouldRefreshNarrationSystemPrompt = (node: NodeData | undefined) => {
  const savedPrompt = node?.systemPrompt?.trim();
  return !savedPrompt || legacyNarrationPromptPrefixes.some((prefix) => savedPrompt.startsWith(prefix));
};

const getDetailSystemPrompt = (
  node: NodeData | undefined,
  config: (typeof detailConfig)[DetailType],
) => config.operation === 'narration' && shouldRefreshNarrationSystemPrompt(node)
  ? config.systemPrompt
  : getNodeSystemPrompt(node, config.systemPrompt);

const getListMetadata = (value: unknown) =>
  typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

const getConnectedSystemPromptSnippets = (
  nodes: NodesState,
  nodeId: string,
  operation: GenerationOperation,
) => {
  const sourceKind = getSourceKind(nodes[nodeId]);
  return Object.values(nodes)
    .filter((node) =>
      node.nodeType === 'script_detail'
      && getSourceKind(node) === promptSnippetSourceKind
      && node.metadata?.enabled !== false
      && Boolean(node.inputValue?.trim()))
    .filter((node) => {
      const appliesTo = getListMetadata(node.metadata?.appliesTo);
      return appliesTo.includes('*') || appliesTo.includes(sourceKind) || appliesTo.includes(operation);
    });
};

const withConnectedSystemPromptSnippets = (
  systemPrompt: string,
  nodeId: string,
  operation: GenerationOperation,
  nodes: NodesState,
) =>
  getConnectedSystemPromptSnippets(nodes, nodeId, operation)
    .reduce((prompt, snippetNode) => {
      const snippet = snippetNode.inputValue?.trim();
      if (!snippet) return prompt;
      const firstLine = snippet.split('\n').find((line) => line.trim())?.trim();
      if ((firstLine && prompt.includes(firstLine)) || prompt.includes(snippet)) return prompt;
      return `${prompt}\n\n# Подключённый системный фрагмент: ${snippetNode.label}\n${snippet}`;
    }, systemPrompt);

const findNodeBySourceKind = (nodes: NodesState, sourceKind: string) =>
  Object.entries(nodes).find(([, node]) => node.nodeType === 'script_detail' && getSourceKind(node) === sourceKind);

const findPipelineNode = (nodes: NodesState, sourceKind: string, parentId?: string) => {
  if (!parentId) return findNodeBySourceKind(nodes, sourceKind);
  return Object.entries(nodes).find(([, node]) =>
    node.nodeType === 'script_detail'
    && getSourceKind(node) === sourceKind
    && node.parentId === parentId);
};

const getNodeTextOutput = (node?: NodeData) =>
  node?.promptResultValue?.trim()
  || node?.inputValue?.trim()
  || node?.sceneText?.trim()
  || node?.masterPrompt?.trim()
  || node?.assetPrompt?.trim()
  || '';

const buildPromptNodeUserPrompt = (node: NodeData, parentNode?: NodeData) => {
  const parentText = getNodeTextOutput(parentNode);
  const template = node.promptTemplateValue?.trim() || '{{TEXT}}';
  const context = node.promptContextValue?.trim() ?? '';
  const knowledge = node.promptKnowledgeValue?.trim() ?? '';
  const memory = node.promptMemoryValue?.trim() ?? '';
  const manualText = node.inputValue?.trim() ?? '';
  const text = parentText || manualText;
  const templateResult = template
    .replace(/\{\{\s*TEXT\s*\}\}/giu, text)
    .replace(/\{\{\s*CONTEXT\s*\}\}/giu, context)
    .replace(/\{\{\s*KNOWLEDGE\s*\}\}/giu, knowledge)
    .replace(/\{\{\s*MEMORY\s*\}\}/giu, memory);

  return [
    templateResult,
    !template.match(/\{\{\s*TEXT\s*\}\}/iu) && text ? `\n\nTEXT:\n${text}` : '',
    !template.match(/\{\{\s*CONTEXT\s*\}\}/iu) && context ? `\n\nCONTEXT:\n${context}` : '',
    !template.match(/\{\{\s*KNOWLEDGE\s*\}\}/iu) && knowledge ? `\n\nKNOWLEDGE:\n${knowledge}` : '',
    !template.match(/\{\{\s*MEMORY\s*\}\}/iu) && memory ? `\n\nMEMORY:\n${memory}` : '',
  ].join('').trim();
};

const normalizeSplitKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/[^a-zа-яё0-9_-]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);

const getSplitItemStableKey = (item: unknown, index: number) => {
  if (typeof item === 'string') {
    return normalizeSplitKey(item.split(/\r?\n/u)[0] ?? '') || String(index + 1);
  }
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    const candidate = record.id ?? record.key ?? record.slug ?? record.number ?? record.title ?? record.name;
    if (typeof candidate === 'string' && candidate.trim()) return normalizeSplitKey(candidate) || String(index + 1);
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return String(index + 1);
};

const parseSplitJson = (text: string) => {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
  try {
    return JSON.parse(fenced) as unknown;
  } catch {
    const objectStart = fenced.indexOf('{');
    const objectEnd = fenced.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(fenced.slice(objectStart, objectEnd + 1)) as unknown;
    }
    const arrayStart = fenced.indexOf('[');
    const arrayEnd = fenced.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(fenced.slice(arrayStart, arrayEnd + 1)) as unknown;
    }
    throw new Error('Split Node не смог прочитать JSON из RESULT родительской ноды.');
  }
};

const readValueAtPath = (value: unknown, path: string) => {
  const cleanPath = path.trim();
  if (!cleanPath) return value;
  return cleanPath
    .replace(/\[(\d+)\]/gu, '.$1')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<unknown>((current, part) => {
      if (Array.isArray(current) && /^\d+$/u.test(part)) return current[Number(part)];
      if (current && typeof current === 'object') return (current as Record<string, unknown>)[part];
      return undefined;
    }, value);
};

const formatSplitItemText = (item: unknown) =>
  typeof item === 'string' ? item : JSON.stringify(item, null, 2);

const getSplitItemTitle = (item: unknown, index: number, arrayPath: string) => {
  if (typeof item === 'string') {
    return (item.split(/\r?\n/u)[0]?.trim() || `${arrayPath || 'item'} ${index + 1}`).slice(0, 120);
  }
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    const title = record.title ?? record.name ?? record.label;
    const number = record.number ?? record.id;
    if (title && number) return `${number}. ${String(title)}`.slice(0, 120);
    if (title) return String(title).slice(0, 120);
    if (number) return `${arrayPath || 'item'} ${number}`.slice(0, 120);
  }
  return `${arrayPath || 'item'} ${index + 1}`.slice(0, 120);
};

const splitByLines = (text: string) =>
  text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const splitBySeparator = (text: string, separator: string) => {
  const cleanSeparator = separator.trim() || '<<<SPLIT>>>';
  return text
    .split(cleanSeparator)
    .map((chunk) => chunk.trim().replace(new RegExp(`^(?:${escapeRegExp(cleanSeparator)}\\s*)+`, 'u'), '').trim())
    .filter(Boolean);
};

interface PlannedChapter {
  number: number;
  title: string;
  dramatic_seed?: string;
  chapter_purpose?: string;
  protagonist_status?: string;
  human_problem?: string;
  client_or_pressure?: string;
  professional_problem?: string;
  source_material_focus?: string[];
  antagonist_pressure?: string;
  system_insert_candidate?: string;
  turning_point?: string;
  what_changes?: string;
  cliffhanger?: string;
  final_state?: string;
  immediate_consequence?: string;
  next_action?: string;
  physical_transition?: string;
  next_chapter_entry_reason?: string;
  bridge_requirement?: string;
  scene_count?: number;
  must_include?: string[];
  defer?: string[];
  assumptions?: string[];
}

interface ChapterPlanDocument {
  schema_version?: number;
  arc_title?: string;
  arc_promise?: string;
  recommended_chapter_count?: number;
  count_reason?: string;
  global_causal_chain?: string[];
  chapters: PlannedChapter[];
}

const extractJsonObject = (text: string) => {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Планировщик не вернул JSON-объект.');
  return trimmed.slice(start, end + 1);
};

const parseChapterPlanDocument = (text: string): ChapterPlanDocument => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (error) {
    throw new Error(`Не удалось прочитать JSON планировщика: ${errorMessage(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as { chapters?: unknown }).chapters)) {
    throw new Error('В JSON планировщика нет массива chapters.');
  }
  const rawDocument = parsed as Partial<ChapterPlanDocument>;
  const chapters = rawDocument.chapters
    ?.map((chapter, index) => {
      if (!chapter || typeof chapter !== 'object') return null;
      const rawChapter = chapter as Partial<PlannedChapter>;
      const number = Number(rawChapter.number) || index + 1;
      const title = typeof rawChapter.title === 'string' && rawChapter.title.trim()
        ? rawChapter.title.trim()
        : `Глава ${number}`;
      return { ...rawChapter, number, title };
    })
    .filter((chapter): chapter is PlannedChapter => Boolean(chapter)) ?? [];
  if (chapters.length === 0) throw new Error('Планировщик вернул пустой список глав.');
  return { ...rawDocument, chapters };
};

const stringifyList = (title: string, values?: string[]) =>
  values?.length ? `${title}:\n${values.map((value) => `- ${value}`).join('\n')}` : '';

const formatPlannedChapter = (document: ChapterPlanDocument, chapter: PlannedChapter) =>
  [
    `Глава ${chapter.number}: ${chapter.title}`,
    document.arc_title ? `Арка: ${document.arc_title}` : '',
    document.arc_promise ? `Обещание арки: ${document.arc_promise}` : '',
    chapter.dramatic_seed ? `Драматическое зерно: ${chapter.dramatic_seed}` : '',
    chapter.chapter_purpose ? `Назначение главы: ${chapter.chapter_purpose}` : '',
    chapter.protagonist_status ? `Положение протагониста: ${chapter.protagonist_status}` : '',
    chapter.human_problem ? `Человеческая проблема: ${chapter.human_problem}` : '',
    chapter.client_or_pressure ? `Клиент/давление: ${chapter.client_or_pressure}` : '',
    chapter.professional_problem ? `Профессиональная проблема: ${chapter.professional_problem}` : '',
    stringifyList('Фокус источника', chapter.source_material_focus),
    chapter.antagonist_pressure ? `Сопротивление: ${chapter.antagonist_pressure}` : '',
    chapter.system_insert_candidate ? `Системная вставка-кандидат: ${chapter.system_insert_candidate}` : '',
    chapter.turning_point ? `Поворот: ${chapter.turning_point}` : '',
    chapter.what_changes ? `Что меняется: ${chapter.what_changes}` : '',
    chapter.cliffhanger ? `Клиффхэнгер: ${chapter.cliffhanger}` : '',
    chapter.final_state ? `Финальная точка главы: ${chapter.final_state}` : '',
    chapter.immediate_consequence ? `Немедленное следствие: ${chapter.immediate_consequence}` : '',
    chapter.next_action ? `Что герой делает сразу после финала: ${chapter.next_action}` : '',
    chapter.physical_transition ? `Физический переход к следующей главе: ${chapter.physical_transition}` : '',
    chapter.next_chapter_entry_reason ? `Почему следующая глава начинается именно там: ${chapter.next_chapter_entry_reason}` : '',
    chapter.bridge_requirement ? `Нужен ли переходный мост: ${chapter.bridge_requirement}` : '',
    `Рекомендуемое число сцен: ${clampSceneCount(chapter.scene_count ?? 10)}`,
    stringifyList('Обязательно включить', chapter.must_include),
    stringifyList('Отложить', chapter.defer),
    stringifyList('Допущения', chapter.assumptions),
  ].filter(Boolean).join('\n\n');

const isPlaceholderSeasonMemory = (text: string) => {
  const normalized = text.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('ru');
  if (!normalized) return true;
  if (normalized.includes('пока глав нет') && normalized.includes('сезонная память пуста')) return true;
  return normalized.startsWith('сезонная память:')
    && normalized.includes('герой, его прошлый профессиональный опыт')
    && normalized.includes('открытые крючки для следующих глав')
    && !normalized.includes('глава:');
};

const getStoryReferenceContext = (nodes: NodesState) => {
  const references = Object.values(nodes)
    .filter((node) =>
      node.nodeType === 'script_detail'
      && typeof node.metadata?.sourceKind === 'string'
      && referenceSourceKinds.has(node.metadata.sourceKind)
      && (node.metadata.sourceKind !== 'season_memory' || !isPlaceholderSeasonMemory(node.inputValue ?? ''))
      && node.inputValue?.trim())
    .sort((first, second) => first.label.localeCompare(second.label, 'ru'));

  if (references.length === 0) return '';
  return references
    .map((node) => `${node.label}:\n${node.inputValue?.trim()}`)
    .join('\n\n');
};

const withStoryReferenceContext = (prompt: string, nodes: NodesState) => {
  const context = getStoryReferenceContext(nodes);
  if (!context) return prompt;
  return [
    prompt,
    'Справочные базы проекта. Используй как ориентир для структуры, фактуры, профессий, лазеек и эмоционального тона. Не копируй дословно, если это пример или шаблон.',
    context,
  ].join('\n\n');
};

const findChildDetail = (nodes: NodesState, parentId: string | undefined, label: string) =>
  Object.values(nodes).find((node) =>
    node.nodeType === 'script_detail'
    && node.parentId === parentId
    && node.label === label);

const findProjectDetail = (nodes: NodesState, parentId: string | undefined, label: string, sourceKind?: string) =>
  findChildDetail(nodes, parentId, label)
  ?? Object.values(nodes).find((node) =>
    node.nodeType === 'script_detail'
    && node.label === label
    && (!sourceKind || getSourceKind(node) === sourceKind));

const buildReferenceExcerpt = (text: string, maxChars = 18000) => {
  const normalized = text.replace(/\r\n?/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
  if (normalized.length <= maxChars) return normalized;

  const lines = normalized
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const headingLikeLines = lines
    .filter((line) =>
      line.length >= 8
      && line.length <= 120
      && !/[.!?…]$/u.test(line)
      && !/^https?:/iu.test(line))
    .slice(0, 80)
    .join('\n');
  const firstPart = normalized.slice(0, Math.floor(maxChars * 0.55));
  const lastPart = normalized.slice(-Math.floor(maxChars * 0.25));
  return [
    firstPart,
    headingLikeLines ? `\n\nКарта разделов источника:\n${headingLikeLines}` : '',
    `\n\nФинальные фрагменты источника:\n${lastPart}`,
  ].join('').slice(0, maxChars);
};

const extractFantasyStyleSection = (text: string, section: 'style' | 'rules') => {
  const normalized = text.replace(/\r\n?/gu, '\n').trim();
  if (!normalized) return '';
  const styleMatch = normalized.match(/STYLE CAPSULE:\s*([\s\S]*?)(?:\n\s*PROMPT RULES:|$)/iu);
  const rulesMatch = normalized.match(/PROMPT RULES:\s*([\s\S]*)$/iu);
  if (section === 'style') return (styleMatch?.[1] ?? normalized).trim();
  return (rulesMatch?.[1] ?? '').trim();
};

const getFantasyStyleBible = (nodes: NodesState) =>
  Object.values(nodes).find((node) =>
    node.nodeType === 'script_detail'
    && getSourceKind(node) === fantasyStyleSourceKind
    && node.inputValue?.trim())
    ?.inputValue?.trim() ?? '';

const getProjectVisualStyle = (nodes: NodesState) => {
  const directStyle = Object.values(nodes).find((node) => node.nodeType === 'script_input' && node.themeInputValue?.trim())
    ?.themeInputValue?.trim() ?? '';
  const fantasyStyle = extractFantasyStyleSection(getFantasyStyleBible(nodes), 'style');
  return [directStyle, fantasyStyle].filter(Boolean).join('\n\n');
};

const getProjectVisualPromptRules = (nodes: NodesState) =>
  extractFantasyStyleSection(getFantasyStyleBible(nodes), 'rules');

const negativeImagePromptClausePattern =
  /\b(?:no|not|without|avoid|exclude|never|don't|do not|negative prompt)\b|(?:^|\s)non-[a-z]|(?:^|\s)без\s/iu;

const negativeImagePromptSentenceStartPattern =
  /^(?:no|not|without|avoid|exclude|never|don't|do not|negative prompt)\b|^(?:без|не)\s/iu;

const sanitizePositiveImagePrompt = (text: string) =>
  text
    .split(/\n+/u)
    .map((paragraph) => {
      const sentences = paragraph.match(/[^.!?]+[.!?]?/gu) ?? [paragraph];
      return sentences
        .map((sentence) => {
          const trimmed = sentence.trim();
          if (!trimmed || negativeImagePromptSentenceStartPattern.test(trimmed)) return '';
          const ending = /[.!?]$/u.test(trimmed) ? trimmed[trimmed.length - 1] : '';
          const body = ending ? trimmed.slice(0, -1) : trimmed;
          const clauses = body
            .split(/[,;]\s*/u)
            .map((clause) => clause.trim())
            .filter((clause) => clause && !negativeImagePromptClausePattern.test(clause));
          if (clauses.length === 0) return '';
          return `${clauses.join(', ')}${ending || '.'}`;
        })
        .filter(Boolean)
        .join(' ');
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();

const withProjectVisualStyle = (prompt: string, nodes: NodesState) => {
  const style = sanitizePositiveImagePrompt(getProjectVisualStyle(nodes));
  const rules = getProjectVisualPromptRules(nodes);
  if (!style && !rules) return prompt;
  return [
    style ? 'Project visual style. Apply this style consistently to every generated image in the project:' : '',
    style,
    style ? 'Keep the same rendering language, medium, line quality, realism level, palette logic, and finish across all character and location assets.' : '',
    rules ? 'Fantasy image prompt guide. Use these rules while writing the text-to-image prompt, but do not copy this guide verbatim into the final image prompt:' : '',
    rules,
    prompt,
  ].filter(Boolean).join('\n\n');
};

const appendProjectVisualStyleToImagePrompt = (imagePrompt: string, nodes: NodesState) => {
  const cleanImagePrompt = sanitizePositiveImagePrompt(imagePrompt);
  const style = sanitizePositiveImagePrompt(getProjectVisualStyle(nodes));
  if (!style) return cleanImagePrompt;
  const normalizedPrompt = cleanImagePrompt.toLocaleLowerCase('en');
  const normalizedStyle = style.toLocaleLowerCase('en');
  if (normalizedPrompt.includes(normalizedStyle)) return cleanImagePrompt;
  return sanitizePositiveImagePrompt([
    cleanImagePrompt,
    `Visual style: ${style}. Keep this exact rendering language, medium, line quality, realism level, palette logic, and finish consistent with every other project image.`,
  ].join('\n\n'));
};

const buildScenarioPrompt = (sourceText: string, sceneCount: number) =>
  [
    `Нужно ровно ${sceneCount} сцен. Верни сцены с номерами от 1 до ${sceneCount}, без пропусков, без объединения нескольких сцен в одну и без финального резюме.`,
    'Не начинай сразу с профессиональной работы. До диагностики нужна человеческая история: кто протагонист или клиент, чего он хочет сегодня, что теряет при провале, где происходит первая встреча, почему возникает доверие или трение, и почему протагонист вмешивается.',
    'Одна глава = один дефект: один предмет, один узел/место проблемы, один симптом, одна причина, одно решение. Всё соседнее отложи.',
    'Каждая сцена должна быть новым драматическим beat: состояние до сцены, желание персонажа, препятствие, физическое действие, реакция мира, что персонаж узнаёт сейчас, что меняется.',
    'Исходный материал:',
    sourceText,
  ].join('\n\n');

const buildScenarioRepairPrompt = (scenario: string, requestedSceneCount: number, actualSceneCount: number) =>
  [
    `Предыдущий ответ содержит ${actualSceneCount} сцен, но нужно ровно ${requestedSceneCount}.`,
    `Перепиши сценарий заново с номерами от 1 до ${requestedSceneCount}, без пропусков и без объединения сцен.`,
    'Сохрани исходный смысл, но разверни драматическую структуру: жизнь носителя проблемы, цель клиента сегодня, цена провала, первая встреча с протагонистом, отношение при встрече, причина вмешаться, первая неполная гипотеза, сопротивление, профессиональная находка, естественная проверка решения, последствия и крючок.',
    'Каждая сцена должна иметь отдельное событие, менять состояние истории и начинаться строго с «Сцена N:».',
    'Сценарий, который нужно исправить:',
    scenario,
  ].join('\n\n');

const buildChapterPrompt = (material: string, sceneCount: number, nodes: NodesState) =>
  withStoryReferenceContext([
    `Нужно ровно ${sceneCount} сцен. Не сокращай главу до 5-8 сцен, если запрошено больше.`,
    'Материал текущей главы:',
    material,
    'Задача: собрать главу как последовательный сценарий сцен. Используй материал главы как главный источник, а базы проекта и сезонную память как контекст.',
    'Перед профессиональной работой обязательно покажи: кто страдает от проблемы, как выглядит его обычная жизнь, чего он хочет сегодня, почему спешит, что потеряет при провале, где и как он встречает протагониста, какая между ними первая эмоция, почему протагонист решает вмешаться.',
    'Каждая сцена должна быть не паузой для размышления, а маленьким событием: состояние до сцены, ближайшая цель персонажа, препятствие, физическое действие, реакция мира или другого персонажа, что персонаж узнаёт сейчас, что меняется и крючок на следующую сцену.',
    'Держи одну техническую цепочку главы: один предмет, один дефект, один симптом, одна причина, одно решение. Протагонист может ошибиться или увидеть только часть причины до финальной проверки.',
    'Закадр потом будет озвучивать эти действия, поэтому заложи в сценарий видимые поступки: герой встаёт, прячет предмет, идёт к двери, встречает союзника или противника, отвечает на угрозу, делает сделку, ошибается, меняет план.',
  ].join('\n\n'), nodes);

const isEditorialReviewText = (text: string) =>
  /^(отлично|хорошо|замечательно|прекрасно|резюме получилось|получилось)/iu.test(text.trim())
  || /(понравил[оа]сь|сильный момент|очень информативн|структурированн|учитывающ|полезно для дальнейшего)/iu.test(text);

const cleanupBrowserSpeechText = (text: string) =>
  text
    .replace(/Сцена\s*\d+\s*[:.\-–—]?\s*/giu, '\n')
    .replace(/Закадровый текст\s*:\s*/giu, '')
    .replace(/Смысловой акцент\s*:\s*[^\n]+/giu, '')
    .replace(/\s+/g, ' ')
    .trim();

const splitSpeechText = (text: string) => {
  const sentences = text.match(/[^.!?…]+[.!?…]?/gu) ?? [text];
  const chunks: string[] = [];
  let current = '';
  sentences.forEach((sentence) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    const next = `${current} ${trimmed}`.trim();
    if (next.length > 700 && current) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = next;
    }
  });
  if (current) chunks.push(current);
  return chunks;
};

const getSceneNumber = (label: string) => {
  const match = label.match(/\d+/u);
  return match ? Number(match[0]) : null;
};

const getChapterNumber = (node: NodeData) => {
  const sourceLabel = typeof node.metadata?.sourceLabel === 'string' ? node.metadata.sourceLabel : '';
  const match = `${node.label}\n${sourceLabel}`.match(/(?:глава|гл\.?)\s*0*(\d+)/iu);
  return match ? Number(match[1]) : null;
};

const countSystemInsertBlocks = (text = '') =>
  [...text.matchAll(/(?:^|\n)\s*После\s+сцены\s+\d+\s*:/giu)].length;

const getDescendantNodeIds = (nodes: NodesState, rootId: string) => {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    Object.entries(nodes).forEach(([nodeId, node]) => {
      if (!node.parentId) return;
      if (node.parentId === rootId || descendants.has(node.parentId)) {
        if (!descendants.has(nodeId)) {
          descendants.add(nodeId);
          changed = true;
        }
      }
    });
  }
  return descendants;
};

const getAncestorNodeId = (
  nodes: NodesState,
  startNodeId: string | undefined,
  predicate: (node: NodeData) => boolean,
) => {
  let currentId = startNodeId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const currentNode = nodes[currentId];
    if (!currentNode) return undefined;
    if (predicate(currentNode)) return currentId;
    currentId = currentNode.parentId;
  }
  return undefined;
};

const getScopedNodeIds = (nodes: NodesState, rootIds: string[]) => {
  const scopedIds = new Set(rootIds.filter(Boolean));
  rootIds.filter(Boolean).forEach((rootId) => {
    getDescendantNodeIds(nodes, rootId).forEach((nodeId) => scopedIds.add(nodeId));
  });
  return scopedIds;
};

const findScopedProjectDetail = (
  nodes: NodesState,
  rootIds: Array<string | undefined>,
  label: string,
) => {
  const validRootIds = [...new Set(rootIds.filter((rootId): rootId is string => Boolean(rootId)))];
  for (const rootId of validRootIds) {
    const directChild = findChildDetail(nodes, rootId, label);
    if (directChild) return directChild;
  }

  if (validRootIds.length === 0) return undefined;
  const scopedIds = getScopedNodeIds(nodes, validRootIds);
  return Object.entries(nodes).find(([nodeId, node]) =>
    scopedIds.has(nodeId)
    && node.nodeType === 'script_detail'
    && node.label === label)?.[1];
};

const extractSceneNarration = (narration: string, sceneLabel: string) => {
  const sceneNumber = getSceneNumber(sceneLabel);
  if (!sceneNumber) return cleanupBrowserSpeechText(narration);

  const normalized = narration.replace(/\r\n/g, '\n');
  const sceneMatch = new RegExp(`(?:^|\\n)\\s*Сцена\\s*${sceneNumber}\\s*[:.\\-–—]?`, 'iu').exec(normalized);
  if (!sceneMatch) {
    const paragraphBlocks = normalized
      .split(/\n\s*\n+/)
      .map((block) => cleanupBrowserSpeechText(block))
      .filter(Boolean);
    return paragraphBlocks[sceneNumber - 1] ?? '';
  }

  const blockStart = sceneMatch.index + sceneMatch[0].length;
  const rest = normalized.slice(blockStart);
  const nextSceneMatch = /\n\s*Сцена\s*\d+\s*[:.\-–—]?/iu.exec(rest);
  return cleanupBrowserSpeechText(rest.slice(0, nextSceneMatch?.index ?? undefined));
};

const getPreparedSceneNarrationText = (sceneNode?: NodeData) => {
  if (!sceneNode?.metadata) return '';
  const preparedTtsText = sceneNode.metadata.preparedTtsText;
  if (typeof preparedTtsText === 'string' && preparedTtsText.trim()) {
    return cleanupBrowserSpeechText(preparedTtsText);
  }
  const sceneNarrationText = sceneNode.metadata.sceneNarrationText;
  if (typeof sceneNarrationText === 'string' && sceneNarrationText.trim()) {
    return cleanupBrowserSpeechText(sceneNarrationText);
  }
  return '';
};

const findPreparedTtsNarrationNode = (nodes: NodesState, narrationNodeId?: string) => {
  if (!narrationNodeId) return undefined;
  return Object.values(nodes).find((node) => (
    node.nodeType === 'script_detail'
    && (
      node.parentId === narrationNodeId
      || node.metadata?.sourceNodeId === narrationNodeId
    )
    && (
      node.metadata?.sourceKind === 'tts_cleanup'
      || node.label === 'TTS · Закадр'
    )
  ));
};

const resolveSceneNarrationText = (nodes: NodesState, sceneNode: NodeData) => {
  const narrationEntry = Object.entries(nodes).find(
    ([, node]) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail' && node.label === 'Закадр',
  );
  const narrationNode = narrationEntry?.[1];
  const preparedNarrationNode = findPreparedTtsNarrationNode(nodes, narrationEntry?.[0]);
  const preparedSceneNarration = typeof sceneNode.metadata?.preparedTtsText === 'string'
    ? cleanupBrowserSpeechText(sceneNode.metadata.preparedTtsText)
    : '';
  const preparedChapterNarration = preparedNarrationNode?.inputValue
    ? extractSceneNarration(preparedNarrationNode.inputValue, sceneNode.label)
    : '';
  const sceneNarration = narrationNode?.inputValue
    ? extractSceneNarration(narrationNode.inputValue, sceneNode.label)
    : '';
  const previousGeneratedNarration = typeof sceneNode.metadata?.sceneNarrationText === 'string'
    ? cleanupBrowserSpeechText(sceneNode.metadata.sceneNarrationText)
    : '';
  const outputNode = sceneNode.parentId ? nodes[sceneNode.parentId] : undefined;
  const fallbackText = cleanupBrowserSpeechText(sceneNode.sceneText || sceneNode.inputValue || outputNode?.inputValue || '');
  return preparedSceneNarration
    || preparedChapterNarration
    || sceneNarration
    || previousGeneratedNarration
    || fallbackText;
};

const getSceneTtsGenerationSignature = (
  text: string,
  settings: NarrationSettings,
  seed = settings.seed,
) => JSON.stringify({
  version: 1,
  text: cleanupBrowserSpeechText(text),
  mode: settings.mode,
  model: settings.model,
  quality: settings.quality,
  steps: getOmniVoiceSteps(settings.quality),
  seed,
  voiceInstruct: settings.voiceInstruct.trim(),
  referenceAssetId: settings.referenceAudio?.assetId ?? '',
  referenceText: settings.referenceText?.trim() ?? '',
  synthesisProfile: 'omnivoice-speed-0.9-v1',
});

const upsertScriptDetailNode = (
  previousNodes: NodesState,
  parentId: string,
  label: string,
  inputValue: string,
  options: {
    column?: number;
    width?: number;
    height?: number;
    systemPrompt?: string;
    selectedModel?: string;
    metadata?: NodeData['metadata'];
  } = {},
) => {
  const parentNode = previousNodes[parentId];
  if (!parentNode) return previousNodes;
  const existing = getExistingChild(
    previousNodes,
    parentId,
    (node) => node.nodeType === 'script_detail' && node.label === label,
  );
  const nodeId = existing?.[0] ?? generateNodeId();
  const column = options.column ?? 0;
  const isNarration = label === 'Закадр';
  const isSystemInserts = label === 'Системные вставки';
  const defaultWidth = isNarration || isSystemInserts ? 420 : 380;
  const defaultHeight = isNarration ? 520 : isSystemInserts ? 470 : 400;
  const currentWidth = existing?.[1].width ?? options.width ?? defaultWidth;
  const currentHeight = existing?.[1].height ?? options.height ?? defaultHeight;
  const nextNode: NodeData = {
    ...existing?.[1],
    nodeType: 'script_detail',
    x: existing?.[1].x ?? parentNode.x + column * 326,
    y: existing?.[1].y ?? parentNode.y + (parentNode.height ?? 390) + 36,
    label,
    width: Math.max(currentWidth, options.width ?? defaultWidth),
    height: Math.max(currentHeight, options.height ?? defaultHeight),
    isGenerated: true,
    level: (parentNode.level ?? 0) + 1,
    parentId,
    inputValue,
    systemPrompt: isNarration && shouldRefreshNarrationSystemPrompt(existing?.[1])
      ? options.systemPrompt
      : existing?.[1].systemPrompt ?? options.systemPrompt,
    selectedModel: existing?.[1].selectedModel ?? options.selectedModel,
    error: undefined,
    metadata: {
      ...existing?.[1].metadata,
      ...options.metadata,
    },
  };
  return {
    ...previousNodes,
    [nodeId]: nextNode,
  };
};

const upsertVideoOutputNode = (
  previousNodes: NodesState,
  parentId: string,
  videoUrl: string,
  label = 'Ролик главы',
  videoFormat: 'mp4' | 'webm' = 'webm',
) => {
  const parentNode = previousNodes[parentId];
  if (!parentNode) return previousNodes;
  const existing = getExistingChild(
    previousNodes,
    parentId,
    (node) => node.nodeType === 'video_output' && node.label === label,
  );
  const nodeId = existing?.[0] ?? generateNodeId();
  if (existing?.[1].videoUrl?.startsWith('blob:')) URL.revokeObjectURL(existing[1].videoUrl);
  return {
    ...previousNodes,
    [nodeId]: {
      ...existing?.[1],
      nodeType: 'video_output' as const,
      x: existing?.[1].x ?? parentNode.x + (parentNode.width ?? 1180) + 36,
      y: existing?.[1].y ?? parentNode.y,
      label,
      width: existing?.[1].width ?? 430,
      height: existing?.[1].height ?? 360,
      isGenerated: true,
      level: (parentNode.level ?? 0) + 1,
      parentId,
      videoUrl,
      statusMessage: 'Общий ролик главы готов.',
      metadata: {
        ...existing?.[1].metadata,
        sourceKind: label.includes('сезона') ? 'season_video' : 'chapter_video',
        sourceTimelineId: parentId,
        videoFormat,
        videoAspectRatio: '16:9',
        videoGeneratedAt: new Date().toISOString(),
      },
    },
  };
};

const getReferencedSceneNumbers = (text: string) => {
  const markerIndex = text.toLocaleLowerCase('ru').lastIndexOf('сцен');
  if (markerIndex < 0) return null;
  const tail = text.slice(markerIndex);
  const numbers = new Set<number>();
  const pattern = /(\d+)\s*[–—-]\s*(\d+)|(\d+)/gu;
  for (const match of tail.matchAll(pattern)) {
    if (match[1] && match[2]) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      const step = start <= end ? 1 : -1;
      for (let value = start; value !== end + step; value += step) numbers.add(value);
    } else if (match[3]) {
      numbers.add(Number(match[3]));
    }
  }
  return numbers.size > 0 ? numbers : null;
};

const getSceneHeroScope = (heroesText: string, sceneLabel: string) => {
  const sceneNumber = getSceneNumber(sceneLabel);
  const lines = heroesText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!sceneNumber || lines.length === 0) return { allowed: heroesText || 'Не задано', excluded: '' };

  const allowed: string[] = [];
  const excluded: string[] = [];
  lines.forEach((line) => {
    const sceneNumbers = getReferencedSceneNumbers(line);
    if (!sceneNumbers || sceneNumbers.has(sceneNumber)) {
      allowed.push(line);
    } else {
      excluded.push(line);
    }
  });

  return {
    allowed: allowed.join('\n') || 'В списке героев нет персонажей, явно привязанных к этой сцене.',
    excluded: excluded.join('\n'),
  };
};

const getCharacterName = (description: string, index: number) => {
  const firstLine = description.split(/\n/)[0]?.trim() || '';
  const normalized = firstLine
    .replace(/^\d+[.)]\s*/u, '')
    .replace(/^ID\/Имя или роль\s*[—-]\s*/iu, '')
    .replace(/^ID\/Имя или роль\s*—\s*/iu, '')
    .split(/\s*[—–-]\s*/u)[0]
    ?.replace(/[;:,.]+$/u, '')
    .trim();
  return (normalized || `Персонаж ${index + 1}`).slice(0, 48);
};

const getCharacterDescriptions = (heroesText: string) =>
  heroesText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^персонажи не выявлены\b/iu.test(line));

const getLocationDescriptions = (locationsText: string) =>
  locationsText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

interface PreparedAssetPromptRecord {
  key: string;
  heading: string;
  prompt: string;
}

const getPreparedAssetPromptRecords = (node?: NodeData) => {
  const value = node?.metadata?.preparedAssetPromptsJson;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PreparedAssetPromptRecord => Boolean(
      entry
      && typeof entry === 'object'
      && typeof (entry as PreparedAssetPromptRecord).key === 'string'
      && typeof (entry as PreparedAssetPromptRecord).heading === 'string'
      && typeof (entry as PreparedAssetPromptRecord).prompt === 'string',
    ));
  } catch {
    return [];
  }
};

const getLegacyPreparedAssetPrompt = (
  bundle: string | undefined,
  heading: string,
  allHeadings: string[],
) => {
  if (!bundle?.trim() || !heading.trim()) return '';
  const marker = `${heading}\n`;
  const start = bundle.startsWith(marker)
    ? 0
    : bundle.indexOf(`\n\n${marker}`) + 2;
  if (start < 0 || !bundle.slice(start).startsWith(marker)) return '';
  const promptStart = start + marker.length;
  const nextStarts = allHeadings
    .filter((candidate) => candidate !== heading)
    .map((candidate) => bundle.indexOf(`\n\n${candidate}\n`, promptStart))
    .filter((index) => index >= 0);
  const promptEnd = nextStarts.length > 0 ? Math.min(...nextStarts) : bundle.length;
  return bundle.slice(promptStart, promptEnd).trim();
};

const getReusablePreparedAssetPrompt = (
  node: NodeData,
  key: string,
  heading: string,
  allHeadings: string[],
) => getPreparedAssetPromptRecords(node).find((entry) => entry.key === key)?.prompt.trim()
  || getLegacyPreparedAssetPrompt(node.assetPrompt, heading, allHeadings);

const getLocationName = (description: string, index: number) => {
  const firstLine = description.split(/\n/)[0]?.trim() || '';
  const normalized = firstLine
    .replace(/^\d+[.)]\s*/u, '')
    .replace(/^Локация\s*\d+\s*[—–-]\s*/iu, '')
    .split(/\s*[—–-]\s*/u)[0]
    ?.replace(/[;:,.]+$/u, '')
    .trim();
  return (normalized || `Локация ${index + 1}`).slice(0, 48);
};

const getSystemInsertDescriptions = (text: string) => {
  const matches = [...text.matchAll(/(?:^|\n)\s*После\s+сцены\s+(\d+)\s*:\s*([\s\S]*?)(?=\n\s*После\s+сцены\s+\d+\s*:|$)/giu)];
  return matches
    .map((match, index) => {
      const sceneNumber = Number(match[1]);
      const body = match[2]?.trim() ?? '';
      const title = body.match(/Заголовок:\s*([^\n]+)/iu)?.[1]?.trim() ?? `Вставка ${index + 1}`;
      return { sceneNumber, title, body: `После сцены ${sceneNumber}:\n${body}` };
    })
    .filter((insert) => insert.sceneNumber > 0 && insert.body.trim().length > 0);
};

const imagePromptKinds = new Set<ImagePromptKind>([
  'default',
  'scene_location',
  'scene_characters',
  'character_asset',
  'location_asset',
  'system_insert',
  'chapter_backdrop',
]);

const getImagePromptKind = (node: NodeData): ImagePromptKind => {
  const promptKind = typeof node.metadata?.promptKind === 'string' ? node.metadata.promptKind.split(':')[0] : '';
  if (imagePromptKinds.has(promptKind as ImagePromptKind)) return promptKind as ImagePromptKind;
  const assetKind = typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind.split(':')[0] : '';
  if (imagePromptKinds.has(assetKind as ImagePromptKind)) return assetKind as ImagePromptKind;
  return 'default';
};

const getAssetKind = (node: NodeData) =>
  typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';

const getDetailAssetImageProvider = (node?: NodeData): DetailAssetImageProvider => {
  const provider = node?.metadata?.detailAssetImageProvider;
  if (
    provider === 'comfy_openai_gpt_image_2_low'
    || provider === 'comfy_krea_medium_turbo'
    || provider === 'comfy_luma_photon_flash'
    || provider === 'replicate_flux_schnell'
  ) return 'comfy_openai_gpt_image_2_low';
  if (provider === 'comfy_nano_banana_2_lite') return provider;
  return 'inherit';
};

const isCloudDetailPromptKind = (
  promptKind: ImagePromptKind,
): promptKind is Extract<ImagePromptKind, 'character_asset' | 'location_asset' | 'system_insert'> =>
  promptKind === 'character_asset' || promptKind === 'location_asset' || promptKind === 'system_insert';

const isImagePipeline = (value: unknown): value is ImagePipeline =>
  value === 'sdxl'
  || value === 'z_image_turbo'
  || value === 'ernie_image_turbo'
  || value === 'flux2_compose'
  || value === 'flux2_turbo_compose'
  || value === 'nano_banana_2_lite_compose';

const getNodeImagePipeline = (node: NodeData, fallback: ImagePipeline = 'sdxl') => {
  if (node.nodeType === 'pollinations_image' && isImagePipeline(node.metadata?.imagePipeline)) {
    return node.metadata.imagePipeline;
  }
  if (isImagePipeline(node.imagePipeline)) return node.imagePipeline;
  if (isImagePipeline(node.metadata?.imagePipeline)) return node.metadata.imagePipeline;
  return fallback;
};

const getDetailImagePipeline = (node: NodeData) => {
  if (node.label === 'Системные вставки' && node.imagePipeline === 'sdxl' && !isImagePipeline(node.metadata?.imagePipeline)) {
    return 'ernie_image_turbo';
  }
  return getNodeImagePipeline(node, node.label === 'Системные вставки' ? 'ernie_image_turbo' : 'z_image_turbo');
};

const getImageReferenceText = (node: NodeData) =>
  [
    node.label,
    node.masterPrompt ?? '',
    node.assetPrompt ?? '',
    typeof node.metadata?.promptContext === 'string' ? node.metadata.promptContext : '',
    typeof node.metadata?.referenceContext === 'string' ? node.metadata.referenceContext : '',
  ].join('\n');

const MAX_SCENE_CHARACTER_REFERENCES = 6;

const getCharacterAssetIndex = (node: NodeData) => {
  const match = getAssetKind(node).match(/^character_asset:(\d+)$/u);
  return match ? Number(match[1]) : null;
};

const getLocationAssetIndex = (node: NodeData) => {
  const match = getAssetKind(node).match(/^location_asset:(\d+)$/u);
  return match ? Number(match[1]) : null;
};

const isCharacterReferenceNode = (node: NodeData) =>
  node.metadata?.isReference === true
  || (getAssetKind(node).startsWith('character_asset') && node.metadata?.isReference !== false);

const findBestSceneFrameEntry = (nodes: NodesState, sceneNodeId: string) => {
  const priorityByAssetKind: Record<string, number> = {
    scene_flux2_frame: 4,
    scene_frame: 3,
    scene_location: 2,
  };
  const candidates = Object.entries(nodes)
    .filter(([, node]) => node.parentId === sceneNodeId && node.nodeType === 'pollinations_image' && Boolean(node.imageUrl))
    .sort(([, first], [, second]) =>
    (priorityByAssetKind[getAssetKind(second)] ?? 1) - (priorityByAssetKind[getAssetKind(first)] ?? 1));
  return candidates[0];
};

const findBestSceneFrameNode = (nodes: NodesState, sceneNodeId: string) =>
  findBestSceneFrameEntry(nodes, sceneNodeId)?.[1];

const getSceneShotIndex = (node: NodeData) => {
  const metadataIndex = node.metadata?.sceneShotIndex;
  if (typeof metadataIndex === 'number' && Number.isInteger(metadataIndex)) return metadataIndex;
  const match = getAssetKind(node).match(/^scene_shot:(\d+)$/u);
  return match ? Number(match[1]) : null;
};

const findSceneShotNodes = (nodes: NodesState, sceneNodeId: string) =>
  Object.values(nodes)
    .filter((node) =>
      (node.parentId === sceneNodeId || node.metadata?.sceneId === sceneNodeId)
      && node.nodeType === 'pollinations_image'
      && Boolean(node.imageUrl)
      && getSceneShotIndex(node) !== null)
    .sort((first, second) => (getSceneShotIndex(first) ?? 0) - (getSceneShotIndex(second) ?? 0));

const getVisualAssetIdentity = (node?: NodeData) => {
  if (!node?.imageUrl) return '';
  const localAssetId = typeof node.metadata?.localAssetId === 'string'
    ? node.metadata.localAssetId
    : '';
  const generatedAt = typeof node.metadata?.generatedAt === 'string'
    ? node.metadata.generatedAt
    : '';
  const imageIdentity = node.imageUrl.startsWith('data:')
    ? `${node.imageUrl.length}:${node.imageUrl.slice(-256)}`
    : node.imageUrl;
  return `${getAssetKind(node)}|${localAssetId}|${generatedAt}|${imageIdentity}`;
};

const getSceneVisualGenerationSignature = (
  frameNode?: NodeData,
  shotNodes: NodeData[] = [],
  systemInsertNode?: NodeData,
  chapterBackdropNode?: NodeData,
) => JSON.stringify({
  version: 1,
  frame: getVisualAssetIdentity(frameNode),
  shots: shotNodes.map(getVisualAssetIdentity),
  systemInsert: getVisualAssetIdentity(systemInsertNode),
  chapterBackdrop: getVisualAssetIdentity(chapterBackdropNode),
});

const findSystemInsertImageNodeForScene = (nodes: NodesState, sceneNumber: number, sourceScenarioId = '') =>
  Object.entries(nodes)
    .filter(([nodeId, node]) => {
      if (node.nodeType !== 'pollinations_image' || !node.imageUrl) return false;
      if (sourceScenarioId) {
        const descendants = getDescendantNodeIds(nodes, sourceScenarioId);
        if (nodeId !== sourceScenarioId && !descendants.has(nodeId)) return false;
      }
      const assetKind = getAssetKind(node);
      const labelSceneMatch = node.label.match(/Системная вставка\s+(\d+)(?:[.,]\d+)?/iu);
      const labelSceneNumber = labelSceneMatch ? Number(labelSceneMatch[1]) : null;
      return assetKind.startsWith(`system_insert:${sceneNumber}:`) || labelSceneNumber === sceneNumber;
    })
    .map(([, node]) => node)
    .sort((first, second) => first.label.localeCompare(second.label, 'ru', { numeric: true }))[0];

const findChapterBackdropImageNode = (
  nodes: NodesState,
  timelineNodeId: string,
  timelineNode: NodeData,
) => {
  const sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
    ? timelineNode.metadata.sourceScenarioId
    : timelineNode.parentId ?? '';
  const sourceChapterId = typeof timelineNode.metadata?.sourceChapterId === 'string'
    ? timelineNode.metadata.sourceChapterId
    : '';
  const scopedIds = getScopedNodeIds(nodes, [sourceScenarioId, sourceChapterId, timelineNodeId]);
  return Object.entries(nodes)
    .filter(([nodeId, node]) =>
      node.nodeType === 'pollinations_image'
      && Boolean(node.imageUrl)
      && getAssetKind(node) === 'chapter_backdrop'
      && (
        node.parentId === timelineNodeId
        || node.parentId === sourceChapterId
        || node.parentId === sourceScenarioId
        || scopedIds.has(nodeId)
        || scopedIds.has(node.parentId ?? '')
      ))
    .map(([, node]) => node)
    .sort((first, second) =>
      String(second.metadata?.chapterBackdropGeneratedAt ?? '').localeCompare(String(first.metadata?.chapterBackdropGeneratedAt ?? ''))
      || first.label.localeCompare(second.label, 'ru', { numeric: true }))[0];
};

const getChapterBackdropGeneratedAt = (node?: NodeData) =>
  typeof node?.metadata?.chapterBackdropGeneratedAt === 'string'
    ? node.metadata.chapterBackdropGeneratedAt
    : '';

const getReferenceLabelFromNodeTitle = (label: string) =>
  label
    .replace(/^Ассет\s+\d+\s*[·:.-]\s*/iu, '')
    .replace(/\s*·\s*Герои\s*$/iu, '')
    .trim();

const getReferenceLabel = (node: NodeData) => {
  const titleLabel = getReferenceLabelFromNodeTitle(node.label);
  if (titleLabel && !/^Project visual style\b/iu.test(titleLabel)) return titleLabel;

  if (typeof node.metadata?.referenceContext === 'string' && node.metadata.referenceContext.trim()) {
    return getCharacterName(node.metadata.referenceContext, 0);
  }

  if (typeof node.metadata?.promptContext === 'string' && node.metadata.promptContext.trim()) {
    const characterBlock = node.metadata.promptContext.match(/Нужный персонаж:\s*([\s\S]*?)(?:\n\n|$)/iu)?.[1]?.trim();
    return getCharacterName(characterBlock || node.metadata.promptContext, 0);
  }

  return node.label;
};

const getReferenceDescription = (node: NodeData) =>
  [
    node.label,
    typeof node.metadata?.promptContext === 'string' ? node.metadata.promptContext : '',
    typeof node.metadata?.referenceContext === 'string' ? node.metadata.referenceContext : '',
  ].join('\n');

const extractSceneShotScale = (text: string) => {
  const match = text.match(/(?:^|\n)\s*(?:Крупность кадра|Shot scale|Camera framing|Framing)\s*:\s*([^\n]+)/iu);
  return match?.[1]?.trim() ?? '';
};
const normalizeMatchText = (text: string) =>
  text.toLocaleLowerCase('ru').replace(/ё/gu, 'е');

const getMeaningfulTokens = (text: string) => {
  const stopWords = new Set([
    'сцена',
    'локация',
    'ассет',
    'день',
    'ночь',
    'место',
    'пространство',
    'открытое',
    'закрытое',
    'интерьер',
    'экстерьер',
    'помещение',
    'кадр',
    'план',
    'свет',
    'цвет',
    'палитра',
    'фон',
    'scene',
    'location',
    'asset',
    'background',
    'plate',
  ]);
  return [...new Set(normalizeMatchText(text).match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((token) => token.length >= 4 && !stopWords.has(token));
};

const scoreLocationReferenceMatch = (
  node: NodeData,
  sceneDescription: string,
  locationDescription: string,
  sceneNumber?: number,
) => {
  const sceneText = normalizeMatchText(sceneDescription);
  const sceneTokens = new Set(getMeaningfulTokens(sceneDescription));
  const locationName = getLocationName(locationDescription || node.label, 0);
  const locationSceneNumbers = getReferencedSceneNumbers(locationDescription);
  let score = 0;

  if (sceneNumber && locationSceneNumbers?.has(sceneNumber)) score += 220;
  if (sceneNumber && locationSceneNumbers && !locationSceneNumbers.has(sceneNumber)) score -= 70;

  getMeaningfulTokens(locationName).forEach((token) => {
    if (sceneText.includes(token)) score += 90;
  });

  getMeaningfulTokens(locationDescription).forEach((token) => {
    if (sceneTokens.has(token)) score += 12;
  });

  getMeaningfulTokens(getImageReferenceText(node)).forEach((token) => {
    if (sceneTokens.has(token)) score += 4;
  });

  return score;
};

const selectSceneLocationReference = (
  nodes: NodesState,
  sceneNodeId: string,
  sceneNode: NodeData,
  sceneDescription: string,
) => {
  const sceneLocationNode = Object.values(nodes).find((node) =>
    node.parentId === sceneNodeId
    && node.nodeType === 'pollinations_image'
    && getAssetKind(node) === 'scene_location'
    && Boolean(node.imageUrl));
  if (sceneLocationNode) return sceneLocationNode;

  const locationDetailEntry = Object.entries(nodes).find(([nodeId, node]) =>
    node.parentId === sceneNode.parentId
    && node.nodeType === 'script_detail'
    && Object.values(nodes).some((candidate) =>
      candidate.parentId === nodeId
      && candidate.nodeType === 'pollinations_image'
      && getAssetKind(candidate).startsWith('location_asset')));
  const locationDetail = locationDetailEntry?.[1];
  const locationDescriptions = getLocationDescriptions(locationDetail?.inputValue ?? '');
  const locationAssets = Object.values(nodes).filter((node) =>
    node.nodeType === 'pollinations_image'
    && getAssetKind(node).startsWith('location_asset')
    && Boolean(node.imageUrl)
    && (!sceneNode.parentId || nodes[node.parentId ?? '']?.parentId === sceneNode.parentId));

  if (locationAssets.length === 1) return locationAssets[0];

  const sceneNumber = getSceneNumber(sceneNode.label);
  const scoredLocationAssets = locationAssets
    .map((node) => {
      const assetIndex = getLocationAssetIndex(node);
      const locationDescription = assetIndex === null ? '' : locationDescriptions[assetIndex] ?? '';
      return { node, score: scoreLocationReferenceMatch(node, sceneDescription, locationDescription, sceneNumber ?? undefined) };
    })
    .sort((left, right) => right.score - left.score);

  return scoredLocationAssets.find(({ score }) => score >= 20)?.node
    ?? scoredLocationAssets[0]?.node;
};

const getReferenceMatchScore = (node: NodeData, sceneLabel: string, sceneDescription: string, fallbackIndex: number) => {
  const sceneNumber = getSceneNumber(sceneLabel);
  const referenceText = getReferenceDescription(node);
  const referenceTextLower = referenceText.toLocaleLowerCase('ru');
  const sceneTextLower = `${sceneLabel}\n${sceneDescription}`.toLocaleLowerCase('ru');
  const sceneNumbers = getReferencedSceneNumbers(referenceText);
  let score = Math.max(0, 12 - fallbackIndex);

  if (sceneNumber && sceneNumbers?.has(sceneNumber)) score += 50;
  if (sceneNumber && sceneNumbers && !sceneNumbers.has(sceneNumber)) score -= 80;
  if (!sceneNumbers && /(все[х\s]+сцен|каждой сцен|all scenes)/iu.test(referenceText)) score += 45;

  const referenceLabel = getReferenceLabel(node).toLocaleLowerCase('ru');
  const nameTokens = referenceLabel
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((token) => token.length >= 3 && !/^(ассет|герой|персонаж|мужчин|женщин)$/iu.test(token));
  nameTokens.forEach((token) => {
    if (sceneTextLower.includes(token)) score += 70;
  });

  if (/(главн|алекс|протагонист)/iu.test(referenceTextLower) && /(герой|алекс|он\b|его\b|ему\b)/iu.test(sceneTextLower)) {
    score += 55;
  }
  if (/(женск|женщина|девушк)/iu.test(referenceTextLower) && /(женщина|девушка|она\b|её\b|ей\b)/iu.test(sceneTextLower)) {
    score += 70;
  }
  if (/(управляющ)/iu.test(referenceTextLower) && /управляющ/iu.test(sceneTextLower)) score += 70;
  if (/(торговец|торговк)/iu.test(referenceTextLower) && /торгов/iu.test(sceneTextLower)) score += 70;
  if (/(стражник|страж)/iu.test(referenceTextLower) && /страж/iu.test(sceneTextLower)) score += 70;
  if (/(прохож|наблюдател)/iu.test(referenceTextLower) && /(прохож|наблюдател|толп)/iu.test(sceneTextLower)) score += 60;

  return score;
};

const selectBestCharacterReference = (nodes: NodeData[], sceneLabel: string, sceneDescription: string) =>
  nodes
    .map((node, index) => ({ node, score: getReferenceMatchScore(node, sceneLabel, sceneDescription, index) }))
    .sort((left, right) => right.score - left.score)[0]?.node;

const selectSceneCharacterReferences = (
  nodes: NodesState,
  sceneNode: NodeData,
  sceneDescription: string,
) => {
  const sceneNumber = getSceneNumber(sceneNode.label);
  const details = Object.values(nodes).filter(
    (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
  );
  const heroesText = details.find((node) => node.label === 'Герои')?.inputValue ?? '';
  const characterDescriptions = getCharacterDescriptions(heroesText);
  const characterAssets = Object.values(nodes).filter((node) =>
    node.nodeType === 'pollinations_image'
    && getAssetKind(node).startsWith('character_asset')
    && isCharacterReferenceNode(node)
    && Boolean(node.imageUrl));

  const scored = characterAssets.map((node, index) => {
    const assetIndex = getCharacterAssetIndex(node);
    const description = assetIndex === null ? '' : characterDescriptions[assetIndex] ?? '';
    const sceneNumbers = description ? getReferencedSceneNumbers(description) : null;
    let score = getReferenceMatchScore(node, sceneNode.label, sceneDescription, index);
    if (sceneNumber && sceneNumbers?.has(sceneNumber)) score += 150;
    if (sceneNumber && sceneNumbers && !sceneNumbers.has(sceneNumber)) score -= 250;
    if (description && !sceneNumbers && /(все[х\s]+сцен|каждой сцен|all scenes)/iu.test(description)) score += 130;
    return { node, score };
  }).sort((left, right) => right.score - left.score);

  const selected = scored
    .filter(({ score }) => score >= 60)
    .slice(0, MAX_SCENE_CHARACTER_REFERENCES)
    .map(({ node }) => node);

  if (selected.length > 0) return selected;
  const fallback = selectBestCharacterReference(characterAssets, sceneNode.label, sceneDescription);
  return fallback ? [fallback] : [];
};

const toFlux2CharacterReference = (node: NodeData): Flux2CharacterReference => ({
  imageUrl: node.imageUrl ?? '',
  label: getReferenceLabel(node),
});

const getCanonicalCharacterName = (node: NodeData) =>
  getReferenceLabel(node)
    .replace(/^[@\p{L}\p{N}_-]+\s*[—–-]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
  || node.label;

const findChapterHeroesNode = (nodes: NodesState, sourceNode: NodeData) =>
  Object.values(nodes).find((node) =>
    node.parentId === sourceNode.parentId
    && node.nodeType === 'script_detail'
    && node.label === 'Герои');

const findCharacterDescriptionForTag = (nodes: NodesState, sourceNode: NodeData, tag: string) => {
  const heroesText = findChapterHeroesNode(nodes, sourceNode)?.inputValue ?? '';
  const normalizedTag = normalizeCharacterTag(tag);
  return getCharacterDescriptions(heroesText).find((description, index) => {
    const descriptionTags = [
      ...getCharacterTagVariantsFromDescription(description, index),
      ...extractRequiredCharacterTagGroups(description).flat(),
    ];
    return descriptionTags.includes(normalizedTag);
  }) ?? '';
};

const getMissingCharacterAssetPipeline = (nodes: NodesState, sourceNode: NodeData) => {
  const heroesNode = findChapterHeroesNode(nodes, sourceNode);
  return heroesNode ? getNodeImagePipeline(heroesNode, 'z_image_turbo') : getNodeImagePipeline(sourceNode, 'z_image_turbo');
};

const buildMissingCharacterAssetPrompt = (
  tag: string,
  characterDescription: string,
  sceneDescription: string,
  nodes: NodesState,
) =>
  appendProjectVisualStyleToImagePrompt([
    `Create a canonical full-body character asset for ${tag}.`,
    'The character must face forward, stand upright, and be centered vertically in the frame.',
    'Use a clean simple studio background with useful margins around the full body.',
    'Make it a reusable identity reference for future scene composition.',
    characterDescription ? `Character description:\n${characterDescription}` : '',
    `Scene/source context:\n${sceneDescription}`,
  ].filter(Boolean).join('\n\n'), nodes);

const createMissingCharacterAssetNode = (
  nodes: NodesState,
  sourceNode: NodeData,
  tag: string,
  index: number,
) => {
  const normalizedTag = normalizeCharacterTag(tag);
  const existing = Object.entries(nodes).find(([, node]) =>
    isCharacterAssetNode(node)
    && createCharacterTagVariants(typeof node.metadata?.characterTag === 'string' ? node.metadata.characterTag : '')
      .includes(normalizedTag));
  if (existing) return existing[0];

  const nodeId = generateNodeId();
  const characterDescription = findCharacterDescriptionForTag(nodes, sourceNode, normalizedTag);
  const prompt = buildMissingCharacterAssetPrompt(
    tag,
    characterDescription,
    sourceNode.sceneText || sourceNode.inputValue || sourceNode.label,
    nodes,
  );
  const imagePipeline = getMissingCharacterAssetPipeline(nodes, sourceNode);
  nodes[nodeId] = {
    nodeType: 'pollinations_image',
    x: sourceNode.x - 360,
    y: sourceNode.y + index * 560,
    label: `Ассет · ${tag} · Герои`,
    width: 320,
    height: 520,
    parentId: sourceNode.parentId,
    level: (sourceNode.level ?? 0) + 1,
    masterPrompt: prompt,
    assetPrompt: prompt,
    imagePipeline,
    productionStatus: 'draft',
    statusMessage: 'Создано из проверки персонажей. Сгенерируйте, выберите удачный seed и нажмите «Канон».',
    metadata: {
      assetKind: `character_asset:missing:${tag}`,
      promptKind: 'character_asset',
      characterTag: normalizedTag,
      isReference: false,
      imagePipeline,
      missingFromSceneId: Object.entries(nodes).find(([, node]) => node === sourceNode)?.[0] ?? '',
      sourceKind: 'missing_character_asset',
    },
  };
  return nodeId;
};

const resolveCanonicalCharacterReferences = (
  nodes: NodesState,
  sceneNode: NodeData,
  sceneDescription: string,
) => {
  const requiredTagGroups = extractRequiredCharacterTagGroups(`${sceneNode.label}\n${sceneDescription}`);
  const requiredTags = [...new Set(requiredTagGroups.flat())];
  if (requiredTags.length === 0) {
    return {
      requiredTags,
      referenceNodes: selectSceneCharacterReferences(nodes, sceneNode, sceneDescription),
      referenceNodeIds: [] as string[],
      missingTags: [] as string[],
    };
  }

  const registryEntries = getCombinedCharacterRegistryEntryMap(nodes);
  const referenceNodeIds: string[] = [];
  const referenceNodes: NodeData[] = [];
  const missingTags: string[] = [];

  requiredTagGroups.forEach((tagGroup) => {
    const tag = tagGroup[0];
    const entry = tagGroup.map((candidateTag) => registryEntries.get(candidateTag)).find(Boolean);
    const fallbackEntry = !entry
      ? Object.entries(nodes).find(([, node]) => {
        if (!isCharacterAssetNode(node) || !node.imageUrl) return false;
        const nodeTags = [
          ...(typeof node.metadata?.characterTag === 'string' ? createCharacterTagVariants(node.metadata.characterTag) : []),
          ...createCharacterTagVariants(getReferenceLabel(node)),
          ...(typeof node.metadata?.referenceContext === 'string'
            ? getCharacterTagVariantsFromDescription(node.metadata.referenceContext)
            : []),
          ...(typeof node.metadata?.promptContext === 'string'
            ? getCharacterTagVariantsFromDescription(node.metadata.promptContext)
            : []),
        ];
        return nodeTags.some((nodeTag) => tagGroup.includes(nodeTag));
      })
      : undefined;
    const referenceNodeId = entry?.assetNodeId ?? fallbackEntry?.[0] ?? '';
    const referenceNode = referenceNodeId ? nodes[referenceNodeId] : undefined;
    if (referenceNode?.nodeType === 'pollinations_image' && referenceNode.imageUrl) {
      if (!referenceNodeIds.includes(referenceNodeId)) {
        referenceNodeIds.push(referenceNodeId);
        referenceNodes.push(referenceNode);
      }
    } else {
      missingTags.push(tag);
    }
  });

  return { requiredTags, referenceNodes, referenceNodeIds, missingTags };
};

const upsertScenarioGraph = (
  previousNodes: NodesState,
  sourceNodeId: string,
  generatedContent: string,
  requestedSceneCount: number,
  preferredOutputNodeId?: string,
) => {
  const sourceNode = previousNodes[sourceNodeId];
  if (!sourceNode) return previousNodes;

  const existingOutput = getExistingChild(
    previousNodes,
    sourceNodeId,
    (node) => node.nodeType === 'script_output',
  );
  const outputNodeId = existingOutput?.[0] ?? preferredOutputNodeId ?? generateNodeId();
  const existingOutputNode = existingOutput?.[1];
  const outputNode: NodeData = {
    nodeType: 'script_output',
    x: existingOutputNode?.x ?? sourceNode.x + (sourceNode.width ?? 360) + 56,
    y: existingOutputNode?.y ?? sourceNode.y,
    label: sourceNode.outputNodeLabel ?? 'СЦЕНАРИЙ ВИЗУАЛИЗАЦИИ',
    width: existingOutputNode?.width ?? 440,
    height: existingOutputNode?.height ?? 390,
    isGenerated: true,
    level: (sourceNode.level ?? 0) + 1,
    parentId: sourceNodeId,
    inputValue: generatedContent,
    systemPrompt: existingOutputNode?.systemPrompt ?? sourceNode.systemPrompt ?? SCENARIO_SYSTEM_PROMPT,
    selectedModel: sourceNode.selectedModel,
    sceneCount: requestedSceneCount,
    statusMessage: 'Сценарий готов. Дополните детали или откройте сцены.',
  };

  const scenes = parseSceneBlocks(generatedContent, requestedSceneCount);
  outputNode.sceneCount = scenes.length;
  const nextNodes: NodesState = { ...previousNodes, [outputNodeId]: outputNode };
  const existingScenes = Object.entries(previousNodes)
    .filter(([, node]) => node.parentId === outputNodeId && node.nodeType === 'scene')
    .sort(([, first], [, second]) => first.label.localeCompare(second.label, 'ru', { numeric: true }));
  const keptSceneIds = new Set<string>();
  const sceneNodeWidth = 400;
  const sceneNodeHeight = 520;

  scenes.forEach((scene, index) => {
    const existingScene = existingScenes[index];
    const sceneNodeId = existingScene?.[0] ?? generateNodeId();
    const existingSceneNode = existingScene?.[1];
    const column = index % 2;
    const row = Math.floor(index / 2);
    keptSceneIds.add(sceneNodeId);
    nextNodes[sceneNodeId] = {
      ...existingSceneNode,
      nodeType: 'scene',
      x: existingSceneNode?.x ?? outputNode.x + (outputNode.width ?? 440) + 56 + column * (sceneNodeWidth + 28),
      y: existingSceneNode?.y ?? outputNode.y + row * (sceneNodeHeight + 36),
      label: scene.label,
      width: Math.max(existingSceneNode?.width ?? sceneNodeWidth, sceneNodeWidth),
      height: Math.max(existingSceneNode?.height ?? sceneNodeHeight, sceneNodeHeight),
      level: (outputNode.level ?? 0) + 1,
      parentId: outputNodeId,
      isGenerated: true,
      hasGenerationButton: true,
      masterPrompt: existingSceneNode?.masterPrompt ?? '',
      sceneText: scene.text,
      inputValue: scene.text,
      systemPrompt: existingSceneNode?.systemPrompt ?? SCENE_DIALOGUE_SYSTEM_PROMPT,
      selectedModel: sourceNode.selectedModel,
      entityRef: existingSceneNode?.entityRef ?? { type: 'scene', id: sceneNodeId },
      productionStatus: existingSceneNode?.productionStatus ?? 'draft',
      error: undefined,
    };
  });

  existingScenes.forEach(([sceneId]) => {
    if (keptSceneIds.has(sceneId)) return;
    Object.entries(nextNodes).forEach(([nodeId, node]) => {
      if (nodeId === sceneId || node.parentId === sceneId) delete nextNodes[nodeId];
    });
  });

  return nextNodes;
};

export const useNodeManagement = (
  initialNodes: NodesState,
  generationSettings: GenerationSettings,
  imageGenerationSettings: ImageGenerationSettings,
  narrationSettings: NarrationSettings,
  onNarrationSeedChange: (seed: number) => void,
): UseNodeManagementReturn => {
  const [nodes, setNodesState] = useState<NodesState>(initialNodes);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const nodesRef = useRef(nodes);
  const activeRequests = useRef(new Map<string, AbortController>());
  const noticeCounter = useRef(0);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakingNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => () => {
    activeRequests.current.forEach((controller) => controller.abort());
    activeRequests.current.clear();
    window.speechSynthesis?.cancel();
  }, []);

  const setNodes = useCallback<Dispatch<SetStateAction<NodesState>>>((action) => {
    setNodesState((previousNodes) => {
      const nextNodes = typeof action === 'function' ? action(previousNodes) : action;
      nodesRef.current = nextNodes;
      return nextNodes;
    });
  }, []);

  const showNotice = useCallback((tone: AppNotice['tone'], message: string) => {
    noticeCounter.current += 1;
    setNotice({ id: noticeCounter.current, tone, message });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const updateNode = useCallback((nodeId: string, patch: Partial<NodeData>) => {
    setNodes((previousNodes) => {
      const node = previousNodes[nodeId];
      return node ? { ...previousNodes, [nodeId]: { ...node, ...patch } } : previousNodes;
    });
  }, [setNodes]);

  const setNodeActiveOperation = useCallback((nodeId: string, activeOperation?: string) => {
    setNodes((previousNodes) => {
      const node = previousNodes[nodeId];
      if (!node) return previousNodes;
      return {
        ...previousNodes,
        [nodeId]: {
          ...node,
          metadata: {
            ...node.metadata,
            activeOperation: activeOperation ?? null,
          },
        },
      };
    });
  }, [setNodes]);

  const requestText = useCallback(async (
    nodeId: string,
    request: GenerationRequest,
    statusMessage: string,
    continueLoading = false,
  ) => {
    if (activeRequests.current.has(nodeId)) {
      const message = 'По этой ноде уже есть активный запрос. Дождитесь ответа или нажмите отмену.';
      updateNode(nodeId, { error: message, statusMessage: undefined });
      showNotice('info', message);
      return null;
    }
    if (!continueLoading && nodesRef.current[nodeId]?.isLoading) {
      const message = 'Нода ещё помечена как занятая предыдущим запросом. Нажмите отмену и попробуйте снова.';
      updateNode(nodeId, { error: message, statusMessage: undefined });
      showNotice('info', message);
      return null;
    }
    const controller = new AbortController();
    activeRequests.current.set(nodeId, controller);
    updateNode(nodeId, {
      isLoading: true,
      loadingProvider: generationSettings.mode,
      error: undefined,
      statusMessage,
    });

    try {
      const requestWithConnectedPrompts: GenerationRequest = {
        ...request,
        systemPrompt: withConnectedSystemPromptSnippets(
          request.systemPrompt,
          nodeId,
          request.operation,
          nodesRef.current,
        ),
      };
      return await generateText(requestWithConnectedPrompts, controller.signal, generationSettings);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация отменена. Сохранён последний готовый результат.');
        return null;
      }
      const message = errorMessage(error);
      updateNode(nodeId, { error: message });
      showNotice('error', message);
      return null;
    } finally {
      activeRequests.current.delete(nodeId);
      updateNode(nodeId, { isLoading: false, loadingProvider: undefined, statusMessage: undefined });
    }
  }, [generationSettings, showNotice, updateNode]);

  const ensureScenarioSceneCount = useCallback(async (
    nodeId: string,
    scenario: string,
    sceneCount: number,
    systemPrompt: string,
    model: string,
  ) => {
    const actualSceneCount = parseSceneBlocks(scenario, sceneCount).length;
    if (actualSceneCount === sceneCount) return scenario;

    showNotice('info', `Модель вернула ${actualSceneCount} сцен вместо ${sceneCount}. Просим пересобрать ровно ${sceneCount}.`);
    const repairedScenario = await requestText(nodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(buildScenarioRepairPrompt(scenario, sceneCount, actualSceneCount), nodesRef.current),
      systemPrompt,
      model,
      sceneCount,
    }, `Исправляем количество сцен: нужно ровно ${sceneCount}...`);

    return repairedScenario || scenario;
  }, [requestText, showNotice]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { inputValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handleThemeInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { themeInputValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handleSystemPromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { systemPrompt: event.target.value, error: undefined });
  }, [updateNode]);

  const handlePromptContextChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { promptContextValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handlePromptKnowledgeChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { promptKnowledgeValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handlePromptMemoryChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { promptMemoryValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handlePromptTemplateChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { promptTemplateValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handleCreatePromptNode = useCallback((sourceNodeId?: string) => {
    setNodes((previousNodes) => {
      const sourceNode = sourceNodeId ? previousNodes[sourceNodeId] : undefined;
      const promptNodeCount = Object.values(previousNodes).filter((node) => node.nodeType === 'prompt_node').length;
      const nextId = generateNodeId();
      const nextNode: NodeData = {
        nodeType: 'prompt_node',
        x: sourceNode ? sourceNode.x + Math.max(sourceNode.width ?? 360, 360) + 80 : 80 + promptNodeCount * 42,
        y: sourceNode ? sourceNode.y : 80 + promptNodeCount * 42,
        label: `Prompt Node ${promptNodeCount + 1}`,
        width: 540,
        height: 860,
        parentId: sourceNodeId,
        level: (sourceNode?.level ?? 0) + 1,
        inputValue: sourceNode ? '' : 'Вставьте исходный текст или подключите ноду слева.',
        promptContextValue: '',
        promptKnowledgeValue: '',
        promptMemoryValue: '',
        promptTemplateValue: 'Используй TEXT и выполни задачу:\n\n{{TEXT}}',
        promptResultValue: '',
        systemPrompt: 'Ты — универсальная LLM-нода. Выполни пользовательский шаблон, используя входной текст и подключённый контекст. Верни только полезный результат без пояснений о процессе.',
        selectedModel: sourceNode?.selectedModel ?? MISTRAL_MODELS[0],
        metadata: {
          sourceKind: 'prompt_node',
          outputKind: 'text',
        },
      };
      return { ...previousNodes, [nextId]: nextNode };
    });
  }, [setNodes]);

  const handleCreateSceneWriterPromptNode = useCallback((sourceNodeId?: string) => {
    setNodes((previousNodes) => {
      const sourceNode = sourceNodeId ? previousNodes[sourceNodeId] : undefined;
      const promptNodeCount = Object.values(previousNodes).filter((node) => node.nodeType === 'prompt_node').length;
      const nextId = generateNodeId();
      const nextNode: NodeData = {
        nodeType: 'prompt_node',
        x: sourceNode ? sourceNode.x + Math.max(sourceNode.width ?? 420, 420) + 80 : 120 + promptNodeCount * 42,
        y: sourceNode ? sourceNode.y + 30 : 120 + promptNodeCount * 42,
        label: `Scene Writer ${promptNodeCount + 1}`,
        width: 540,
        height: 860,
        parentId: sourceNodeId,
        level: (sourceNode?.level ?? 0) + 1,
        inputValue: sourceNode ? '' : 'Вставьте подробный план одной главы или подключите главу слева.',
        promptContextValue: '',
        promptKnowledgeValue: '',
        promptMemoryValue: '',
        promptTemplateValue: 'Разбей эту главу на сцены строго в формате Split Node.\n\n{{TEXT}}',
        promptResultValue: '',
        systemPrompt: `${SCENE_WRITER_SPLIT_SYSTEM_PROMPT}\n\n${SCENE_WRITER_SHOT_SCALE_CONTRACT}\n\n${SCENE_WRITER_CHARACTER_TAG_CONTRACT}`,
        selectedModel: sourceNode?.selectedModel ?? MISTRAL_MODELS[0],
        statusMessage: sourceNode
          ? 'Scene Writer готов. Запустите Prompt Node, затем подключите результат к Split Node в режиме Separator.'
          : 'Scene Writer готов. Вставьте главу вручную или подключите ноду слева.',
        metadata: {
          sourceKind: 'prompt_node',
          promptPreset: 'scene_writer_split',
          outputKind: 'split_text',
        },
      };
      return { ...previousNodes, [nextId]: nextNode };
    });
  }, [setNodes]);

  const handleRunPromptNode = useCallback(async (nodeId: string) => {
    const node = nodesRef.current[nodeId];
    if (!node || node.nodeType !== 'prompt_node') return;
    const parentNode = node.parentId ? nodesRef.current[node.parentId] : undefined;
    const prompt = buildPromptNodeUserPrompt(node, parentNode);
    if (!prompt) {
      updateNode(nodeId, { error: 'Нет входного текста. Подключите Source/Prompt Node или заполните TEXT вручную.' });
      return;
    }

    const result = await requestText(nodeId, {
      operation: 'prompt_node',
      prompt,
      systemPrompt: getNodeSystemPrompt(node, 'Ты — универсальная LLM-нода. Верни только полезный результат.'),
      model: node.selectedModel || MISTRAL_MODELS[0],
    }, 'Prompt Node выполняет LLM-запрос...');

    if (!result) return;
    updateNode(nodeId, {
      promptResultValue: result,
      inputValue: node.inputValue,
      error: undefined,
      statusMessage: 'Готово. RESULT можно передать в следующую Prompt Node.',
    });
  }, [requestText, updateNode]);

  const handleAssemblePromptResultScenario = useCallback(async (nodeId: string) => {
    const node = nodesRef.current[nodeId];
    const scenario = node?.promptResultValue?.trim();
    if (!node || node.nodeType !== 'prompt_node' || node.isLoading) return;
    if (!scenario) {
      updateNode(nodeId, { error: 'Сначала запустите Prompt Node, чтобы появился RESULT со сценами.' });
      return;
    }

    const scenes = parseSceneBlocks(scenario, node.sceneCount ?? 8);
    if (scenes.length === 0) {
      updateNode(nodeId, { error: 'Не удалось найти сцены в RESULT. Нужны блоки вида "СЦЕНА 01 - ...".' });
      return;
    }

    updateNode(nodeId, {
      error: undefined,
      statusMessage: 'Автосбор сцен: создаём production-граф и детали главы...',
    });
    showNotice('info', 'Автосбор сцен запущен.');

    const existingOutputEntry = getExistingChild(
      nodesRef.current,
      nodeId,
      (candidate) => candidate.nodeType === 'script_output',
    );
    const outputNodeId = existingOutputEntry?.[0] ?? generateNodeId();
    setNodes((previousNodes) => upsertScenarioGraph(
      previousNodes,
      nodeId,
      scenario,
      scenes.length,
      outputNodeId,
    ));

    const model = node.selectedModel || MISTRAL_MODELS[0];
    for (const config of Object.values(detailConfig)) {
      updateNode(nodeId, {
        error: undefined,
        statusMessage: `Автосбор сцен: готовим «${config.label}»...`,
      });
      const existingDetail = getExistingChild(
        nodesRef.current,
        outputNodeId,
        (candidate) => candidate.nodeType === 'script_detail' && candidate.label === config.label,
      );
      const systemPrompt = getDetailSystemPrompt(existingDetail?.[1], config);
      const result = await requestText(outputNodeId, {
        operation: config.operation,
        prompt: withStoryReferenceContext(scenario, nodesRef.current),
        systemPrompt,
        model,
        sceneCount: scenes.length,
      }, `Автосбор сцен: готовим «${config.label}»...`, true);
      if (!result) {
        updateNode(nodeId, { error: `Автосбор сцен остановился на разделе «${config.label}».` });
        return;
      }
      setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, outputNodeId, config.label, result, {
        column: config.column,
        systemPrompt,
        selectedModel: model,
      }));
    }

    updateNode(nodeId, {
      error: undefined,
      statusMessage: 'Автосбор сцен готов: создан production-граф, сцены и детали главы.',
    });
    showNotice('success', 'Автосбор сцен готов: герои, локации, настроение, закадр и сцены созданы.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleCreateSplitNode = useCallback((sourceNodeId?: string) => {
    setNodes((previousNodes) => {
      const sourceNode = sourceNodeId ? previousNodes[sourceNodeId] : undefined;
      const splitNodeCount = Object.values(previousNodes).filter((node) => node.nodeType === 'split_node').length;
      const nextId = generateNodeId();
      const nextNode: NodeData = {
        nodeType: 'split_node',
        x: sourceNode ? sourceNode.x + Math.max(sourceNode.width ?? 360, 360) + 80 : 120 + splitNodeCount * 42,
        y: sourceNode ? sourceNode.y + 40 : 140 + splitNodeCount * 42,
        label: `Split Node ${splitNodeCount + 1}`,
        width: 420,
        height: 340,
        parentId: sourceNodeId,
        level: (sourceNode?.level ?? 0) + 1,
        splitMode: 'separator',
        splitSeparator: '<<<SPLIT>>>',
        arrayPath: 'chapters',
        inputValue: '',
        statusMessage: sourceNode ? 'Получит RESULT из подключённой ноды.' : 'Подключите Prompt Node с JSON RESULT или вставьте JSON вручную.',
        metadata: {
          sourceKind: 'split_node',
        },
      };
      return { ...previousNodes, [nextId]: nextNode };
    });
  }, [setNodes]);

  const handleEnsureCharacterRegistry = useCallback(() => {
    setNodes((previousNodes) => {
      const existing = findCharacterRegistryNodeEntry(previousNodes);
      if (existing) {
        const [registryNodeId, registryNode] = existing;
        return {
          ...previousNodes,
          [registryNodeId]: {
            ...registryNode,
            statusMessage: 'Реестр персонажей уже создан. Канонические ассеты добавляются кнопкой «Канон».',
          },
        };
      }

      const anchor = Object.values(previousNodes).find((node) => node.nodeType === 'script_input')
        ?? Object.values(previousNodes)[0];
      const nodeId = generateNodeId();
      const node: NodeData = {
        nodeType: 'character_registry',
        x: (anchor?.x ?? 80) + 520,
        y: (anchor?.y ?? 80) + 80,
        label: 'Реестр персонажей',
        width: 440,
        height: 420,
        level: (anchor?.level ?? 0) + 1,
        inputValue: formatCharacterRegistryText([]),
        statusMessage: 'Нажимайте «Канон» на удачных ассетах персонажей. Сцены с @ID будут брать референсы отсюда.',
        metadata: {
          sourceKind: CHARACTER_REGISTRY_SOURCE_KIND,
          characterRegistryJson: serializeCharacterRegistryEntries([]),
        },
      };
      return { ...previousNodes, [nodeId]: node };
    });
  }, [setNodes]);

  const handleSplitModeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    updateNode(nodeId, { splitMode: event.target.value as NodeData['splitMode'], error: undefined });
  }, [updateNode]);

  const handleSplitSeparatorChange = useCallback((event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => {
    updateNode(nodeId, { splitSeparator: event.target.value, error: undefined });
  }, [updateNode]);

  const handleArrayPathChange = useCallback((event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => {
    updateNode(nodeId, { arrayPath: event.target.value, error: undefined });
  }, [updateNode]);

  const handleRunSplitNode = useCallback((nodeId: string) => {
    setNodes((previousNodes) => {
      const splitNode = previousNodes[nodeId];
      if (!splitNode || splitNode.nodeType !== 'split_node') return previousNodes;
      const parentNode = splitNode.parentId ? previousNodes[splitNode.parentId] : undefined;
      const sourceText = getNodeTextOutput(parentNode) || splitNode.inputValue?.trim() || '';
      if (!sourceText) {
        return {
          ...previousNodes,
          [nodeId]: {
            ...splitNode,
            error: 'Нет JSON. Подключите Prompt Node с RESULT или вставьте JSON в поле ручного входа.',
            statusMessage: undefined,
          },
        };
      }

      let arrayValue: unknown[];
      const splitMode = splitNode.splitMode ?? 'json_path';
      try {
        if (splitMode === 'lines') {
          arrayValue = splitByLines(sourceText);
        } else if (splitMode === 'separator') {
          arrayValue = splitBySeparator(sourceText, splitNode.splitSeparator ?? '<<<SPLIT>>>');
        } else {
          const valueAtPath = readValueAtPath(parseSplitJson(sourceText), splitNode.arrayPath ?? '');
          if (!Array.isArray(valueAtPath)) {
            return {
              ...previousNodes,
              [nodeId]: {
                ...splitNode,
                error: `No array found at path "${splitNode.arrayPath || '(root)'}".`,
                statusMessage: undefined,
              },
            };
          }
          arrayValue = valueAtPath;
        }
      } catch (error) {
        return {
          ...previousNodes,
          [nodeId]: {
            ...splitNode,
            error: errorMessage(error),
            statusMessage: undefined,
          },
        };
      }

      if (arrayValue.length === 0) {
        return {
          ...previousNodes,
          [nodeId]: {
            ...splitNode,
            error: `По пути "${splitNode.arrayPath || '(root)'}" не найден массив.`,
            statusMessage: undefined,
          },
        };
      }

      const arrayPath = splitMode === 'json_path'
        ? splitNode.arrayPath?.trim() || 'items'
        : splitMode === 'lines'
          ? 'lines'
          : 'blocks';
      const nextNodes = { ...previousNodes };
      const existingItems = Object.entries(previousNodes).filter(([, node]) =>
        node.nodeType === 'split_item'
        && node.metadata?.splitParentId === nodeId);
      const existingByKey = new Map(existingItems.map(([id, node]) => [String(node.metadata?.splitItemKey ?? ''), { id, node }]));
      const columns = 3;
      const itemWidth = 420;
      const itemHeight = 430;

      arrayValue.forEach((item, index) => {
        const itemKey = getSplitItemStableKey(item, index);
        const existing = existingByKey.get(itemKey);
        const itemText = formatSplitItemText(item);
        const itemLabel = getSplitItemTitle(item, index, arrayPath);
        const x = splitNode.x + (index % columns) * (itemWidth + 28);
        const y = splitNode.y + (splitNode.height ?? 340) + 90 + Math.floor(index / columns) * (itemHeight + 34);
        const itemNode: NodeData = {
          ...(existing?.node ?? {}),
          nodeType: 'split_item',
          x: existing?.node.x ?? x,
          y: existing?.node.y ?? y,
          width: existing?.node.width ?? itemWidth,
          height: existing?.node.height ?? itemHeight,
          label: splitMode === 'json_path' ? `${arrayPath} · ${itemLabel}` : itemLabel,
          parentId: nodeId,
          level: (splitNode.level ?? 0) + 1,
          inputValue: itemText,
          error: undefined,
          statusMessage: undefined,
          metadata: {
            ...existing?.node.metadata,
            sourceKind: 'split_item',
            splitParentId: nodeId,
            splitArrayPath: arrayPath,
            splitItemKey: itemKey,
            splitIndex: index,
          },
        };
        nextNodes[existing?.id ?? `${nodeId}__${normalizeSplitKey(arrayPath)}__${itemKey}`] = itemNode;
      });

      nextNodes[nodeId] = {
        ...splitNode,
        error: undefined,
        statusMessage: `Готово: ${arrayValue.length} элементов из ${arrayPath}. Существующие дочерние ноды обновлены, лишние не удалялись.`,
      };

      return nextNodes;
    });
  }, [setNodes]);

  const handleTogglePromptSnippet = useCallback((nodeId: string) => {
    setNodes((previousNodes) => {
      const node = previousNodes[nodeId];
      if (!node || node.nodeType !== 'script_detail' || getSourceKind(node) !== promptSnippetSourceKind) return previousNodes;
      const enabled = node.metadata?.enabled !== false;
      return {
        ...previousNodes,
        [nodeId]: {
          ...node,
          statusMessage: enabled ? 'Системный фрагмент выключен.' : 'Системный фрагмент включён.',
          metadata: {
            ...node.metadata,
            sourceKind: promptSnippetSourceKind,
            enabled: !enabled,
          },
        },
      };
    });
  }, [setNodes]);

  const updateTimelineSetting = useCallback((nodeId: string, updates: Partial<NodeData>) => {
    setNodes((previousNodes) => {
      const currentNode = previousNodes[nodeId];
      if (!currentNode) return previousNodes;
      const applyUpdates = (node: NodeData): NodeData => ({
        ...node,
        ...updates,
        metadata: updates.metadata
          ? { ...node.metadata, ...updates.metadata }
          : node.metadata,
      });
      const nextNodes = {
        ...previousNodes,
        [nodeId]: applyUpdates(currentNode),
      };
      if (currentNode.nodeType !== 'chapter_timeline' || currentNode.metadata?.isTimelineMaster !== true) {
        return nextNodes;
      }
      Object.entries(previousNodes).forEach(([candidateId, candidate]) => {
        if (candidateId !== nodeId && candidate.nodeType === 'chapter_timeline') {
          nextNodes[candidateId] = applyUpdates(candidate);
        }
      });
      return nextNodes;
    });
  }, [setNodes]);

  useEffect(() => {
    setNodes((previousNodes) => {
      const timelineEntries = Object.entries(previousNodes)
        .filter(([, node]) => node.nodeType === 'chapter_timeline');
      if (
        timelineEntries.length === 0
        || timelineEntries.some(([, node]) => typeof node.metadata?.isTimelineMaster === 'boolean')
      ) return previousNodes;
      const [masterId, masterNode] = timelineEntries[0];
      const sharedMetadata: NodeData['metadata'] = {
        ...(masterNode.metadata?.timelineAssetPipeline !== undefined
          ? { timelineAssetPipeline: masterNode.metadata.timelineAssetPipeline }
          : {}),
        ...(masterNode.metadata?.timelineAssetImageProvider !== undefined
          ? { timelineAssetImageProvider: masterNode.metadata.timelineAssetImageProvider }
          : {}),
        ...(masterNode.metadata?.timelineSystemInsertPipeline !== undefined
          ? { timelineSystemInsertPipeline: masterNode.metadata.timelineSystemInsertPipeline }
          : {}),
        ...(masterNode.metadata?.timelineSystemInsertImageProvider !== undefined
          ? { timelineSystemInsertImageProvider: masterNode.metadata.timelineSystemInsertImageProvider }
          : {}),
      };
      const nextNodes = { ...previousNodes };
      timelineEntries.forEach(([timelineId, timelineNode]) => {
        const isMaster = timelineId === masterId;
        nextNodes[timelineId] = {
          ...timelineNode,
          ...(!isMaster ? {
            selectedModel: masterNode.selectedModel,
            imagePipeline: masterNode.imagePipeline,
          } : {}),
          metadata: {
            ...timelineNode.metadata,
            ...(!isMaster ? sharedMetadata : {}),
            isTimelineMaster: isMaster,
          },
        };
      });
      return nextNodes;
    });
  }, [setNodes]);

  const handleModelChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    const currentNode = nodesRef.current[nodeId];
    const updates = { selectedModel: event.target.value, error: undefined };
    if (currentNode?.nodeType === 'chapter_timeline') {
      updateTimelineSetting(nodeId, updates);
    } else {
      updateNode(nodeId, updates);
    }
  }, [updateNode, updateTimelineSetting]);

  const handleImagePipelineChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    const value = event.target.value;
    const nextPipeline: ImagePipeline = value === 'z_image_turbo'
      ? 'z_image_turbo'
      : value === 'ernie_image_turbo'
        ? 'ernie_image_turbo'
        : value === 'flux2_compose'
          ? 'flux2_compose'
          : value === 'flux2_turbo_compose'
            ? 'flux2_turbo_compose'
            : value === 'nano_banana_2_lite_compose'
              ? 'nano_banana_2_lite_compose'
              : 'sdxl';
    const updates = { imagePipeline: nextPipeline, pollinationsApiError: undefined };
    if (nodesRef.current[nodeId]?.nodeType === 'chapter_timeline') {
      updateTimelineSetting(nodeId, updates);
    } else {
      updateNode(nodeId, updates);
    }
  }, [updateNode, updateTimelineSetting]);

  const handleDetailAssetImageProviderChange = useCallback((
    event: React.ChangeEvent<HTMLSelectElement>,
    nodeId: string,
  ) => {
    const currentNode = nodesRef.current[nodeId];
    if (!currentNode || currentNode.nodeType !== 'script_detail') return;
    const value = event.target.value;
    const nextProvider: DetailAssetImageProvider = value === 'comfy_openai_gpt_image_2_low'
      ? 'comfy_openai_gpt_image_2_low'
      : value === 'comfy_nano_banana_2_lite' && currentNode.label === 'Системные вставки'
        ? 'comfy_nano_banana_2_lite'
        : 'inherit';
    updateNode(nodeId, {
      pollinationsApiError: undefined,
      metadata: {
        ...currentNode.metadata,
        detailAssetImageProvider: nextProvider,
      },
    });
  }, [updateNode]);

  const handleTimelineAssetPipelineChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    const value = event.target.value;
    const currentNode = nodesRef.current[nodeId];
    const currentPipeline = currentNode?.metadata?.timelineAssetPipeline;
    const fallbackPipeline: ImagePipeline = currentPipeline === 'sdxl'
      || currentPipeline === 'ernie_image_turbo'
      || currentPipeline === 'z_image_turbo'
        ? currentPipeline
        : 'z_image_turbo';
    const nextPipeline: ImagePipeline = value === 'sdxl'
      || value === 'ernie_image_turbo'
      || value === 'z_image_turbo'
        ? value
        : fallbackPipeline;
    const nextProvider: DetailAssetImageProvider = value === 'comfy_openai_gpt_image_2_low'
      ? 'comfy_openai_gpt_image_2_low'
      : 'inherit';
    updateTimelineSetting(nodeId, {
      pollinationsApiError: undefined,
      metadata: {
        timelineAssetPipeline: nextPipeline,
        timelineAssetImageProvider: nextProvider,
      },
    });
  }, [updateTimelineSetting]);

  const handleTimelineSystemInsertPipelineChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    const value = event.target.value;
    const currentNode = nodesRef.current[nodeId];
    const currentPipeline = currentNode?.metadata?.timelineSystemInsertPipeline;
    const fallbackPipeline: ImagePipeline = currentPipeline === 'sdxl'
      || currentPipeline === 'z_image_turbo'
      || currentPipeline === 'ernie_image_turbo'
        ? currentPipeline
        : 'ernie_image_turbo';
    const nextPipeline: ImagePipeline = value === 'sdxl'
      || value === 'z_image_turbo'
      || value === 'ernie_image_turbo'
        ? value
        : fallbackPipeline;
    const nextProvider: DetailAssetImageProvider = value === 'comfy_openai_gpt_image_2_low'
      ? 'comfy_openai_gpt_image_2_low'
      : 'inherit';
    updateTimelineSetting(nodeId, {
      pollinationsApiError: undefined,
      metadata: {
        timelineSystemInsertPipeline: nextPipeline,
        timelineSystemInsertImageProvider: nextProvider,
      },
    });
  }, [updateTimelineSetting]);

  const handleTimelineMasterChange = useCallback((event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => {
    const checked = event.target.checked;
    setNodes((previousNodes) => {
      const selectedTimeline = previousNodes[nodeId];
      if (!selectedTimeline || selectedTimeline.nodeType !== 'chapter_timeline') return previousNodes;
      const masterMetadata = selectedTimeline.metadata ?? {};
      const nextNodes = { ...previousNodes };
      Object.entries(previousNodes).forEach(([candidateId, candidate]) => {
        if (candidate.nodeType !== 'chapter_timeline') return;
        const shouldCopySettings = checked && candidateId !== nodeId;
        nextNodes[candidateId] = {
          ...candidate,
          ...(shouldCopySettings ? {
            selectedModel: selectedTimeline.selectedModel,
            imagePipeline: selectedTimeline.imagePipeline,
          } : {}),
          metadata: {
            ...candidate.metadata,
            ...(shouldCopySettings ? {
              timelineAssetPipeline: masterMetadata.timelineAssetPipeline,
              timelineAssetImageProvider: masterMetadata.timelineAssetImageProvider,
              timelineSystemInsertPipeline: masterMetadata.timelineSystemInsertPipeline,
              timelineSystemInsertImageProvider: masterMetadata.timelineSystemInsertImageProvider,
            } : {}),
            isTimelineMaster: checked && candidateId === nodeId,
          },
        };
      });
      return nextNodes;
    });
    showNotice(
      'info',
      checked
        ? 'Эта глава назначена мастером. Её настройки применены ко всем таймлайнам.'
        : 'Мастер-глава отключена. Настройки глав теперь можно менять независимо.',
    );
  }, [setNodes, showNotice]);

  const handleSceneCountChange = useCallback((event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => {
    updateNode(nodeId, { sceneCount: clampSceneCount(Number(event.target.value)), error: undefined });
  }, [updateNode]);

  const handleContinueAssociation = useCallback(async (sourceNodeId: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    if (!sourceNode || sourceNode.isLoading) return;
    const prompt = (sourceNode.nodeType === 'text' ? sourceNode.inputValue : sourceNode.label)?.trim();
    if (!prompt) {
      updateNode(sourceNodeId, { error: 'Сначала введите слово или короткую фразу.' });
      return;
    }

    let associations = sourceNode.fullAssociations;
    if (!associations) {
      const result = await requestText(sourceNodeId, {
        operation: 'associations',
        prompt,
        systemPrompt: ASSOCIATE_SYSTEM_PROMPT,
        model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      }, 'Ищем ассоциации…');
      if (!result) return;
      associations = result.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    }

    setNodes((previousNodes) => {
      const currentSource = previousNodes[sourceNodeId];
      if (!currentSource) return previousNodes;
      const startIndex = currentSource.nextAssociationIndex ?? 0;
      const batch = associations.slice(startIndex, startIndex + 5);
      if (batch.length === 0) {
        showNotice('info', 'Все подготовленные ассоциации уже показаны.');
        return previousNodes;
      }

      const nextNodes = { ...previousNodes };
      const children = Object.values(previousNodes).filter((node) => node.parentId === sourceNodeId);
      const childStartY = children.length > 0
        ? Math.max(...children.map((node) => node.y + (node.height ?? 56))) + 12
        : currentSource.y;

      batch.forEach((label, index) => {
        const nodeId = generateNodeId();
        nextNodes[nodeId] = {
          nodeType: 'association',
          x: currentSource.x + (currentSource.width ?? 360) + 44,
          y: childStartY + index * 68,
          label,
          width: Math.min(320, Math.max(150, calculateTextWidth(label))),
          height: 56,
          isGenerated: true,
          canContinue: true,
          level: (currentSource.level ?? 0) + 1,
          parentId: sourceNodeId,
        };
      });
      nextNodes[sourceNodeId] = {
        ...currentSource,
        fullAssociations: associations,
        nextAssociationIndex: startIndex + batch.length,
        error: undefined,
      };
      return nextNodes;
    });
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleScriptVisualization = useCallback(async (sourceNodeId: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    const script = sourceNode?.inputValue?.trim();
    if (!sourceNode || sourceNode.isLoading) return;
    if (!script) {
      updateNode(sourceNodeId, { error: 'Добавьте текст сценария — хотя бы одно предложение.' });
      return;
    }

    const sceneCount = clampSceneCount(sourceNode.sceneCount ?? 4);
    const theme = sourceNode.themeInputValue?.trim();
    const systemPrompt = theme
      ? `${SCENARIO_SYSTEM_PROMPT}\nСтилистическое направление: ${theme}.`
      : SCENARIO_SYSTEM_PROMPT;
    const model = sourceNode.selectedModel || MISTRAL_MODELS[0];
    const result = await requestText(sourceNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(buildScenarioPrompt(script, sceneCount), nodesRef.current),
      systemPrompt,
      model,
      sceneCount,
    }, `Разбиваем историю на ${sceneCount} сцен…`);
    if (!result) return;

    const scenario = await ensureScenarioSceneCount(sourceNodeId, result, sceneCount, systemPrompt, model);
    setNodes((previousNodes) => upsertScenarioGraph(previousNodes, sourceNodeId, scenario, sceneCount));
    showNotice('success', `Сценарий и ${parseSceneBlocks(scenario, sceneCount).length} сцен готовы.`);
  }, [ensureScenarioSceneCount, requestText, setNodes, showNotice, updateNode]);

  const handleEnsureStoryReferenceNodes = useCallback(() => {
    setNodes((previousNodes) => {
      const anchor = Object.values(previousNodes).find((node) => node.nodeType === 'script_input')
        ?? Object.values(previousNodes)[0];
      const anchorX = anchor?.x ?? 40;
      const anchorY = anchor?.y ?? 40;
      const nextNodes = { ...previousNodes };

      const ensureReferenceNode = (
        sourceKind: string,
        config: {
          label: string;
          x: number;
          y: number;
          width: number;
          height: number;
          inputValue: string;
          systemPrompt?: string;
          parentId?: string;
          sceneCount?: number;
        },
      ) => {
        const existing = findNodeBySourceKind(nextNodes, sourceKind);
        const nodeId = existing?.[0] ?? generateNodeId();
        nextNodes[nodeId] = {
          ...existing?.[1],
          nodeType: 'script_detail',
          x: existing?.[1].x ?? config.x,
          y: existing?.[1].y ?? config.y,
          label: existing?.[1].label === 'Тема главы' ? config.label : existing?.[1].label ?? config.label,
          width: existing?.[1].width ?? config.width,
          height: existing?.[1].height ?? config.height,
          isGenerated: true,
          level: anchor?.level ?? 0,
          parentId: config.parentId,
          inputValue: existing?.[1].inputValue ?? config.inputValue,
          systemPrompt: existing?.[1].systemPrompt ?? config.systemPrompt,
          selectedModel: existing?.[1].selectedModel || anchor?.selectedModel || MISTRAL_MODELS[0],
          sceneCount: existing?.[1].sceneCount ?? config.sceneCount,
          error: undefined,
          metadata: {
            ...existing?.[1].metadata,
            sourceKind,
          },
        };
        return nodeId;
      };

      const formatBibleId = ensureReferenceNode('format_bible', {
        label: 'Библия формата',
        x: anchorX + 450,
        y: anchorY,
        width: 420,
        height: 300,
        inputValue: DEFAULT_FORMAT_BIBLE,
        parentId: anchor ? Object.entries(previousNodes).find(([, node]) => node === anchor)?.[0] : undefined,
      });
      const knowledgeBaseId = ensureReferenceNode('knowledge_base', {
        label: 'База знаний',
        x: anchorX + 890,
        y: anchorY,
        width: 430,
        height: 300,
        inputValue: DEFAULT_KNOWLEDGE_BASE,
        parentId: formatBibleId,
      });
      ensureReferenceNode('fantasy_style_bible', {
        label: 'Библия фэнтези-стиля',
        x: anchorX + 1340,
        y: anchorY,
        width: 450,
        height: 360,
        inputValue: DEFAULT_FANTASY_STYLE_BIBLE,
        parentId: formatBibleId,
      });
      ensureReferenceNode(promptSnippetSourceKind, {
        label: 'Системное правило · исекай-пролог',
        x: anchorX + 1790,
        y: anchorY,
        width: 460,
        height: 420,
        inputValue: ISEKAI_PROLOG_REQUIREMENT,
        parentId: formatBibleId,
      });
      const isekaiPromptSnippet = findNodeBySourceKind(nextNodes, promptSnippetSourceKind);
      if (isekaiPromptSnippet) {
        nextNodes[isekaiPromptSnippet[0]] = {
          ...isekaiPromptSnippet[1],
          statusMessage: 'Подключено к: зерно, планировщик и материал глав.',
          metadata: {
            ...isekaiPromptSnippet[1].metadata,
            sourceKind: promptSnippetSourceKind,
            promptSnippetKey: 'isekai_prolog',
            appliesTo: 'pdf_source,chapter_topic,chapter_planner,chapter_plan,chapter_material',
            enabled: isekaiPromptSnippet[1].metadata?.enabled ?? true,
          },
        };
      }
      ensureReferenceNode('season_memory', {
        label: 'Сезонная память',
        x: anchorX + 450,
        y: anchorY + 330,
        width: 420,
        height: 300,
        inputValue: DEFAULT_SEASON_MEMORY,
        parentId: knowledgeBaseId,
      });
      const pdfSourceId = ensureReferenceNode('pdf_source', {
        label: 'PDF / сырьё сезона',
        x: anchorX + 890,
        y: anchorY + 330,
        width: 430,
        height: 360,
        inputValue: DEFAULT_PDF_SOURCE,
        systemPrompt: CHAPTER_TOPIC_SYSTEM_PROMPT,
        parentId: knowledgeBaseId,
      });
      const chapterTopicId = ensureReferenceNode('chapter_topic', {
        label: 'Зерно истории',
        x: anchorX + 1340,
        y: anchorY + 330,
        width: 430,
        height: 340,
        inputValue: DEFAULT_CHAPTER_TOPIC,
        systemPrompt: CHAPTER_KNOWLEDGE_SYSTEM_PROMPT,
        parentId: pdfSourceId,
      });
      ensureReferenceNode('chapter_planner', {
        label: 'Планировщик глав',
        x: anchorX + 1790,
        y: anchorY + 790,
        width: 460,
        height: 380,
        inputValue: DEFAULT_CHAPTER_PLANNER,
        systemPrompt: CHAPTER_PLANNER_SYSTEM_PROMPT,
        parentId: chapterTopicId,
      });
      const chapterKnowledgeId = ensureReferenceNode('chapter_knowledge', {
        label: 'База главы',
        x: anchorX + 1790,
        y: anchorY + 330,
        width: 440,
        height: 420,
        inputValue: DEFAULT_CHAPTER_KNOWLEDGE,
        systemPrompt: SEASON_SKELETON_SYSTEM_PROMPT,
        parentId: chapterTopicId,
      });
      const seasonSkeletonId = ensureReferenceNode('season_skeleton', {
        label: 'Скелет сезона',
        x: anchorX + 2250,
        y: anchorY + 330,
        width: 460,
        height: 430,
        inputValue: DEFAULT_SEASON_SKELETON,
        systemPrompt: CHAPTER_MATERIAL_SYSTEM_PROMPT,
        parentId: chapterKnowledgeId,
      });
      ensureReferenceNode('chapter_material', {
        label: 'Материал главы',
        x: anchorX + 2730,
        y: anchorY + 330,
        width: 430,
        height: 360,
        inputValue: DEFAULT_CHAPTER_MATERIAL,
        systemPrompt: SCENARIO_SYSTEM_PROMPT,
        parentId: seasonSkeletonId,
        sceneCount: 8,
      });

      showNotice('success', 'Конвейер базы готов: PDF → зерно истории → база главы → скелет сезона → материал главы → сценарий.');
      return nextNodes;
    });
  }, [setNodes, showNotice]);
  const handleEnsureChapterTimeline = useCallback((sourceNodeId?: string) => {
    setNodes((previousNodes) => {
      const requestedNode = sourceNodeId ? previousNodes[sourceNodeId] : undefined;
      const requestedTimeline = requestedNode?.nodeType === 'chapter_timeline' ? requestedNode : undefined;
      const requestedTimelineScenarioId = typeof requestedTimeline?.metadata?.sourceScenarioId === 'string'
        ? requestedTimeline.metadata.sourceScenarioId
        : requestedTimeline?.parentId;
      const sourceDescendants = sourceNodeId && !requestedTimeline
        ? getDescendantNodeIds(previousNodes, sourceNodeId)
        : new Set<string>();
      const isInRequestedBranch = (nodeId: string) =>
        !sourceNodeId || nodeId === sourceNodeId || sourceDescendants.has(nodeId);
      const ancestorScenarioId = sourceNodeId && !requestedTimeline
        ? getAncestorNodeId(previousNodes, sourceNodeId, (node) => node.nodeType === 'script_output')
        : undefined;
      const scenarioEntry = requestedTimelineScenarioId && previousNodes[requestedTimelineScenarioId]
        ? [requestedTimelineScenarioId, previousNodes[requestedTimelineScenarioId]] as [string, NodeData]
        : ancestorScenarioId && previousNodes[ancestorScenarioId]
          ? [ancestorScenarioId, previousNodes[ancestorScenarioId]] as [string, NodeData]
          : Object.entries(previousNodes).find(
            ([nodeId, node]) => node.nodeType === 'script_output' && isInRequestedBranch(nodeId),
          )
          ?? (!sourceNodeId
            ? Object.entries(previousNodes).find(([, node]) => node.nodeType === 'script_output')
            : undefined);
      const sourceScenarioId = scenarioEntry?.[0] ?? '';
      const sourceChapterId = !requestedTimeline && sourceNodeId
        ? sourceNodeId
        : typeof requestedTimeline?.metadata?.sourceChapterId === 'string'
          ? requestedTimeline.metadata.sourceChapterId
          : scenarioEntry?.[1].parentId ?? '';
      const existing = requestedTimeline
        ? [sourceNodeId, requestedTimeline] as [string, NodeData]
        : Object.entries(previousNodes).find(([, node]) =>
          node.nodeType === 'chapter_timeline'
          && (
            (sourceScenarioId && node.metadata?.sourceScenarioId === sourceScenarioId)
            || (!sourceScenarioId && sourceChapterId && node.metadata?.sourceChapterId === sourceChapterId)
          ));
      const timelineEntries = Object.entries(previousNodes)
        .filter(([, node]) => node.nodeType === 'chapter_timeline');
      const hasTimelineMasterChoice = timelineEntries
        .some(([, node]) => typeof node.metadata?.isTimelineMaster === 'boolean');
      const masterTimelineEntry = timelineEntries
        .find(([, node]) => node.metadata?.isTimelineMaster === true)
        ?? (!hasTimelineMasterChoice ? timelineEntries[0] : undefined);
      const masterTimeline = masterTimelineEntry?.[1];
      const anchor = requestedTimeline
        ?? (sourceChapterId ? previousNodes[sourceChapterId] : undefined)
        ?? scenarioEntry?.[1]
        ?? Object.values(previousNodes).find((node) => node.nodeType === 'script_input')
        ?? Object.values(previousNodes)[0];
      const nodeId = existing?.[0] ?? generateNodeId();
      const sceneCount = Object.values(previousNodes).filter((node) => {
        if (node.nodeType !== 'scene') return false;
        if (sourceScenarioId) return node.parentId === sourceScenarioId;
        if (sourceChapterId) return node.parentId === sourceChapterId || sourceDescendants.has(node.parentId ?? '');
        return true;
      }).length;
      const x = existing?.[1].x ?? ((anchor?.x ?? 40) + (anchor?.width ?? 520) + 90);
      const y = existing?.[1].y ?? (anchor?.y ?? 40);
      const systemInsertDetail = Object.values(previousNodes).find((node) =>
        node.nodeType === 'script_detail'
        && node.label === 'Системные вставки'
        && (!sourceScenarioId || node.parentId === sourceScenarioId));
      const timelineItemCount = sceneCount + countSystemInsertBlocks(systemInsertDetail?.inputValue);
      const timelineRows = Math.max(1, Math.ceil(Math.max(timelineItemCount, 1) / 4));
      const preferredWidth = 1260;
      const preferredHeight = Math.min(3200, Math.max(720, 140 + timelineRows * 390));
      const sourceLabel = anchor?.label ?? scenarioEntry?.[1].label ?? 'глава';
      const inheritedAssetPipeline = existing?.[1].metadata?.timelineAssetPipeline
        ?? masterTimeline?.metadata?.timelineAssetPipeline;
      const inheritedAssetProvider = existing?.[1].metadata?.timelineAssetImageProvider
        ?? masterTimeline?.metadata?.timelineAssetImageProvider
        ?? 'comfy_openai_gpt_image_2_low';
      const inheritedInsertPipeline = existing?.[1].metadata?.timelineSystemInsertPipeline
        ?? masterTimeline?.metadata?.timelineSystemInsertPipeline;
      const inheritedInsertProvider = existing?.[1].metadata?.timelineSystemInsertImageProvider
        ?? masterTimeline?.metadata?.timelineSystemInsertImageProvider
        ?? 'comfy_openai_gpt_image_2_low';
      const existingMasterValue = existing?.[1].metadata?.isTimelineMaster;
      const isTimelineMaster = typeof existingMasterValue === 'boolean'
        ? existingMasterValue
        : timelineEntries.length === 0;

      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          selectedModel: existing?.[1].selectedModel ?? masterTimeline?.selectedModel,
          imagePipeline: existing?.[1].imagePipeline ?? masterTimeline?.imagePipeline,
          nodeType: 'chapter_timeline',
          x,
          y,
          label: sourceLabel.toLocaleLowerCase('ru').includes('таймлайн')
            ? sourceLabel
            : `Таймлайн · ${sourceLabel}`,
          width: Math.max(existing?.[1].width ?? 0, preferredWidth),
          height: Math.max(existing?.[1].height ?? 0, preferredHeight),
          isGenerated: true,
          level: 12,
          parentId: sourceScenarioId || sourceChapterId || undefined,
          productionStatus: sceneCount > 0 ? 'in_production' : 'draft',
          statusMessage: sceneCount > 0
            ? `Собрано сцен: ${sceneCount}. Таймлайн обновляется по текущим нодам.`
            : 'В этой ветке пока не найдены рабочие сцены. Сначала соберите сцены главы, потом обновите таймлайн.',
          metadata: {
            ...existing?.[1].metadata,
            ...(inheritedAssetPipeline !== undefined
              ? { timelineAssetPipeline: inheritedAssetPipeline }
              : {}),
            ...(inheritedAssetProvider !== undefined
              ? { timelineAssetImageProvider: inheritedAssetProvider }
              : {}),
            ...(inheritedInsertPipeline !== undefined
              ? { timelineSystemInsertPipeline: inheritedInsertPipeline }
              : {}),
            sourceKind: 'chapter_timeline',
            sourceScenarioId,
            sourceChapterId,
            sourceLabel,
            timelineSystemInsertImageProvider: inheritedInsertProvider,
            isTimelineMaster,
          },
        },
      };
    });
    showNotice('success', 'Таймлайн главы готов.');
  }, [setNodes, showNotice]);

  const handleEnsureChapterCollector = useCallback(() => {
    setNodes((previousNodes) => {
      const timelines = Object.values(previousNodes).filter((node) => node.nodeType === 'chapter_timeline');
      const existing = Object.entries(previousNodes).find(([, node]) => node.nodeType === 'chapter_collector');
      const anchor = timelines
        .sort((first, second) => (first.y - second.y) || (first.x - second.x))[0]
        ?? Object.values(previousNodes).find((node) => node.nodeType === 'script_input')
        ?? Object.values(previousNodes)[0];
      const nodeId = existing?.[0] ?? generateNodeId();
      const chapterCount = timelines.length;
      const readyCount = timelines.filter((timeline) =>
        Object.values(previousNodes).some((candidate) =>
          candidate.nodeType === 'video_output'
          && candidate.parentId === Object.entries(previousNodes).find(([, node]) => node === timeline)?.[0]
          && Boolean(candidate.videoUrl))).length;
      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'chapter_collector',
          x: existing?.[1].x ?? (anchor?.x ?? 40),
          y: existing?.[1].y ?? ((anchor?.y ?? 40) - 430),
          label: 'Собиратель глав',
          width: Math.max(existing?.[1].width ?? 0, 980),
          height: Math.max(existing?.[1].height ?? 0, 430),
          isGenerated: true,
          level: 20,
          productionStatus: readyCount === chapterCount && chapterCount > 0 ? 'ready' : 'in_production',
          statusMessage: chapterCount > 0
            ? `Найдено глав: ${chapterCount}. Готово роликов глав: ${readyCount}.`
            : 'Таймлайны глав пока не найдены.',
          metadata: {
            ...existing?.[1].metadata,
            sourceKind: 'chapter_collector',
            chapterCount,
            readyChapterVideoCount: readyCount,
          },
        },
      };
    });
    showNotice('success', 'Собиратель глав готов.');
  }, [setNodes, showNotice]);

  const handleBuildScenarioFromBrief = useCallback(async (briefNodeId: string) => {
    const briefNode = nodesRef.current[briefNodeId];
    const brief = briefNode?.inputValue?.trim();
    const sourceNode = briefNode?.parentId ? nodesRef.current[briefNode.parentId] : undefined;
    if (
      !briefNode
      || briefNode.nodeType !== 'script_detail'
      || briefNode.metadata?.sourceKind !== 'brief_revision'
      || briefNode.isLoading
      || !sourceNode
    ) return;
    if (!brief) {
      updateNode(briefNodeId, { error: 'В заявке редактора нет текста для сборки сценария.' });
      return;
    }

    const sceneCount = clampSceneCount(briefNode.sceneCount ?? sourceNode.sceneCount ?? 4);
    const theme = sourceNode.themeInputValue?.trim();
    const baseSystemPrompt = getNodeSystemPrompt(briefNode, SCENARIO_SYSTEM_PROMPT);
    const systemPrompt = theme
      ? `${baseSystemPrompt}\nСтилистическое направление: ${theme}.`
      : baseSystemPrompt;
    const model = briefNode.selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0];
    const result = await requestText(briefNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(buildScenarioPrompt(brief, sceneCount), nodesRef.current),
      systemPrompt,
      model,
      sceneCount,
    }, `Собираем ${sceneCount} сцен из редакторской заявки...`);
    if (!result) return;

    const scenario = await ensureScenarioSceneCount(briefNodeId, result, sceneCount, systemPrompt, model);
    setNodes((previousNodes) => upsertScenarioGraph(previousNodes, briefNode.parentId ?? '', scenario, sceneCount));
    showNotice('success', `Сценарий пересобран из редакторской заявки: ${parseSceneBlocks(scenario, sceneCount).length} сцен.`);
  }, [ensureScenarioSceneCount, requestText, setNodes, showNotice, updateNode]);

  const handleImportReferenceFile = useCallback(async (nodeId: string, file: File) => {
    const node = nodesRef.current[nodeId];
    if (!node || node.nodeType !== 'script_detail' || getSourceKind(node) !== 'pdf_source') return;
    updateNode(nodeId, {
      isLoading: true,
      error: undefined,
      statusMessage: `Читаем файл: ${file.name}...`,
    });
    try {
      const text = await extractTextFromDocumentFile(file);
      if (!text.trim()) throw new Error('Не удалось извлечь текст из файла.');
      updateNode(nodeId, {
        inputValue: text,
        isLoading: false,
        error: undefined,
        statusMessage: `Файл загружен: ${file.name}. Извлечено ${text.length.toLocaleString('ru-RU')} знаков.`,
        metadata: {
          ...node.metadata,
          sourceKind: 'pdf_source',
          fileName: file.name,
          fileSize: file.size,
          importedAt: new Date().toISOString(),
        },
      });
      showNotice('success', `PDF/материал загружен: ${file.name}`);
    } catch (error) {
      updateNode(nodeId, {
        isLoading: false,
        error: errorMessage(error),
        statusMessage: undefined,
      });
      showNotice('error', errorMessage(error));
    }
  }, [showNotice, updateNode]);

  const handleExtractChapterTopic = useCallback(async (sourceNodeId: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    const sourceText = sourceNode?.inputValue?.trim();
    if (!sourceNode || sourceNode.nodeType !== 'script_detail' || getSourceKind(sourceNode) !== 'pdf_source') return;
    if (!sourceText) {
      updateNode(sourceNodeId, { error: 'Сначала загрузите PDF или вставьте сырьё сезона.' });
      return;
    }

    const result = await requestText(sourceNodeId, {
      operation: 'chapter_topic',
      prompt: withStoryReferenceContext([
        'Большой источник для первичного структурированного извлечения:',
        buildReferenceExcerpt(sourceText, 18000),
        'Задача: найди зерно истории и собери концепт манхвы по системному шаблону. Не пиши связный пересказ источника. Каждую информацию положи в свой раздел. Лишний материал явно оставь для следующих арок.',
      ].join('\n\n'), nodesRef.current),
      systemPrompt: getNodeSystemPrompt(sourceNode, CHAPTER_TOPIC_SYSTEM_PROMPT),
      model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount: sourceNode.sceneCount,
    }, 'Раскладываем PDF в паспорт главы...');
    if (!result) return;

    setNodes((previousNodes) => {
      const existing = findPipelineNode(previousNodes, 'chapter_topic', sourceNodeId);
      const currentSource = previousNodes[sourceNodeId] ?? sourceNode;
      const nodeId = existing?.[0] ?? generateNodeId();
      const plannerExisting = findPipelineNode(previousNodes, 'chapter_planner', nodeId);
      const plannerNodeId = plannerExisting?.[0] ?? generateNodeId();
      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'script_detail',
          x: existing?.[1].x ?? currentSource.x + (currentSource.width ?? 430) + 28,
          y: existing?.[1].y ?? currentSource.y,
          label: existing?.[1].label ?? 'Зерно истории',
          width: existing?.[1].width ?? 430,
          height: existing?.[1].height ?? 340,
          isGenerated: true,
          level: currentSource.level ?? 0,
          parentId: sourceNodeId,
          inputValue: result,
          systemPrompt: existing?.[1].systemPrompt ?? CHAPTER_KNOWLEDGE_SYSTEM_PROMPT,
          selectedModel: existing?.[1].selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0],
          error: undefined,
          statusMessage: 'Зерно истории найдено. Теперь соберите структурированную базу главы.',
          metadata: {
            ...existing?.[1].metadata,
            sourceKind: 'chapter_topic',
            sourcePdfId: sourceNodeId,
          },
        },
        [plannerNodeId]: {
          ...plannerExisting?.[1],
          nodeType: 'script_detail',
          x: plannerExisting?.[1].x ?? currentSource.x + (currentSource.width ?? 430) + 486,
          y: plannerExisting?.[1].y ?? currentSource.y,
          label: plannerExisting?.[1].label ?? 'Планировщик глав',
          width: plannerExisting?.[1].width ?? 460,
          height: plannerExisting?.[1].height ?? 380,
          isGenerated: true,
          level: currentSource.level ?? 0,
          parentId: nodeId,
          inputValue: plannerExisting?.[1].inputValue ?? DEFAULT_CHAPTER_PLANNER,
          systemPrompt: plannerExisting?.[1].systemPrompt ?? CHAPTER_PLANNER_SYSTEM_PROMPT,
          selectedModel: plannerExisting?.[1].selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0],
          error: undefined,
          statusMessage: plannerExisting?.[1].statusMessage ?? 'Планировщик готов. Он разложит зерно истории на главы в JSON.',
          metadata: {
            ...plannerExisting?.[1].metadata,
            sourceKind: 'chapter_planner',
            sourceTopicId: nodeId,
          },
        },
      };
    });
    showNotice('success', 'Зерно истории готово.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handlePlanChapters = useCallback(async (plannerNodeId: string) => {
    const plannerNode = nodesRef.current[plannerNodeId];
    if (!plannerNode || plannerNode.nodeType !== 'script_detail' || getSourceKind(plannerNode) !== 'chapter_planner') return;
    const topicNode = plannerNode.parentId ? nodesRef.current[plannerNode.parentId] : findNodeBySourceKind(nodesRef.current, 'chapter_topic')?.[1];
    const pdfNode = topicNode?.parentId ? nodesRef.current[topicNode.parentId] : findNodeBySourceKind(nodesRef.current, 'pdf_source')?.[1];
    const seasonMemory = findNodeBySourceKind(nodesRef.current, 'season_memory')?.[1].inputValue?.trim() || DEFAULT_SEASON_MEMORY;
    const topic = topicNode?.inputValue?.trim() || '';
    if (!topic) {
      updateNode(plannerNodeId, { error: 'Сначала найдите или впишите зерно истории.' });
      return;
    }

    const result = await requestText(plannerNodeId, {
      operation: 'chapter_planner',
      prompt: [
        `Зерно истории:\n${topic}`,
        pdfNode?.inputValue?.trim() ? `Выдержка из PDF/сырья:\n${buildReferenceExcerpt(pdfNode.inputValue, 14000)}` : '',
        `Сезонная память:\n${seasonMemory}`,
        'Задача: рассчитать первую арку и вернуть строгий JSON со списком глав. Количество глав выбери сам по материалу.',
      ].filter(Boolean).join('\n\n'),
      systemPrompt: getNodeSystemPrompt(plannerNode, CHAPTER_PLANNER_SYSTEM_PROMPT),
      model: plannerNode.selectedModel || topicNode?.selectedModel || MISTRAL_MODELS[0],
      sceneCount: plannerNode.sceneCount,
    }, 'Планировщик раскладывает арку на главы...');
    if (!result) return;

    try {
      const document = parseChapterPlanDocument(result);
      updateNode(plannerNodeId, {
        inputValue: JSON.stringify(document, null, 2),
        error: undefined,
        statusMessage: `План готов: ${document.chapters.length} глав. Можно создать ноды глав.`,
        metadata: {
          ...plannerNode.metadata,
          sourceKind: 'chapter_planner',
          plannedChapterCount: document.chapters.length,
          plannedAt: new Date().toISOString(),
        },
      });
      showNotice('success', `Планировщик готов: ${document.chapters.length} глав.`);
    } catch (error) {
      updateNode(plannerNodeId, {
        inputValue: result,
        error: errorMessage(error),
        statusMessage: undefined,
      });
      showNotice('error', errorMessage(error));
    }
  }, [requestText, showNotice, updateNode]);

  const handleCreateChapterPlanNodes = useCallback((plannerNodeId: string) => {
    const plannerNode = nodesRef.current[plannerNodeId];
    if (!plannerNode || plannerNode.nodeType !== 'script_detail' || getSourceKind(plannerNode) !== 'chapter_planner') return;
    try {
      const document = parseChapterPlanDocument(plannerNode.inputValue ?? '');
      setNodes((previousNodes) => {
        const currentPlanner = previousNodes[plannerNodeId] ?? plannerNode;
        const nextNodes = { ...previousNodes };
        const chapterWidth = 440;
        const chapterHeight = 560;
        document.chapters.forEach((chapter, index) => {
          const existing = Object.entries(previousNodes).find(([, node]) =>
            node.nodeType === 'script_detail'
            && node.parentId === plannerNodeId
            && getSourceKind(node) === 'chapter_plan'
            && Number(node.metadata?.chapterNumber) === chapter.number);
          const nodeId = existing?.[0] ?? generateNodeId();
          const column = index % 3;
          const row = Math.floor(index / 3);
          nextNodes[nodeId] = {
            ...existing?.[1],
            nodeType: 'script_detail',
            x: existing?.[1].x ?? currentPlanner.x + column * (chapterWidth + 28),
            y: existing?.[1].y ?? currentPlanner.y + (currentPlanner.height ?? 380) + 46 + row * (chapterHeight + 32),
            label: `Глава ${chapter.number} · ${chapter.title}`.slice(0, 120),
            width: existing?.[1].width ?? chapterWidth,
            height: existing?.[1].height ?? chapterHeight,
            isGenerated: true,
            level: (currentPlanner.level ?? 0) + 1,
            parentId: plannerNodeId,
            inputValue: formatPlannedChapter(document, chapter),
            systemPrompt: existing?.[1].systemPrompt ?? CHAPTER_MATERIAL_SYSTEM_PROMPT,
            selectedModel: existing?.[1].selectedModel || currentPlanner.selectedModel || MISTRAL_MODELS[0],
            sceneCount: existing?.[1].sceneCount ?? clampSceneCount(chapter.scene_count ?? 10),
            error: undefined,
            statusMessage: 'План главы готов. Можно развернуть в материал главы.',
            metadata: {
              ...existing?.[1].metadata,
              sourceKind: 'chapter_plan',
              chapterNumber: chapter.number,
              sourcePlannerId: plannerNodeId,
              arcTitle: document.arc_title ?? '',
            },
          };
        });
        nextNodes[plannerNodeId] = {
          ...currentPlanner,
          error: undefined,
          statusMessage: `Создано/обновлено нод глав: ${document.chapters.length}.`,
          metadata: {
            ...currentPlanner.metadata,
            sourceKind: 'chapter_planner',
            plannedChapterCount: document.chapters.length,
            chapterNodesCreatedAt: new Date().toISOString(),
          },
        };
        return nextNodes;
      });
      showNotice('success', `Ноды глав созданы: ${document.chapters.length}.`);
    } catch (error) {
      updateNode(plannerNodeId, { error: errorMessage(error), statusMessage: undefined });
      showNotice('error', errorMessage(error));
    }
  }, [setNodes, showNotice, updateNode]);

  const handleBuildChapterKnowledge = useCallback(async (topicNodeId: string) => {
    const topicNode = nodesRef.current[topicNodeId];
    const topic = topicNode?.inputValue?.trim();
    if (!topicNode || topicNode.nodeType !== 'script_detail' || getSourceKind(topicNode) !== 'chapter_topic') return;
    if (!topic) {
      updateNode(topicNodeId, { error: 'Сначала найдите или впишите зерно истории.' });
      return;
    }
    const pdfNode = topicNode.parentId ? nodesRef.current[topicNode.parentId] : findNodeBySourceKind(nodesRef.current, 'pdf_source')?.[1];
    const sourceText = pdfNode?.inputValue?.trim() || '';
    if (!sourceText) {
      updateNode(topicNodeId, { error: 'Не найден PDF/сырьё сезона для сборки базы главы.' });
      return;
    }

    const result = await requestText(topicNodeId, {
      operation: 'chapter_knowledge',
      prompt: withStoryReferenceContext([
        `Паспорт главы:\n${topic}`,
        `Выдержка из PDF/сырья:\n${buildReferenceExcerpt(sourceText, 18000)}`,
        'Задача: собрать короткую структурированную базу только для этой главы. Не пересказывай PDF сплошным текстом. Разложи факты, персонажей, конфликты, проверки, визуальные детали и запреты по отдельным разделам.',
      ].join('\n\n'), nodesRef.current),
      systemPrompt: getNodeSystemPrompt(topicNode, CHAPTER_KNOWLEDGE_SYSTEM_PROMPT),
      model: topicNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount: topicNode.sceneCount,
    }, 'Собираем короткую базу главы...');
    if (!result) return;

    setNodes((previousNodes) => {
      const existing = findPipelineNode(previousNodes, 'chapter_knowledge', topicNodeId);
      const currentTopic = previousNodes[topicNodeId] ?? topicNode;
      const nodeId = existing?.[0] ?? generateNodeId();
      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'script_detail',
          x: existing?.[1].x ?? currentTopic.x + (currentTopic.width ?? 430) + 28,
          y: existing?.[1].y ?? currentTopic.y,
          label: existing?.[1].label ?? 'База главы',
          width: existing?.[1].width ?? 440,
          height: existing?.[1].height ?? 420,
          isGenerated: true,
          level: currentTopic.level ?? 0,
          parentId: topicNodeId,
          inputValue: result,
          systemPrompt: existing?.[1].systemPrompt ?? SEASON_SKELETON_SYSTEM_PROMPT,
          selectedModel: existing?.[1].selectedModel || topicNode.selectedModel || MISTRAL_MODELS[0],
          error: undefined,
          statusMessage: 'Короткая база главы готова. Теперь соберите материал главы.',
          metadata: {
            ...existing?.[1].metadata,
            sourceKind: 'chapter_knowledge',
            sourceTopicId: topicNodeId,
          },
        },
      };
    });
    showNotice('success', 'База главы готова.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleBuildSeasonSkeleton = useCallback(async (knowledgeNodeId: string) => {
    const knowledgeNode = nodesRef.current[knowledgeNodeId];
    const knowledge = knowledgeNode?.inputValue?.trim();
    if (!knowledgeNode || knowledgeNode.nodeType !== 'script_detail' || getSourceKind(knowledgeNode) !== 'chapter_knowledge') return;
    if (!knowledge) {
      updateNode(knowledgeNodeId, { error: 'Сначала соберите короткую базу главы.' });
      return;
    }
    const topicNode = knowledgeNode.parentId ? nodesRef.current[knowledgeNode.parentId] : findNodeBySourceKind(nodesRef.current, 'chapter_topic')?.[1];
    const seasonMemory = findNodeBySourceKind(nodesRef.current, 'season_memory')?.[1].inputValue?.trim() || DEFAULT_SEASON_MEMORY;

    const result = await requestText(knowledgeNodeId, {
      operation: 'season_skeleton',
      prompt: [
        `Паспорт главы:\n${topicNode?.inputValue?.trim() || DEFAULT_CHAPTER_TOPIC}`,
        `Структурированная база главы:\n${knowledge}`,
        `Сезонная память:\n${seasonMemory}`,
        'Задача: собрать кость истории сезона и выбрать главу для разворачивания сейчас. Не пиши сцены. Сначала человек и причинная цепочка, потом профессиональные лазейки.',
      ].join('\n\n'),
      systemPrompt: getNodeSystemPrompt(knowledgeNode, SEASON_SKELETON_SYSTEM_PROMPT),
      model: knowledgeNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount: knowledgeNode.sceneCount,
    }, 'Собираем скелет сезона...');
    if (!result) return;

    setNodes((previousNodes) => {
      const existing = findPipelineNode(previousNodes, 'season_skeleton', knowledgeNodeId);
      const currentKnowledge = previousNodes[knowledgeNodeId] ?? knowledgeNode;
      const nodeId = existing?.[0] ?? generateNodeId();
      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'script_detail',
          x: existing?.[1].x ?? currentKnowledge.x + (currentKnowledge.width ?? 440) + 28,
          y: existing?.[1].y ?? currentKnowledge.y,
          label: existing?.[1].label ?? 'Скелет сезона',
          width: existing?.[1].width ?? 460,
          height: existing?.[1].height ?? 430,
          isGenerated: true,
          level: currentKnowledge.level ?? 0,
          parentId: knowledgeNodeId,
          inputValue: result,
          systemPrompt: existing?.[1].systemPrompt ?? CHAPTER_MATERIAL_SYSTEM_PROMPT,
          selectedModel: existing?.[1].selectedModel || knowledgeNode.selectedModel || MISTRAL_MODELS[0],
          sceneCount: existing?.[1].sceneCount ?? knowledgeNode.sceneCount ?? 8,
          error: undefined,
          statusMessage: 'Скелет сезона готов. Теперь соберите материал главы из выбранной главы.',
          metadata: {
            ...existing?.[1].metadata,
            sourceKind: 'season_skeleton',
            sourceKnowledgeId: knowledgeNodeId,
          },
        },
      };
    });
    showNotice('success', 'Скелет сезона готов.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleBuildChapterMaterial = useCallback(async (sourceNodeId: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    const sourceKind = getSourceKind(sourceNode);
    const sourceText = sourceNode?.inputValue?.trim();
    if (!sourceNode || sourceNode.nodeType !== 'script_detail' || (sourceKind !== 'season_skeleton' && sourceKind !== 'chapter_knowledge' && sourceKind !== 'chapter_plan')) return;
    if (!sourceText) {
      updateNode(sourceNodeId, {
        error: sourceKind === 'season_skeleton'
          ? 'Сначала соберите или впишите скелет сезона.'
          : sourceKind === 'chapter_plan'
            ? 'Сначала заполните или создайте план главы.'
            : 'Сначала соберите короткую базу главы.',
      });
      return;
    }
    const plannerNode = sourceKind === 'chapter_plan' && sourceNode.parentId
      ? nodesRef.current[sourceNode.parentId]
      : undefined;
    const topicFromPlanner = plannerNode?.parentId ? nodesRef.current[plannerNode.parentId] : undefined;
    const knowledgeNode = sourceKind === 'season_skeleton' && sourceNode.parentId
      ? nodesRef.current[sourceNode.parentId]
      : sourceNode;
    const topicNode = sourceKind === 'chapter_plan'
      ? topicFromPlanner ?? findNodeBySourceKind(nodesRef.current, 'chapter_topic')?.[1]
      : knowledgeNode?.parentId ? nodesRef.current[knowledgeNode.parentId] : findNodeBySourceKind(nodesRef.current, 'chapter_topic')?.[1];
    const seasonMemory = findNodeBySourceKind(nodesRef.current, 'season_memory')?.[1].inputValue?.trim() || DEFAULT_SEASON_MEMORY;
    const knowledge = sourceKind === 'chapter_plan'
      ? findNodeBySourceKind(nodesRef.current, 'chapter_knowledge')?.[1].inputValue?.trim() || DEFAULT_CHAPTER_KNOWLEDGE
      : knowledgeNode?.inputValue?.trim() || DEFAULT_CHAPTER_KNOWLEDGE;

    const result = await requestText(sourceNodeId, {
      operation: 'chapter_material',
      prompt: [
        `Паспорт главы:\n${topicNode?.inputValue?.trim() || DEFAULT_CHAPTER_TOPIC}`,
        `Структурированная база главы:\n${knowledge}`,
        sourceKind === 'season_skeleton' ? `Скелет сезона:\n${sourceText}` : '',
        sourceKind === 'chapter_plan' ? `План конкретной главы:\n${sourceText}` : '',
        sourceKind === 'chapter_plan' && plannerNode?.inputValue ? `Общий JSON-план арки:\n${plannerNode.inputValue}` : '',
        `Сезонная память:\n${seasonMemory}`,
        sourceKind === 'chapter_plan'
          ? 'Задача: развернуть именно эту главу в материал главы как техническое задание по шаблону. Не превращай в эссе: сначала человек, боль, встреча, причина вмешаться, потом профессиональная проверка.'
          : 'Задача: собрать материал главы как техническое задание по шаблону. Возьми главу, указанную в скелете как "Глава для разворачивания сейчас". Не превращай в эссе и не начинай сразу с работы: сначала человек, боль, встреча, причина вмешаться, потом профессиональная проверка.',
      ].filter(Boolean).join('\n\n'),
      systemPrompt: getNodeSystemPrompt(sourceNode, CHAPTER_MATERIAL_SYSTEM_PROMPT),
      model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount: sourceNode.sceneCount,
    }, 'Собираем материал главы из скелета сезона...');
    if (!result) return;

    setNodes((previousNodes) => {
      const existing = findPipelineNode(previousNodes, 'chapter_material', sourceNodeId);
      const currentSource = previousNodes[sourceNodeId] ?? sourceNode;
      const nodeId = existing?.[0] ?? generateNodeId();
      const chapterNumber = sourceKind === 'chapter_plan'
        ? Number(currentSource.metadata?.chapterNumber)
        : 0;
      const defaultMaterialLabel = Number.isFinite(chapterNumber) && chapterNumber > 0
        ? `Материал главы ${chapterNumber}`
        : 'Материал главы';
      const existingMaterialLabel = existing?.[1].label?.trim();
      const knowledgeNodeId = knowledgeNode && sourceKind !== 'chapter_plan'
        ? Object.entries(nodesRef.current).find(([, node]) => node === knowledgeNode)?.[0] ?? ''
        : '';
      const materialMetadata = {
        ...existing?.[1].metadata,
        sourceKind: 'chapter_material',
        ...(sourceKind === 'season_skeleton' ? { sourceSkeletonId: sourceNodeId } : {}),
        ...(sourceKind === 'chapter_plan' ? { sourceChapterPlanId: sourceNodeId, chapterNumber: sourceNode.metadata?.chapterNumber ?? null } : {}),
        ...(knowledgeNodeId ? { sourceKnowledgeId: knowledgeNodeId } : {}),
      };
      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'script_detail',
          x: existing?.[1].x ?? currentSource.x + (currentSource.width ?? 460) + 28,
          y: existing?.[1].y ?? currentSource.y,
          label: existingMaterialLabel && existingMaterialLabel !== 'Материал главы'
            ? existingMaterialLabel
            : defaultMaterialLabel,
          width: existing?.[1].width ?? 430,
          height: existing?.[1].height ?? 360,
          isGenerated: true,
          level: currentSource.level ?? 0,
          parentId: sourceNodeId,
          inputValue: result,
          systemPrompt: existing?.[1].systemPrompt ?? SCENARIO_SYSTEM_PROMPT,
          selectedModel: existing?.[1].selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0],
          sceneCount: existing?.[1].sceneCount ?? sourceNode.sceneCount ?? 8,
          error: undefined,
          statusMessage: 'Материал главы готов. Можно запускать автосборку.',
          metadata: materialMetadata,
        },
      };
    });
    showNotice('success', 'Материал главы готов.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleAutoBuildChapter = useCallback(async (chapterMaterialNodeId: string) => {
    const materialNode = nodesRef.current[chapterMaterialNodeId];
    const material = materialNode?.inputValue?.trim();
    if (!materialNode) {
      showNotice('error', 'Не удалось найти ноду материала главы.');
      return;
    }
    if (materialNode.nodeType !== 'script_detail' || getSourceKind(materialNode) !== 'chapter_material') {
      const message = 'Эта кнопка может запускать автосборку только из ноды «Материал главы».';
      updateNode(chapterMaterialNodeId, { error: message });
      showNotice('error', message);
      return;
    }
    if (materialNode.isLoading) {
      const message = 'Автосборка для этой ноды уже идёт. Если это старый зависший запуск, нажмите отмену.';
      updateNode(chapterMaterialNodeId, { error: message });
      showNotice('info', message);
      return;
    }
    if (!material) {
      updateNode(chapterMaterialNodeId, { error: 'Вставьте материал главы перед автосборкой.' });
      return;
    }

    updateNode(chapterMaterialNodeId, {
      error: undefined,
      statusMessage: 'Клик получен. Запускаем автосборку главы...',
    });
    showNotice('info', 'Автосборка главы запущена.');
    const setChapterAutoStatus = (statusMessage: string) => {
      updateNode(chapterMaterialNodeId, { error: undefined, statusMessage });
      showNotice('info', statusMessage);
    };
    const sceneCount = clampSceneCount(materialNode.sceneCount ?? 8);
    const model = materialNode.selectedModel || MISTRAL_MODELS[0];
    const scenarioSystemPrompt = getNodeSystemPrompt(materialNode, SCENARIO_SYSTEM_PROMPT);
    const rawScenario = await requestText(chapterMaterialNodeId, {
      operation: 'scenario',
      prompt: buildChapterPrompt(material, sceneCount, nodesRef.current),
      systemPrompt: scenarioSystemPrompt,
      model,
      sceneCount,
    }, `Автосборка: пишем ${sceneCount} сцен главы...`);
    if (!rawScenario) {
      updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на создании сценария.' });
      return;
    }
    const scenario = await ensureScenarioSceneCount(chapterMaterialNodeId, rawScenario, sceneCount, scenarioSystemPrompt, model);

    setChapterAutoStatus('Сценарий главы создан. Создаём ноды сцен и готовим детали...');
    const existingOutputEntry = getExistingChild(
      nodesRef.current,
      chapterMaterialNodeId,
      (node) => node.nodeType === 'script_output',
    );
    const outputNodeId = existingOutputEntry?.[0] ?? generateNodeId();
    setNodes((previousNodes) => upsertScenarioGraph(
      previousNodes,
      chapterMaterialNodeId,
      scenario,
      sceneCount,
      outputNodeId,
    ));

    const detailResults: Array<{ label: string; text: string }> = [];
    let autoCharacterMemory = '';
    for (const config of Object.values(detailConfig)) {
      setChapterAutoStatus(`Автосборка: готовим «${config.label}»...`);
      const existingDetail = getExistingChild(
        nodesRef.current,
        outputNodeId,
        (node) => node.nodeType === 'script_detail' && node.label === config.label,
      );
      const detailSystemPrompt = getDetailSystemPrompt(existingDetail?.[1], config);
      const detailPrompt = [
        scenario,
        autoCharacterMemory && config.operation !== 'heroes'
          ? `Память персонажей, собранная в этом проходе:\n${autoCharacterMemory}`
          : '',
      ].filter(Boolean).join('\n\n');
      const detailText = await requestText(outputNodeId, {
        operation: config.operation,
        prompt: withStoryReferenceContext(detailPrompt, nodesRef.current),
        systemPrompt: detailSystemPrompt,
        model,
        sceneCount,
      }, `Автосборка: готовим «${config.label}»...`, true);
      if (!detailText) {
        updateNode(chapterMaterialNodeId, { error: `Автосборка остановилась на разделе «${config.label}».` });
        return;
      }
      detailResults.push({ label: config.label, text: detailText });
      setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, outputNodeId, config.label, detailText, {
        column: config.column,
        systemPrompt: detailSystemPrompt,
      }));

      if (config.operation === 'heroes') {
        setChapterAutoStatus('Автосборка: собираем память персонажей...');
        const memoryPrompt = [
          `Библия героев:\n${detailText}`,
          `Текущий сценарий:\n${scenario}`,
          'Задача: собрать компактную рабочую память персонажей для диалогов, закадра, поведения и будущих сцен этой главы.',
        ].join('\n\n');
        const memoryText = await requestText(outputNodeId, {
          operation: 'character_memory',
          prompt: withStoryReferenceContext(memoryPrompt, nodesRef.current),
          systemPrompt: CHARACTER_MEMORY_SYSTEM_PROMPT,
          model,
          sceneCount,
        }, 'Автосборка: собираем память персонажей...', true);
        if (!memoryText) {
          updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на памяти персонажей.' });
          return;
        }
        autoCharacterMemory = memoryText;
        detailResults.push({ label: 'Память персонажей', text: memoryText });
        setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, outputNodeId, 'Память персонажей', memoryText, {
          column: 5,
          width: 460,
          height: 420,
          systemPrompt: CHARACTER_MEMORY_SYSTEM_PROMPT,
          selectedModel: model,
          metadata: {
            sourceKind: 'character_memory',
            createdBy: 'auto_build_chapter',
            updatedAt: new Date().toISOString(),
          },
        }));
      }
    }

    const chapterFactsPrompt = withStoryReferenceContext([
      `Материал главы:\n${material}`,
      `Сценарий главы:\n${scenario}`,
      ...detailResults.map((detail) => `${detail.label}:\n${detail.text}`),
      'Задача: вычленить только факты, правила и обещания, которые нужно помнить дальше.',
    ].join('\n\n'), nodesRef.current);
    setChapterAutoStatus('Автосборка: вычленяем факты главы...');
    const chapterFacts = await requestText(outputNodeId, {
      operation: 'chapter_facts',
      prompt: chapterFactsPrompt,
      systemPrompt: CHAPTER_FACTS_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Автосборка: вычленяем факты главы...', true);
    if (!chapterFacts) {
      updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на вычленении фактов главы.' });
      return;
    }

    setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, outputNodeId, 'Факты главы', chapterFacts, {
      column: 5,
      width: 360,
      height: 280,
      systemPrompt: CHAPTER_FACTS_SYSTEM_PROMPT,
      metadata: {
        sourceKind: 'chapter_facts',
      },
    }));

    const chapterSummaryPrompt = withStoryReferenceContext([
      'Ниже входные материалы готовой главы. Не оценивай их качество и не комментируй, хорошо ли они написаны. Извлеки только факты истории для сезонной памяти.',
      `Материал главы:\n${material}`,
      `Сценарий главы:\n${scenario}`,
      ...detailResults.map((detail) => `${detail.label}:\n${detail.text}`),
      `Факты главы:\n${chapterFacts}`,
      'Выход: заполни шаблон резюме из system prompt. Начни строго со строки "Глава:".',
    ].join('\n\n'), nodesRef.current);
    setChapterAutoStatus('Автосборка: делаем резюме главы...');
    let chapterSummary = await requestText(outputNodeId, {
      operation: 'chapter_summary',
      prompt: chapterSummaryPrompt,
      systemPrompt: CHAPTER_SUMMARY_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Автосборка: делаем резюме главы...', true);
    if (!chapterSummary) {
      updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на резюме главы.' });
      return;
    }
    if (isEditorialReviewText(chapterSummary)) {
      setChapterAutoStatus('Резюме похоже на комментарий редактора. Переписываем в память главы...');
      const repairedSummary = await requestText(outputNodeId, {
        operation: 'chapter_summary',
        prompt: [
          'Предыдущий ответ ошибочный: он оценивал качество текста вместо резюме главы.',
          `Ошибочный ответ:\n${chapterSummary}`,
          'Перепиши заново. Не используй ни одной фразы похвалы или оценки. Начни строго со строки "Глава:".',
          chapterSummaryPrompt,
        ].join('\n\n'),
        systemPrompt: CHAPTER_SUMMARY_SYSTEM_PROMPT,
        model,
        sceneCount,
      }, 'Автосборка: переписываем резюме главы...', true);
      if (!repairedSummary || isEditorialReviewText(repairedSummary)) {
        updateNode(chapterMaterialNodeId, { error: 'Модель снова вернула комментарий вместо резюме. Попробуйте другую модель или перезапустите автосборку.' });
        return;
      }
      chapterSummary = repairedSummary;
    }

    setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, outputNodeId, 'Резюме главы', chapterSummary, {
      column: 4,
      width: 360,
      height: 280,
      systemPrompt: CHAPTER_SUMMARY_SYSTEM_PROMPT,
      metadata: {
        sourceKind: 'chapter_summary',
      },
    }));

    const seasonMemoryEntry = findNodeBySourceKind(nodesRef.current, 'season_memory');
    const oldSeasonMemory = seasonMemoryEntry?.[1].inputValue?.trim() || DEFAULT_SEASON_MEMORY;
    setChapterAutoStatus('Автосборка: обновляем сезонную память...');
    const updatedSeasonMemory = await requestText(outputNodeId, {
      operation: 'season_memory_update',
      prompt: [
        `Старая сезонная память:\n${oldSeasonMemory}`,
        `Новое резюме главы:\n${chapterSummary}`,
        `Факты главы:\n${chapterFacts}`,
        'Задача: обновить сезонную память для следующей главы.',
      ].join('\n\n'),
      systemPrompt: SEASON_MEMORY_UPDATE_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Автосборка: обновляем сезонную память...', true);
    if (!updatedSeasonMemory) {
      updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на обновлении сезонной памяти.' });
      return;
    }

    setNodes((previousNodes) => {
      const existing = findNodeBySourceKind(previousNodes, 'season_memory');
      if (existing) {
        return {
          ...previousNodes,
          [existing[0]]: {
            ...existing[1],
            inputValue: updatedSeasonMemory,
            systemPrompt: existing[1].systemPrompt ?? SEASON_MEMORY_UPDATE_SYSTEM_PROMPT,
            error: undefined,
            statusMessage: 'Сезонная память обновлена.',
          },
        };
      }
      const currentMaterial = previousNodes[chapterMaterialNodeId] ?? materialNode;
      return {
        ...previousNodes,
        [generateNodeId()]: {
          nodeType: 'script_detail',
          x: currentMaterial.x - 450,
          y: currentMaterial.y,
          label: 'Сезонная память',
          width: 420,
          height: 300,
          isGenerated: true,
          level: currentMaterial.level ?? 0,
          inputValue: updatedSeasonMemory,
          systemPrompt: SEASON_MEMORY_UPDATE_SYSTEM_PROMPT,
          error: undefined,
          statusMessage: 'Сезонная память обновлена.',
          metadata: {
            sourceKind: 'season_memory',
          },
        },
      };
    });

    updateNode(chapterMaterialNodeId, {
      error: undefined,
      statusMessage: 'Автосборка завершена: сценарий, детали, закадр, резюме и сезонная память готовы.',
    });
    showNotice('success', 'Глава собрана: сценарий, детали, закадр, резюме и сезонная память готовы.');
  }, [ensureScenarioSceneCount, requestText, setNodes, showNotice, updateNode]);

  const handleScenarioDetailClick = useCallback(async (sourceNodeId: string, detailType: DetailType, modelOverride?: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    if (!sourceNode?.inputValue || sourceNode.isLoading) return;
    const config = detailConfig[detailType];
    const existingDetail = getExistingChild(
      nodesRef.current,
      sourceNodeId,
      (node) => node.nodeType === 'script_detail' && node.label === config.label,
    );
    const systemPrompt = getDetailSystemPrompt(existingDetail?.[1], config);
    const result = await requestText(sourceNodeId, {
      operation: config.operation,
      prompt: withStoryReferenceContext(sourceNode.inputValue, nodesRef.current),
      systemPrompt,
      model: modelOverride || sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount: sourceNode.sceneCount,
    }, `Готовим раздел «${config.label}»…`);
    if (!result) return;

    setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, sourceNodeId, config.label, result, {
      column: config.column,
      systemPrompt,
    }));
    showNotice('success', `Раздел «${config.label}» готов.`);
  }, [requestText, setNodes, showNotice]);

  const handleBuildCharacterMemory = useCallback(async (heroesNodeId: string) => {
    const currentNodes = nodesRef.current;
    const heroesNode = currentNodes[heroesNodeId];
    const heroesText = heroesNode?.inputValue?.trim();
    if (!heroesNode || heroesNode.nodeType !== 'script_detail' || heroesNode.label !== 'Герои' || heroesNode.isLoading) return;
    if (!heroesText) {
      updateNode(heroesNodeId, { error: 'Сначала соберите список героев.' });
      return;
    }

    const outputNode = heroesNode.parentId ? currentNodes[heroesNode.parentId] : undefined;
    const parentId = outputNode?.nodeType === 'script_output' ? heroesNode.parentId : undefined;
    const existingMemory = findProjectDetail(currentNodes, parentId, 'Память персонажей', 'character_memory');
    const narrationNode = findProjectDetail(currentNodes, parentId, 'Закадр');
    const factsNode = findProjectDetail(currentNodes, parentId, 'Факты главы', 'chapter_facts');
    const seasonMemoryNode = findProjectDetail(currentNodes, undefined, 'Сезонная память', 'season_memory');
    const model = heroesNode.selectedModel || outputNode?.selectedModel || MISTRAL_MODELS[0];
    const prompt = [
      `Библия героев:\n${heroesText}`,
      `Текущий сценарий:\n${outputNode?.inputValue || 'Не задано'}`,
      existingMemory?.inputValue ? `Старая память персонажей, которую нужно обновить:\n${existingMemory.inputValue}` : '',
      narrationNode?.inputValue ? `Закадр:\n${narrationNode.inputValue}` : '',
      factsNode?.inputValue ? `Факты главы:\n${factsNode.inputValue}` : '',
      seasonMemoryNode?.inputValue ? `Сезонная память:\n${seasonMemoryNode.inputValue}` : '',
      'Задача: собрать компактную рабочую память персонажей для будущих диалогов.',
    ].filter(Boolean).join('\n\n');

    const result = await requestText(heroesNodeId, {
      operation: 'character_memory',
      prompt: withStoryReferenceContext(prompt, currentNodes),
      systemPrompt: getNodeSystemPrompt(existingMemory, CHARACTER_MEMORY_SYSTEM_PROMPT),
      model,
      sceneCount: heroesNode.sceneCount ?? outputNode?.sceneCount,
    }, 'Собираем память персонажей...');
    if (!result || !parentId) return;

    setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, parentId, 'Память персонажей', result, {
      column: 5,
      width: 460,
      height: 420,
      systemPrompt: getNodeSystemPrompt(existingMemory, CHARACTER_MEMORY_SYSTEM_PROMPT),
      selectedModel: model,
      metadata: {
        sourceKind: 'character_memory',
        sourceHeroesNodeId: heroesNodeId,
        updatedAt: new Date().toISOString(),
      },
    }));
    showNotice('success', 'Память персонажей собрана.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleBuildSceneDialogue = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoading) return;
    const sceneText = (sceneNode.sceneText || sceneNode.inputValue || '').trim();
    if (!sceneText) {
      updateNode(sceneNodeId, { error: 'В сцене пока нет описания для диалога.' });
      return;
    }

    const parentId = outputNode?.nodeType === 'script_output' ? sceneNode.parentId : undefined;
    const characterMemoryNode = findProjectDetail(currentNodes, parentId, 'Память персонажей', 'character_memory');
    const heroesNode = findProjectDetail(currentNodes, parentId, 'Герои');
    const narrationNode = findProjectDetail(currentNodes, parentId, 'Закадр');
    const factsNode = findProjectDetail(currentNodes, parentId, 'Факты главы', 'chapter_facts');
    const model = sceneNode.selectedModel || outputNode?.selectedModel || characterMemoryNode?.selectedModel || MISTRAL_MODELS[0];
    const prompt = [
      `Нужная сцена:\n${sceneNode.label}`,
      `Описание сцены:\n${sceneText}`,
      `Сценарий главы:\n${outputNode?.inputValue || 'Не задано'}`,
      `Память персонажей:\n${characterMemoryNode?.inputValue || 'Память ещё не собрана. Используй список героев осторожно.'}`,
      `Библия героев:\n${heroesNode?.inputValue || 'Не задано'}`,
      narrationNode?.inputValue ? `Закадр главы:\n${narrationNode.inputValue}` : '',
      factsNode?.inputValue ? `Факты главы:\n${factsNode.inputValue}` : '',
      'Задача: написать реплики и маленькие действия только для этой сцены.',
    ].filter(Boolean).join('\n\n');

    setNodeActiveOperation(sceneNodeId, 'scene_dialogue');
    let result: string | null = null;
    try {
      result = await requestText(sceneNodeId, {
        operation: 'scene_dialogue',
        prompt: withStoryReferenceContext(prompt, currentNodes),
        systemPrompt: getNodeSystemPrompt(sceneNode, SCENE_DIALOGUE_SYSTEM_PROMPT),
        model,
        sceneCount: sceneNode.sceneCount ?? outputNode?.sceneCount,
        sceneLabel: sceneNode.label,
      }, 'Пишем диалог персонажей...');
    } finally {
      setNodeActiveOperation(sceneNodeId);
    }
    if (!result) return;

    setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, sceneNodeId, `Диалог · ${sceneNode.label}`, result, {
      width: 420,
      height: 360,
      systemPrompt: SCENE_DIALOGUE_SYSTEM_PROMPT,
      selectedModel: model,
      metadata: {
        sourceKind: 'scene_dialogue',
        sourceSceneId: sceneNodeId,
        sourceCharacterMemoryNodeId: characterMemoryNode
          ? Object.entries(currentNodes).find(([, node]) => node === characterMemoryNode)?.[0] ?? null
          : null,
        createdAt: new Date().toISOString(),
      },
    }));
    showNotice('success', `Диалог для «${sceneNode.label}» готов.`);
  }, [requestText, setNodeActiveOperation, setNodes, showNotice, updateNode]);

  const handleCreateSceneNodes = useCallback((sourceNodeId: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    if (!sourceNode?.inputValue) return;
    setNodes((previousNodes) => {
      const parentInput = sourceNode.parentId ? previousNodes[sourceNode.parentId] : undefined;
      return upsertScenarioGraph(
        previousNodes,
        sourceNode.parentId ?? sourceNodeId,
        sourceNode.inputValue ?? '',
        sourceNode.sceneCount ?? parentInput?.sceneCount ?? 4,
      );
    });
    showNotice('success', 'Сцены синхронизированы со сценарием.');
  }, [setNodes, showNotice]);

  const handleGenerateScenePrompt = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || !outputNode?.inputValue || sceneNode.isLoading) return;

    const details = Object.values(currentNodes).filter(
      (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
    );
    const findDetail = (label: string) => details.find((node) => node.label === label)?.inputValue || 'Не задано';
    const prompt = [
      `Нужная сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneNode.sceneText || sceneNode.inputValue || outputNode.inputValue}`,
      `Персонажи:\n${findDetail('Герои')}`,
      `Локации:\n${findDetail('Локации')}`,
      `Настроение:\n${findDetail('Настроение')}`,
      `Закадровый смысл:\n${findDetail('Закадр')}`,
    ].join('\n\n');
    const result = await requestText(sceneNodeId, {
      operation: 'scene_prompt',
      prompt,
      systemPrompt: SCENE_MASTER_PROMPT_SYSTEM_PROMPT,
      model: sceneNode.selectedModel || outputNode.selectedModel || MISTRAL_MODELS[0],
      sceneLabel: sceneNode.label,
    }, 'Собираем визуальный промпт…');
    if (!result) return;

    updateNode(sceneNodeId, {
      masterPrompt: result,
      error: undefined,
      productionStatus: 'ready',
      statusMessage: 'Промпт готов к копированию или генерации кадра.',
    });
    showNotice('success', `Промпт для «${sceneNode.label}» готов.`);
  }, [requestText, showNotice, updateNode]);

  const handleCopyToClipboard = useCallback(async (textToCopy: string) => {
    if (!textToCopy.trim()) {
      showNotice('info', 'В этом блоке пока нет текста для копирования.');
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      showNotice('success', 'Текст скопирован.');
    } catch {
      showNotice('error', 'Браузер не разрешил копирование. Выделите текст вручную.');
    }
  }, [showNotice]);

  const upsertImageNode = useCallback((
    parentNodeId: string,
    imageUrl: string,
    labelPrefix = 'Кадр',
    assetKind = 'scene_frame',
    offsetIndex = 0,
    imagePrompt = '',
    promptContext = '',
    metadataPatch: NonNullable<NodeData['metadata']> = {},
  ) => {
    setNodes((previousNodes) => {
      const parentNode = previousNodes[parentNodeId];
      if (!parentNode) return previousNodes;
      const isCharacterAsset = assetKind.startsWith('character_asset');
      const isWideImageAsset = !isCharacterAsset;
      const existing = getExistingChild(
        previousNodes,
        parentNodeId,
        (node) => node.nodeType === 'pollinations_image' && node.metadata?.assetKind === assetKind,
      );
      if (existing?.[1].imageUrl?.startsWith('blob:')) URL.revokeObjectURL(existing[1].imageUrl);
      const imageNodeId = existing?.[0] ?? generateNodeId();
      const parentWidth = parentNode.width ?? 320;
      const defaultImageSize = isCharacterAsset
        ? { width: 320, height: 520 }
        : { width: 420, height: 300 };
      const shouldResizeExistingWideImage = isWideImageAsset
        && existing?.[1].width === 360
        && existing?.[1].height === 360;
      const imagePipeline = isImagePipeline(metadataPatch.imagePipeline)
        ? metadataPatch.imagePipeline
        : getNodeImagePipeline(parentNode);
      return {
        ...previousNodes,
        [parentNodeId]: {
          ...parentNode,
          isLoadingImage: false,
          pollinationsApiError: undefined,
        },
        [imageNodeId]: {
          ...existing?.[1],
          nodeType: 'pollinations_image',
          label: `${labelPrefix} · ${parentNode.label}`,
          x: existing?.[1].x ?? parentNode.x + parentWidth + 36,
          y: existing?.[1].y ?? parentNode.y + offsetIndex * (defaultImageSize.height + 36),
          width: shouldResizeExistingWideImage ? defaultImageSize.width : existing?.[1].width ?? defaultImageSize.width,
          height: shouldResizeExistingWideImage ? defaultImageSize.height : existing?.[1].height ?? defaultImageSize.height,
          parentId: parentNodeId,
          imageUrl,
          masterPrompt: imagePrompt,
          imagePipeline,
          level: (parentNode.level ?? 0) + 1,
          metadata: {
            ...existing?.[1].metadata,
            assetKind,
            promptContext,
            promptKind: assetKind,
            imageProvider: imageGenerationSettings.provider,
            imagePipeline,
            localAssetId: null,
            localAssetKind: null,
            localAssetSavedAt: null,
            ...(isCharacterAsset ? {
              isReference: existing?.[1].metadata?.isReference ?? true,
              referencePrompt: imagePrompt,
              referenceContext: promptContext,
            } : {}),
            ...metadataPatch,
          },
        },
      };
    });
  }, [imageGenerationSettings.provider, setNodes]);

  const handleGenerateSceneLocationAsset = useCallback(async (
    sceneNodeId: string,
    pipelineOverride?: ImagePipeline,
    modelOverride?: string,
    providerOverride?: DetailAssetImageProvider,
  ) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || !outputNode?.inputValue || sceneNode.isLoading || sceneNode.isLoadingImage) return;

    const requestId = `scene-location:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    setNodeActiveOperation(sceneNodeId, 'scene_location');

    const details = Object.values(currentNodes).filter(
      (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
    );
    const findDetail = (label: string) => details.find((node) => node.label === label)?.inputValue || 'Не задано';
    const sceneDescription = sceneNode.sceneText || sceneNode.inputValue || outputNode.inputValue;
    const useGptImage = providerOverride === 'comfy_openai_gpt_image_2_low';
    const sceneLocationPipeline = pipelineOverride ?? getNodeImagePipeline(sceneNode, 'z_image_turbo');
    const prompt = [
      `Нужная сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneDescription}`,
      `Список локаций проекта:\n${findDetail('Локации')}`,
      `Настроение сцены:\n${findDetail('Настроение')}`,
      'Задача: выбери или уточни конкретную локацию этой сцены и подготовь фон без персонажей.',
    ].join('\n\n');

    try {
      updateNode(sceneNodeId, {
        isLoading: true,
        loadingProvider: generationSettings.mode,
        error: undefined,
        pollinationsApiError: undefined,
        statusMessage: 'Определяем локацию сцены и собираем image prompt...',
      });

      const locationPrompt = await generateText({
        operation: 'scene_location_prompt',
        prompt: withProjectVisualStyle(prompt, currentNodes),
        systemPrompt: SCENE_LOCATION_PROMPT_SYSTEM_PROMPT,
        model: modelOverride || sceneNode.selectedModel || outputNode.selectedModel || MISTRAL_MODELS[0],
        sceneLabel: sceneNode.label,
      }, controller.signal, generationSettings);
      const styledLocationPrompt = appendProjectVisualStyleToImagePrompt(locationPrompt, currentNodes);

      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: true,
        loadingProvider: useGptImage ? 'comfy_openai_image' : imageGenerationSettings.provider,
        assetPrompt: styledLocationPrompt,
        productionStatus: 'in_production',
        statusMessage: useGptImage
          ? 'GPT Image 2 API генерирует фон этой сцены без персонажей...'
          : imageGenerationSettings.provider === 'comfyui'
            ? `Локальный ${sceneLocationPipeline === 'sdxl'
              ? 'SDXL'
              : sceneLocationPipeline === 'ernie_image_turbo'
                ? 'ERNIE Image Turbo'
                : 'Z-Image Turbo'} генерирует фон этой сцены без персонажей...`
            : 'Основной рендер генерирует фон этой сцены без персонажей...',
      });

      const imageUrl = useGptImage
        ? await generateComfyOpenAiGptImage2LowImage(styledLocationPrompt, 'location_asset', imageGenerationSettings, controller.signal)
        : await generateImage(
          styledLocationPrompt,
          sceneLocationPipeline,
          imageGenerationSettings,
          'scene_location',
          controller.signal,
        );
      upsertImageNode(
        sceneNodeId,
        imageUrl,
        'Локация',
        'scene_location',
        0,
        styledLocationPrompt,
        withProjectVisualStyle(prompt, currentNodes),
        { imageProvider: useGptImage ? 'comfy_openai_gpt_image_2_low' : imageGenerationSettings.provider },
      );
      showNotice('success', `Локация для «${sceneNode.label}» создана.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация локации сцены отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      setNodeActiveOperation(sceneNodeId);
      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [generationSettings, imageGenerationSettings, setNodeActiveOperation, showNotice, updateNode, upsertImageNode]);

  const handleGenerateSceneCharacterLayer = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || !outputNode?.inputValue || sceneNode.isLoading || sceneNode.isLoadingImage) return;

    const requestId = `scene-characters:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    const details = Object.values(currentNodes).filter(
      (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
    );
    const heroesNode = details.find((node) => node.label === 'Герои');
    const findDetail = (label: string) => details.find((node) => node.label === label)?.inputValue || 'Не задано';
    const sceneDescription = sceneNode.sceneText || sceneNode.inputValue || outputNode.inputValue;
    const heroScope = getSceneHeroScope(heroesNode?.inputValue || '', sceneNode.label);
    const prompt = [
      `Нужная сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneDescription}`,
      `Герои, разрешённые для этой сцены:\n${heroScope.allowed}`,
      heroScope.excluded ? `Герои, которых нельзя добавлять в эту сцену:\n${heroScope.excluded}` : '',
      `Стилевой якорь героев:\n${heroesNode?.assetPrompt || 'Character sheet ещё не сгенерирован, сохраняй стиль по текстовому описанию героев.'}`,
      `Локация сцены:\n${sceneNode.assetPrompt || findDetail('Локации')}`,
      `Настроение сцены:\n${findDetail('Настроение')}`,
      'Задача: подготовь персонажей этой сцены отдельным слоем для последующего наложения на фон.',
    ].filter(Boolean).join('\n\n');

    try {
      updateNode(sceneNodeId, {
        isLoading: true,
        loadingProvider: generationSettings.mode,
        error: undefined,
        pollinationsApiError: undefined,
        statusMessage: 'Выбираем героев сцены и собираем image prompt...',
      });

      const characterPrompt = await generateText({
        operation: 'scene_character_layer_prompt',
        prompt: withProjectVisualStyle(prompt, currentNodes),
        systemPrompt: SCENE_CHARACTER_LAYER_PROMPT_SYSTEM_PROMPT,
        model: sceneNode.selectedModel || outputNode.selectedModel || MISTRAL_MODELS[0],
        sceneLabel: sceneNode.label,
      }, controller.signal, generationSettings);
      const styledCharacterPrompt = appendProjectVisualStyleToImagePrompt(characterPrompt, currentNodes);

      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: true,
        loadingProvider: imageGenerationSettings.provider,
        statusMessage: 'Генерируем слой персонажей на чистом фоне...',
      });

      const imageUrl = await generateImage(
        styledCharacterPrompt,
        getNodeImagePipeline(sceneNode),
        imageGenerationSettings,
        'scene_characters',
        controller.signal,
      );
      upsertImageNode(sceneNodeId, imageUrl, 'Персонажи', 'scene_characters', 1, styledCharacterPrompt, withProjectVisualStyle(prompt, currentNodes));
      showNotice('success', `Персонажи для «${sceneNode.label}» созданы.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация персонажей сцены отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [generationSettings, imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

  const handleComposeSceneFlux2 = useCallback(async (
    sceneNodeId: string,
    pipeline: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose' | 'nano_banana_2_lite_compose'> = 'flux2_compose',
  ) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoading || sceneNode.isLoadingImage) return;

    const sceneDescription = sceneNode.sceneText || sceneNode.inputValue || sceneNode.label;
    const locationNode = selectSceneLocationReference(currentNodes, sceneNodeId, sceneNode, sceneDescription);
    const resolvedCharacters = resolveCanonicalCharacterReferences(currentNodes, sceneNode, sceneDescription);
    const referenceNodes = resolvedCharacters.referenceNodes;
    const referenceLabels = referenceNodes.map(getReferenceLabel);
    const referenceNodeIds = resolvedCharacters.referenceNodeIds.length > 0
      ? resolvedCharacters.referenceNodeIds
      : referenceNodes.map((referenceNode) =>
        Object.entries(currentNodes).find(([, node]) => node === referenceNode)?.[0] ?? '',
      ).filter(Boolean);

    if (!locationNode?.imageUrl) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала сгенерируйте локацию этой сцены или общий ассет подходящей локации.' });
      return;
    }
    if (resolvedCharacters.missingTags.length > 0) {
      setNodes((previousNodes) => {
        const currentSceneNode = previousNodes[sceneNodeId];
        if (!currentSceneNode) return previousNodes;
        const nextNodes = { ...previousNodes };
        resolvedCharacters.missingTags.forEach((tag, index) => {
          createMissingCharacterAssetNode(nextNodes, currentSceneNode, tag, index);
        });
        nextNodes[sceneNodeId] = {
          ...currentSceneNode,
          pollinationsApiError: `Не найден канонический референс: ${resolvedCharacters.missingTags.join(', ')}. Создала ассет-ноды: сгенерируйте персонажей и нажмите «Канон».`,
        };
        return nextNodes;
      });
      return;
    }
    if (referenceNodes.length === 0 || referenceNodes.some((referenceNode) => !referenceNode.imageUrl)) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала сгенерируйте или отметьте референс персонажа.' });
      return;
    }

    const isTurbo = pipeline === 'flux2_turbo_compose';
    const isNanoBanana = pipeline === 'nano_banana_2_lite_compose';
    const composeLabel = isNanoBanana ? 'Nano Banana 2 Lite' : isTurbo ? 'Flux2 Turbo' : 'Flux2';
    const requestId = `compose-frame:${pipeline}:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    setNodeActiveOperation(
      sceneNodeId,
      isNanoBanana
        ? 'scene_compose_banana'
        : isTurbo
          ? 'scene_compose_flux2_turbo'
          : 'scene_compose_flux2',
    );

    const referenceSummary = referenceLabels.map((label, index) => `${index + 1}. ${label}`).join('; ');
    const projectVisualStyle = sanitizePositiveImagePrompt(getProjectVisualStyle(currentNodes));
    const shotScale = extractSceneShotScale(sceneDescription);
    const composePrompt = [
      projectVisualStyle ? `Project visual style: ${projectVisualStyle}. Keep this same rendering language, realism level, palette logic, and painterly finish in the final composed frame.` : '',
      `Use the first reference image as the background location plate for ${sceneNode.label}.`,
      referenceNodes.length > 1
        ? `Use the second reference image as a character reference board. It contains these character references in reading order: ${referenceSummary}.`
        : `Use the second reference image as the character identity reference for ${referenceSummary}.`,
      'Create one coherent cinematic fantasy manhwa story frame inside the location as a single continuous image, using positive visual description and natural staging.',
      'Deliver an uncaptioned story frame. Do not add or preserve non-diegetic editorial text such as shot names, panel titles, scene labels, numbers, subtitles, storyboard notes, black caption strips, logos, or watermarks. If a reference image contains such an overlay, treat it as contamination and reconstruct the covered area naturally. Keep text only when it is story-required content inside the fictional world, such as an explicitly requested system window, screen, sign, document, or message.',
      shotScale
        ? `Camera framing requirement: ${shotScale}. Follow this requested shot scale even if the location reference is a wide background plate.`
        : 'Avoid defaulting to a static wide establishing shot. Choose a visually useful framing for the scene action: medium shot, half shot, close-up, or detail shot when the story beat is about a face, hands, object, tool, fabric, seam, system window, or discovery.',
      referenceNodes.length > 1
        ? 'Use the character reference board as an identity guide. Select the characters required by the scene action from the listed references, place each required character naturally in the same environment, and keep their relative scale believable.'
        : 'Place the referenced character naturally inside the location.',
      referenceNodes.length > 1
        ? 'For every included character, preserve the matching identity, clothing, body type, face, age, and role from its numbered reference. Keep character identities separate and readable.'
        : 'Preserve the character identity, clothing, body type, face, age, and role from the character reference.',
      'Match perspective, scale, light direction, shadows, color palette, material rendering, and painterly style to the location plate. Preserve the architecture, construction logic, key props, and mood from the location reference.',
      `Scene action: ${sceneDescription}`,
      'Compose the action with clear staging: foreground, midground, and background should read as one continuous scene.',
    ].filter(Boolean).join(' ');
    const promptContext = [
      `Сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneDescription}`,
      shotScale ? `Крупность кадра: ${shotScale}` : '',
      `Локация-референс: ${locationNode.label}`,
      `Персонажи-референсы:\n${referenceNodes.map((referenceNode, index) => `${index + 1}. ${referenceNode.label} — ${getReferenceLabel(referenceNode)}`).join('\n')}`,
    ].filter(Boolean).join('\n\n');

    try {
      updateNode(sceneNodeId, {
        isLoadingImage: true,
        loadingProvider: 'comfyui',
        pollinationsApiError: undefined,
        statusMessage: isNanoBanana
          ? 'Nano Banana 2 Lite поставлен в очередь и собирает кадр через ComfyUI...'
          : isTurbo
          ? 'Flux2 Turbo поставлен в очередь и собирает кадр на 8 шагах...'
          : 'Flux2 поставлен в очередь и собирает кадр из локации и референса...',
      });

      const characterReferences = referenceNodes.map(toFlux2CharacterReference);
      const imageUrl = isNanoBanana
        ? await generateComfyNanoBanana2LiteComposeImage(
          composePrompt,
          locationNode.imageUrl,
          characterReferences,
          imageGenerationSettings,
          controller.signal,
        )
        : await generateComfyFlux2ComposeImage(
          composePrompt,
          locationNode.imageUrl,
          characterReferences,
          pipeline,
          imageGenerationSettings,
          controller.signal,
        );
      upsertImageNode(sceneNodeId, imageUrl, `Кадр ${composeLabel}`, 'scene_flux2_frame', isNanoBanana ? 4 : isTurbo ? 3 : 2, composePrompt, promptContext, {
        backgroundNodeId: Object.entries(currentNodes).find(([, node]) => node === locationNode)?.[0] ?? '',
        characterReferenceNodeId: referenceNodeIds[0] ?? '',
        characterReferenceNodeIds: referenceNodeIds.join(','),
        imagePipeline: pipeline,
      });
      showNotice('success', `${composeLabel} собрал кадр для «${sceneNode.label}».`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', `Сборка кадра ${composeLabel} отменена.`);
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      setNodeActiveOperation(sceneNodeId);
      updateNode(sceneNodeId, {
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [imageGenerationSettings, setNodeActiveOperation, setNodes, showNotice, updateNode, upsertImageNode]);

  const unloadLmStudioBeforeComfyRender = useCallback(async (
    nodeId: string,
    signal?: AbortSignal,
    statusMessage = 'Выгружаем LM Studio перед запуском ComfyUI...',
  ) => {
    if (generationSettings.mode !== 'lmstudio' || imageGenerationSettings.provider !== 'comfyui') return;
    updateNode(nodeId, {
      isLoading: true,
      loadingProvider: 'lmstudio',
      statusMessage,
    });
    try {
      const unloadedCount = await unloadLmStudioModels(generationSettings, signal);
      if (unloadedCount > 0) showNotice('info', `LM Studio выгрузил моделей: ${unloadedCount}.`);
    } catch (error) {
      if (isAbortError(error)) throw error;
      showNotice('error', `Не удалось выгрузить LM Studio перед ComfyUI: ${errorMessage(error)}`);
    }
  }, [generationSettings, imageGenerationSettings.provider, showNotice, updateNode]);

  const handleGenerateDetailAsset = useCallback(async (
    detailNodeId: string,
    pipelineOverride?: ImagePipeline,
    modelOverride?: string,
    providerOverride?: DetailAssetImageProvider,
  ) => {
    const detailNode = nodesRef.current[detailNodeId];
    const description = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail' || detailNode.isLoading || detailNode.isLoadingImage) return;
    if (detailNode.label !== 'Герои' && detailNode.label !== 'Локации' && detailNode.label !== 'Системные вставки') return;
    if (!description) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте или заполните описание.' });
      return;
    }

    const requestId = `detail-asset:${detailNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    const isCharacters = detailNode.label === 'Герои';
    const isSystemInserts = detailNode.label === 'Системные вставки';
    const savedDetailAssetProvider = providerOverride ?? getDetailAssetImageProvider(detailNode);
    const detailAssetProvider = savedDetailAssetProvider === 'comfy_nano_banana_2_lite' && !isSystemInserts
      ? 'inherit'
      : savedDetailAssetProvider;
    const useGptImage = detailAssetProvider === 'comfy_openai_gpt_image_2_low';
    const useNanoBanana = detailAssetProvider === 'comfy_nano_banana_2_lite';
    const usesCloudRenderer = useGptImage || useNanoBanana;
    const imageLoadingProvider = useGptImage
      ? 'comfy_openai_image' as const
      : useNanoBanana
        ? 'comfy_nano_banana' as const
        : imageGenerationSettings.provider;
    const imageProviderMetadata = useGptImage
      ? 'comfy_openai_gpt_image_2_low'
      : useNanoBanana
        ? 'comfy_nano_banana_2_lite'
        : imageGenerationSettings.provider;

    try {
      if (isCharacters) {
        const allCharacterDescriptions = getCharacterDescriptions(description);
        const characterDescriptions = getNewCharacterDescriptions(description, nodesRef.current);
        if (allCharacterDescriptions.length === 0) {
          updateNode(detailNodeId, {
            error: 'В описании героев нет действующих персонажей для генерации ассетов.',
            isLoading: false,
            isLoadingImage: false,
            loadingProvider: undefined,
            statusMessage: undefined,
          });
          return;
        }
        if (characterDescriptions.length === 0) {
          updateNode(detailNodeId, {
            error: undefined,
            isLoading: false,
            isLoadingImage: false,
            loadingProvider: undefined,
            statusMessage: 'Все персонажи из этой ноды уже есть в референсах/каноне. Новых героев для рендера нет.',
          });
          showNotice('info', 'Новых персонажей для рендера нет: уже есть референсы или канон.');
          return;
        }

        const allCharacterHeadings = allCharacterDescriptions
          .map((characterDescription, index) => getCharacterName(characterDescription, index));
        let preparedPromptRecords = getPreparedAssetPromptRecords(detailNode);
        const preparedAssets: Array<{ name: string; description: string; prompt: string }> = [];
        for (let index = 0; index < characterDescriptions.length; index += 1) {
          const characterDescription = characterDescriptions[index];
          const characterName = getCharacterName(characterDescription, index);
          const promptKey = `character:${createCharacterTag(characterName) || index}`;
          const reusablePrompt = getReusablePreparedAssetPrompt(
            detailNode,
            promptKey,
            characterName,
            allCharacterHeadings,
          );
          updateNode(detailNodeId, {
            isLoading: true,
            loadingProvider: generationSettings.mode,
            error: undefined,
            pollinationsApiError: undefined,
            statusMessage: reusablePrompt
              ? `Ищем готовый рендер персонажа ${index + 1}/${characterDescriptions.length}: ${characterName}`
              : `Собираем prompt персонажа ${index + 1}/${characterDescriptions.length}: ${characterName}`,
          });

          const styledAssetPrompt = reusablePrompt || appendProjectVisualStyleToImagePrompt(await generateText({
              operation: 'character_asset_prompt',
              prompt: withProjectVisualStyle(characterDescription, nodesRef.current),
              systemPrompt: CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT,
              model: modelOverride || detailNode.selectedModel || MISTRAL_MODELS[0],
            }, controller.signal, generationSettings), nodesRef.current);
          preparedAssets.push({
            name: characterName,
            description: characterDescription,
            prompt: styledAssetPrompt,
          });
          preparedPromptRecords = [
            ...preparedPromptRecords.filter((entry) => entry.key !== promptKey),
            { key: promptKey, heading: characterName, prompt: styledAssetPrompt },
          ];

          updateNode(detailNodeId, {
            assetPrompt: preparedAssets.map((asset) => `${asset.name}\n${asset.prompt}`).join('\n\n'),
            metadata: {
              ...nodesRef.current[detailNodeId]?.metadata,
              preparedAssetPromptsJson: JSON.stringify(preparedPromptRecords),
            },
          });
        }

        if (!usesCloudRenderer) {
          await unloadLmStudioBeforeComfyRender(detailNodeId, controller.signal);
        }

        for (let index = 0; index < preparedAssets.length; index += 1) {
          const preparedAsset = preparedAssets[index];
          updateNode(detailNodeId, {
            isLoading: false,
            isLoadingImage: true,
            loadingProvider: imageLoadingProvider,
            statusMessage: `Генерируем референс ${index + 1}/${preparedAssets.length}: ${preparedAsset.name}`,
          });
          const imageUrl = useGptImage
            ? await generateComfyOpenAiGptImage2LowImage(
              preparedAsset.prompt,
              'character_asset',
              imageGenerationSettings,
              controller.signal,
              { reuseCompleted: true },
            )
            : await generateImage(
              preparedAsset.prompt,
              pipelineOverride ?? getDetailImagePipeline(detailNode),
              imageGenerationSettings,
              'character_asset',
              controller.signal,
            );
          upsertImageNode(
            detailNodeId,
            imageUrl,
            `Ассет ${index + 1} · ${preparedAsset.name}`,
            `character_asset:${createCharacterTag(preparedAsset.name) || index}`,
            index,
            preparedAsset.prompt,
            withProjectVisualStyle(preparedAsset.description, nodesRef.current),
            {
              characterTag: createCharacterTag(preparedAsset.name),
              imageProvider: imageProviderMetadata,
            },
          );
        }

        showNotice('success', `Создано референсов персонажей: ${characterDescriptions.length}.`);
        return;
      }

      if (isSystemInserts) {
        const systemInsertDescriptions = getSystemInsertDescriptions(description);
        if (systemInsertDescriptions.length === 0) {
          updateNode(detailNodeId, {
            error: 'В системных вставках не найдены блоки формата «После сцены N:».',
            isLoading: false,
            isLoadingImage: false,
            loadingProvider: undefined,
            statusMessage: undefined,
          });
          return;
        }

        setNodes((previousNodes) => {
          const nextNodes = { ...previousNodes };
          Object.entries(previousNodes).forEach(([nodeId, node]) => {
            const assetKind = typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';
            if (
              node.parentId === detailNodeId
              && node.nodeType === 'pollinations_image'
              && assetKind.startsWith('system_insert')
            ) {
              if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
              delete nextNodes[nodeId];
            }
          });
          return nextNodes;
        });

        const systemInsertHeadings = systemInsertDescriptions
          .map((insert) => `Сцена ${insert.sceneNumber} · ${insert.title}`);
        let preparedPromptRecords = getPreparedAssetPromptRecords(detailNode);
        const preparedAssets: Array<{ sceneNumber: number; title: string; body: string; prompt: string }> = [];
        for (let index = 0; index < systemInsertDescriptions.length; index += 1) {
          const insert = systemInsertDescriptions[index];
          const heading = systemInsertHeadings[index];
          const promptKey = `system_insert:${insert.sceneNumber}:${index}`;
          const reusablePrompt = getReusablePreparedAssetPrompt(
            detailNode,
            promptKey,
            heading,
            systemInsertHeadings,
          );
          updateNode(detailNodeId, {
            isLoading: true,
            loadingProvider: generationSettings.mode,
            error: undefined,
            pollinationsApiError: undefined,
            statusMessage: reusablePrompt
              ? `Ищем готовый рендер вставки ${index + 1}/${systemInsertDescriptions.length}: сцена ${insert.sceneNumber}`
              : `Собираем prompt системной вставки ${index + 1}/${systemInsertDescriptions.length}: сцена ${insert.sceneNumber}`,
          });

          const styledAssetPrompt = reusablePrompt || appendProjectVisualStyleToImagePrompt(await generateText({
              operation: 'system_insert_asset_prompt',
              prompt: withProjectVisualStyle(insert.body, nodesRef.current),
              systemPrompt: SYSTEM_INSERT_ASSET_PROMPT_SYSTEM_PROMPT,
              model: modelOverride || detailNode.selectedModel || MISTRAL_MODELS[0],
            }, controller.signal, generationSettings), nodesRef.current);
          preparedAssets.push({
            sceneNumber: insert.sceneNumber,
            title: insert.title,
            body: insert.body,
            prompt: styledAssetPrompt,
          });
          preparedPromptRecords = [
            ...preparedPromptRecords.filter((entry) => entry.key !== promptKey),
            { key: promptKey, heading, prompt: styledAssetPrompt },
          ];

          updateNode(detailNodeId, {
            assetPrompt: preparedAssets
              .map((asset) => `Сцена ${asset.sceneNumber} · ${asset.title}\n${asset.prompt}`)
              .join('\n\n'),
            metadata: {
              ...nodesRef.current[detailNodeId]?.metadata,
              preparedAssetPromptsJson: JSON.stringify(preparedPromptRecords),
            },
          });
        }

        if (!usesCloudRenderer) {
          await unloadLmStudioBeforeComfyRender(detailNodeId, controller.signal);
        }

        const imagePipeline = pipelineOverride ?? getDetailImagePipeline(detailNode);
        for (let index = 0; index < preparedAssets.length; index += 1) {
          const preparedAsset = preparedAssets[index];
          updateNode(detailNodeId, {
            isLoading: false,
            isLoadingImage: true,
            loadingProvider: imageLoadingProvider,
            statusMessage: `Генерируем системную вставку ${index + 1}/${preparedAssets.length}: сцена ${preparedAsset.sceneNumber}`,
          });
          const imageUrl = useNanoBanana
            ? await generateComfyNanoBanana2LiteImage(preparedAsset.prompt, imageGenerationSettings, controller.signal)
            : useGptImage
              ? await generateComfyOpenAiGptImage2LowImage(
                preparedAsset.prompt,
                'system_insert',
                imageGenerationSettings,
                controller.signal,
                { reuseCompleted: true },
              )
              : await generateImage(
                preparedAsset.prompt,
                imagePipeline,
                imageGenerationSettings,
                'system_insert',
                controller.signal,
              );
          upsertImageNode(
            detailNodeId,
            imageUrl,
            `Системная вставка ${preparedAsset.sceneNumber}.5`,
            `system_insert:${preparedAsset.sceneNumber}:${index}`,
            index,
            preparedAsset.prompt,
            preparedAsset.body,
            {
              sceneNumber: preparedAsset.sceneNumber,
              insertTitle: preparedAsset.title,
              imagePipeline,
              imageProvider: imageProviderMetadata,
            },
          );
        }

        showNotice('success', `Создано системных вставок: ${systemInsertDescriptions.length}.`);
        return;
      }

      const locationDescriptions = getLocationDescriptions(description);
      if (locationDescriptions.length === 0) {
        updateNode(detailNodeId, {
          error: 'В описании не найдено ни одной локации для генерации.',
          isLoading: false,
          isLoadingImage: false,
          loadingProvider: undefined,
          statusMessage: undefined,
        });
        return;
      }

      const locationHeadings = locationDescriptions
        .map((locationDescription, index) => getLocationName(locationDescription, index));
      let preparedPromptRecords = getPreparedAssetPromptRecords(detailNode);
      const preparedAssets: Array<{ name: string; description: string; prompt: string }> = [];
      for (let index = 0; index < locationDescriptions.length; index += 1) {
        const locationDescription = locationDescriptions[index];
        const locationName = getLocationName(locationDescription, index);
        const promptKey = `location:${index}:${locationName}`;
        const reusablePrompt = getReusablePreparedAssetPrompt(
          detailNode,
          promptKey,
          locationName,
          locationHeadings,
        );
        updateNode(detailNodeId, {
          isLoading: true,
          loadingProvider: generationSettings.mode,
          error: undefined,
          pollinationsApiError: undefined,
          statusMessage: reusablePrompt
            ? `Ищем готовый рендер локации ${index + 1}/${locationDescriptions.length}: ${locationName}`
            : `Собираем prompt локации ${index + 1}/${locationDescriptions.length}: ${locationName}`,
        });

        const styledAssetPrompt = reusablePrompt || appendProjectVisualStyleToImagePrompt(await generateText({
            operation: 'location_asset_prompt',
            prompt: withProjectVisualStyle(locationDescription, nodesRef.current),
            systemPrompt: LOCATION_ASSET_PROMPT_SYSTEM_PROMPT,
            model: modelOverride || detailNode.selectedModel || MISTRAL_MODELS[0],
          }, controller.signal, generationSettings), nodesRef.current);
        preparedAssets.push({
          name: locationName,
          description: locationDescription,
          prompt: styledAssetPrompt,
        });
        preparedPromptRecords = [
          ...preparedPromptRecords.filter((entry) => entry.key !== promptKey),
          { key: promptKey, heading: locationName, prompt: styledAssetPrompt },
        ];

        updateNode(detailNodeId, {
          assetPrompt: preparedAssets.map((asset) => `${asset.name}\n${asset.prompt}`).join('\n\n'),
          metadata: {
            ...nodesRef.current[detailNodeId]?.metadata,
            preparedAssetPromptsJson: JSON.stringify(preparedPromptRecords),
          },
        });
      }

      if (!usesCloudRenderer) {
        await unloadLmStudioBeforeComfyRender(detailNodeId, controller.signal);
      }

      for (let index = 0; index < preparedAssets.length; index += 1) {
        const preparedAsset = preparedAssets[index];
        updateNode(detailNodeId, {
          isLoading: false,
          isLoadingImage: true,
          loadingProvider: imageLoadingProvider,
          statusMessage: `Генерируем локацию ${index + 1}/${preparedAssets.length}: ${preparedAsset.name}`,
        });
        const imageUrl = useGptImage
          ? await generateComfyOpenAiGptImage2LowImage(
            preparedAsset.prompt,
            'location_asset',
            imageGenerationSettings,
            controller.signal,
            { reuseCompleted: true },
          )
          : await generateImage(
            preparedAsset.prompt,
            pipelineOverride ?? getDetailImagePipeline(detailNode),
            imageGenerationSettings,
            'location_asset',
            controller.signal,
          );
        upsertImageNode(
          detailNodeId,
          imageUrl,
          `Ассет ${index + 1} · ${preparedAsset.name}`,
          `location_asset:${index}`,
          index,
          preparedAsset.prompt,
          withProjectVisualStyle(preparedAsset.description, nodesRef.current),
          { imageProvider: imageProviderMetadata },
        );
      }
      const validAssetKinds = new Set(preparedAssets.map((_, index) => `location_asset:${index}`));
      setNodes((previousNodes) => {
        const nextNodes = { ...previousNodes };
        Object.entries(previousNodes).forEach(([nodeId, node]) => {
          const assetKind = typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';
          if (
            node.parentId === detailNodeId
            && node.nodeType === 'pollinations_image'
            && assetKind.startsWith('location_asset')
            && !validAssetKinds.has(assetKind)
          ) {
            if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
            delete nextNodes[nodeId];
          }
        });
        return nextNodes;
      });
      showNotice('success', `Создано референсов локаций: ${locationDescriptions.length}.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация ассета отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(detailNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(detailNodeId, {
        isLoading: false,
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [
    generationSettings,
    imageGenerationSettings,
    setNodes,
    showNotice,
    unloadLmStudioBeforeComfyRender,
    updateNode,
    upsertImageNode,
  ]);

  const handleEditNarration = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const narration = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail' || detailNode.label !== 'Закадр' || detailNode.isLoading) return;
    if (!narration) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте закадровый текст.' });
      return;
    }

    const parentNode = detailNode.parentId ? nodesRef.current[detailNode.parentId] : undefined;
    const prompt = [
      `Сценарий:\n${parentNode?.inputValue || 'Не задано'}`,
      `Текущий закадр:\n${narration}`,
      'Задача: отредактируй закадр как смысловой двигатель истории.',
    ].join('\n\n');
    const result = await requestText(detailNodeId, {
      operation: 'narration_edit',
      prompt: withStoryReferenceContext(prompt, nodesRef.current),
      systemPrompt: NARRATION_EDIT_SYSTEM_PROMPT,
      model: detailNode.selectedModel || parentNode?.selectedModel || MISTRAL_MODELS[0],
      sceneCount: detailNode.sceneCount ?? parentNode?.sceneCount,
    }, 'Редактируем закадр и усиливаем смысл...');
    if (!result) return;

    updateNode(detailNodeId, {
      inputValue: result,
      error: undefined,
      statusMessage: 'Закадр отредактирован.',
      metadata: {
        ...detailNode.metadata,
        editedAt: new Date().toISOString(),
      },
    });
    showNotice('success', 'Закадр отредактирован.');
  }, [requestText, showNotice, updateNode]);

  const handleStoryStructureEdit = useCallback(async (detailNodeId: string) => {
    const currentNodes = nodesRef.current;
    const detailNode = currentNodes[detailNodeId];
    const narration = detailNode?.inputValue?.trim() || '';
    const outputNode = detailNode?.parentId ? currentNodes[detailNode.parentId] : undefined;
    const sourceNode = outputNode?.parentId ? currentNodes[outputNode.parentId] : undefined;
    if (
      !detailNode
      || detailNode.nodeType !== 'script_detail'
      || detailNode.label !== 'Закадр'
      || detailNode.isLoading
      || !outputNode
      || outputNode.nodeType !== 'script_output'
      || !sourceNode
    ) return;
    if (!outputNode.inputValue?.trim()) {
      updateNode(detailNodeId, { error: 'Сначала нужен сценарий по сценам.' });
      return;
    }

    const parentId = detailNode.parentId;
    const sourceNodeId = outputNode.parentId ?? '';
    const sceneCount = clampSceneCount(outputNode.sceneCount ?? sourceNode.sceneCount ?? detailNode.sceneCount ?? 4);
    const model = detailNode.selectedModel || outputNode.selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0];
    const heroesNode = findProjectDetail(currentNodes, parentId, 'Герои');
    const locationsNode = findProjectDetail(currentNodes, parentId, 'Локации');
    const moodNode = findProjectDetail(currentNodes, parentId, 'Настроение');
    const systemInsertsNode = findProjectDetail(currentNodes, parentId, 'Системные вставки');

    const structurePrompt = [
      `Нужно сохранить ровно ${sceneCount} сцен.`,
      `Исходная заявка:\n${sourceNode.inputValue || 'Не задано'}`,
      `Текущий сценарий:\n${outputNode.inputValue || 'Не задано'}`,
      narration ? `Текущий закадр:\n${narration}` : '',
      heroesNode?.inputValue ? `Герои:\n${heroesNode.inputValue}` : '',
      locationsNode?.inputValue ? `Локации:\n${locationsNode.inputValue}` : '',
      moodNode?.inputValue ? `Настроение:\n${moodNode.inputValue}` : '',
      systemInsertsNode?.inputValue ? `Системные вставки:\n${systemInsertsNode.inputValue}` : '',
      'Задача: пересобери сценарий так, чтобы зритель понимал, кто перед ним, откуда взялась проблема, почему герои встретились, почему действие движется дальше, и как профессиональная фактура встроена в поступки, а не висит лекцией.',
    ].filter(Boolean).join('\n\n');

    const rawStructuredScenario = await requestText(detailNodeId, {
      operation: 'story_structure_edit',
      prompt: withStoryReferenceContext(structurePrompt, currentNodes),
      systemPrompt: STORY_STRUCTURE_EDIT_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Сюжетная редактура: чиним причинно-следственную цепочку...');
    if (!rawStructuredScenario) return;
    const structuredScenario = await ensureScenarioSceneCount(
      detailNodeId,
      rawStructuredScenario,
      sceneCount,
      STORY_STRUCTURE_EDIT_SYSTEM_PROMPT,
      model,
    );

    const narrationPrompt = [
      `Исправленный сценарий:\n${structuredScenario}`,
      heroesNode?.inputValue ? `Герои:\n${heroesNode.inputValue}` : '',
      locationsNode?.inputValue ? `Локации:\n${locationsNode.inputValue}` : '',
      moodNode?.inputValue ? `Настроение:\n${moodNode.inputValue}` : '',
      systemInsertsNode?.inputValue ? `Системные вставки:\n${systemInsertsNode.inputValue}` : '',
      'Задача: заново напиши закадр под исправленный сценарий. Закадр должен объяснить завязку, мотивацию, связь сцен и моменты появления системных окон.',
    ].filter(Boolean).join('\n\n');
    const structuredNarration = await requestText(detailNodeId, {
      operation: 'narration',
      prompt: withStoryReferenceContext(narrationPrompt, nodesRef.current),
      systemPrompt: NARRATION_DETAIL_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Сюжетная редактура: пересобираем закадр...', true);
    if (!structuredNarration) return;

    setNodes((previousNodes) => {
      let nextNodes = upsertScenarioGraph(previousNodes, sourceNodeId, structuredScenario, sceneCount);
      const currentDetail = nextNodes[detailNodeId];
      if (!currentDetail) return nextNodes;
      const sceneIds = new Set(Object.entries(nextNodes)
        .filter(([, node]) => node.parentId === detailNode.parentId && node.nodeType === 'scene')
        .map(([nodeId]) => nodeId));
      nextNodes = { ...nextNodes };
      Object.entries(nextNodes).forEach(([nodeId, node]) => {
        if (node.nodeType === 'pollinations_image' && node.parentId && sceneIds.has(node.parentId)) {
          if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
          delete nextNodes[nodeId];
        }
      });
      return {
        ...nextNodes,
        [detailNodeId]: {
          ...currentDetail,
          inputValue: structuredNarration,
          error: undefined,
          statusMessage: 'Сюжетная редактура завершена.',
          metadata: {
            ...currentDetail.metadata,
            storyStructureEditedAt: new Date().toISOString(),
          },
        },
      };
    });
    showNotice('success', 'Сюжетная редактура завершена: сценарий и закадр пересобраны.');
  }, [ensureScenarioSceneCount, requestText, setNodes, showNotice, updateNode]);

  const handleNarrationEditorialLoop = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const narration = detailNode?.inputValue?.trim();
    const outputNode = detailNode?.parentId ? nodesRef.current[detailNode.parentId] : undefined;
    const sourceNode = outputNode?.parentId ? nodesRef.current[outputNode.parentId] : undefined;
    if (
      !detailNode
      || detailNode.nodeType !== 'script_detail'
      || detailNode.label !== 'Закадр'
      || detailNode.isLoading
      || !outputNode
      || outputNode.nodeType !== 'script_output'
      || !sourceNode
    ) return;
    if (!narration) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте закадровый текст.' });
      return;
    }

    const sourceNodeId = outputNode.parentId ?? '';
    const sceneCount = clampSceneCount(outputNode.sceneCount ?? sourceNode.sceneCount ?? detailNode.sceneCount ?? 4);
    const model = detailNode.selectedModel || outputNode.selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0];
    const briefPrompt = [
      `Исходная короткая заявка:\n${sourceNode.inputValue || 'Не задано'}`,
      `Текущий сценарий:\n${outputNode.inputValue || 'Не задано'}`,
      `Сильные идеи из закадра:\n${narration}`,
      'Задача: собери расширенную заявку для следующего прохода.',
    ].join('\n\n');

    const revisedBrief = await requestText(detailNodeId, {
      operation: 'brief_revision',
      prompt: withStoryReferenceContext(briefPrompt, nodesRef.current),
      systemPrompt: STORY_BRIEF_REVISION_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Редактура луп: поднимаем сильные идеи в заявку...');
    if (!revisedBrief) return;

    const theme = sourceNode.themeInputValue?.trim();
    const scenarioSystemPrompt = theme
      ? `${SCENARIO_SYSTEM_PROMPT}\nСтилистическое направление: ${theme}.`
      : SCENARIO_SYSTEM_PROMPT;
    const rawRevisedScenario = await requestText(detailNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(buildScenarioPrompt(revisedBrief, sceneCount), nodesRef.current),
      systemPrompt: scenarioSystemPrompt,
      model,
      sceneCount,
    }, `Редактура луп: пересобираем ${sceneCount} сцен...`, true);
    if (!rawRevisedScenario) return;
    const revisedScenario = await ensureScenarioSceneCount(detailNodeId, rawRevisedScenario, sceneCount, scenarioSystemPrompt, model);

    const revisedNarration = await requestText(detailNodeId, {
      operation: 'narration',
      prompt: withStoryReferenceContext(revisedScenario, nodesRef.current),
      systemPrompt: NARRATION_DETAIL_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Редактура луп: пересобираем закадр...', true);
    if (!revisedNarration) return;

    setNodes((previousNodes) => {
      let nextNodes = upsertScenarioGraph(previousNodes, sourceNodeId, revisedScenario, sceneCount);
      const currentOutput = nextNodes[detailNode.parentId ?? ''];
      const currentDetail = nextNodes[detailNodeId];
      if (!currentOutput || !currentDetail) return nextNodes;
      const sceneIds = new Set(Object.entries(nextNodes)
        .filter(([, node]) => node.parentId === detailNode.parentId && node.nodeType === 'scene')
        .map(([nodeId]) => nodeId));
      nextNodes = { ...nextNodes };
      Object.entries(nextNodes).forEach(([nodeId, node]) => {
        if (node.nodeType === 'pollinations_image' && node.parentId && sceneIds.has(node.parentId)) {
          if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
          delete nextNodes[nodeId];
        }
      });
      const existingBrief = getExistingChild(
        nextNodes,
        currentOutput.parentId ?? '',
        (node) => node.nodeType === 'script_detail' && node.label === 'Заявка · редактура',
      );
      const briefNodeId = existingBrief?.[0] ?? generateNodeId();
      nextNodes = {
        ...nextNodes,
        [detailNodeId]: {
          ...currentDetail,
          inputValue: revisedNarration,
          error: undefined,
          statusMessage: 'Редакторский луп завершён.',
          metadata: {
            ...currentDetail.metadata,
            editorialLoopAt: new Date().toISOString(),
          },
        },
        [briefNodeId]: {
          ...existingBrief?.[1],
          nodeType: 'script_detail',
          x: existingBrief?.[1].x ?? currentDetail.x,
          y: existingBrief?.[1].y ?? currentDetail.y + (currentDetail.height ?? 280) + 36,
          label: 'Заявка · редактура',
          width: existingBrief?.[1].width ?? 420,
          height: existingBrief?.[1].height ?? 280,
          isGenerated: true,
          level: (currentDetail.level ?? 0) + 1,
          parentId: sourceNodeId,
          inputValue: revisedBrief,
          error: undefined,
          metadata: {
            ...existingBrief?.[1].metadata,
            sourceKind: 'brief_revision',
            sourceNarrationNodeId: detailNodeId,
            revisedAt: new Date().toISOString(),
          },
        },
      };
      return nextNodes;
    });
    showNotice('success', 'Редакторский луп завершён: заявка, сценарий и закадр обновлены.');
  }, [ensureScenarioSceneCount, requestText, setNodes, showNotice, updateNode]);

  const handlePrepareNarrationTts = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const narration = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail' || detailNode.label !== 'Закадр' || detailNode.isLoading) return;
    if (!narration) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте закадровый текст.' });
      return;
    }

    const parentNode = detailNode.parentId ? nodesRef.current[detailNode.parentId] : undefined;
    const result = await requestText(detailNodeId, {
      operation: 'tts_cleanup',
      prompt: narration,
      systemPrompt: TTS_CLEANUP_SYSTEM_PROMPT,
      model: detailNode.selectedModel || parentNode?.selectedModel || MISTRAL_MODELS[0],
      sceneCount: detailNode.sceneCount ?? parentNode?.sceneCount,
    }, 'Чистим закадр для TTS...');
    if (!result) return;

    setNodes((previousNodes) => {
      const currentDetail = previousNodes[detailNodeId];
      if (!currentDetail) return previousNodes;
      const existing = getExistingChild(
        previousNodes,
        detailNodeId,
        (node) => node.nodeType === 'script_detail' && node.label === 'TTS · Закадр',
      );
      const nodeId = existing?.[0] ?? generateNodeId();
      const cleanedAt = new Date().toISOString();
      let distributedSceneCount = 0;
      const nextNodes: NodesState = {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'script_detail',
          x: existing?.[1].x ?? currentDetail.x + (currentDetail.width ?? 302) + 36,
          y: existing?.[1].y ?? currentDetail.y,
          label: 'TTS · Закадр',
          width: existing?.[1].width ?? 360,
          height: existing?.[1].height ?? 280,
          isGenerated: true,
          level: (currentDetail.level ?? 0) + 1,
          parentId: detailNodeId,
          inputValue: result,
          error: undefined,
          metadata: {
            ...existing?.[1].metadata,
            sourceKind: 'tts_cleanup',
            sourceNodeId: detailNodeId,
            cleanedAt,
          },
        },
      };
      Object.entries(nextNodes).forEach(([sceneNodeId, sceneNode]) => {
        if (sceneNode.nodeType !== 'scene' || sceneNode.parentId !== currentDetail.parentId) return;
        const preparedTtsText = extractSceneNarration(result, sceneNode.label);
        if (!preparedTtsText) return;
        distributedSceneCount += 1;
        nextNodes[sceneNodeId] = {
          ...sceneNode,
          statusMessage: 'TTS-текст сцены подготовлен.',
          metadata: {
            ...sceneNode.metadata,
            preparedTtsText,
            preparedTtsSourceNodeId: nodeId,
            preparedTtsAt: cleanedAt,
          },
        };
      });
      nextNodes[detailNodeId] = {
        ...currentDetail,
        statusMessage: distributedSceneCount > 0
          ? `TTS-текст разложен по сценам: ${distributedSceneCount}.`
          : 'TTS-текст подготовлен.',
      };
      return nextNodes;
    });
    showNotice('success', 'TTS-текст подготовлен.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleStopSpeech = useCallback(() => {
    window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    const speakingNodeId = speakingNodeIdRef.current;
    speakingNodeIdRef.current = null;
    if (speakingNodeId) {
      updateNode(speakingNodeId, {
        isSpeaking: false,
        statusMessage: 'Озвучка остановлена.',
      });
    }
    showNotice('info', 'Озвучка остановлена.');
  }, [showNotice, updateNode]);

  const handleSpeakNarration = useCallback((detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const rawText = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail') return;
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      const message = 'Браузер не поддерживает встроенную озвучку. Нужен Chrome, Edge или другой браузер с Web Speech API.';
      updateNode(detailNodeId, { error: message });
      showNotice('error', message);
      return;
    }
    if (!rawText) {
      updateNode(detailNodeId, { error: 'В этой ноде нет текста для озвучки.' });
      return;
    }

    const previousNodeId = speakingNodeIdRef.current;
    window.speechSynthesis.cancel();
    if (previousNodeId && previousNodeId !== detailNodeId) {
      updateNode(previousNodeId, { isSpeaking: false, statusMessage: undefined });
    }

    const text = cleanupBrowserSpeechText(rawText);
    const chunks = splitSpeechText(text);
    if (chunks.length === 0) {
      updateNode(detailNodeId, { error: 'После очистки не осталось текста для озвучки.' });
      return;
    }

    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const russianVoice = voices.find((voice) => voice.lang.toLocaleLowerCase().startsWith('ru'))
      ?? voices.find((voice) => /russian|рус/i.test(voice.name))
      ?? null;
    speakingNodeIdRef.current = detailNodeId;
    updateNode(detailNodeId, {
      error: undefined,
      isSpeaking: true,
      statusMessage: `Озвучиваем закадр: 1/${chunks.length}`,
    });

    const finishSpeech = (statusMessage: string) => {
      if (speakingNodeIdRef.current !== detailNodeId) return;
      speakingNodeIdRef.current = null;
      speechUtteranceRef.current = null;
      updateNode(detailNodeId, {
        isSpeaking: false,
        statusMessage,
      });
    };

    const speakChunk = (index: number) => {
      if (speakingNodeIdRef.current !== detailNodeId) return;
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      speechUtteranceRef.current = utterance;
      utterance.lang = 'ru-RU';
      utterance.rate = 0.95;
      utterance.pitch = 1;
      if (russianVoice) utterance.voice = russianVoice;
      utterance.onend = () => {
        if (speakingNodeIdRef.current !== detailNodeId) return;
        if (index + 1 < chunks.length) {
          updateNode(detailNodeId, { statusMessage: `Озвучиваем закадр: ${index + 2}/${chunks.length}` });
          speakChunk(index + 1);
        } else {
          finishSpeech('Озвучка завершена.');
          showNotice('success', 'Озвучка завершена.');
        }
      };
      utterance.onerror = () => {
        finishSpeech('Озвучка остановилась из-за ошибки браузерного голоса.');
        updateNode(detailNodeId, { error: 'Браузерный голос остановился из-за ошибки. Попробуйте другой голос в системе или подготовьте TTS-текст заново.' });
      };
      synth.speak(utterance);
    };

    speakChunk(0);
  }, [showNotice, updateNode]);

  const getOmniVoiceReferenceInput = useCallback(async () => {
    if (narrationSettings.mode !== 'clone') return undefined;
    const reference = narrationSettings.referenceAudio;
    if (!reference?.assetId) {
      throw new Error('Для Voice Clone выберите голосовой референс длительностью 3–15 секунд в настройках озвучки.');
    }
    const record = await loadLocalAssetRecord(reference.assetId);
    if (!record) {
      throw new Error('Голосовой референс не найден в локальном хранилище. Выберите аудиофайл заново или откройте переносимый пакет проекта.');
    }
    return {
      blob: record.blob,
      fileName: narrationSettings.referenceFileName || reference.filePath || 'narrator-reference.wav',
      assetId: reference.assetId,
      transcript: narrationSettings.referenceText?.trim() ?? '',
    };
  }, [narrationSettings]);

  const handleGenerateOmniVoiceNarration = useCallback(async (detailNodeId: string, seedOverride?: number) => {
    const detailNode = nodesRef.current[detailNodeId];
    const rawText = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail') return;
    if (!rawText) {
      updateNode(detailNodeId, { error: 'В этой ноде нет текста для озвучки.' });
      return;
    }

    const text = cleanupBrowserSpeechText(rawText);
    if (!text) {
      updateNode(detailNodeId, { error: 'После очистки не осталось текста для озвучки.' });
      return;
    }

    const requestId = `tts:${detailNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    const effectiveSeed = seedOverride ?? narrationSettings.seed;

    try {
      updateNode(detailNodeId, {
        isLoadingAudio: true,
        loadingProvider: 'comfyui',
        error: undefined,
        pollinationsApiError: undefined,
        statusMessage: narrationSettings.mode === 'clone'
          ? 'Отправляем Voice Clone в очередь ComfyUI...'
          : 'Отправляем OmniVoice в очередь ComfyUI...',
      });

      const audioUrl = await generateComfyOmniVoiceAudio(
        text,
        narrationSettings,
        imageGenerationSettings,
        await getOmniVoiceReferenceInput(),
        effectiveSeed,
        controller.signal,
        (phase) => {
          if (!activeRequests.current.has(requestId)) return;
          updateNode(detailNodeId, {
            statusMessage: phase === 'running'
              ? 'OmniVoice выполняет озвучку в ComfyUI...'
              : 'OmniVoice ждёт очередь: ComfyUI заканчивает предыдущую задачу...',
          });
        },
      );

      setNodes((previousNodes) => {
        const currentNode = previousNodes[detailNodeId];
        if (!currentNode) return previousNodes;
        if (currentNode.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.audioUrl);
        return {
          ...previousNodes,
          [detailNodeId]: {
            ...currentNode,
            audioUrl,
            isLoadingAudio: false,
            loadingProvider: undefined,
            statusMessage: 'OmniVoice озвучка готова.',
            metadata: {
              ...currentNode.metadata,
              ttsProvider: 'omnivoice',
              voiceInstruct: narrationSettings.voiceInstruct,
              ttsMode: narrationSettings.mode,
              ttsModel: narrationSettings.model,
              ttsQuality: narrationSettings.quality,
              ttsSeed: effectiveSeed,
              ttsGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', 'OmniVoice озвучка готова.');
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'OmniVoice озвучка отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(detailNodeId, { error: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(detailNodeId, {
        isLoadingAudio: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [getOmniVoiceReferenceInput, imageGenerationSettings, narrationSettings, setNodes, showNotice, updateNode]);

  const handleGenerateSceneOmniVoiceNarration = useCallback(async (sceneNodeId: string, seedOverride?: number) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoadingAudio) return;

    const text = resolveSceneNarrationText(currentNodes, sceneNode);
    if (!text) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Не найден закадровый текст для этой сцены. Сначала создайте или подготовьте ноду «Закадр».' });
      return;
    }

    const requestId = `tts-scene:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    setNodeActiveOperation(sceneNodeId, 'scene_tts');
    const effectiveSeed = seedOverride ?? narrationSettings.seed;
    const ttsGenerationSignature = getSceneTtsGenerationSignature(text, narrationSettings, effectiveSeed);

    try {
      updateNode(sceneNodeId, {
        isLoadingAudio: true,
        loadingProvider: 'comfyui',
        pollinationsApiError: undefined,
        statusMessage: narrationSettings.mode === 'clone'
          ? 'Отправляем Voice Clone сцены в очередь ComfyUI...'
          : 'Отправляем OmniVoice сцены в очередь ComfyUI...',
      });

      const audioUrl = await generateComfyOmniVoiceAudio(
        text,
        narrationSettings,
        imageGenerationSettings,
        await getOmniVoiceReferenceInput(),
        effectiveSeed,
        controller.signal,
        (phase) => {
          if (!activeRequests.current.has(requestId)) return;
          updateNode(sceneNodeId, {
            statusMessage: phase === 'running'
              ? narrationSettings.mode === 'clone'
                ? 'OmniVoice озвучивает сцену голосом из референса...'
                : 'OmniVoice озвучивает эту сцену голосом проекта...'
              : 'OmniVoice ждёт очередь: ComfyUI заканчивает предыдущий рендер...',
          });
        },
      );

      setNodes((previousNodes) => {
        const currentNode = previousNodes[sceneNodeId];
        if (!currentNode) return previousNodes;
        if (currentNode.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.audioUrl);
        if (currentNode.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.videoUrl);
        const metadataWithoutStaleVideo = { ...(currentNode.metadata ?? {}) };
        delete metadataWithoutStaleVideo.videoAspectRatio;
        delete metadataWithoutStaleVideo.videoAudioGeneratedAt;
        delete metadataWithoutStaleVideo.videoFormat;
        delete metadataWithoutStaleVideo.videoFrameSource;
        delete metadataWithoutStaleVideo.videoGeneratedAt;
        delete metadataWithoutStaleVideo.systemInsertSource;
        return {
          ...previousNodes,
          [sceneNodeId]: {
            ...currentNode,
            audioUrl,
            videoUrl: undefined,
            isLoadingAudio: false,
            loadingProvider: undefined,
            statusMessage: 'Озвучка сцены готова. Старый клип сброшен.',
            metadata: {
              ...metadataWithoutStaleVideo,
              ttsProvider: 'omnivoice',
              voiceInstruct: narrationSettings.voiceInstruct,
              ttsMode: narrationSettings.mode,
              ttsModel: narrationSettings.model,
              ttsQuality: narrationSettings.quality,
              ttsSeed: effectiveSeed,
              ttsGenerationSignature,
              sceneNarrationText: text,
              ttsGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', `Озвучка для «${sceneNode.label}» готова.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Озвучка сцены отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      setNodeActiveOperation(sceneNodeId);
      updateNode(sceneNodeId, {
        isLoadingAudio: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [getOmniVoiceReferenceInput, imageGenerationSettings, narrationSettings, setNodeActiveOperation, setNodes, showNotice, updateNode]);

  const handleGenerateAlternateOmniVoiceNarration = useCallback(async (detailNodeId: string) => {
    const nextSeed = getNextNarrationSeed(narrationSettings.seed);
    onNarrationSeedChange(nextSeed);
    await handleGenerateOmniVoiceNarration(detailNodeId, nextSeed);
  }, [handleGenerateOmniVoiceNarration, narrationSettings.seed, onNarrationSeedChange]);

  const handleGenerateAlternateSceneOmniVoiceNarration = useCallback(async (sceneNodeId: string) => {
    const nextSeed = getNextNarrationSeed(narrationSettings.seed);
    onNarrationSeedChange(nextSeed);
    await handleGenerateSceneOmniVoiceNarration(sceneNodeId, nextSeed);
  }, [handleGenerateSceneOmniVoiceNarration, narrationSettings.seed, onNarrationSeedChange]);

  const handleGenerateSceneShotGrid = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const frameEntry = findBestSceneFrameEntry(currentNodes, sceneNodeId);
    const frameNodeId = frameEntry?.[0] ?? '';
    const frameNode = frameEntry?.[1];
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoadingImage) return;
    if (!frameNode?.imageUrl) {
      updateNode(sceneNodeId, {
        pollinationsApiError: 'Сначала создайте основной кадр сцены. Из него Nano Banana соберёт четыре дополнительных плана.',
      });
      return;
    }

    const requestId = `scene-shot-grid:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    setNodeActiveOperation(sceneNodeId, 'scene_shot_grid');
    let sheetImageUrl = '';
    let generatedShotUrls: string[] = [];
    let committed = false;

    try {
      const narrationEntry = Object.entries(currentNodes).find(
        ([, candidate]) => candidate.parentId === sceneNode.parentId
          && candidate.nodeType === 'script_detail'
          && candidate.label === 'Закадр',
      );
      const moodEntry = Object.entries(currentNodes).find(
        ([, candidate]) => candidate.parentId === sceneNode.parentId
          && candidate.nodeType === 'script_detail'
          && candidate.label === 'Настроение',
      );
      const locationFrameNode = Object.values(currentNodes).find((candidate) =>
        candidate.parentId === sceneNodeId
          && candidate.nodeType === 'pollinations_image'
          && getAssetKind(candidate) === 'scene_location');
      const narrationText = getPreparedSceneNarrationText(sceneNode)
        || (narrationEntry?.[1].inputValue
          ? extractSceneNarration(narrationEntry[1].inputValue, sceneNode.label)
          : '');
      const moodText = moodEntry?.[1].inputValue
        ? extractSceneNarration(moodEntry[1].inputValue, sceneNode.label)
        : '';
      const locationText = locationFrameNode?.masterPrompt
        || locationFrameNode?.assetPrompt
        || sceneNode.assetPrompt
        || '';
      const sceneText = sceneNode.sceneText || sceneNode.inputValue || sceneNode.label;
      const gridPrompt = buildSceneShotGridPrompt({
        sceneLabel: sceneNode.label,
        sceneText,
        visualPrompt: frameNode.masterPrompt || sceneNode.masterPrompt || '',
        narrationText,
        locationText,
        moodText,
      });

      updateNode(sceneNodeId, {
        isLoadingImage: true,
        loadingProvider: 'comfy_nano_banana',
        pollinationsApiError: undefined,
        statusMessage: 'Nano Banana собирает горизонтальный лист 16:9 из четырёх дополнительных планов...',
      });
      sheetImageUrl = await generateComfyNanoBanana2LiteShotGrid(
        gridPrompt,
        frameNode.imageUrl,
        imageGenerationSettings,
        controller.signal,
      );
      updateNode(sceneNodeId, {
        statusMessage: 'Лист готов. Разрезаем его на четыре горизонтальных кадра 16:9...',
      });
      const crops = await splitSceneShotGrid(sheetImageUrl, controller.signal);
      generatedShotUrls = crops.map((crop) => crop.imageUrl);
      const generatedAt = new Date().toISOString();

      setNodes((previousNodes) => {
        const currentScene = previousNodes[sceneNodeId];
        if (!currentScene) return previousNodes;
        const nextNodes = { ...previousNodes };
        const existingSheetEntry = Object.entries(previousNodes).find(([, candidate]) =>
          (candidate.parentId === sceneNodeId || candidate.metadata?.sceneId === sceneNodeId)
          && candidate.nodeType === 'pollinations_image'
          && getAssetKind(candidate) === 'scene_contact_sheet');
        const sheetNodeId = existingSheetEntry?.[0] ?? generateNodeId();
        const existingSheetNode = existingSheetEntry?.[1];
        if (existingSheetNode?.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(existingSheetNode.imageUrl);
        if (currentScene.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(currentScene.videoUrl);

        const parentWidth = currentScene.width ?? 400;
        const sheetX = currentScene.x + parentWidth + 36;
        const sheetY = currentScene.y + 340;
        nextNodes[sheetNodeId] = {
          ...existingSheetNode,
          nodeType: 'pollinations_image',
          label: `Лист 2×2 · ${currentScene.label}`,
          x: existingSheetNode?.x ?? sheetX,
          y: existingSheetNode?.y ?? sheetY,
          width: existingSheetNode?.width ?? 520,
          height: existingSheetNode?.height ?? 330,
          parentId: sceneNodeId,
          imageUrl: sheetImageUrl,
          masterPrompt: gridPrompt,
          imagePipeline: 'nano_banana_2_lite_compose',
          productionStatus: 'ready',
          level: (currentScene.level ?? 0) + 1,
          metadata: {
            ...existingSheetNode?.metadata,
            assetKind: 'scene_contact_sheet',
            sceneId: sceneNodeId,
            sourceFrameNodeId: frameNodeId,
            gridColumns: 2,
            gridRows: 2,
            sheetAspectRatio: '16:9',
            generatedAt,
            imageProvider: 'comfy_nano_banana',
            localAssetId: null,
            localAssetKind: null,
            localAssetSavedAt: null,
          },
        };

        const sceneShotNodeIds: string[] = [];
        crops.forEach((crop, arrayIndex) => {
          const existingShotEntry = Object.entries(previousNodes).find(([, candidate]) =>
            (candidate.parentId === sceneNodeId || candidate.metadata?.sceneId === sceneNodeId)
            && candidate.nodeType === 'pollinations_image'
            && getSceneShotIndex(candidate) === crop.index);
          const shotNodeId = existingShotEntry?.[0] ?? generateNodeId();
          sceneShotNodeIds.push(shotNodeId);
          const existingShotNode = existingShotEntry?.[1];
          if (existingShotNode?.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(existingShotNode.imageUrl);
          const column = arrayIndex % 2;
          const row = Math.floor(arrayIndex / 2);
          nextNodes[shotNodeId] = {
            ...existingShotNode,
            nodeType: 'pollinations_image',
            label: `План ${crop.index}: ${crop.label} · ${currentScene.label}`,
            x: existingShotNode?.x ?? sheetX + column * 350,
            y: existingShotNode?.y ?? sheetY + 370 + row * 250,
            width: existingShotNode?.width ?? 330,
            height: existingShotNode?.height ?? 215,
            parentId: sceneNodeId,
            imageUrl: crop.imageUrl,
            masterPrompt: gridPrompt,
            imagePipeline: 'nano_banana_2_lite_compose',
            productionStatus: 'ready',
            level: (currentScene.level ?? 0) + 1,
            metadata: {
              ...existingShotNode?.metadata,
              assetKind: `scene_shot:${crop.index}`,
              sceneId: sceneNodeId,
              sceneShotIndex: crop.index,
              sceneShotRole: crop.role,
              sourceFrameNodeId: frameNodeId,
              contactSheetNodeId: sheetNodeId,
              shotAspectRatio: '16:9',
              hiddenOnCanvas: true,
              generatedAt,
              imageProvider: 'comfy_nano_banana',
              localAssetId: null,
              localAssetKind: null,
              localAssetSavedAt: null,
            },
          };
        });

        nextNodes[sceneNodeId] = {
          ...currentScene,
          videoUrl: undefined,
          sceneShotNodeIds,
          isLoadingImage: false,
          loadingProvider: undefined,
          pollinationsApiError: undefined,
          statusMessage: 'Четыре дополнительных плана готовы. Старый клип сброшен.',
          metadata: {
            ...currentScene.metadata,
            sceneShotCount: crops.length,
            sceneShotGridGeneratedAt: generatedAt,
            sceneShotGridPrompt: gridPrompt,
          },
        };
        return nextNodes;
      });
      committed = true;
      showNotice('success', `Для «${sceneNode.label}» готовы четыре дополнительных плана 16:9.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация дополнительных планов отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      if (!committed) {
        if (sheetImageUrl.startsWith('blob:')) URL.revokeObjectURL(sheetImageUrl);
        generatedShotUrls.forEach((imageUrl) => {
          if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
        });
      }
      activeRequests.current.delete(requestId);
      setNodeActiveOperation(sceneNodeId);
      updateNode(sceneNodeId, {
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [imageGenerationSettings, setNodeActiveOperation, setNodes, showNotice, updateNode]);

  const handleBuildSceneVideoClip = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoadingVideo) return;
    if (!sceneNode.audioUrl) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала озвучьте эту сцену OmniVoice.' });
      return;
    }
    const frameNode = findBestSceneFrameNode(currentNodes, sceneNodeId);
    if (!frameNode?.imageUrl) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала соберите или сгенерируйте кадр для этой сцены.' });
      return;
    }

    const requestId = `scene-video:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(sceneNodeId, {
        isLoadingVideo: true,
        pollinationsApiError: undefined,
        statusMessage: 'Собираем 16:9 WebM клип из кадра и озвучки...',
      });

      const sceneNumber = getSceneNumber(sceneNode.label);
      const systemInsertNode = sceneNumber
        ? findSystemInsertImageNodeForScene(currentNodes, sceneNumber, sceneNode.parentId ?? '')
        : undefined;
      const timelineEntry = Object.entries(currentNodes).find(([timelineId, candidate]) =>
        candidate.nodeType === 'chapter_timeline'
        && getScopedNodeIds(currentNodes, [
          typeof candidate.metadata?.sourceScenarioId === 'string' ? candidate.metadata.sourceScenarioId : candidate.parentId ?? '',
          typeof candidate.metadata?.sourceChapterId === 'string' ? candidate.metadata.sourceChapterId : '',
          timelineId,
        ]).has(sceneNodeId));
      const chapterBackdropNode = timelineEntry
        ? findChapterBackdropImageNode(currentNodes, timelineEntry[0], timelineEntry[1])
        : undefined;
      const chapterBackdropGeneratedAt = getChapterBackdropGeneratedAt(chapterBackdropNode);
      const sceneShotUrls = findSceneShotNodes(currentNodes, sceneNodeId)
        .map((shotNode) => shotNode.imageUrl)
        .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
      const sceneShotNodes = findSceneShotNodes(currentNodes, sceneNodeId);
      const visualGenerationSignature = getSceneVisualGenerationSignature(
        frameNode,
        sceneShotNodes,
        systemInsertNode,
        chapterBackdropNode,
      );
      const clipImageUrls = [
        frameNode.imageUrl,
        ...sceneShotUrls,
        ...(systemInsertNode?.imageUrl ? [systemInsertNode.imageUrl] : []),
      ];
      const generatedVideo = await buildStillImagesVideoClip(clipImageUrls, sceneNode.audioUrl, {
        signal: controller.signal,
        backgroundImageUrl: chapterBackdropNode?.imageUrl,
      });

      setNodes((previousNodes) => {
        const currentNode = previousNodes[sceneNodeId];
        if (!currentNode) return previousNodes;
        if (currentNode.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.videoUrl);
        const audioGeneratedAt = typeof currentNode.metadata?.ttsGeneratedAt === 'string'
          ? currentNode.metadata.ttsGeneratedAt
          : '';
        return {
          ...previousNodes,
          [sceneNodeId]: {
            ...currentNode,
            videoUrl: generatedVideo.url,
            isLoadingVideo: false,
            statusMessage: 'Клип 16:9 готов.',
            metadata: {
              ...currentNode.metadata,
              videoFormat: generatedVideo.format,
              videoRenderer: generatedVideo.renderer,
              videoAspectRatio: '16:9',
              videoFrameSource: frameNode.label,
              sceneShotCountUsed: sceneShotUrls.length,
              videoVisualGenerationSignature: visualGenerationSignature,
              ...(systemInsertNode ? { systemInsertSource: systemInsertNode.label } : {}),
              chapterBackdropSource: chapterBackdropNode?.label ?? null,
              chapterBackdropGeneratedAt: chapterBackdropGeneratedAt || null,
              ...(audioGeneratedAt ? { videoAudioGeneratedAt: audioGeneratedAt } : {}),
              videoGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', `Клип 16:9 для «${sceneNode.label}» готов.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Сборка клипа отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(sceneNodeId, {
        isLoadingVideo: false,
        statusMessage: undefined,
      });
    }
  }, [setNodes, showNotice, updateNode]);

  const handleBuildChapterSceneClips = useCallback(async (timelineNodeId: string) => {
    const currentNodes = nodesRef.current;
    const timelineNode = currentNodes[timelineNodeId];
    if (!timelineNode || timelineNode.nodeType !== 'chapter_timeline' || timelineNode.isLoadingVideo) return;

    const sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
      ? timelineNode.metadata.sourceScenarioId
      : timelineNode.parentId;
    const sourceChapterId = typeof timelineNode.metadata?.sourceChapterId === 'string'
      ? timelineNode.metadata.sourceChapterId
      : '';
    const timelineScope = getScopedNodeIds(currentNodes, [sourceScenarioId ?? '', sourceChapterId]);
    const hasTimelineScope = timelineScope.size > 0;
    const sceneEntries = Object.entries(currentNodes)
      .filter(([, candidate]) =>
        candidate.nodeType === 'scene'
        && (!hasTimelineScope || timelineScope.has(candidate.parentId ?? '')))
      .sort(([, first], [, second]) =>
        (getSceneNumber(first.label) ?? 0) - (getSceneNumber(second.label) ?? 0)
        || first.label.localeCompare(second.label, 'ru', { numeric: true }));

    if (sceneEntries.length === 0) {
      updateNode(timelineNodeId, { pollinationsApiError: 'Сначала создайте сцены для таймлайна.' });
      return;
    }

    const scenePlans = sceneEntries.map(([sceneId, scene]) => {
      const sceneNumber = getSceneNumber(scene.label) ?? 0;
      const systemInsertNode = sceneNumber
        ? findSystemInsertImageNodeForScene(currentNodes, sceneNumber, sourceScenarioId ?? '')
        : undefined;
      const frameNode = findBestSceneFrameNode(currentNodes, sceneId);
      const shotNodes = findSceneShotNodes(currentNodes, sceneId);
      return { sceneId, scene, frameNode, shotNodes, systemInsertNode };
    });
    const chapterBackdropNode = findChapterBackdropImageNode(currentNodes, timelineNodeId, timelineNode);
    const chapterBackdropGeneratedAt = getChapterBackdropGeneratedAt(chapterBackdropNode);
    const missingSourceLabels = scenePlans
      .filter((plan) => !plan.scene.videoUrl && (!plan.scene.audioUrl || !plan.frameNode?.imageUrl))
      .map((plan) => plan.scene.label);
    if (missingSourceLabels.length > 0) {
      updateNode(timelineNodeId, {
        pollinationsApiError: `Не хватает кадра или озвучки для клипов: ${missingSourceLabels.join(', ')}.`,
      });
      return;
    }

    const plansToBuild = scenePlans.filter((plan) => plan.scene.audioUrl && plan.frameNode?.imageUrl);
    if (plansToBuild.length === 0) {
      updateNode(timelineNodeId, {
        pollinationsApiError: undefined,
        statusMessage: 'Нет сцен с кадром и озвучкой для пересборки клипов.',
      });
      showNotice('info', 'Нет сцен с кадром и озвучкой для пересборки клипов.');
      window.setTimeout(() => {
        const latestNode = nodesRef.current[timelineNodeId];
        if (latestNode?.statusMessage === 'Нет сцен с кадром и озвучкой для пересборки клипов.') {
          updateNode(timelineNodeId, { statusMessage: undefined });
        }
      }, 2500);
      return;
    }

    const requestId = `chapter-scene-clips:${timelineNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(timelineNodeId, {
        isLoadingVideo: true,
        pollinationsApiError: undefined,
        statusMessage: `Собираем клипы главы по очереди: 0/${plansToBuild.length}`,
      });

      for (let index = 0; index < plansToBuild.length; index += 1) {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const plan = plansToBuild[index];
        if (!plan.scene.audioUrl || !plan.frameNode?.imageUrl) continue;
        updateNode(timelineNodeId, {
          statusMessage: `Собираем клип ${index + 1}/${plansToBuild.length}: ${plan.scene.label}`,
        });
        updateNode(plan.sceneId, {
          isLoadingVideo: true,
          pollinationsApiError: undefined,
          statusMessage: 'Клип поставлен в очередь таймлайна...',
        });

        const shotUrls = plan.shotNodes
          .map((shotNode) => shotNode.imageUrl)
          .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
        const visualGenerationSignature = getSceneVisualGenerationSignature(
          plan.frameNode,
          plan.shotNodes,
          plan.systemInsertNode,
          chapterBackdropNode,
        );
        const imageUrls = [
          plan.frameNode.imageUrl,
          ...shotUrls,
          ...(plan.systemInsertNode?.imageUrl ? [plan.systemInsertNode.imageUrl] : []),
        ];
        const generatedVideo = await buildStillImagesVideoClip(imageUrls, plan.scene.audioUrl, {
          signal: controller.signal,
          backgroundImageUrl: chapterBackdropNode?.imageUrl,
        });

        setNodes((previousNodes) => {
          const currentSceneNode = previousNodes[plan.sceneId];
          if (!currentSceneNode) return previousNodes;
          if (currentSceneNode.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(currentSceneNode.videoUrl);
          const audioGeneratedAt = typeof currentSceneNode.metadata?.ttsGeneratedAt === 'string'
            ? currentSceneNode.metadata.ttsGeneratedAt
            : '';
          return {
            ...previousNodes,
            [plan.sceneId]: {
              ...currentSceneNode,
              videoUrl: generatedVideo.url,
              isLoadingVideo: false,
              statusMessage: 'Клип 16:9 готов.',
              metadata: {
                ...currentSceneNode.metadata,
                videoFormat: generatedVideo.format,
                videoRenderer: generatedVideo.renderer,
                videoAspectRatio: '16:9',
                videoFrameSource: plan.frameNode.label,
                sceneShotCountUsed: shotUrls.length,
                videoVisualGenerationSignature: visualGenerationSignature,
                ...(plan.systemInsertNode ? { systemInsertSource: plan.systemInsertNode.label } : {}),
                chapterBackdropSource: chapterBackdropNode?.label ?? null,
                chapterBackdropGeneratedAt: chapterBackdropGeneratedAt || null,
                ...(audioGeneratedAt ? { videoAudioGeneratedAt: audioGeneratedAt } : {}),
                videoGeneratedAt: new Date().toISOString(),
              },
            },
          };
        });
      }

      updateNode(timelineNodeId, {
        isLoadingVideo: false,
        statusMessage: chapterBackdropNode
          ? `Клипы главы с фоном готовы: ${plansToBuild.length}.`
          : `Клипы главы готовы: ${plansToBuild.length}.`,
      });
      showNotice('success', chapterBackdropNode
        ? `Фон главы применён к клипам: ${plansToBuild.length}.`
        : `Клипы главы готовы: ${plansToBuild.length}.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Очередь клипов остановлена.');
      } else {
        const message = errorMessage(error);
        updateNode(timelineNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      sceneEntries.forEach(([sceneId]) => {
        updateNode(sceneId, {
          isLoadingVideo: false,
          statusMessage: undefined,
        });
      });
      updateNode(timelineNodeId, {
        isLoadingVideo: false,
        statusMessage: undefined,
      });
    }
  }, [setNodes, showNotice, updateNode]);

  const handleBuildChapterVideo = useCallback(async (
    timelineNodeId: string,
    options?: { requireFfmpeg?: boolean },
  ) => {
    const currentNodes = nodesRef.current;
    const timelineNode = currentNodes[timelineNodeId];
    if (!timelineNode || timelineNode.nodeType !== 'chapter_timeline' || timelineNode.isLoadingVideo) return;

    const sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
      ? timelineNode.metadata.sourceScenarioId
      : timelineNode.parentId;
    const sourceChapterId = typeof timelineNode.metadata?.sourceChapterId === 'string'
      ? timelineNode.metadata.sourceChapterId
      : '';
    const timelineScope = getScopedNodeIds(currentNodes, [sourceScenarioId ?? '', sourceChapterId]);
    const hasTimelineScope = timelineScope.size > 0;
    const sceneEntries = Object.entries(currentNodes)
      .filter(([, candidate]) =>
        candidate.nodeType === 'scene'
        && (!hasTimelineScope || timelineScope.has(candidate.parentId ?? '')))
      .sort(([, first], [, second]) =>
        (getSceneNumber(first.label) ?? 0) - (getSceneNumber(second.label) ?? 0)
        || first.label.localeCompare(second.label, 'ru', { numeric: true }));

    const chapterBackdropNode = findChapterBackdropImageNode(currentNodes, timelineNodeId, timelineNode);
    const chapterBackdropGeneratedAt = getChapterBackdropGeneratedAt(chapterBackdropNode);
    const scenePlans = sceneEntries.map(([sceneId, scene]) => {
      const sceneNumber = getSceneNumber(scene.label) ?? 0;
      const systemInsertNode = sceneNumber
        ? findSystemInsertImageNodeForScene(currentNodes, sceneNumber, sourceScenarioId ?? '')
        : undefined;
      const frameNode = findBestSceneFrameNode(currentNodes, sceneId);
      const shotNodes = findSceneShotNodes(currentNodes, sceneId);
      const canBuildFromSources = Boolean(scene.audioUrl && frameNode?.imageUrl);
      const appliedBackdropGeneratedAt = typeof scene.metadata?.chapterBackdropGeneratedAt === 'string'
        ? scene.metadata.chapterBackdropGeneratedAt
        : '';
      const backdropNeedsRefresh = Boolean(
        chapterBackdropNode?.imageUrl
        && (
          scene.metadata?.chapterBackdropSource !== chapterBackdropNode.label
          || appliedBackdropGeneratedAt !== chapterBackdropGeneratedAt
        ),
      );
      const visualGenerationSignature = getSceneVisualGenerationSignature(
        frameNode,
        shotNodes,
        systemInsertNode,
        chapterBackdropNode,
      );
      const storedVisualGenerationSignature = typeof scene.metadata?.videoVisualGenerationSignature === 'string'
        ? scene.metadata.videoVisualGenerationSignature
        : '';
      const visualsNeedRefresh = storedVisualGenerationSignature !== visualGenerationSignature;
      const rendererNeedsRefresh = Boolean(
        options?.requireFfmpeg
        && scene.metadata?.videoRenderer !== 'ffmpeg',
      );
      const shouldBuildFromSources = canBuildFromSources && (
        Boolean(systemInsertNode?.imageUrl)
        || !scene.videoUrl
        || backdropNeedsRefresh
        || visualsNeedRefresh
        || rendererNeedsRefresh
      );
      return {
        sceneId,
        scene,
        frameNode,
        shotNodes,
        systemInsertNode,
        canBuildFromSources,
        shouldBuildFromSources,
        visualGenerationSignature,
      };
    });
    const missingClipLabels = scenePlans
      .filter((plan) => {
        const needsGeneratedClip = !plan.scene.videoUrl || Boolean(
          options?.requireFfmpeg
          && plan.scene.metadata?.videoRenderer !== 'ffmpeg',
        );
        return needsGeneratedClip && !plan.canBuildFromSources;
      })
      .map((plan) => plan.scene.label);
    if (sceneEntries.length === 0) {
      updateNode(timelineNodeId, { pollinationsApiError: 'Сначала создайте сцены для таймлайна.' });
      return;
    }
    if (missingClipLabels.length > 0) {
      updateNode(timelineNodeId, {
        pollinationsApiError: `Сначала соберите клипы для всех сцен. Не хватает: ${missingClipLabels.join(', ')}.`,
      });
      return;
    }

    const plannedClipCount = scenePlans.length;
    const systemInsertCount = scenePlans.filter((plan) => Boolean(plan.systemInsertNode?.imageUrl)).length;
    const requestId = `chapter-video:${timelineNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(timelineNodeId, {
        isLoadingVideo: true,
        pollinationsApiError: undefined,
        statusMessage: `Собираем общий ролик главы из ${plannedClipCount} сцен...`,
      });

      const clipUrls: string[] = [];
      for (let index = 0; index < scenePlans.length; index += 1) {
        const plan = scenePlans[index];
        if (plan.shouldBuildFromSources && plan.scene.audioUrl && plan.frameNode?.imageUrl) {
          updateNode(timelineNodeId, {
            statusMessage: `Готовим клип ${index + 1}/${scenePlans.length}: ${plan.scene.label}`,
          });
          const shotUrls = plan.shotNodes
            .map((shotNode) => shotNode.imageUrl)
            .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
          const imageUrls = [
            plan.frameNode.imageUrl,
            ...shotUrls,
            ...(plan.systemInsertNode?.imageUrl ? [plan.systemInsertNode.imageUrl] : []),
          ];
          const generatedSceneClip = await buildStillImagesVideoClip(imageUrls, plan.scene.audioUrl, {
            signal: controller.signal,
            backgroundImageUrl: chapterBackdropNode?.imageUrl,
            requireFfmpeg: options?.requireFfmpeg,
          });
          clipUrls.push(generatedSceneClip.url);
          setNodes((previousNodes) => {
            const currentSceneNode = previousNodes[plan.sceneId];
            if (!currentSceneNode) return previousNodes;
            if (currentSceneNode.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(currentSceneNode.videoUrl);
            return {
              ...previousNodes,
              [plan.sceneId]: {
                ...currentSceneNode,
                videoUrl: generatedSceneClip.url,
                metadata: {
                  ...currentSceneNode.metadata,
                  videoFormat: generatedSceneClip.format,
                  videoRenderer: generatedSceneClip.renderer,
                  videoAspectRatio: '16:9',
                  videoFrameSource: plan.frameNode.label,
                  sceneShotCountUsed: shotUrls.length,
                  videoVisualGenerationSignature: plan.visualGenerationSignature,
                  ...(plan.systemInsertNode ? { systemInsertSource: plan.systemInsertNode.label } : {}),
                  chapterBackdropSource: chapterBackdropNode?.label ?? null,
                  chapterBackdropGeneratedAt: chapterBackdropGeneratedAt || null,
                  videoGeneratedAt: new Date().toISOString(),
                },
              },
            };
          });
        } else if (plan.scene.videoUrl) {
          clipUrls.push(plan.scene.videoUrl);
        }
      }
      updateNode(timelineNodeId, {
        statusMessage: `Склеиваем общий ролик главы из ${clipUrls.length} клипов...`,
      });

      const generatedChapterVideo = await buildChapterVideoFromClips(
        clipUrls,
        controller.signal,
        { requireFfmpeg: options?.requireFfmpeg },
      );
      setNodes((previousNodes) => {
        const currentNode = previousNodes[timelineNodeId];
        if (!currentNode) return previousNodes;
        const withVideoNode = upsertVideoOutputNode(
          previousNodes,
          timelineNodeId,
          generatedChapterVideo.url,
          'Ролик главы',
          generatedChapterVideo.format,
        );
        return {
          ...withVideoNode,
          [timelineNodeId]: {
            ...currentNode,
            isLoadingVideo: false,
            statusMessage: 'Общий ролик главы готов.',
            metadata: {
              ...currentNode.metadata,
              chapterClipCount: clipUrls.length,
              chapterSystemInsertCount: systemInsertCount,
              ...(chapterBackdropNode ? { chapterBackdropSource: chapterBackdropNode.label } : {}),
              videoRenderer: generatedChapterVideo.renderer,
              videoGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', `Общий ролик главы собран из ${clipUrls.length} клипов.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Сборка общего ролика отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(timelineNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(timelineNodeId, {
        isLoadingVideo: false,
        statusMessage: undefined,
      });
    }
  }, [setNodes, showNotice, updateNode]);

  const handleGenerateChapterBackdrop = useCallback(async (timelineNodeId: string) => {
    const currentNodes = nodesRef.current;
    const timelineNode = currentNodes[timelineNodeId];
    if (!timelineNode || timelineNode.nodeType !== 'chapter_timeline' || timelineNode.isLoadingImage) return;

    const sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
      ? timelineNode.metadata.sourceScenarioId
      : timelineNode.parentId;
    const sourceChapterId = typeof timelineNode.metadata?.sourceChapterId === 'string'
      ? timelineNode.metadata.sourceChapterId
      : '';
    const sourceChapterNode = sourceChapterId ? currentNodes[sourceChapterId] : undefined;
    const timelineTextModel = typeof timelineNode.selectedModel === 'string' && timelineNode.selectedModel.trim()
      ? timelineNode.selectedModel.trim()
      : MISTRAL_MODELS[0];
    const timelineScope = getScopedNodeIds(currentNodes, [sourceScenarioId ?? '', sourceChapterId]);
    const hasTimelineScope = timelineScope.size > 0;
    const sceneEntries = Object.entries(currentNodes)
      .filter(([, candidate]) =>
        candidate.nodeType === 'scene'
        && (!hasTimelineScope || timelineScope.has(candidate.parentId ?? '')))
      .sort(([, first], [, second]) =>
        (getSceneNumber(first.label) ?? 0) - (getSceneNumber(second.label) ?? 0)
        || first.label.localeCompare(second.label, 'ru', { numeric: true }));
    const findScopedDetailNode = (label: string) =>
      findScopedProjectDetail(currentNodes, [sourceScenarioId, sourceChapterId], label);
    const narrationNode = findScopedDetailNode('Закадр');
    const systemInsertsNode = findScopedDetailNode('Системные вставки');
    const locationsNode = findScopedDetailNode('Локации');
    const heroesNode = findScopedDetailNode('Герои');
    const moodNode = findScopedDetailNode('Настроение');
    const sceneSummary = sceneEntries
      .map(([, scene]) => `${scene.label}\n${scene.sceneText || scene.inputValue || ''}`.trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 9000);
    const chapterMaterial = [
      sourceChapterNode?.label ? `Глава: ${sourceChapterNode.label}` : '',
      sourceChapterNode?.inputValue ? sourceChapterNode.inputValue.slice(0, 7000) : '',
      timelineNode.inputValue ? timelineNode.inputValue.slice(0, 3000) : '',
    ].filter(Boolean).join('\n\n');
    const promptContext = [
      `Таймлайн: ${timelineNode.label}`,
      chapterMaterial ? `Материал главы:\n${chapterMaterial}` : '',
      sceneSummary ? `Сцены главы:\n${sceneSummary}` : '',
      heroesNode?.inputValue ? `Персонажи главы:\n${heroesNode.inputValue.slice(0, 3000)}` : '',
      locationsNode?.inputValue ? `Локации главы:\n${locationsNode.inputValue.slice(0, 3000)}` : '',
      moodNode?.inputValue ? `Настроение главы:\n${moodNode.inputValue.slice(0, 3000)}` : '',
      narrationNode?.inputValue ? `Закадр главы:\n${narrationNode.inputValue.slice(0, 4000)}` : '',
      systemInsertsNode?.inputValue ? `Системные вставки главы:\n${systemInsertsNode.inputValue.slice(0, 4000)}` : '',
      'Задача: придумай одну тёмную низкоконтрастную декоративную подложку главы для фона видеоклипов. Она должна поддерживать основной кадр и не перетягивать внимание.',
    ].filter(Boolean).join('\n\n');

    if (!promptContext.trim()) {
      updateNode(timelineNodeId, { pollinationsApiError: 'Нет материала главы для генерации фона.' });
      return;
    }

    const requestId = `chapter-backdrop:${timelineNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(timelineNodeId, {
        isLoadingImage: true,
        loadingProvider: generationSettings.mode,
        pollinationsApiError: undefined,
        statusMessage: 'Собираем prompt фона главы...',
      });

      const assetPrompt = await generateText({
        operation: 'chapter_backdrop_prompt',
        prompt: withProjectVisualStyle(promptContext, nodesRef.current),
        systemPrompt: CHAPTER_BACKDROP_ASSET_PROMPT_SYSTEM_PROMPT,
        model: timelineTextModel,
      }, controller.signal, generationSettings);
      const styledAssetPrompt = [
        appendProjectVisualStyleToImagePrompt(assetPrompt, nodesRef.current),
        'Non-negotiable backdrop treatment: deliberately dark low-key 16:9 background, deep muted colors, restrained highlights, soft low contrast, subdued decorative edges, calm darker center, visually secondary to the foreground frame.',
      ].join('\n\n');

      updateNode(timelineNodeId, {
        assetPrompt: styledAssetPrompt,
        loadingProvider: 'comfy_openai_image',
        statusMessage: 'Генерируем тёмный фон главы через GPT Image 2 Low API...',
      });

      const imageUrl = await generateComfyOpenAiGptImage2LowImage(
        styledAssetPrompt,
        'chapter_backdrop',
        imageGenerationSettings,
        controller.signal,
      );

      upsertImageNode(
        timelineNodeId,
        imageUrl,
        'Фон главы',
        'chapter_backdrop',
        -1,
        styledAssetPrompt,
        promptContext,
        {
          imagePipeline: 'gpt_image_2_low',
          imageProvider: 'comfy_openai_gpt_image_2_low',
          chapterBackdropGeneratedAt: new Date().toISOString(),
        },
      );
      updateNode(timelineNodeId, {
        statusMessage: 'Фон главы готов. Примените его к клипам или соберите ролик главы.',
      });
      showNotice('success', 'Фон главы готов. Новые клипы получат его автоматически; старые можно обновить кнопкой «Применить фон к клипам».');
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация фона главы отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(timelineNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(timelineNodeId, {
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [
    generationSettings,
    imageGenerationSettings,
    showNotice,
    updateNode,
    upsertImageNode,
  ]);

  const handleGenerateTimelineMissingAssets = useCallback(async (timelineNodeId: string) => {
    let currentNodes = nodesRef.current;
    let timelineNode = currentNodes[timelineNodeId];
    if (!timelineNode || timelineNode.nodeType !== 'chapter_timeline' || timelineNode.isLoadingVideo) return false;
    const timelineTextModel = typeof timelineNode.selectedModel === 'string' && timelineNode.selectedModel.trim()
      ? timelineNode.selectedModel.trim()
      : undefined;
    const timelineComposePipeline: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose' | 'nano_banana_2_lite_compose'> =
      timelineNode.imagePipeline === 'flux2_compose'
      || timelineNode.imagePipeline === 'flux2_turbo_compose'
      || timelineNode.imagePipeline === 'nano_banana_2_lite_compose'
        ? timelineNode.imagePipeline
        : 'nano_banana_2_lite_compose';
    const timelineComposeLabel = timelineComposePipeline === 'flux2_compose'
      ? 'Flux2'
      : timelineComposePipeline === 'flux2_turbo_compose'
        ? 'Flux2 Turbo'
        : 'Nano Banana';
    const timelineAssetPipeline: ImagePipeline =
      timelineNode.metadata?.timelineAssetPipeline === 'sdxl'
      || timelineNode.metadata?.timelineAssetPipeline === 'ernie_image_turbo'
      || timelineNode.metadata?.timelineAssetPipeline === 'z_image_turbo'
        ? timelineNode.metadata.timelineAssetPipeline
        : 'z_image_turbo';
    const timelineAssetImageProvider: DetailAssetImageProvider =
      timelineNode.metadata?.timelineAssetImageProvider === 'inherit'
        ? 'inherit'
        : 'comfy_openai_gpt_image_2_low';
    const timelineSystemInsertPipeline: ImagePipeline =
      timelineNode.metadata?.timelineSystemInsertPipeline === 'sdxl'
      || timelineNode.metadata?.timelineSystemInsertPipeline === 'z_image_turbo'
      || timelineNode.metadata?.timelineSystemInsertPipeline === 'ernie_image_turbo'
        ? timelineNode.metadata.timelineSystemInsertPipeline
        : 'ernie_image_turbo';
    const timelineSystemInsertImageProvider: DetailAssetImageProvider =
      timelineNode.metadata?.timelineSystemInsertImageProvider === 'inherit'
        ? 'inherit'
        : 'comfy_openai_gpt_image_2_low';

    const requestId = `timeline-missing:${timelineNodeId}`;
    if (activeRequests.current.has(requestId)) {
      const message = 'Подготовка ассетов этой главы уже выполняется. Дождитесь завершения или нажмите «Остановить».';
      updateNode(timelineNodeId, { pollinationsApiError: message });
      return false;
    }
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    const waitForState = () => new Promise((resolve) => window.setTimeout(resolve, 40));
    const isCancelled = () => controller.signal.aborted;
    let sourceScenarioId: string | undefined;
    let sourceChapterId = '';
    let sceneEntries: Array<[string, NodeData]> = [];
    let detailSourceId: string | undefined;
    const refreshTimelineContext = () => {
      currentNodes = nodesRef.current;
      timelineNode = currentNodes[timelineNodeId] ?? timelineNode;
      sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
        ? timelineNode.metadata.sourceScenarioId
        : timelineNode.parentId;
      sourceChapterId = typeof timelineNode.metadata?.sourceChapterId === 'string'
        ? timelineNode.metadata.sourceChapterId
        : '';
      const timelineScope = getScopedNodeIds(currentNodes, [sourceScenarioId ?? '', sourceChapterId]);
      const hasTimelineScope = timelineScope.size > 0;
      sceneEntries = Object.entries(currentNodes)
        .filter((entry): entry is [string, NodeData] => {
          const candidate = entry[1];
          return candidate.nodeType === 'scene'
            && (!hasTimelineScope || timelineScope.has(candidate.parentId ?? ''));
        })
        .sort(([, first], [, second]) =>
          (getSceneNumber(first.label) ?? 0) - (getSceneNumber(second.label) ?? 0)
          || first.label.localeCompare(second.label, 'ru', { numeric: true }));
      detailSourceId = [sourceScenarioId, sourceChapterId]
        .find((nodeId) => Boolean(nodeId && currentNodes[nodeId]?.inputValue));
    };
    refreshTimelineContext();

    const ensureChapterTextWorkflow = async () => {
      if (sceneEntries.length > 0) return true;

      let chapterPlanEntry = sourceChapterId
        && getSourceKind(nodesRef.current[sourceChapterId]) === 'chapter_plan'
        ? [sourceChapterId, nodesRef.current[sourceChapterId]] as [string, NodeData]
        : undefined;
      const plannerEntry = findNodeBySourceKind(nodesRef.current, 'chapter_planner');

      if (!chapterPlanEntry && plannerEntry) {
        let plannerHasJson = true;
        try {
          parseChapterPlanDocument(plannerEntry[1].inputValue ?? '');
        } catch {
          plannerHasJson = false;
        }
        if (!plannerHasJson) {
          updateNode(timelineNodeId, { statusMessage: 'Разбиваем материал сезона на главы...' });
          await handlePlanChapters(plannerEntry[0]);
          await waitForState();
        }
        if (isCancelled()) return false;

        const latestPlanner = nodesRef.current[plannerEntry[0]];
        try {
          parseChapterPlanDocument(latestPlanner?.inputValue ?? '');
          updateNode(timelineNodeId, { statusMessage: 'Создаём карточки глав по плану...' });
          handleCreateChapterPlanNodes(plannerEntry[0]);
          await waitForState();
        } catch {
          return false;
        }

        const chapterPlanEntries = Object.entries(nodesRef.current)
          .filter((entry): entry is [string, NodeData] =>
            entry[1].nodeType === 'script_detail'
            && getSourceKind(entry[1]) === 'chapter_plan');
        const targetChapterNumber = getChapterNumber(timelineNode);
        chapterPlanEntry = chapterPlanEntries.find(([, node]) =>
          targetChapterNumber !== null && Number(node.metadata?.chapterNumber) === targetChapterNumber)
          ?? (chapterPlanEntries.length === 1 ? chapterPlanEntries[0] : undefined);
      }

      if (!chapterPlanEntry) return false;
      const [chapterPlanId, chapterPlanNode] = chapterPlanEntry;
      if (sourceChapterId !== chapterPlanId) {
        updateNode(timelineNodeId, {
          parentId: chapterPlanId,
          metadata: {
            ...timelineNode.metadata,
            sourceChapterId: chapterPlanId,
            sourceLabel: chapterPlanNode.label,
          },
        });
        refreshTimelineContext();
      }

      let chapterMaterialEntry = findPipelineNode(nodesRef.current, 'chapter_material', chapterPlanId);
      const preparedMaterial = chapterMaterialEntry?.[1].inputValue?.trim();
      if (!preparedMaterial || preparedMaterial === DEFAULT_CHAPTER_MATERIAL.trim()) {
        updateNode(timelineNodeId, { statusMessage: `Разворачиваем материал: ${chapterPlanNode.label}...` });
        await handleBuildChapterMaterial(chapterPlanId);
        await waitForState();
        chapterMaterialEntry = findPipelineNode(nodesRef.current, 'chapter_material', chapterPlanId);
      }
      if (isCancelled() || !chapterMaterialEntry?.[1].inputValue?.trim()) return false;

      refreshTimelineContext();
      if (sceneEntries.length === 0) {
        updateNode(timelineNodeId, { statusMessage: `Автособираем сценарий и сцены: ${chapterPlanNode.label}...` });
        await handleAutoBuildChapter(chapterMaterialEntry[0]);
        await waitForState();
      }
      if (isCancelled()) return false;

      handleEnsureChapterTimeline(timelineNodeId);
      await waitForState();
      refreshTimelineContext();
      return sceneEntries.length > 0;
    };

    const findScopedDetail = (label: string) => {
      const latestNodes = nodesRef.current;
      return findScopedProjectDetail(
        latestNodes,
        [sourceScenarioId, sourceChapterId, detailSourceId],
        label,
      );
    };
    const ensureDetail = async (detailType: DetailType) => {
      const config = detailConfig[detailType];
      if (!config || findScopedDetail(config.label) || !detailSourceId) return;
      updateNode(timelineNodeId, {
        statusMessage: `Добираем раздел «${config.label}» для таймлайна...`,
      });
      await handleScenarioDetailClick(detailSourceId, detailType, timelineTextModel);
      await waitForState();
    };
    const hasSceneLocation = (sceneId: string, scene: NodeData) =>
      Boolean(selectSceneLocationReference(nodesRef.current, sceneId, scene, scene.sceneText || scene.inputValue || scene.label)?.imageUrl);
    const hasLocationsForEveryScene = () => sceneEntries.every(([sceneId, initialScene]) => {
      const latestScene = nodesRef.current[sceneId] ?? initialScene;
      return latestScene.nodeType === 'scene' && hasSceneLocation(sceneId, latestScene);
    });
    const hasComposedFrame = (sceneId: string) =>
      Object.values(nodesRef.current).some((candidate) =>
        candidate.nodeType === 'pollinations_image'
        && candidate.parentId === sceneId
        && getAssetKind(candidate) === 'scene_flux2_frame'
        && Boolean(candidate.imageUrl));
    const hasCompleteSceneShotGrid = (sceneId: string) =>
      findSceneShotNodes(nodesRef.current, sceneId).length >= 4;
    const countDetailImages = (detailNodeId: string, assetKindPrefix: string) =>
      Object.values(nodesRef.current).filter((candidate) =>
        candidate.nodeType === 'pollinations_image'
        && candidate.parentId === detailNodeId
        && getAssetKind(candidate).startsWith(assetKindPrefix)
        && Boolean(candidate.imageUrl)).length;
    const syncDetailRenderer = (
      detailNodeId: string,
      pipeline: ImagePipeline,
      provider: DetailAssetImageProvider,
    ) => {
      const detailNode = nodesRef.current[detailNodeId];
      if (!detailNode || detailNode.nodeType !== 'script_detail') return;
      updateNode(detailNodeId, {
        imagePipeline: pipeline,
        metadata: {
          ...detailNode.metadata,
          detailAssetImageProvider: provider,
        },
      });
    };

    try {
      updateNode(timelineNodeId, {
        isLoadingVideo: true,
        pollinationsApiError: undefined,
        statusMessage: sceneEntries.length > 0
          ? 'Добираем недостающие элементы таймлайна...'
          : 'Проверяем разбивку на главы и сценарий...',
      });

      if (sceneEntries.length === 0) {
        const chapterReady = await ensureChapterTextWorkflow();
        if (isCancelled()) return false;
        if (!chapterReady) {
          const chapterPlanCount = Object.values(nodesRef.current).filter((node) =>
            node.nodeType === 'script_detail' && getSourceKind(node) === 'chapter_plan').length;
          const message = chapterPlanCount > 1
            ? 'Таймлайн не привязан к конкретной главе. В пульте глав откройте нужную карточку и создайте её таймлайн.'
            : 'Не удалось подготовить разбивку и сцены главы. Проверьте ноды «PDF / сырьё сезона» и «Планировщик глав».';
          updateNode(timelineNodeId, { pollinationsApiError: message });
          showNotice('error', message);
          return false;
        }
        updateNode(timelineNodeId, { statusMessage: 'Структура главы готова. Добираем изображения и озвучку...' });
      }

      await ensureDetail('герои');
      if (isCancelled()) return false;
      await ensureDetail('локации');
      if (isCancelled()) return false;
      await ensureDetail('настроение');
      if (isCancelled()) return false;
      await ensureDetail('закадр');
      if (isCancelled()) return false;
      await ensureDetail('система');
      if (isCancelled()) return false;

      const narrationNode = findScopedDetail('Закадр');
      const narrationNodeId = narrationNode
        ? Object.entries(nodesRef.current).find(([, node]) => node === narrationNode)?.[0]
        : undefined;
      if (narrationNodeId && !findPreparedTtsNarrationNode(nodesRef.current, narrationNodeId)) {
        updateNode(timelineNodeId, { statusMessage: 'Готовим очищенный закадр для TTS...' });
        await handlePrepareNarrationTts(narrationNodeId);
        await waitForState();
      }
      if (isCancelled()) return false;

      const heroesNode = findScopedDetail('Герои');
      const pendingCharacterDescriptions = heroesNode?.inputValue
        ? getNewCharacterDescriptions(heroesNode.inputValue, nodesRef.current)
        : [];
      if (heroesNode?.inputValue && pendingCharacterDescriptions.length > 0) {
        const heroesNodeId = Object.entries(nodesRef.current).find(([, node]) => node === heroesNode)?.[0];
        if (heroesNodeId) {
          syncDetailRenderer(heroesNodeId, timelineAssetPipeline, timelineAssetImageProvider);
          updateNode(timelineNodeId, {
            statusMessage: timelineAssetImageProvider === 'comfy_openai_gpt_image_2_low'
              ? 'Генерируем недостающие ассеты персонажей через GPT Image 2 API...'
              : 'Генерируем недостающие ассеты персонажей через реестр...',
          });
          await handleGenerateDetailAsset(heroesNodeId, timelineAssetPipeline, timelineTextModel, timelineAssetImageProvider);
          await waitForState();
        }
      }
      if (isCancelled()) return false;
      if (
        heroesNode?.inputValue
        && getNewCharacterDescriptions(heroesNode.inputValue, nodesRef.current).length > 0
      ) {
        const latestHeroesNode = findScopedDetail('Герои');
        const message = latestHeroesNode?.pollinationsApiError
          || latestHeroesNode?.error
          || 'Не удалось создать все новые референсы персонажей.';
        updateNode(timelineNodeId, { pollinationsApiError: `Автодобор остановился на персонажах: ${message}` });
        return false;
      }

      const locationsNode = findScopedDetail('Локации');
      const locationsNodeId = locationsNode
        ? Object.entries(nodesRef.current).find(([, node]) => node === locationsNode)?.[0]
        : undefined;
      const expectedLocationCount = locationsNode?.inputValue
        ? getLocationDescriptions(locationsNode.inputValue).length
        : 0;
      if (
        locationsNode?.inputValue
        && locationsNodeId
        && (
          countDetailImages(locationsNodeId, 'location_asset') < expectedLocationCount
          || !hasLocationsForEveryScene()
        )
      ) {
        syncDetailRenderer(locationsNodeId, timelineAssetPipeline, timelineAssetImageProvider);
        updateNode(timelineNodeId, {
          statusMessage: timelineAssetImageProvider === 'comfy_openai_gpt_image_2_low'
            ? 'Генерируем общий набор локаций главы через GPT Image 2 API...'
            : 'Генерируем общий набор локаций главы...',
        });
        await handleGenerateDetailAsset(locationsNodeId, timelineAssetPipeline, timelineTextModel, timelineAssetImageProvider);
        await waitForState();
      }
      if (isCancelled()) return false;
      if (
        locationsNodeId
        && expectedLocationCount > 0
        && countDetailImages(locationsNodeId, 'location_asset') < expectedLocationCount
      ) {
        const latestLocationsNode = findScopedDetail('Локации');
        const message = latestLocationsNode?.pollinationsApiError
          || latestLocationsNode?.error
          || `Создано не все локации: ${countDetailImages(locationsNodeId, 'location_asset')} из ${expectedLocationCount}.`;
        updateNode(timelineNodeId, { pollinationsApiError: `Автодобор остановился на локациях: ${message}` });
        return false;
      }

      const systemInsertsNode = findScopedDetail('Системные вставки');
      const systemInsertsNodeId = systemInsertsNode
        ? Object.entries(nodesRef.current).find(([, node]) => node === systemInsertsNode)?.[0]
        : undefined;
      const expectedSystemInsertCount = systemInsertsNode?.inputValue
        ? getSystemInsertDescriptions(systemInsertsNode.inputValue).length
        : 0;
      if (
        systemInsertsNode?.inputValue
        && systemInsertsNodeId
        && countDetailImages(systemInsertsNodeId, 'system_insert') < expectedSystemInsertCount
      ) {
        syncDetailRenderer(systemInsertsNodeId, timelineSystemInsertPipeline, timelineSystemInsertImageProvider);
        updateNode(timelineNodeId, {
          statusMessage: timelineSystemInsertImageProvider === 'comfy_openai_gpt_image_2_low'
            ? 'Генерируем системные вставки главы через GPT Image 2 API...'
            : 'Генерируем системные вставки главы локально...',
        });
        await handleGenerateDetailAsset(
          systemInsertsNodeId,
          timelineSystemInsertPipeline,
          timelineTextModel,
          timelineSystemInsertImageProvider,
        );
        await waitForState();
      }
      if (isCancelled()) return false;

      const latestTimelineNode = nodesRef.current[timelineNodeId] ?? timelineNode;
      if (!findChapterBackdropImageNode(nodesRef.current, timelineNodeId, latestTimelineNode)) {
        updateNode(timelineNodeId, { statusMessage: 'Генерируем декоративный фон главы...' });
        await handleGenerateChapterBackdrop(timelineNodeId);
        await waitForState();

        const timelineAfterBackdrop = nodesRef.current[timelineNodeId] ?? latestTimelineNode;
        if (!findChapterBackdropImageNode(nodesRef.current, timelineNodeId, timelineAfterBackdrop)) {
          const backdropError = timelineAfterBackdrop.pollinationsApiError
            || 'ComfyUI не вернул изображение фона главы.';
          updateNode(timelineNodeId, {
            pollinationsApiError: `Автодобор остановился на фоне главы: ${backdropError}`,
          });
          return false;
        }
      }
      if (isCancelled()) return false;

      for (let index = 0; index < sceneEntries.length; index += 1) {
        if (isCancelled()) return false;
        const [sceneId, initialScene] = sceneEntries[index];
        const latestScene = nodesRef.current[sceneId] ?? initialScene;
        if (!latestScene || latestScene.nodeType !== 'scene') continue;

        updateNode(timelineNodeId, {
          statusMessage: `Сцена ${index + 1}/${sceneEntries.length}: выбираем референс из ноды «Локации»...`,
        });

        const sceneAfterLocation = nodesRef.current[sceneId] ?? latestScene;
        if (sceneAfterLocation.nodeType !== 'scene') continue;
        if (!hasSceneLocation(sceneId, sceneAfterLocation)) {
          const message = sceneAfterLocation.pollinationsApiError
            ? `Автодобор остановился на локации «${sceneAfterLocation.label}»: ${sceneAfterLocation.pollinationsApiError}`
            : `Для «${sceneAfterLocation.label}» не найден общий референс. Сначала создайте локации в ноде «Локации».`;
          updateNode(timelineNodeId, { pollinationsApiError: message });
          return false;
        }
        const narrationText = resolveSceneNarrationText(nodesRef.current, sceneAfterLocation);
        const currentTtsSignature = narrationText
          ? getSceneTtsGenerationSignature(narrationText, narrationSettings)
          : '';
        const storedTtsSignature = typeof sceneAfterLocation.metadata?.ttsGenerationSignature === 'string'
          ? sceneAfterLocation.metadata.ttsGenerationSignature
          : '';
        const shouldRefreshAudio = !sceneAfterLocation.audioUrl
          || Boolean(narrationText && storedTtsSignature !== currentTtsSignature);
        if (shouldRefreshAudio) {
          updateNode(timelineNodeId, {
            statusMessage: sceneAfterLocation.audioUrl
              ? `Сцена ${index + 1}/${sceneEntries.length}: обновляем озвучку после изменения голоса или TTS-текста...`
              : `Сцена ${index + 1}/${sceneEntries.length}: озвучиваем закадр...`,
          });
          await handleGenerateSceneOmniVoiceNarration(sceneId);
          await waitForState();
        }
        if (isCancelled()) return false;
        const sceneAfterAudio = nodesRef.current[sceneId] ?? sceneAfterLocation;
        if (shouldRefreshAudio && !sceneAfterAudio.audioUrl) {
          const message = sceneAfterAudio.pollinationsApiError
            ? `Автодобор остановился на озвучке «${sceneAfterAudio.label}»: ${sceneAfterAudio.pollinationsApiError}`
            : `Автодобор остановлен: озвучка для «${sceneAfterAudio.label}» не создана или была отменена.`;
          updateNode(timelineNodeId, { pollinationsApiError: message });
          return false;
        }

        if (!hasComposedFrame(sceneId)) {
          updateNode(timelineNodeId, {
            statusMessage: `Сцена ${index + 1}/${sceneEntries.length}: объединяем кадр через ${timelineComposeLabel}...`,
          });
          await handleComposeSceneFlux2(sceneId, timelineComposePipeline);
          await waitForState();

          const sceneAfterCompose = nodesRef.current[sceneId];
          if (!hasComposedFrame(sceneId)) {
            const composeError = sceneAfterCompose?.pollinationsApiError
              || 'ComfyUI не вернул основной объединённый кадр.';
            updateNode(timelineNodeId, {
              pollinationsApiError: `Автодобор остановился на «${sceneAfterCompose?.label ?? initialScene.label}»: ${composeError}`,
            });
            return false;
          }
        }
        if (isCancelled()) return false;

        if (!hasCompleteSceneShotGrid(sceneId)) {
          updateNode(timelineNodeId, {
            statusMessage: `Сцена ${index + 1}/${sceneEntries.length}: создаём четыре дополнительных плана...`,
          });
          await handleGenerateSceneShotGrid(sceneId);
          await waitForState();

          const sceneAfterShotGrid = nodesRef.current[sceneId];
          if (!hasCompleteSceneShotGrid(sceneId)) {
            const shotGridError = sceneAfterShotGrid?.pollinationsApiError
              || 'ComfyUI не вернул четыре дополнительных плана.';
            updateNode(timelineNodeId, {
              pollinationsApiError: `Автодобор остановился на дополнительных планах «${sceneAfterShotGrid?.label ?? initialScene.label}»: ${shotGridError}`,
            });
            return false;
          }
        }
      }

      updateNode(timelineNodeId, {
        isLoadingVideo: false,
        statusMessage: 'Недостающие элементы таймлайна добраны.',
      });
      showNotice('success', 'Таймлайн проверен: недостающие элементы добраны по очереди.');
      return true;
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Автодобор таймлайна остановлен.');
      } else {
        const message = errorMessage(error);
        updateNode(timelineNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
      return false;
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(timelineNodeId, {
        isLoadingVideo: false,
        statusMessage: undefined,
      });
    }
  }, [
    handleAutoBuildChapter,
    handleBuildChapterMaterial,
    handleComposeSceneFlux2,
    handleCreateChapterPlanNodes,
    handleEnsureChapterTimeline,
    handleGenerateChapterBackdrop,
    handleGenerateDetailAsset,
    handleGenerateSceneOmniVoiceNarration,
    handleGenerateSceneShotGrid,
    handlePlanChapters,
    handlePrepareNarrationTts,
    handleScenarioDetailClick,
    narrationSettings,
    showNotice,
    updateNode,
  ]);

  const handleCompleteChapter = useCallback(async (timelineNodeId: string) => {
    const timelineNode = nodesRef.current[timelineNodeId];
    if (!timelineNode || timelineNode.nodeType !== 'chapter_timeline' || timelineNode.isLoadingVideo) return;
    const requestId = `complete-chapter:${timelineNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(timelineNodeId, {
        pollinationsApiError: undefined,
        statusMessage: 'Проверяем локальный FFmpeg renderer...',
      });
      if (!await isNativeVideoRendererAvailable()) {
        const message = 'Локальный FFmpeg renderer недоступен. Запустите CANVA STORY через start_canva_story_full_stack.bat.';
        updateNode(timelineNodeId, { pollinationsApiError: message, statusMessage: undefined });
        showNotice('error', message);
        return;
      }
      if (controller.signal.aborted) return;

      updateNode(timelineNodeId, {
        pollinationsApiError: undefined,
        statusMessage: 'Полная сборка главы: проверяем недостающие элементы...',
      });
      const assetsReady = await handleGenerateTimelineMissingAssets(timelineNodeId);
      if (controller.signal.aborted) return;

      const timelineAfterAssets = nodesRef.current[timelineNodeId];
      if (!timelineAfterAssets || timelineAfterAssets.nodeType !== 'chapter_timeline') return;
      if (timelineAfterAssets.pollinationsApiError) {
        showNotice('error', 'Полная сборка остановлена: не все элементы главы удалось подготовить.');
        return;
      }
      if (!assetsReady) {
        const message = 'Полная сборка остановлена: этап подготовки ассетов не завершился. Повторите запуск — уже готовые элементы сохранятся.';
        updateNode(timelineNodeId, { pollinationsApiError: message, statusMessage: undefined });
        showNotice('error', message);
        return;
      }

      updateNode(timelineNodeId, {
        statusMessage: 'Все элементы готовы. FFmpeg собирает клипы сцен...',
      });
      await handleBuildChapterSceneClips(timelineNodeId);
      if (controller.signal.aborted) return;

      const timelineAfterClips = nodesRef.current[timelineNodeId];
      if (!timelineAfterClips || timelineAfterClips.nodeType !== 'chapter_timeline') return;
      if (timelineAfterClips.pollinationsApiError) {
        showNotice('error', 'Полная сборка остановлена: клипы сцен не удалось подготовить.');
        return;
      }

      const sourceScenarioId = typeof timelineAfterClips.metadata?.sourceScenarioId === 'string'
        ? timelineAfterClips.metadata.sourceScenarioId
        : timelineAfterClips.parentId;
      const sourceChapterId = typeof timelineAfterClips.metadata?.sourceChapterId === 'string'
        ? timelineAfterClips.metadata.sourceChapterId
        : '';
      const timelineScope = getScopedNodeIds(nodesRef.current, [sourceScenarioId ?? '', sourceChapterId]);
      const hasTimelineScope = timelineScope.size > 0;
      const chapterScenes = Object.values(nodesRef.current).filter((candidate) =>
        candidate.nodeType === 'scene'
        && (!hasTimelineScope || timelineScope.has(candidate.parentId ?? '')));
      const missingClipLabels = chapterScenes
        .filter((scene) => !scene.videoUrl)
        .map((scene) => scene.label);
      if (chapterScenes.length === 0 || missingClipLabels.length > 0) {
        const message = chapterScenes.length === 0
          ? 'Полная сборка остановлена: для этой главы не найдены сцены.'
          : `Полная сборка остановлена: не созданы клипы — ${missingClipLabels.join(', ')}.`;
        updateNode(timelineNodeId, { pollinationsApiError: message, statusMessage: undefined });
        showNotice('error', message);
        return;
      }

      updateNode(timelineNodeId, {
        statusMessage: 'Клипы сцен готовы. FFmpeg собирает общий ролик главы...',
      });
      await handleBuildChapterVideo(timelineNodeId, { requireFfmpeg: true });
      if (controller.signal.aborted) return;

      const completedVideo = Object.values(nodesRef.current).find((candidate) =>
        candidate.nodeType === 'video_output'
        && candidate.parentId === timelineNodeId
        && Boolean(candidate.videoUrl));
      const timelineAfterVideo = nodesRef.current[timelineNodeId];
      if (completedVideo?.videoUrl && !timelineAfterVideo?.pollinationsApiError) {
        showNotice('success', 'Глава полностью собрана: ассеты, озвучка, клипы и общий MP4 готовы.');
      }
    } finally {
      activeRequests.current.delete(requestId);
    }
  }, [
    handleBuildChapterSceneClips,
    handleBuildChapterVideo,
    handleGenerateTimelineMissingAssets,
    showNotice,
    updateNode,
  ]);

  const handleBuildSeasonVideo = useCallback(async (collectorNodeId: string) => {
    const currentNodes = nodesRef.current;
    const collectorNode = currentNodes[collectorNodeId];
    if (!collectorNode || collectorNode.nodeType !== 'chapter_collector' || collectorNode.isLoadingVideo) return;

    const chapterPlans = Object.entries(currentNodes)
      .filter(([, candidate]) => candidate.nodeType === 'chapter_timeline')
      .map(([timelineId, timeline]) => {
        const videoNode = Object.values(currentNodes).find((candidate) =>
          candidate.nodeType === 'video_output'
          && candidate.parentId === timelineId
          && Boolean(candidate.videoUrl));
        return {
          timelineId,
          timeline,
          chapterNumber: getChapterNumber(timeline),
          videoNode,
        };
      })
      .sort((first, second) =>
        (first.chapterNumber ?? Number.MAX_SAFE_INTEGER) - (second.chapterNumber ?? Number.MAX_SAFE_INTEGER)
        || first.timeline.label.localeCompare(second.timeline.label, 'ru', { numeric: true }));

    if (chapterPlans.length === 0) {
      updateNode(collectorNodeId, { pollinationsApiError: 'Сначала создайте таймлайны глав.' });
      return;
    }

    const missingLabels = chapterPlans
      .filter((plan) => !plan.videoNode?.videoUrl)
      .map((plan) => plan.timeline.label);
    if (missingLabels.length > 0) {
      updateNode(collectorNodeId, {
        pollinationsApiError: `Сначала соберите ролики всех глав. Не хватает: ${missingLabels.join(', ')}.`,
      });
      return;
    }

    const requestId = `season-video:${collectorNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(collectorNodeId, {
        isLoadingVideo: true,
        pollinationsApiError: undefined,
        statusMessage: `Склеиваем финальный ролик из ${chapterPlans.length} глав...`,
      });

      const videoUrls = chapterPlans
        .map((plan) => plan.videoNode?.videoUrl)
        .filter((videoUrl): videoUrl is string => Boolean(videoUrl));
      const generatedSeasonVideo = await buildChapterVideoFromClips(videoUrls, controller.signal);

      setNodes((previousNodes) => {
        const currentNode = previousNodes[collectorNodeId];
        if (!currentNode) return previousNodes;
        const withVideoNode = upsertVideoOutputNode(
          previousNodes,
          collectorNodeId,
          generatedSeasonVideo.url,
          'Финальный ролик сезона',
          generatedSeasonVideo.format,
        );
        return {
          ...withVideoNode,
          [collectorNodeId]: {
            ...currentNode,
            isLoadingVideo: false,
            productionStatus: 'done',
            statusMessage: 'Финальный ролик сезона готов.',
            metadata: {
              ...currentNode.metadata,
              chapterCount: chapterPlans.length,
              readyChapterVideoCount: chapterPlans.length,
              videoRenderer: generatedSeasonVideo.renderer,
              videoGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', `Финальный ролик собран из ${chapterPlans.length} глав.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Сборка финального ролика отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(collectorNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(collectorNodeId, {
        isLoadingVideo: false,
        statusMessage: undefined,
      });
    }
  }, [setNodes, showNotice, updateNode]);

  const handleGeneratePollinationsImage = useCallback(async (parentNodeId: string) => {
    const parentNode = nodesRef.current[parentNodeId];
    if (!parentNode?.masterPrompt || parentNode.isLoadingImage) return;
    const requestId = `image:${parentNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    updateNode(parentNodeId, {
      isLoadingImage: true,
      loadingProvider: imageGenerationSettings.provider,
      pollinationsApiError: undefined,
    });

    try {
      const imageUrl = await generateImage(
        appendProjectVisualStyleToImagePrompt(parentNode.masterPrompt, nodesRef.current),
        getNodeImagePipeline(parentNode),
        imageGenerationSettings,
        'default',
        controller.signal,
      );
      upsertImageNode(parentNodeId, imageUrl, 'Кадр', 'scene_frame', 0, appendProjectVisualStyleToImagePrompt(parentNode.masterPrompt, nodesRef.current), parentNode.inputValue ?? '');
      showNotice('success', 'Кадр создан. Он не включается в localStorage и JSON проекта.');
    } catch (error) {
      if (!isAbortError(error)) {
        const message = errorMessage(error);
        updateNode(parentNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(parentNodeId, { isLoadingImage: false, loadingProvider: undefined });
    }
  }, [imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

  const handleRegenerateImageNode = useCallback(async (nodeId: string) => {
    const node = nodesRef.current[nodeId];
    const prompt = node?.masterPrompt?.trim();
    if (!node || node.nodeType !== 'pollinations_image' || !prompt || node.isLoadingImage) return;

    const requestId = `reroll-image:${nodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    const assetKind = getAssetKind(node);
    const promptKind = getImagePromptKind(node);
    const detailSourceNode = node.parentId ? nodesRef.current[node.parentId] : undefined;
    const savedDetailAssetProvider = isCloudDetailPromptKind(promptKind)
      ? getDetailAssetImageProvider(detailSourceNode)
      : 'inherit';
    const detailAssetProvider = savedDetailAssetProvider === 'comfy_nano_banana_2_lite' && promptKind !== 'system_insert'
      ? 'inherit'
      : savedDetailAssetProvider;
    const useGptImage = detailAssetProvider === 'comfy_openai_gpt_image_2_low';
    const useNanoBanana = detailAssetProvider === 'comfy_nano_banana_2_lite';

    updateNode(nodeId, {
      isLoadingImage: true,
      loadingProvider: useGptImage
        ? 'comfy_openai_image'
        : useNanoBanana
          ? 'comfy_nano_banana'
          : imageGenerationSettings.provider,
      pollinationsApiError: undefined,
      statusMessage: 'Перегенерируем с новым seed...',
    });

    try {
      const styledPrompt = appendProjectVisualStyleToImagePrompt(prompt, nodesRef.current);
      let imageUrl: string;
      if (useNanoBanana) {
        imageUrl = await generateComfyNanoBanana2LiteImage(styledPrompt, imageGenerationSettings, controller.signal);
      } else if (useGptImage && isCloudDetailPromptKind(promptKind)) {
        imageUrl = await generateComfyOpenAiGptImage2LowImage(styledPrompt, promptKind, imageGenerationSettings, controller.signal);
      } else if (assetKind === 'scene_flux2_frame') {
        const backgroundNodeId = typeof node.metadata?.backgroundNodeId === 'string' ? node.metadata.backgroundNodeId : '';
        const characterReferenceNodeIds = typeof node.metadata?.characterReferenceNodeIds === 'string'
          ? node.metadata.characterReferenceNodeIds.split(',').map((value) => value.trim()).filter(Boolean)
          : [];
        const characterReferenceNodeId = typeof node.metadata?.characterReferenceNodeId === 'string' ? node.metadata.characterReferenceNodeId : '';
        const backgroundNode = nodesRef.current[backgroundNodeId];
        const characterNodes = (characterReferenceNodeIds.length > 0 ? characterReferenceNodeIds : [characterReferenceNodeId])
          .map((referenceNodeId) => nodesRef.current[referenceNodeId])
          .filter((referenceNode): referenceNode is NodeData => Boolean(referenceNode?.imageUrl));
        if (!backgroundNode?.imageUrl || characterNodes.length === 0) {
          throw new Error('Не найдены исходная локация или персонаж для повторной сборки Flux2.');
        }
        const composePipeline = getNodeImagePipeline(node);
        imageUrl = composePipeline === 'nano_banana_2_lite_compose'
          ? await generateComfyNanoBanana2LiteComposeImage(
            styledPrompt,
            backgroundNode.imageUrl,
            characterNodes.map(toFlux2CharacterReference),
            imageGenerationSettings,
            controller.signal,
          )
          : await generateComfyFlux2ComposeImage(
            styledPrompt,
            backgroundNode.imageUrl,
            characterNodes.map(toFlux2CharacterReference),
            composePipeline === 'flux2_turbo_compose' ? 'flux2_turbo_compose' : 'flux2_compose',
            imageGenerationSettings,
            controller.signal,
          );
      } else {
        imageUrl = await generateImage(
          styledPrompt,
          getNodeImagePipeline(node),
          imageGenerationSettings,
          getImagePromptKind(node),
          controller.signal,
        );
      }

      setNodes((previousNodes) => {
        const currentNode = previousNodes[nodeId];
        if (!currentNode || currentNode.nodeType !== 'pollinations_image') return previousNodes;
        if (currentNode.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.imageUrl);
        return {
          ...previousNodes,
          [nodeId]: {
            ...currentNode,
            imageUrl,
            masterPrompt: styledPrompt,
            imagePipeline: getNodeImagePipeline(currentNode),
            isLoadingImage: false,
            loadingProvider: undefined,
            pollinationsApiError: undefined,
            statusMessage: undefined,
            metadata: {
              ...currentNode.metadata,
              imageProvider: useGptImage
                ? 'comfy_openai_gpt_image_2_low'
                : useNanoBanana
                  ? 'comfy_nano_banana_2_lite'
                  : imageGenerationSettings.provider,
              imagePipeline: getNodeImagePipeline(currentNode),
              ...(isCharacterReferenceNode(currentNode) ? {
                referencePrompt: styledPrompt,
                referenceContext: typeof currentNode.metadata?.promptContext === 'string' ? currentNode.metadata.promptContext : '',
              } : {}),
              rerolledAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', 'Картинка перегенерирована с новым seed.');
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Перегенерация отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(nodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(nodeId, { isLoadingImage: false, loadingProvider: undefined, statusMessage: undefined });
    }
  }, [imageGenerationSettings, setNodes, showNotice, updateNode]);

  const handleToggleReferenceImage = useCallback((nodeId: string) => {
    setNodes((previousNodes) => {
      const node = previousNodes[nodeId];
      if (!node || node.nodeType !== 'pollinations_image') return previousNodes;
      const isReference = isCharacterReferenceNode(node);
      return {
        ...previousNodes,
        [nodeId]: {
          ...node,
          metadata: {
            ...node.metadata,
            isReference: !isReference,
            referencePrompt: node.masterPrompt ?? '',
            referenceContext: typeof node.metadata?.promptContext === 'string' ? node.metadata.promptContext : '',
          },
          productionStatus: !isReference ? 'ready' : node.productionStatus,
        },
      };
    });
    showNotice('success', 'Статус референса обновлён.');
  }, [setNodes, showNotice]);

  const handleSetCharacterCanonicalAsset = useCallback((nodeId: string) => {
    setNodes((previousNodes) => {
      const node = previousNodes[nodeId];
      if (!isCharacterAssetNode(node)) return previousNodes;

      const existingRegistry = findCharacterRegistryNodeEntry(previousNodes);
      const existingRegistryId = existingRegistry?.[0] ?? generateNodeId();
      const existingRegistryNode = existingRegistry?.[1];
      const characterName = getCanonicalCharacterName(node);
      const existingTag = typeof node.metadata?.characterTag === 'string'
        ? normalizeCharacterTag(node.metadata.characterTag)
        : '';
      const tag = existingTag || createCharacterTag(characterName, `CHARACTER_${Date.now()}`);
      const entries = parseCharacterRegistryEntries(existingRegistryNode);
      const now = new Date().toISOString();
      const referenceDescription = typeof node.metadata?.referenceContext === 'string'
        ? node.metadata.referenceContext
        : typeof node.metadata?.promptContext === 'string' ? node.metadata.promptContext : '';
      const aliases = [...new Set([
        characterName,
        getReferenceLabel(node),
        tag,
        ...(typeof node.metadata?.characterTag === 'string' ? [node.metadata.characterTag] : []),
        ...getCharacterAliasCandidatesFromDescription(referenceDescription),
        ...createCharacterTagVariants(characterName),
      ].map((alias) => alias.trim()).filter(Boolean))];
      const nextEntry = {
        tag,
        name: characterName,
        assetNodeId: nodeId,
        aliases,
        description: referenceDescription,
        updatedAt: now,
      };
      const nextEntries = [
        ...entries.filter((entry) => entry.tag !== tag && entry.assetNodeId !== nodeId),
        nextEntry,
      ].sort((left, right) => left.tag.localeCompare(right.tag, 'ru', { numeric: true }));
      const nextRegistryNode: NodeData = {
        ...(existingRegistryNode ?? {
          nodeType: 'character_registry',
          x: node.x + Math.max(node.width ?? 320, 320) + 40,
          y: node.y,
          label: 'Реестр персонажей',
          width: 440,
          height: 420,
          level: (node.level ?? 0) + 1,
          parentId: node.parentId,
        }),
        nodeType: 'character_registry',
        inputValue: formatCharacterRegistryText(nextEntries),
        statusMessage: `${tag} закреплён как канонический референс.`,
        metadata: {
          ...existingRegistryNode?.metadata,
          sourceKind: CHARACTER_REGISTRY_SOURCE_KIND,
          characterRegistryJson: serializeCharacterRegistryEntries(nextEntries),
        },
      };

      return {
        ...previousNodes,
        [nodeId]: {
          ...node,
          productionStatus: 'ready',
          metadata: {
            ...node.metadata,
            isReference: true,
            canonicalCharacter: true,
            characterTag: tag,
            referencePrompt: node.masterPrompt ?? '',
            referenceContext: typeof node.metadata?.promptContext === 'string' ? node.metadata.promptContext : '',
            canonicalRegisteredAt: now,
          },
        },
        [existingRegistryId]: nextRegistryNode,
      };
    });
    showNotice('success', 'Персонаж добавлен в канон. Теперь сцены с его @ID будут брать этот референс.');
  }, [setNodes, showNotice]);

  const handleCancelGeneration = useCallback((nodeId: string) => {
    activeRequests.current.get(nodeId)?.abort();
    activeRequests.current.get(`image:${nodeId}`)?.abort();
    activeRequests.current.get(`reroll-image:${nodeId}`)?.abort();
    activeRequests.current.get(`flux2-compose:${nodeId}`)?.abort();
    activeRequests.current.get(`compose-frame:flux2_compose:${nodeId}`)?.abort();
    activeRequests.current.get(`compose-frame:flux2_turbo_compose:${nodeId}`)?.abort();
    activeRequests.current.get(`compose-frame:nano_banana_2_lite_compose:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-location:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-characters:${nodeId}`)?.abort();
    activeRequests.current.get(`detail-asset:${nodeId}`)?.abort();
    activeRequests.current.get(`tts:${nodeId}`)?.abort();
    activeRequests.current.get(`tts-scene:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-shot-grid:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-video:${nodeId}`)?.abort();
    activeRequests.current.get(`chapter-backdrop:${nodeId}`)?.abort();
    activeRequests.current.get(`timeline-missing:${nodeId}`)?.abort();
    activeRequests.current.get(`complete-chapter:${nodeId}`)?.abort();
    activeRequests.current.get(`chapter-scene-clips:${nodeId}`)?.abort();
    activeRequests.current.get(`chapter-video:${nodeId}`)?.abort();
    if (speakingNodeIdRef.current === nodeId) {
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
      speakingNodeIdRef.current = null;
    }
    updateNode(nodeId, {
      isLoading: false,
      isLoadingImage: false,
      isLoadingAudio: false,
      isLoadingVideo: false,
      isSpeaking: false,
      loadingProvider: undefined,
      statusMessage: undefined,
    });
    showNotice('info', 'Загрузка для ноды сброшена.');
  }, [showNotice, updateNode]);

  return {
    nodes,
    setNodes,
    notice,
    clearNotice,
    handleInputChange,
    handleThemeInputChange,
    handleSystemPromptChange,
    handlePromptContextChange,
    handlePromptKnowledgeChange,
    handlePromptMemoryChange,
    handlePromptTemplateChange,
    handleCreatePromptNode,
    handleCreateSceneWriterPromptNode,
    handleRunPromptNode,
    handleAssemblePromptResultScenario,
    handleCreateSplitNode,
    handleEnsureCharacterRegistry,
    handleSplitModeChange,
    handleSplitSeparatorChange,
    handleArrayPathChange,
    handleRunSplitNode,
    handleTogglePromptSnippet,
    handleModelChange,
    handleImagePipelineChange,
    handleDetailAssetImageProviderChange,
    handleTimelineAssetPipelineChange,
    handleTimelineSystemInsertPipelineChange,
    handleTimelineMasterChange,
    handleSceneCountChange,
    handleContinueAssociation,
    handleScriptVisualization,
    handleBuildScenarioFromBrief,
    handleImportReferenceFile,
    handleExtractChapterTopic,
    handlePlanChapters,
    handleCreateChapterPlanNodes,
    handleBuildChapterKnowledge,
    handleBuildSeasonSkeleton,
    handleBuildChapterMaterial,
    handleAutoBuildChapter,
    handleEnsureStoryReferenceNodes,
    handleEnsureChapterTimeline,
    handleScenarioDetailClick,
    handleCreateSceneNodes,
    handleBuildCharacterMemory,
    handleBuildSceneDialogue,
    handleGenerateScenePrompt,
    handleGenerateSceneLocationAsset,
    handleGenerateSceneCharacterLayer,
    handleComposeSceneFlux2,
    handleGenerateDetailAsset,
    handleEditNarration,
    handleStoryStructureEdit,
    handleNarrationEditorialLoop,
    handlePrepareNarrationTts,
    handleSpeakNarration,
    handleStopSpeech,
    handleGenerateOmniVoiceNarration,
    handleGenerateAlternateOmniVoiceNarration,
    handleGenerateSceneOmniVoiceNarration,
    handleGenerateAlternateSceneOmniVoiceNarration,
    handleGenerateSceneShotGrid,
    handleBuildSceneVideoClip,
    handleGenerateChapterBackdrop,
    handleGenerateTimelineMissingAssets,
    handleCompleteChapter,
    handleBuildChapterSceneClips,
    handleBuildChapterVideo,
    handleEnsureChapterCollector,
    handleBuildSeasonVideo,
    handleCopyToClipboard,
    handleGeneratePollinationsImage,
    handleRegenerateImageNode,
    handleToggleReferenceImage,
    handleSetCharacterCanonicalAsset,
    handleCancelGeneration,
  };
};
