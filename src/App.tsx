import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GenerationMode,
  GenerationSettings,
  ImageGenerationSettings,
  ImageProvider,
  COMFY_GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
  COMFY_GEMINI_DEFAULT_MODEL,
  COMFY_GEMINI_DEFAULT_THINKING_LEVEL,
  COMFYUI_DEFAULT_CHECKPOINT,
  COMFYUI_DEFAULT_ENDPOINT,
  getDefaultGenerationSettings,
  getDefaultImageGenerationSettings,
  listLmStudioModels,
  LM_STUDIO_DEFAULT_DRAFT_CONTEXT_LENGTH,
  LM_STUDIO_DEFAULT_ENDPOINT,
  LM_STUDIO_DEFAULT_LARGE_CONTEXT_LENGTH,
  LM_STUDIO_DEFAULT_MODEL,
  unloadComfyModels,
  unloadLmStudioModels,
} from './api';
import {
  deleteLocalAsset,
  getNodeAssetId,
  saveAssetBlob,
} from './assetStorage';
import NodeRenderer from './components/NodeRenderer';
import ChapterNavigator, { ChapterNavigatorItem } from './components/ChapterNavigator';
import { useAssetPersistence } from './hooks/useAssetPersistence';
import { useCanvasNavigation } from './hooks/useCanvasNavigation';
import { useDraggableNodes } from './hooks/useDraggableNodes';
import { useNodeManagement } from './hooks/useNodeManagement';
import { COMFY_GEMINI_MODELS, MISTRAL_MODELS } from './constants';
import {
  clearSavedProject,
  createProjectDocument,
  loadSavedProject,
  parseProjectJson,
  projectSnapshot,
  projectToJson,
  saveProject,
} from './project';
import {
  buildPortableProjectPackage,
  importPortableProjectPackage,
  isPortableProjectPackageFile,
} from './portableProject';
import {
  isFolderProjectSupported,
  loadProjectFolderHandle,
  openProjectFromFolder,
  pickProjectDirectory,
  saveProjectToFolder,
} from './folderProject';
import {
  createDefaultNarrationSettings,
  getNextNarrationSeed,
  getRandomOmniVoiceNarratorPreset,
  isOmniVoiceNarratorPreset,
  OMNIVOICE_MAX_SEED,
  OMNIVOICE_MODEL_OPTIONS,
  OMNIVOICE_NARRATOR_PRESETS,
  OMNIVOICE_QUALITY_OPTIONS,
} from './narrationSettings';
import {
  AppNotice,
  NarrationSettings,
  NodeData,
  NodesState,
  ProjectDocument,
  ViewportState,
} from './types';
import { errorMessage } from './utils';
import './App.css';

const GENERATION_SETTINGS_STORAGE_KEY = 'canva-story.generation-settings.v1';
const IMAGE_GENERATION_SETTINGS_STORAGE_KEY = 'canva-story.image-generation-settings.v1';

const chapterPattern = /^\s*(?:<<<SPLIT>>>\s*)?(?:blocks\s*[·:]\s*)?(?:ГЛАВА|CHAPTER)\s*0*(\d+)\b/iu;

const getChapterNumber = (node: NodeData) => {
  const sourceLabel = typeof node.metadata?.sourceLabel === 'string' ? node.metadata.sourceLabel : '';
  const metadataNumber = node.metadata?.chapterNumber;
  if (typeof metadataNumber === 'number' && Number.isFinite(metadataNumber)) return metadataNumber;
  const match = `${node.label}\n${sourceLabel}\n${node.inputValue ?? ''}`.match(/(?:ГЛАВА|CHAPTER)\s*0*(\d+)\b/iu);
  return match ? Number(match[1]) : null;
};

const getChapterTitle = (node: NodeData) =>
  node.label
    .replace(/^\s*<<<SPLIT>>>\s*[·:]?\s*/iu, '')
    .replace(/^\s*blocks\s*[·:]\s*/iu, '')
    .trim();

const getDescendantNodeIds = (nodes: NodesState, rootIds: string[]) => {
  const descendants = new Set(rootIds.filter(Boolean));
  let changed = true;
  while (changed) {
    changed = false;
    Object.entries(nodes).forEach(([nodeId, node]) => {
      if (!node.parentId || !descendants.has(node.parentId) || descendants.has(nodeId)) return;
      descendants.add(nodeId);
      changed = true;
    });
  }
  return descendants;
};

const ROOT_WORKSPACE_ID = 'root';

const getChapterTimelineEntry = (nodes: NodesState, chapterId: string) => {
  const chapter = nodes[chapterId];
  const chapterNumber = chapter ? getChapterNumber(chapter) : null;
  return Object.entries(nodes).find(([, node]) =>
    node.nodeType === 'chapter_timeline'
    && (
      node.metadata?.sourceChapterId === chapterId
      || node.parentId === chapterId
      || (chapterNumber !== null && getChapterNumber(node) === chapterNumber)
    ));
};

const resolveChapterWorkspaceId = (nodes: NodesState, sourceNodeId: string) => {
  const sourceNode = nodes[sourceNodeId];
  if (!sourceNode) return null;
  if (sourceNode.nodeType === 'chapter_timeline') {
    const sourceChapterId = typeof sourceNode.metadata?.sourceChapterId === 'string'
      ? sourceNode.metadata.sourceChapterId
      : '';
    if (sourceChapterId && nodes[sourceChapterId]) return sourceChapterId;
  }
  if (
    sourceNode.nodeType === 'split_item'
    && chapterPattern.test(`${sourceNode.label}\n${sourceNode.inputValue ?? ''}`)
  ) return sourceNodeId;

  let currentId: string | undefined = sourceNodeId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const current: NodeData | undefined = nodes[currentId];
    if (
      current?.nodeType === 'split_item'
      && chapterPattern.test(`${current.label}\n${current.inputValue ?? ''}`)
    ) return currentId;
    currentId = current?.parentId;
  }
  return sourceNode.nodeType === 'chapter_timeline' ? sourceNodeId : null;
};

const getChapterWorkspaceNodeIds = (nodes: NodesState, chapterId: string) => {
  const timelineEntry = getChapterTimelineEntry(nodes, chapterId);
  const timeline = timelineEntry?.[1];
  const roots = [chapterId];
  const sourceScenarioId = typeof timeline?.metadata?.sourceScenarioId === 'string'
    ? timeline.metadata.sourceScenarioId
    : '';
  const sourceChapterId = typeof timeline?.metadata?.sourceChapterId === 'string'
    ? timeline.metadata.sourceChapterId
    : '';
  if (sourceScenarioId) roots.push(sourceScenarioId);
  if (sourceChapterId) roots.push(sourceChapterId);
  if (timelineEntry) roots.push(timelineEntry[0]);
  return getDescendantNodeIds(nodes, roots);
};

const getNodeAssetKind = (node: NodeData) =>
  typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';

const countSystemInsertBlocks = (text = '') =>
  [...text.matchAll(/(?:^|\n)\s*После\s+сцены\s+\d+\s*:/giu)].length;

const generationModeLabels: Record<GenerationMode, string> = {
  mock: 'Тестовый режим',
  mistral: 'Mistral API',
  lmstudio: 'LM Studio',
  comfygemini: 'Gemini · ComfyUI',
};

const imageProviderLabels: Record<ImageProvider, string> = {
  pollinations: 'Pollinations',
  comfyui: 'ComfyUI',
};

const isGenerationMode = (value: unknown): value is GenerationMode =>
  value === 'mock' || value === 'mistral' || value === 'lmstudio' || value === 'comfygemini';

const isImageProvider = (value: unknown): value is ImageProvider =>
  value === 'pollinations' || value === 'comfyui';

const getSavedContextLength = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1024, Math.floor(value))
    : fallback;

const loadSavedImageComfyOrgApiKey = () => {
  try {
    const saved = localStorage.getItem(IMAGE_GENERATION_SETTINGS_STORAGE_KEY);
    if (!saved) return '';
    const parsed = JSON.parse(saved) as Partial<ImageGenerationSettings>;
    return typeof parsed.comfyOrgApiKey === 'string' ? parsed.comfyOrgApiKey : '';
  } catch {
    return '';
  }
};

const loadGenerationSettings = (): GenerationSettings => {
  const fallback = getDefaultGenerationSettings();
  const sharedComfyOrgApiKey = loadSavedImageComfyOrgApiKey();
  try {
    const saved = localStorage.getItem(GENERATION_SETTINGS_STORAGE_KEY);
    if (!saved) {
      return {
        ...fallback,
        comfyGeminiApiKey: sharedComfyOrgApiKey || fallback.comfyGeminiApiKey,
      };
    }
    const parsed = JSON.parse(saved) as Partial<GenerationSettings>;
    const savedComfyGeminiApiKey = typeof parsed.comfyGeminiApiKey === 'string'
      ? parsed.comfyGeminiApiKey.trim()
      : '';
    return {
      mode: isGenerationMode(parsed.mode) ? parsed.mode : fallback.mode,
      lmStudioEndpoint: typeof parsed.lmStudioEndpoint === 'string'
        ? parsed.lmStudioEndpoint
        : LM_STUDIO_DEFAULT_ENDPOINT,
      lmStudioModel: typeof parsed.lmStudioModel === 'string'
        ? parsed.lmStudioModel
        : LM_STUDIO_DEFAULT_MODEL,
      lmStudioDraftContextLength: getSavedContextLength(
        parsed.lmStudioDraftContextLength,
        LM_STUDIO_DEFAULT_DRAFT_CONTEXT_LENGTH,
      ),
      lmStudioLargeContextLength: getSavedContextLength(
        parsed.lmStudioLargeContextLength,
        LM_STUDIO_DEFAULT_LARGE_CONTEXT_LENGTH,
      ),
      comfyGeminiEndpoint: typeof parsed.comfyGeminiEndpoint === 'string'
        ? parsed.comfyGeminiEndpoint
        : COMFYUI_DEFAULT_ENDPOINT,
      comfyGeminiModel: typeof parsed.comfyGeminiModel === 'string'
        ? parsed.comfyGeminiModel
        : COMFY_GEMINI_DEFAULT_MODEL,
      comfyGeminiThinkingLevel: typeof parsed.comfyGeminiThinkingLevel === 'string'
        ? parsed.comfyGeminiThinkingLevel
        : COMFY_GEMINI_DEFAULT_THINKING_LEVEL,
      comfyGeminiMaxOutputTokens: getSavedContextLength(
        parsed.comfyGeminiMaxOutputTokens,
        COMFY_GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
      ),
      comfyGeminiApiKey: savedComfyGeminiApiKey || sharedComfyOrgApiKey || fallback.comfyGeminiApiKey,
    };
  } catch {
    return {
      ...fallback,
      comfyGeminiApiKey: sharedComfyOrgApiKey || fallback.comfyGeminiApiKey,
    };
  }
};

const loadImageGenerationSettings = (): ImageGenerationSettings => {
  const fallback = getDefaultImageGenerationSettings();
  try {
    const saved = localStorage.getItem(IMAGE_GENERATION_SETTINGS_STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<ImageGenerationSettings>;
    return {
      provider: isImageProvider(parsed.provider) ? parsed.provider : fallback.provider,
      comfyEndpoint: typeof parsed.comfyEndpoint === 'string'
        ? parsed.comfyEndpoint
        : COMFYUI_DEFAULT_ENDPOINT,
      comfyCheckpoint: typeof parsed.comfyCheckpoint === 'string'
        ? parsed.comfyCheckpoint
        : COMFYUI_DEFAULT_CHECKPOINT,
      comfyOrgApiKey: typeof parsed.comfyOrgApiKey === 'string'
        ? parsed.comfyOrgApiKey
        : fallback.comfyOrgApiKey,
    };
  } catch {
    return fallback;
  }
};

const collectNodeFamily = (nodes: NodesState, rootId: string) => {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    Object.entries(nodes).forEach(([nodeId, node]) => {
      if (node.parentId && ids.has(node.parentId) && !ids.has(nodeId)) {
        ids.add(nodeId);
        changed = true;
      }
    });
  }
  return ids;
};

const isHiddenTechnicalCanvasNode = (node: NodeData) => {
  if (node.metadata?.hiddenOnCanvas === true) return true;
  const assetKind = typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';
  return node.nodeType === 'pollinations_image' && /^scene_shot:\d+$/u.test(assetKind);
};

const getSafeProjectFileName = (title: string) =>
  title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'canva-story-project';

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const withNarrationSettings = (
  project: ProjectDocument,
  narration: NarrationSettings,
): ProjectDocument => ({
  ...project,
  extensions: {
    ...project.extensions,
    narration,
  },
});

const withCanvasWorkspaceSettings = (
  project: ProjectDocument,
  activeChapterId: string | null,
  viewports: Record<string, ViewportState>,
): ProjectDocument => ({
  ...project,
  extensions: {
    ...project.extensions,
    canvasWorkspaces: {
      ...(activeChapterId ? { activeChapterId } : {}),
      viewports,
    },
  },
});

const App = () => {
  const [bootstrap] = useState(() => {
    const savedProject = loadSavedProject();
    return { project: savedProject ?? createProjectDocument(), restored: Boolean(savedProject) };
  });
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceReferenceInputRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<ProjectDocument>(bootstrap.project);
  const previousNodeCount = useRef(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [pendingProjectAction, setPendingProjectAction] = useState<'new' | 'reset' | null>(null);
  const [pendingOutputNodeId, setPendingOutputNodeId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState(bootstrap.project.title);
  const [projectNotice, setProjectNotice] = useState<AppNotice | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [saveErrorMessage, setSaveErrorMessage] = useState('');
  const [isSavingPackage, setIsSavingPackage] = useState(false);
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [linkedFolderName, setLinkedFolderName] = useState('');
  const [isImportingProject, setIsImportingProject] = useState(false);
  const [isUnloadingModels, setIsUnloadingModels] = useState(false);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(loadGenerationSettings);
  const [lmStudioModels, setLmStudioModels] = useState<string[]>([]);
  const [lmStudioModelsStatus, setLmStudioModelsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lmStudioModelsError, setLmStudioModelsError] = useState('');
  const [imageGenerationSettings, setImageGenerationSettings] = useState<ImageGenerationSettings>(loadImageGenerationSettings);
  const [narrationSettings, setNarrationSettings] = useState<NarrationSettings>(
    () => bootstrap.project.extensions?.narration ?? createDefaultNarrationSettings(),
  );
  const restoredWorkspaceId = bootstrap.project.extensions?.canvasWorkspaces?.activeChapterId;
  const initialWorkspaceId = restoredWorkspaceId && bootstrap.project.nodes[restoredWorkspaceId]
    ? restoredWorkspaceId
    : null;

  useEffect(() => {
    void loadProjectFolderHandle(bootstrap.project.id)
      .then((handle) => setLinkedFolderName(handle?.name ?? ''))
      .catch(() => setLinkedFolderName(''));
  }, [bootstrap.project.id]);

  const [activeChapterWorkspaceId, setActiveChapterWorkspaceId] = useState<string | null>(initialWorkspaceId);
  const workspaceViewportsRef = useRef<Record<string, ViewportState>>({
    ...bootstrap.project.extensions?.canvasWorkspaces?.viewports,
    [ROOT_WORKSPACE_ID]: bootstrap.project.extensions?.canvasWorkspaces?.viewports?.[ROOT_WORKSPACE_ID]
      ?? bootstrap.project.viewport,
  });
  const [viewport, setViewport] = useState<ViewportState>(
    (initialWorkspaceId && workspaceViewportsRef.current[initialWorkspaceId])
      || workspaceViewportsRef.current[ROOT_WORKSPACE_ID]
      || bootstrap.project.viewport,
  );
  const [timelineFocusMode, setTimelineFocusMode] = useState(true);
  const [chapterNavigatorOpen, setChapterNavigatorOpen] = useState(true);
  const [expandedFocusNodeIds, setExpandedFocusNodeIds] = useState<Set<string>>(() => new Set());
  const pendingWorkspaceFitRef = useRef(false);
  const pendingRootFocusNodeRef = useRef<string | null>(null);
  const handleNarrationSeedChange = useCallback((seed: number) => {
    setNarrationSettings((settings) => ({ ...settings, seed }));
  }, []);
  const {
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
    handleEnsureCharacterRegistry,
    handleEnsureChapterTimeline,
    handleScenarioDetailClick,
    handleCreateSceneNodes,
    handleBuildCharacterMemory,
    handleBuildSceneDialogue,
    handleGenerateSceneLocationAsset,
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
    handleBuildChapterSceneClips,
    handleBuildChapterVideo,
    handleEnsureChapterCollector,
    handleBuildSeasonVideo,
    handleCopyToClipboard,
    handleRegenerateImageNode,
    handleToggleReferenceImage,
    handleSetCharacterCanonicalAsset,
    handleCancelGeneration,
  } = useNodeManagement(
    bootstrap.project.nodes,
    generationSettings,
    imageGenerationSettings,
    narrationSettings,
    handleNarrationSeedChange,
  );

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setPendingOutputNodeId(null);
  }, []);
  const canvasNodeEntries = useMemo(
    () => Object.entries(nodes).filter(([, node]) => !isHiddenTechnicalCanvasNode(node)),
    [nodes],
  );
  const { handleMouseDown, handleResizeMouseDown } = useDraggableNodes({
    nodes,
    setNodes,
    zoom: viewport.zoom,
    onSelect: setSelectedNodeId,
  });

  const nodeEntries = useMemo(() => Object.entries(nodes), [nodes]);
  const hasComfyDetailRenderer = useMemo(
    () => nodeEntries.some(([, node]) => (
      node.metadata?.detailAssetImageProvider === 'comfy_openai_gpt_image_2_low'
      || node.metadata?.timelineAssetImageProvider === 'comfy_openai_gpt_image_2_low'
      || node.metadata?.detailAssetImageProvider === 'comfy_krea_medium_turbo'
      || node.metadata?.detailAssetImageProvider === 'comfy_luma_photon_flash'
      || node.metadata?.detailAssetImageProvider === 'replicate_flux_schnell'
      || node.metadata?.detailAssetImageProvider === 'comfy_nano_banana_2_lite'
    )),
    [nodeEntries],
  );
  const toggleFocusChain = useCallback((nodeId: string) => {
    setExpandedFocusNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const visibleNodeEntries = useMemo(() => {
    if (activeChapterWorkspaceId) {
      const workspaceNodeIds = getChapterWorkspaceNodeIds(nodes, activeChapterWorkspaceId);
      return canvasNodeEntries.filter(([nodeId, node]) =>
        workspaceNodeIds.has(nodeId)
        && node.nodeType !== 'chapter_timeline'
        && node.nodeType !== 'chapter_collector');
    }
    if (!timelineFocusMode) return canvasNodeEntries;
    const expandedIds = new Set(expandedFocusNodeIds);
    let changed = true;
    while (changed) {
      changed = false;
      canvasNodeEntries.forEach(([nodeId, node]) => {
        if (!node.parentId || !expandedIds.has(node.parentId) || expandedIds.has(nodeId)) return;
        expandedIds.add(nodeId);
        changed = true;
      });
    }
    const isChapterNode = (node: NodeData) =>
      node.nodeType === 'split_item'
      && /^\s*(?:<<<SPLIT>>>\s*)?(?:ГЛАВА|CHAPTER)\b/iu.test(`${node.label}\n${node.inputValue ?? ''}`);
    const isSceneWriterNode = (node: NodeData) =>
      node.nodeType === 'prompt_node' && /Scene Writer/iu.test(node.label);
    return canvasNodeEntries.filter(([nodeId, node]) =>
      node.nodeType === 'chapter_timeline'
      || node.nodeType === 'chapter_collector'
      || node.nodeType === 'video_output'
      || node.nodeType === 'script_input'
      || node.nodeType === 'script_output'
      || isChapterNode(node)
      || isSceneWriterNode(node)
      || expandedIds.has(nodeId)
      || selectedNodeId === nodeId);
  }, [activeChapterWorkspaceId, canvasNodeEntries, expandedFocusNodeIds, nodes, selectedNodeId, timelineFocusMode]);
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodeEntries.map(([nodeId]) => nodeId)),
    [visibleNodeEntries],
  );
  const visibleCanvasNodes = useMemo(
    () => Object.fromEntries(visibleNodeEntries),
    [visibleNodeEntries],
  );
  const {
    isPanning,
    handleCanvasMouseDown,
    handleWheel,
    fitView,
    centerView,
    focusNode,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useCanvasNavigation({
    canvasRef,
    nodes: visibleCanvasNodes,
    viewport,
    setViewport,
    onBackgroundClick: clearSelection,
  });
  const chapterNavigatorItems = useMemo<ChapterNavigatorItem[]>(() => {
    const chapterEntries = nodeEntries
      .filter(([, node]) => {
        const sourceKind = typeof node.metadata?.sourceKind === 'string' ? node.metadata.sourceKind : '';
        return (
          node.nodeType === 'split_item'
          && chapterPattern.test(`${node.label}\n${node.inputValue ?? ''}`)
        ) || (node.nodeType === 'script_detail' && sourceKind === 'chapter_plan');
      })
      .map(([id, node]) => ({ id, node, chapterNumber: getChapterNumber(node) }));

    const timelines = nodeEntries
      .filter(([, node]) => node.nodeType === 'chapter_timeline')
      .map(([id, node]) => ({ id, node, chapterNumber: getChapterNumber(node) }));

    const usedTimelineIds = new Set<string>();
    const items = chapterEntries.map(({ id, node, chapterNumber }) => {
      const timeline = timelines.find((entry) =>
        entry.node.metadata?.sourceChapterId === id || entry.node.parentId === id)
        ?? timelines.find((entry) =>
          !usedTimelineIds.has(entry.id)
          && chapterNumber !== null
          && entry.chapterNumber === chapterNumber);
      if (timeline) usedTimelineIds.add(timeline.id);

      const scopeRoots = [id];
      if (timeline) {
        const sourceScenarioId = timeline.node.metadata?.sourceScenarioId;
        const sourceChapterId = timeline.node.metadata?.sourceChapterId;
        if (typeof sourceScenarioId === 'string') scopeRoots.push(sourceScenarioId);
        if (typeof sourceChapterId === 'string') scopeRoots.push(sourceChapterId);
      }
      const scopedIds = getDescendantNodeIds(nodes, scopeRoots);
      const sceneEntries = nodeEntries.filter(([sceneId, candidate]) =>
        candidate.nodeType === 'scene' && scopedIds.has(sceneId));
      const imageEntries = nodeEntries.filter(([imageId, candidate]) =>
        candidate.nodeType === 'pollinations_image' && scopedIds.has(imageId) && Boolean(candidate.imageUrl));
      const sharedLocationCount = imageEntries.filter(([, image]) =>
        getNodeAssetKind(image).startsWith('location_asset')).length;
      const characterAssets = imageEntries.filter(([, image]) =>
        getNodeAssetKind(image).startsWith('character_asset')).length;
      const locations = sceneEntries.filter(([sceneId]) =>
        sharedLocationCount > 0 || imageEntries.some(([, image]) =>
          image.parentId === sceneId && getNodeAssetKind(image) === 'scene_location')).length;
      const frames = sceneEntries.filter(([sceneId]) =>
        imageEntries.some(([, image]) =>
          image.parentId === sceneId
          && ['scene_flux2_frame', 'scene_frame'].includes(getNodeAssetKind(image)))).length;
      const detailEntries = nodeEntries.filter(([detailId, candidate]) =>
        candidate.nodeType === 'script_detail' && scopedIds.has(detailId));
      const systemInsertDetail = detailEntries.find(([, candidate]) => candidate.label === 'Системные вставки')?.[1];
      const insertsTotal = countSystemInsertBlocks(systemInsertDetail?.inputValue);
      const insertsReady = imageEntries.filter(([, image]) =>
        getNodeAssetKind(image).startsWith('system_insert:')
        || /Системная вставка/iu.test(image.label)).length;

      return {
        id,
        title: getChapterTitle(node),
        chapterNumber,
        timelineId: timeline?.id,
        scenes: sceneEntries.length,
        locations,
        characterAssets,
        frames,
        audio: sceneEntries.filter(([, scene]) => Boolean(scene.audioUrl)).length,
        clips: sceneEntries.filter(([, scene]) => Boolean(scene.videoUrl)).length,
        insertsReady: Math.min(insertsReady, insertsTotal),
        insertsTotal,
      };
    });

    timelines
      .filter((timeline) => !usedTimelineIds.has(timeline.id))
      .forEach((timeline) => {
        const scopeRoots = [timeline.id];
        const sourceScenarioId = timeline.node.metadata?.sourceScenarioId;
        const sourceChapterId = timeline.node.metadata?.sourceChapterId;
        if (typeof sourceScenarioId === 'string') scopeRoots.push(sourceScenarioId);
        if (typeof sourceChapterId === 'string') scopeRoots.push(sourceChapterId);
        const scopedIds = getDescendantNodeIds(nodes, scopeRoots);
        const sceneEntries = nodeEntries.filter(([sceneId, candidate]) =>
          candidate.nodeType === 'scene' && scopedIds.has(sceneId));
        const imageEntries = nodeEntries.filter(([imageId, candidate]) =>
          candidate.nodeType === 'pollinations_image' && scopedIds.has(imageId) && Boolean(candidate.imageUrl));
        const insertsReady = imageEntries.filter(([, image]) =>
          getNodeAssetKind(image).startsWith('system_insert:')
          || /Системная вставка/iu.test(image.label)).length;
        const systemInsertDetail = nodeEntries.find(([detailId, candidate]) =>
          candidate.nodeType === 'script_detail'
          && candidate.label === 'Системные вставки'
          && scopedIds.has(detailId))?.[1];
        const insertsTotal = countSystemInsertBlocks(systemInsertDetail?.inputValue);

        items.push({
          id: timeline.id,
          title: getChapterTitle(timeline.node).replace(/^Таймлайн\s*·\s*/iu, ''),
          chapterNumber: timeline.chapterNumber,
          timelineId: timeline.id,
          scenes: sceneEntries.length,
          locations: sceneEntries.filter(([sceneId]) => imageEntries.some(([, image]) =>
            image.parentId === sceneId && getNodeAssetKind(image) === 'scene_location')).length,
          characterAssets: imageEntries.filter(([, image]) =>
            getNodeAssetKind(image).startsWith('character_asset')).length,
          frames: sceneEntries.filter(([sceneId]) => imageEntries.some(([, image]) =>
            image.parentId === sceneId
            && ['scene_flux2_frame', 'scene_frame'].includes(getNodeAssetKind(image)))).length,
          audio: sceneEntries.filter(([, scene]) => Boolean(scene.audioUrl)).length,
          clips: sceneEntries.filter(([, scene]) => Boolean(scene.videoUrl)).length,
          insertsReady: Math.min(insertsReady, insertsTotal),
          insertsTotal,
        });
      });

    return items.sort((first, second) =>
      (first.chapterNumber ?? Number.MAX_SAFE_INTEGER) - (second.chapterNumber ?? Number.MAX_SAFE_INTEGER)
      || first.title.localeCompare(second.title, 'ru', { numeric: true }));
  }, [nodeEntries, nodes]);
  const activeChapterWorkspaceItem = useMemo(
    () => chapterNavigatorItems.find((item) =>
      item.id === activeChapterWorkspaceId || item.timelineId === activeChapterWorkspaceId),
    [activeChapterWorkspaceId, chapterNavigatorItems],
  );
  const getCanvasWorkspaceSnapshot = useCallback(() => {
    const workspaceKey = activeChapterWorkspaceId ?? ROOT_WORKSPACE_ID;
    const viewports = {
      ...workspaceViewportsRef.current,
      [workspaceKey]: viewport,
    };
    workspaceViewportsRef.current = viewports;
    return {
      viewports,
      rootViewport: viewports[ROOT_WORKSPACE_ID] ?? bootstrap.project.viewport,
    };
  }, [activeChapterWorkspaceId, bootstrap.project.viewport, viewport]);
  const handleOpenChapterWorkspace = useCallback((sourceNodeId: string) => {
    const chapterId = resolveChapterWorkspaceId(nodes, sourceNodeId);
    if (!chapterId) return;

    const currentWorkspaceKey = activeChapterWorkspaceId ?? ROOT_WORKSPACE_ID;
    workspaceViewportsRef.current[currentWorkspaceKey] = viewport;
    const savedViewport = workspaceViewportsRef.current[chapterId];
    setActiveChapterWorkspaceId(chapterId);
    setSelectedNodeId(null);
    setPendingOutputNodeId(null);
    if (savedViewport) {
      setViewport(savedViewport);
    } else {
      setViewport({ x: 48, y: 48, zoom: 0.8 });
      pendingWorkspaceFitRef.current = true;
    }
  }, [activeChapterWorkspaceId, nodes, viewport]);
  const handleExitChapterWorkspace = useCallback((focusTimeline = false) => {
    if (!activeChapterWorkspaceId) return;
    workspaceViewportsRef.current[activeChapterWorkspaceId] = viewport;
    const timelineId = getChapterTimelineEntry(nodes, activeChapterWorkspaceId)?.[0] ?? null;
    const rootViewport = workspaceViewportsRef.current[ROOT_WORKSPACE_ID] ?? bootstrap.project.viewport;
    setActiveChapterWorkspaceId(null);
    setSelectedNodeId(null);
    setPendingOutputNodeId(null);
    setViewport(rootViewport);
    if (focusTimeline && timelineId) pendingRootFocusNodeRef.current = timelineId;
  }, [activeChapterWorkspaceId, bootstrap.project.viewport, nodes, viewport]);
  const handleFocusChapterNode = useCallback((nodeId: string) => {
    if (activeChapterWorkspaceId) {
      workspaceViewportsRef.current[activeChapterWorkspaceId] = viewport;
      workspaceViewportsRef.current[ROOT_WORKSPACE_ID] = workspaceViewportsRef.current[ROOT_WORKSPACE_ID]
        ?? bootstrap.project.viewport;
      pendingRootFocusNodeRef.current = nodeId;
      setActiveChapterWorkspaceId(null);
      setSelectedNodeId(null);
      setViewport(workspaceViewportsRef.current[ROOT_WORKSPACE_ID]);
      return;
    }
    setSelectedNodeId(nodeId);
    focusNode(nodeId);
  }, [activeChapterWorkspaceId, bootstrap.project.viewport, focusNode, viewport]);

  useEffect(() => {
    const workspaceKey = activeChapterWorkspaceId ?? ROOT_WORKSPACE_ID;
    workspaceViewportsRef.current[workspaceKey] = viewport;
  }, [activeChapterWorkspaceId, viewport]);

  useEffect(() => {
    if (!pendingWorkspaceFitRef.current || !activeChapterWorkspaceId || visibleNodeEntries.length === 0) return;
    pendingWorkspaceFitRef.current = false;
    const frame = window.requestAnimationFrame(() => fitView(0.82));
    return () => window.cancelAnimationFrame(frame);
  }, [activeChapterWorkspaceId, fitView, visibleNodeEntries.length]);

  useEffect(() => {
    if (activeChapterWorkspaceId || !pendingRootFocusNodeRef.current) return;
    const nodeId = pendingRootFocusNodeRef.current;
    if (!visibleNodeIds.has(nodeId)) return;
    pendingRootFocusNodeRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      setSelectedNodeId(nodeId);
      focusNode(nodeId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeChapterWorkspaceId, focusNode, visibleNodeIds]);
  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : undefined;
  const deleteCandidate = deleteCandidateId ? nodes[deleteCandidateId] : undefined;
  const visibleNotice = projectNotice ?? notice;
  const textModelOptions = useMemo(
    () => {
      if (generationSettings.mode === 'lmstudio' && lmStudioModels.length > 0) return lmStudioModels;
      if (generationSettings.mode === 'comfygemini') return [...COMFY_GEMINI_MODELS];
      return [...MISTRAL_MODELS];
    },
    [generationSettings.mode, lmStudioModels],
  );
  const lmStudioEndpoint = generationSettings.lmStudioEndpoint.trim();
  const comfyEndpoint = imageGenerationSettings.comfyEndpoint.trim();
  const needsComfyImageEndpoint = imageGenerationSettings.provider === 'comfyui'
    || hasComfyDetailRenderer
    || Boolean(narrationSettings);
  const hasLmStudioMixedContentRisk = generationSettings.mode === 'lmstudio'
    && window.location.protocol === 'https:'
    && lmStudioEndpoint.startsWith('http://')
    && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(lmStudioEndpoint);
  const hasComfyMixedContentRisk = needsComfyImageEndpoint
    && window.location.protocol === 'https:'
    && comfyEndpoint.startsWith('http://')
    && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(comfyEndpoint);
  const hasComfyGeminiMixedContentRisk = generationSettings.mode === 'comfygemini'
    && window.location.protocol === 'https:'
    && generationSettings.comfyGeminiEndpoint.trim().startsWith('http://')
    && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(generationSettings.comfyGeminiEndpoint.trim());

  const showProjectNotice = useCallback((tone: AppNotice['tone'], message: string) => {
    setProjectNotice({ id: Date.now(), tone, message });
  }, []);

  const { restoreAssets: handleRestoreImageAssets } = useAssetPersistence({
    projectId: projectRef.current.id,
    nodes,
    setNodes,
    showNotice: showProjectNotice,
  });

  const handleStartOutputConnection = useCallback((nodeId: string) => {
    const node = nodes[nodeId];
    if (!node || node.nodeType !== 'prompt_node') return;
    setPendingOutputNodeId((current) => (current === nodeId ? null : nodeId));
    showProjectNotice('info', `${node.label}: выбран RESULT. Теперь нажмите RESULT TEXT на Split Node.`);
  }, [nodes, showProjectNotice]);

  const handleConnectInput = useCallback((nodeId: string) => {
    const sourceId = pendingOutputNodeId;
    if (!sourceId) {
      showProjectNotice('info', 'Сначала нажмите RESULT у Prompt Node, потом RESULT TEXT у Split Node.');
      return;
    }

    const sourceNode = nodes[sourceId];
    const targetNode = nodes[nodeId];
    if (
      !sourceNode
      || sourceNode.nodeType !== 'prompt_node'
      || !targetNode
      || targetNode.nodeType !== 'split_node'
    ) {
      setPendingOutputNodeId(null);
      showProjectNotice('error', 'Можно соединять только RESULT Prompt Node с RESULT TEXT Split Node.');
      return;
    }

    setNodes((previousNodes) => {
      const currentTarget = previousNodes[nodeId];
      if (!currentTarget || currentTarget.nodeType !== 'split_node') return previousNodes;
      return {
        ...previousNodes,
        [nodeId]: {
          ...currentTarget,
          parentId: sourceId,
          level: (previousNodes[sourceId]?.level ?? 0) + 1,
          error: undefined,
          statusMessage: `Подключено к ${previousNodes[sourceId]?.label ?? 'Prompt Node'}. Можно запускать Split Node.`,
        },
      };
    });
    setSelectedNodeId(nodeId);
    setPendingOutputNodeId(null);
    showProjectNotice('success', `${sourceNode.label} подключена к ${targetNode.label}.`);
  }, [nodes, pendingOutputNodeId, setNodes, showProjectNotice]);

  const dismissNotice = useCallback(() => {
    setProjectNotice(null);
    clearNotice();
  }, [clearNotice]);

  const refreshLmStudioModels = useCallback(async (silent = false, signal?: AbortSignal) => {
    if (generationSettings.mode !== 'lmstudio') {
      setLmStudioModelsStatus('idle');
      setLmStudioModels([]);
      setLmStudioModelsError('');
      return;
    }

    setLmStudioModelsStatus('loading');
    setLmStudioModelsError('');
    try {
      const models = await listLmStudioModels({
        ...generationSettings,
        mode: 'lmstudio',
        lmStudioModel: LM_STUDIO_DEFAULT_MODEL,
      }, signal);
      setLmStudioModels(models);
      setLmStudioModelsStatus('ready');
      if (!silent) showProjectNotice('success', `LM Studio: найдено моделей ${models.length}.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = errorMessage(error);
      setLmStudioModels([]);
      setLmStudioModelsStatus('error');
      setLmStudioModelsError(message);
      if (!silent) showProjectNotice('error', message);
    }
  }, [generationSettings, showProjectNotice]);

  useEffect(() => {
    if (!visibleNotice) return;
    const timer = window.setTimeout(dismissNotice, 3800);
    return () => window.clearTimeout(timer);
  }, [dismissNotice, visibleNotice]);

  useEffect(() => {
    const textKey = generationSettings.comfyGeminiApiKey.trim();
    const imageKey = imageGenerationSettings.comfyOrgApiKey.trim();
    if (!textKey && imageKey) {
      setGenerationSettings((settings) => (
        settings.comfyGeminiApiKey.trim()
          ? settings
          : { ...settings, comfyGeminiApiKey: imageGenerationSettings.comfyOrgApiKey }
      ));
    }
    if (textKey && !imageKey) {
      setImageGenerationSettings((settings) => (
        settings.comfyOrgApiKey.trim()
          ? settings
          : { ...settings, comfyOrgApiKey: generationSettings.comfyGeminiApiKey }
      ));
    }
  }, [
    generationSettings.comfyGeminiApiKey,
    imageGenerationSettings.comfyOrgApiKey,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    if (generationSettings.mode !== 'lmstudio') {
      setLmStudioModelsStatus('idle');
      setLmStudioModels([]);
      setLmStudioModelsError('');
      return () => controller.abort();
    }

    const timer = window.setTimeout(() => {
      void refreshLmStudioModels(true, controller.signal);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [generationSettings.mode, generationSettings.lmStudioEndpoint, refreshLmStudioModels]);

  useEffect(() => {
    try {
      localStorage.setItem(GENERATION_SETTINGS_STORAGE_KEY, JSON.stringify(generationSettings));
    } catch {
      // Project saving has its own visible status; generation settings can fall back to defaults.
    }
  }, [generationSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(IMAGE_GENERATION_SETTINGS_STORAGE_KEY, JSON.stringify(imageGenerationSettings));
    } catch {
      // Image generation settings are local convenience state and can fall back to defaults.
    }
  }, [imageGenerationSettings]);

  useEffect(() => {
    const modelListIsReady = generationSettings.mode !== 'lmstudio' || lmStudioModels.length > 0;
    if (!modelListIsReady || textModelOptions.length === 0) return;

    setNodes((previousNodes) => {
      let changed = false;
      const nextNodes: NodesState = {};
      Object.entries(previousNodes).forEach(([nodeId, node]) => {
        if (node.selectedModel && !textModelOptions.includes(node.selectedModel)) {
          nextNodes[nodeId] = { ...node, selectedModel: textModelOptions[0] };
          changed = true;
        } else {
          nextNodes[nodeId] = node;
        }
      });
      return changed ? nextNodes : previousNodes;
    });
  }, [generationSettings.mode, lmStudioModels.length, setNodes, textModelOptions]);

  useEffect(() => {
    setSaveStatus('saving');
    setSaveErrorMessage('');
    const timer = window.setTimeout(() => {
      try {
        const workspaceState = getCanvasWorkspaceSnapshot();
        const snapshot = projectSnapshot(
          withCanvasWorkspaceSettings(
            withNarrationSettings(projectRef.current, narrationSettings),
            activeChapterWorkspaceId,
            workspaceState.viewports,
          ),
          nodes,
          workspaceState.rootViewport,
          projectTitle,
        );
        saveProject(snapshot);
        projectRef.current = snapshot;
        setSaveStatus('saved');
      } catch (error) {
        setSaveErrorMessage(errorMessage(error));
        setSaveStatus('error');
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [activeChapterWorkspaceId, getCanvasWorkspaceSnapshot, narrationSettings, nodes, projectTitle]);

  useEffect(() => {
    const saveBeforeUnload = () => {
      try {
        const workspaceState = getCanvasWorkspaceSnapshot();
        saveProject(projectSnapshot(
          withCanvasWorkspaceSettings(
            withNarrationSettings(projectRef.current, narrationSettings),
            activeChapterWorkspaceId,
            workspaceState.viewports,
          ),
          nodes,
          workspaceState.rootViewport,
          projectTitle,
        ));
      } catch {
        // The visible save indicator reports quota or storage failures during normal work.
      }
    };
    window.addEventListener('beforeunload', saveBeforeUnload);
    return () => window.removeEventListener('beforeunload', saveBeforeUnload);
  }, [activeChapterWorkspaceId, getCanvasWorkspaceSnapshot, narrationSettings, nodes, projectTitle]);

  useEffect(() => {
    const nodeCount = nodeEntries.length;
    if (bootstrap.restored && previousNodeCount.current === 0) {
      previousNodeCount.current = nodeCount;
      return;
    }
    if (!bootstrap.restored && previousNodeCount.current === 0 && nodeCount > 0) {
      const timer = window.setTimeout(() => {
        fitView();
        previousNodeCount.current = nodeCount;
      }, 60);
      return () => window.clearTimeout(timer);
    }
    previousNodeCount.current = nodeCount;
  }, [bootstrap.restored, fitView, nodeEntries.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      const isEditing = element?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId && !isEditing) {
        event.preventDefault();
        setDeleteCandidateId(selectedNodeId);
      }
      if (event.key === 'Escape') {
        setDeleteCandidateId(null);
        setSelectedNodeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId]);

  const confirmDelete = useCallback(() => {
    if (!deleteCandidateId) return;
    setNodes((previousNodes) => {
      const idsToDelete = collectNodeFamily(previousNodes, deleteCandidateId);
      const nextNodes = { ...previousNodes };
      idsToDelete.forEach((nodeId) => {
        const node = nextNodes[nodeId];
        const imageUrl = node?.imageUrl;
        if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
        const localAssetId = typeof node?.metadata?.localAssetId === 'string' ? node.metadata.localAssetId : '';
        if (localAssetId) void deleteLocalAsset(localAssetId);
        void deleteLocalAsset(getNodeAssetId(projectRef.current.id, nodeId, 'image'));
        delete nextNodes[nodeId];
      });
      return nextNodes;
    });
    setSelectedNodeId(null);
    setDeleteCandidateId(null);
  }, [deleteCandidateId, setNodes]);

  const applyProject = useCallback((project: ProjectDocument) => {
    Object.values(nodes).forEach((node) => {
      if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
    });
    projectRef.current = project;
    previousNodeCount.current = Object.keys(project.nodes).length;
    const restoredWorkspaceId = project.extensions?.canvasWorkspaces?.activeChapterId;
    const restoredActiveWorkspaceId = restoredWorkspaceId && project.nodes[restoredWorkspaceId]
      ? restoredWorkspaceId
      : null;
    workspaceViewportsRef.current = {
      ...project.extensions?.canvasWorkspaces?.viewports,
      [ROOT_WORKSPACE_ID]: project.extensions?.canvasWorkspaces?.viewports?.[ROOT_WORKSPACE_ID]
        ?? project.viewport,
    };
    setNodes(project.nodes);
    setActiveChapterWorkspaceId(restoredActiveWorkspaceId);
    setViewport(
      (restoredActiveWorkspaceId && workspaceViewportsRef.current[restoredActiveWorkspaceId])
        || workspaceViewportsRef.current[ROOT_WORKSPACE_ID]
        || project.viewport,
    );
    setProjectTitle(project.title);
    setNarrationSettings(project.extensions?.narration ?? createDefaultNarrationSettings());
    setSelectedNodeId(null);
    setDeleteCandidateId(null);
    setPendingProjectAction(null);
    setPendingOutputNodeId(null);
    setSaveStatus('saved');
    void loadProjectFolderHandle(project.id)
      .then((handle) => setLinkedFolderName(handle?.name ?? ''))
      .catch(() => setLinkedFolderName(''));
  }, [nodes, setNodes]);

  const confirmProjectAction = useCallback(() => {
    if (!pendingProjectAction) return;
    const project = createProjectDocument(
      pendingProjectAction === 'new' ? 'Новый проект' : 'Проект после сброса',
    );

    try {
      if (pendingProjectAction === 'reset') clearSavedProject();
      saveProject(project);
    } catch {
      setSaveStatus('error');
      showProjectNotice('error', 'Браузер не разрешил сохранить проект локально. Проверьте настройки хранилища.');
      return;
    }

    applyProject(project);
    setLinkedFolderName('');
    showProjectNotice(
      'success',
      pendingProjectAction === 'new'
        ? 'Создан новый локальный проект.'
        : 'Локальные данные очищены, восстановлен стартовый проект.',
    );
  }, [applyProject, pendingProjectAction, showProjectNotice]);

  const getCurrentProjectSnapshot = useCallback(() => {
    const workspaceState = getCanvasWorkspaceSnapshot();
    return projectSnapshot(
      withCanvasWorkspaceSettings(
        withNarrationSettings(projectRef.current, narrationSettings),
        activeChapterWorkspaceId,
        workspaceState.viewports,
      ),
      nodes,
      workspaceState.rootViewport,
      projectTitle,
    );
  }, [activeChapterWorkspaceId, getCanvasWorkspaceSnapshot, narrationSettings, nodes, projectTitle]);

  const handleSaveProjectFolder = useCallback(async () => {
    if (isSavingFolder) return;
    setIsSavingFolder(true);
    try {
      const snapshot = getCurrentProjectSnapshot();
      const linkedHandle = await loadProjectFolderHandle(snapshot.id);
      const result = await saveProjectToFolder(snapshot, linkedHandle ?? undefined);
      projectRef.current = snapshot;
      saveProject(snapshot);
      setLinkedFolderName(result.handle.name);
      const missingMessage = result.missingAssetIds.length > 0
        ? ` Не найдено медиафайлов: ${result.missingAssetIds.length}.`
        : '';
      showProjectNotice(
        result.missingAssetIds.length > 0 ? 'info' : 'success',
        `Проект сохранён в папку «${result.handle.name}»: ${result.includedAssetCount} медиа и ${result.exportedTextCount} текстовых файлов.${missingMessage}`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showProjectNotice('error', error instanceof Error ? error.message : 'Не удалось сохранить проект в папку.');
    } finally {
      setIsSavingFolder(false);
    }
  }, [getCurrentProjectSnapshot, isSavingFolder, showProjectNotice]);

  const handleOpenProjectFolder = useCallback(async () => {
    if (isOpeningFolder) return;
    setIsOpeningFolder(true);
    try {
      const result = await openProjectFromFolder();
      saveProject(result.project);
      applyProject(result.project);
      setLinkedFolderName(result.handle.name);
      const missingMessage = result.missingAssetIds.length > 0
        ? ` Не найдено медиафайлов: ${result.missingAssetIds.length}.`
        : '';
      showProjectNotice(
        result.missingAssetIds.length > 0 ? 'info' : 'success',
        `Проект «${result.project.title}» открыт из папки. Восстановлено медиафайлов: ${result.importedAssetCount}.${missingMessage}`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showProjectNotice('error', error instanceof Error ? error.message : 'Не удалось открыть папку проекта.');
    } finally {
      setIsOpeningFolder(false);
    }
  }, [applyProject, isOpeningFolder, showProjectNotice]);

  const handleCreateProjectInFolder = useCallback(async () => {
    if (isSavingFolder || pendingProjectAction !== 'new') return;
    setIsSavingFolder(true);
    try {
      const handle = await pickProjectDirectory('readwrite');
      const project = createProjectDocument('Новый проект');
      const result = await saveProjectToFolder(project, handle);
      saveProject(project);
      applyProject(project);
      setLinkedFolderName(result.handle.name);
      showProjectNotice('success', `Создан новый проект в папке «${result.handle.name}».`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showProjectNotice('error', error instanceof Error ? error.message : 'Не удалось создать проект в папке.');
    } finally {
      setIsSavingFolder(false);
    }
  }, [applyProject, isSavingFolder, pendingProjectAction, showProjectNotice]);

  const handleSavePortableProject = useCallback(async () => {
    if (isSavingPackage) return;
    setIsSavingPackage(true);
    try {
      const workspaceState = getCanvasWorkspaceSnapshot();
      const snapshot = projectSnapshot(
        withCanvasWorkspaceSettings(
          withNarrationSettings(projectRef.current, narrationSettings),
          activeChapterWorkspaceId,
          workspaceState.viewports,
        ),
        nodes,
        workspaceState.rootViewport,
        projectTitle,
      );
      const result = await buildPortableProjectPackage(snapshot);
      downloadBlob(result.blob, `${getSafeProjectFileName(snapshot.title)}.canva-story.zip`);
      if (result.missingAssetIds.length > 0) {
        showProjectNotice(
          'info',
          `Проект сохранён с ${result.includedAssetCount} медиафайлами. Не найдено локальных ассетов: ${result.missingAssetIds.length}.`,
        );
      } else {
        showProjectNotice(
          'success',
          `Проект сохранён вместе с медиафайлами: ${result.includedAssetCount}.`,
        );
      }
    } catch (error) {
      showProjectNotice('error', error instanceof Error ? error.message : 'Не удалось сохранить пакет проекта.');
    } finally {
      setIsSavingPackage(false);
    }
  }, [activeChapterWorkspaceId, getCanvasWorkspaceSnapshot, isSavingPackage, narrationSettings, nodes, projectTitle, showProjectNotice]);

  const handleExportJson = useCallback(() => {
    const workspaceState = getCanvasWorkspaceSnapshot();
    const snapshot = projectSnapshot(
      withCanvasWorkspaceSettings(
        withNarrationSettings(projectRef.current, narrationSettings),
        activeChapterWorkspaceId,
        workspaceState.viewports,
      ),
      nodes,
      workspaceState.rootViewport,
      projectTitle,
    );
    const blob = new Blob([projectToJson(snapshot)], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, `${getSafeProjectFileName(snapshot.title)}.canva-story.json`);
    showProjectNotice('success', 'Проект экспортирован в JSON без тяжёлых изображений.');
  }, [activeChapterWorkspaceId, getCanvasWorkspaceSnapshot, narrationSettings, nodes, projectTitle, showProjectNotice]);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (isImportingProject) return;
    setIsImportingProject(true);
    try {
      if (isPortableProjectPackageFile(file)) {
        const result = await importPortableProjectPackage(file);
        saveProject(result.project);
        applyProject(result.project);
        const missingMessage = result.missingAssetIds.length > 0
          ? ` В исходном пакете отсутствовало ассетов: ${result.missingAssetIds.length}.`
          : '';
        showProjectNotice(
          'success',
          `Проект «${result.project.title}» открыт. Восстановлено медиафайлов: ${result.importedAssetCount}.${missingMessage}`,
        );
        return;
      }

      const importedProject = parseProjectJson(await file.text());
      saveProject(importedProject);
      applyProject(importedProject);
      showProjectNotice('success', `JSON проекта «${importedProject.title}» открыт без бинарных медиафайлов.`);
    } catch (error) {
      setSaveStatus('error');
      showProjectNotice('error', error instanceof Error ? error.message : 'Не удалось открыть проект.');
    } finally {
      setIsImportingProject(false);
    }
  }, [applyProject, isImportingProject, showProjectNotice]);

  const handleVoiceReferenceImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const hasSupportedAudioExtension = /\.(?:wav|mp3|flac|m4a|ogg)$/iu.test(file.name);
    if (!file.type.startsWith('audio/') && !hasSupportedAudioExtension) {
      showProjectNotice('error', 'Для Voice Clone нужен аудиофайл WAV, MP3, FLAC, M4A или OGG.');
      return;
    }

    try {
      const projectId = projectRef.current.id;
      const referenceAudio = await saveAssetBlob(file, 'audio', {
        assetId: `${projectId}:audio:narrator-reference`,
        assetKind: 'voice_reference',
        scope: 'project',
        projectId,
        canonicalId: 'narrator',
        filePath: file.name,
      });
      setNarrationSettings((settings) => ({
        ...settings,
        mode: 'clone',
        referenceAudio,
        referenceFileName: file.name,
      }));
      showProjectNotice('success', `Референс голоса «${file.name}» сохранён вместе с проектом.`);
    } catch (error) {
      showProjectNotice('error', errorMessage(error));
    }
  }, [showProjectNotice]);

  const handleNarrationModeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value;
    if (mode !== 'design' && mode !== 'clone') return;
    setNarrationSettings((settings) => ({ ...settings, mode }));
  }, []);

  const handleNarrationModelChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const model = event.target.value;
    if (model !== 'OmniVoice-bf16' && model !== 'OmniVoice') return;
    setNarrationSettings((settings) => ({ ...settings, model }));
  }, []);

  const handleNarrationQualityChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const quality = event.target.value;
    if (quality !== 'fast' && quality !== 'balanced' && quality !== 'quality') return;
    setNarrationSettings((settings) => ({ ...settings, quality }));
  }, []);

  const handleNarrationSeedInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;
    handleNarrationSeedChange(Math.min(OMNIVOICE_MAX_SEED, Math.max(1, Math.floor(value))));
  }, [handleNarrationSeedChange]);

  const handleNarrationVoicePresetChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const voiceInstruct = event.target.value;
    if (!isOmniVoiceNarratorPreset(voiceInstruct)) return;
    setNarrationSettings((settings) => ({ ...settings, voiceInstruct }));
  }, []);

  const handleNarrationVoiceRoulette = useCallback(() => {
    setNarrationSettings((settings) => {
      const preset = getRandomOmniVoiceNarratorPreset(settings.voiceInstruct);
      return {
        ...settings,
        voiceInstruct: preset.value,
        seed: getNextNarrationSeed(settings.seed),
      };
    });
  }, []);

  const handleRemoveVoiceReference = useCallback(() => {
    setNarrationSettings((settings) => ({
      ...settings,
      mode: 'design',
      referenceAudio: undefined,
      referenceFileName: undefined,
      referenceText: undefined,
    }));
    showProjectNotice('info', 'Референс отключён. Выбран синтетический голос.');
  }, [showProjectNotice]);

  const handleGenerationModeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = event.target.value;
    if (!isGenerationMode(mode)) return;
    setGenerationSettings((settings) => ({ ...settings, mode }));
  }, []);

  const handleLmStudioEndpointChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setGenerationSettings((settings) => ({ ...settings, lmStudioEndpoint: event.target.value }));
  }, []);

  const handleLmStudioModelChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setGenerationSettings((settings) => ({ ...settings, lmStudioModel: event.target.value }));
  }, []);

  const handleLmStudioDraftContextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setGenerationSettings((settings) => ({
      ...settings,
      lmStudioDraftContextLength: getSavedContextLength(value, LM_STUDIO_DEFAULT_DRAFT_CONTEXT_LENGTH),
    }));
  }, []);

  const handleLmStudioLargeContextChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setGenerationSettings((settings) => ({
      ...settings,
      lmStudioLargeContextLength: getSavedContextLength(value, LM_STUDIO_DEFAULT_LARGE_CONTEXT_LENGTH),
    }));
  }, []);

  const handleComfyGeminiEndpointChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setGenerationSettings((settings) => ({ ...settings, comfyGeminiEndpoint: event.target.value }));
  }, []);

  const handleComfyGeminiModelChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setGenerationSettings((settings) => ({ ...settings, comfyGeminiModel: event.target.value }));
  }, []);

  const handleComfyGeminiThinkingLevelChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setGenerationSettings((settings) => ({ ...settings, comfyGeminiThinkingLevel: event.target.value }));
  }, []);

  const handleComfyGeminiMaxOutputTokensChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    setGenerationSettings((settings) => ({
      ...settings,
      comfyGeminiMaxOutputTokens: getSavedContextLength(value, COMFY_GEMINI_DEFAULT_MAX_OUTPUT_TOKENS),
    }));
  }, []);

  const handleComfyGeminiApiKeyChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const apiKey = event.target.value;
    setGenerationSettings((settings) => ({ ...settings, comfyGeminiApiKey: apiKey }));
    setImageGenerationSettings((settings) => ({ ...settings, comfyOrgApiKey: apiKey }));
  }, []);

  const handleImageProviderChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = event.target.value;
    if (!isImageProvider(provider)) return;
    setImageGenerationSettings((settings) => ({ ...settings, provider }));
  }, []);

  const handleComfyEndpointChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setImageGenerationSettings((settings) => ({ ...settings, comfyEndpoint: event.target.value }));
  }, []);

  const handleComfyCheckpointChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setImageGenerationSettings((settings) => ({ ...settings, comfyCheckpoint: event.target.value }));
  }, []);

  const handleComfyOrgApiKeyChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const apiKey = event.target.value;
    setImageGenerationSettings((settings) => ({ ...settings, comfyOrgApiKey: apiKey }));
    setGenerationSettings((settings) => ({ ...settings, comfyGeminiApiKey: apiKey }));
  }, []);

  const handleUnloadLocalModels = useCallback(async () => {
    if (isUnloadingModels) return;
    setIsUnloadingModels(true);
    const results: string[] = [];
    const failures: string[] = [];

    try {
      await unloadComfyModels(imageGenerationSettings);
      results.push('ComfyUI очищен');
    } catch (error) {
      failures.push(`ComfyUI: ${errorMessage(error)}`);
    }

    if (generationSettings.mode === 'lmstudio') {
      try {
        const count = await unloadLmStudioModels(generationSettings);
        results.push(count > 0 ? `LM Studio: выгружено ${count}` : 'LM Studio: загруженных моделей нет');
      } catch (error) {
        failures.push(`LM Studio: ${errorMessage(error)}`);
      }
    }

    if (results.length) showProjectNotice('success', results.join(' · '));
    if (failures.length) showProjectNotice(results.length ? 'info' : 'error', failures.join(' · '));
    setIsUnloadingModels(false);
  }, [generationSettings, imageGenerationSettings, isUnloadingModels, showProjectNotice]);

  const getConnectionPath = (parentId: string, childId: string) => {
    const parentNode = nodes[parentId];
    const childNode = nodes[childId];
    if (!parentNode || !childNode) return '';
    const parentWidth = Math.max(parentNode.width ?? 300, parentNode.nodeType === 'scene' ? 400 : 0);
    const parentHeight = Math.max(parentNode.height ?? 220, parentNode.nodeType === 'scene' ? 520 : 0);
    const childWidth = Math.max(childNode.width ?? 300, childNode.nodeType === 'scene' ? 400 : 0);
    const childHeight = Math.max(childNode.height ?? 220, childNode.nodeType === 'scene' ? 520 : 0);
    const parentCenterX = parentNode.x + parentWidth / 2;
    const parentCenterY = parentNode.y + parentHeight / 2;
    const childCenterX = childNode.x + childWidth / 2;
    const childCenterY = childNode.y + childHeight / 2;
    const horizontalGap = childCenterX - parentCenterX;
    const verticalGap = childCenterY - parentCenterY;

    if (Math.abs(horizontalGap) >= Math.abs(verticalGap)) {
      const fromRight = horizontalGap >= 0;
      const x1 = fromRight ? parentNode.x + parentWidth : parentNode.x;
      const x2 = fromRight ? childNode.x : childNode.x + childWidth;
      const y1 = parentCenterY;
      const y2 = childCenterY;
      const bend = Math.max(44, Math.abs(x2 - x1) * 0.45);
      return `M ${x1} ${y1} C ${x1 + (fromRight ? bend : -bend)} ${y1}, ${x2 + (fromRight ? -bend : bend)} ${y2}, ${x2} ${y2}`;
    }

    const fromBottom = verticalGap >= 0;
    const x1 = parentCenterX;
    const x2 = childCenterX;
    const y1 = fromBottom ? parentNode.y + parentHeight : parentNode.y;
    const y2 = fromBottom ? childNode.y : childNode.y + childHeight;
    const bend = Math.max(44, Math.abs(y2 - y1) * 0.45);
    return `M ${x1} ${y1} C ${x1} ${y1 + (fromBottom ? bend : -bend)}, ${x2} ${y2 + (fromBottom ? -bend : bend)}, ${x2} ${y2}`;
  };

  const gridStyle = {
    backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };
  const worldTransform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;
  const svgWorldTransform = `translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`;

  return (
    <div className="app-shell">
      <header className="app-toolbar">
        <div className="app-brand">
          <span className="app-brand__mark" aria-hidden="true">CS</span>
          <div>
            <strong>CANVA STORY</strong>
            <span>визуальная мастерская сценария</span>
          </div>
        </div>
        <div className="project-toolbar">
          <div className="project-toolbar__row">
            <input
              className="project-title-input"
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              maxLength={120}
              aria-label="Название проекта"
            />
            <span
              className={`save-indicator save-indicator--${saveStatus}`}
              title={saveStatus === 'error' ? saveErrorMessage || 'Браузер не смог сохранить проект.' : undefined}
            >
              {saveStatus === 'saving' ? 'Сохраняем…' : saveStatus === 'error' ? 'Ошибка сохранения' : 'Сохранено локально'}
            </span>
            <span className={`mode-badge mode-badge--${generationSettings.mode}`}>
              {generationModeLabels[generationSettings.mode]}
            </span>
          </div>
          <div className="generation-controls" aria-label="Режим генерации текста">
            <select
              className="generation-select"
              value={generationSettings.mode}
              onChange={handleGenerationModeChange}
              aria-label="Провайдер генерации текста"
            >
              <option value="mock">Тест</option>
              <option value="mistral">Mistral API</option>
              <option value="lmstudio">LM Studio</option>
              <option value="comfygemini">Gemini · ComfyUI</option>
            </select>
            {generationSettings.mode === 'lmstudio' && (
              <>
                <input
                  className="generation-endpoint-input"
                  value={generationSettings.lmStudioEndpoint}
                  onChange={handleLmStudioEndpointChange}
                  placeholder={LM_STUDIO_DEFAULT_ENDPOINT}
                  aria-label="Endpoint LM Studio"
                />
                <input
                  className="generation-model-input"
                  value={generationSettings.lmStudioModel}
                  onChange={handleLmStudioModelChange}
                  placeholder="default=local-model; research=fast; scenario=writer; editor=ernie"
                  aria-label="Модель или роли LM Studio"
                  title="Можно указать одну модель или роли: research=..., scenario=..., editor=..., narration=..., memory=..., details=..., image_prompt=..., default=..."
                />
                <input
                  className="generation-context-input"
                  type="number"
                  min="1024"
                  step="1024"
                  value={generationSettings.lmStudioDraftContextLength}
                  onChange={handleLmStudioDraftContextChange}
                  aria-label="Быстрый контекст LM Studio"
                  title="Контекст для быстрых/маленьких моделей"
                />
                <input
                  className="generation-context-input"
                  type="number"
                  min="1024"
                  step="1024"
                  value={generationSettings.lmStudioLargeContextLength}
                  onChange={handleLmStudioLargeContextChange}
                  aria-label="Большой контекст LM Studio"
                  title="Контекст для больших моделей, если max_context_length позволяет"
                />
                <button
                  type="button"
                  className="generation-refresh-button"
                  onClick={() => void refreshLmStudioModels(false)}
                  disabled={lmStudioModelsStatus === 'loading'}
                  title={lmStudioModelsError || 'Обновить список моделей LM Studio'}
                >
                  {lmStudioModelsStatus === 'loading'
                    ? 'ищем...'
                    : lmStudioModels.length > 0
                      ? `моделей ${lmStudioModels.length}`
                      : 'модели'}
                </button>
              </>
            )}
            {generationSettings.mode === 'comfygemini' && (
              <>
                <input
                  className="generation-endpoint-input"
                  value={generationSettings.comfyGeminiEndpoint}
                  onChange={handleComfyGeminiEndpointChange}
                  placeholder={COMFYUI_DEFAULT_ENDPOINT}
                  aria-label="Endpoint ComfyUI для Gemini"
                />
                <select
                  className="generation-model-input"
                  value={generationSettings.comfyGeminiModel}
                  onChange={handleComfyGeminiModelChange}
                  aria-label="Модель Gemini в ComfyUI"
                >
                  {COMFY_GEMINI_MODELS.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <select
                  className="generation-context-input"
                  value={generationSettings.comfyGeminiThinkingLevel}
                  onChange={handleComfyGeminiThinkingLevelChange}
                  aria-label="Thinking level Gemini"
                  title="Поле thinking_level из GeminiNodeV2"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
                <input
                  className="generation-context-input"
                  type="number"
                  min="512"
                  step="512"
                  value={generationSettings.comfyGeminiMaxOutputTokens}
                  onChange={handleComfyGeminiMaxOutputTokensChange}
                  aria-label="Max output tokens Gemini"
                  title="max_output_tokens для GeminiNodeV2"
                />
                <input
                  className="generation-secret-input"
                  type="password"
                  value={generationSettings.comfyGeminiApiKey}
                  onChange={handleComfyGeminiApiKeyChange}
                  placeholder="Comfy.org API key"
                  aria-label="Comfy.org API key для Gemini"
                  title="Если GeminiNodeV2 требует ключ Comfy.org, он будет отправлен в extra_data. Хранится только в localStorage этого браузера."
                />
              </>
            )}
          </div>
          {hasLmStudioMixedContentRisk && (
            <div className="generation-warning" role="status">
              GitHub Pages работает по HTTPS. Для HTTP-адреса в домашней сети браузер может потребовать локальный запуск приложения или HTTPS/proxy.
            </div>
          )}
          {hasComfyGeminiMixedContentRisk && (
            <div className="generation-warning" role="status">
              GitHub Pages по HTTPS может блокировать HTTP ComfyUI для Gemini. Для такого режима лучше локальный запуск или HTTPS/proxy.
            </div>
          )}
          <div className="image-generation-controls" aria-label="Генерация кадров">
            <span className={`mode-badge mode-badge--image-${imageGenerationSettings.provider}`}>
              {imageProviderLabels[imageGenerationSettings.provider]}
            </span>
            <select
              className="generation-select"
              value={imageGenerationSettings.provider}
              onChange={handleImageProviderChange}
              aria-label="Провайдер генерации кадров"
            >
              <option value="pollinations">Pollinations</option>
              <option value="comfyui">ComfyUI</option>
            </select>
            {needsComfyImageEndpoint && (
              <>
                <input
                  className="generation-endpoint-input"
                  value={imageGenerationSettings.comfyEndpoint}
                  onChange={handleComfyEndpointChange}
                  placeholder={COMFYUI_DEFAULT_ENDPOINT}
                  aria-label="Endpoint ComfyUI"
                />
                {imageGenerationSettings.provider === 'comfyui' && (
                  <input
                    className="generation-model-input"
                    value={imageGenerationSettings.comfyCheckpoint}
                    onChange={handleComfyCheckpointChange}
                    placeholder={COMFYUI_DEFAULT_CHECKPOINT}
                    aria-label="Checkpoint SDXL для ComfyUI"
                  />
                )}
                <input
                  className="generation-secret-input"
                  type="password"
                  value={imageGenerationSettings.comfyOrgApiKey}
                  onChange={handleComfyOrgApiKeyChange}
                  placeholder="Comfy.org API key"
                  aria-label="Comfy.org API key"
                  title="Ключ Comfy.org для API-нод вроде Nano Banana. Хранится только в localStorage этого браузера."
                />
              </>
            )}
          </div>
          <details className="narration-generation-controls">
            <summary>
              Озвучка · {narrationSettings.mode === 'clone' ? 'Voice Clone' : 'Голос по описанию'} ·{' '}
              {narrationSettings.model === 'OmniVoice' ? 'FP32' : 'BF16'}
            </summary>
            <div className="narration-settings-grid">
              <label>
                Режим голоса
                <select value={narrationSettings.mode} onChange={handleNarrationModeChange}>
                  <option value="design">Голос по описанию</option>
                  <option value="clone">Voice Clone</option>
                </select>
              </label>
              <label>
                Модель
                <select value={narrationSettings.model} onChange={handleNarrationModelChange}>
                  {OMNIVOICE_MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Качество
                <select value={narrationSettings.quality} onChange={handleNarrationQualityChange}>
                  {OMNIVOICE_QUALITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Seed дубля
                <span className="narration-seed-control">
                  <input
                    type="number"
                    min="1"
                    max={OMNIVOICE_MAX_SEED}
                    step="1"
                    value={narrationSettings.seed}
                    onChange={handleNarrationSeedInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => handleNarrationSeedChange(getNextNarrationSeed(narrationSettings.seed))}
                    title="Подготовить новый вариант голоса для следующей генерации"
                  >
                    Новый
                  </button>
                </span>
              </label>
            </div>
            {narrationSettings.mode === 'design' ? (
              <label className="narration-wide-field">
                Голос рассказчика
                <span className="narration-voice-preset-row">
                  <select
                  value={narrationSettings.voiceInstruct}
                    onChange={handleNarrationVoicePresetChange}
                    aria-label="Пресет голоса рассказчика OmniVoice"
                  >
                    {!isOmniVoiceNarratorPreset(narrationSettings.voiceInstruct) && (
                      <option value={narrationSettings.voiceInstruct}>Сохранённая комбинация тегов</option>
                    )}
                    {OMNIVOICE_NARRATOR_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>{preset.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleNarrationVoiceRoulette}
                    title="Выбрать другую допустимую комбинацию тегов и новый seed"
                  >
                    🎲 Рулетка
                  </button>
                </span>
                <code className="narration-voice-tags">{narrationSettings.voiceInstruct}</code>
              </label>
            ) : (
              <div className="narration-clone-settings">
                <div className="narration-reference-row">
                  <button type="button" onClick={() => voiceReferenceInputRef.current?.click()}>
                    {narrationSettings.referenceAudio ? 'Заменить аудио' : 'Выбрать аудио'}
                  </button>
                  <span className="narration-reference-name">
                    {narrationSettings.referenceFileName || 'Референс ещё не выбран'}
                  </span>
                  {narrationSettings.referenceAudio && (
                    <button type="button" onClick={handleRemoveVoiceReference}>Убрать</button>
                  )}
                </div>
                <label className="narration-wide-field">
                  Точный текст, произнесённый в референсе
                  <textarea
                    rows={2}
                    value={narrationSettings.referenceText ?? ''}
                    onChange={(event) => setNarrationSettings((settings) => ({
                      ...settings,
                      referenceText: event.target.value,
                    }))}
                    placeholder="Впишите дословную расшифровку аудиофайла — так не потребуется Whisper."
                  />
                </label>
              </div>
            )}
            <p className="narration-settings-hint">
              Рулетка использует только официальные теги OmniVoice. Отдельного тега хрипотцы у модели нет: низкий возрастной голос — ближайший синтетический вариант, а точную хрипотцу лучше задавать через Voice Clone. Один seed сохраняет голос одинаковым во всей главе.
            </p>
            <input
              ref={voiceReferenceInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg"
              onChange={handleVoiceReferenceImport}
              className="visually-hidden"
              hidden
              tabIndex={-1}
              aria-hidden="true"
            />
          </details>
          {hasComfyMixedContentRisk && (
            <div className="generation-warning" role="status">
              GitHub Pages по HTTPS может блокировать HTTP ComfyUI в домашней сети. Для такого режима лучше локальный запуск или HTTPS/proxy.
            </div>
          )}
          <div className="workflow-hint" aria-label="Текущий рабочий процесс">
            <span>1 · Текст</span>
            <span>2 · Детали</span>
            <span>3 · Сцены</span>
            <span>4 · Промпты</span>
          </div>
        </div>
        <div className="project-actions" aria-label="Действия с проектом">
          <span className="node-count">{visibleNodeEntries.length} из {canvasNodeEntries.length} нод</span>
          {linkedFolderName && (
            <span className="project-folder-status" title="Проект связан с этой папкой">
              Папка: {linkedFolderName}
            </span>
          )}
          {activeChapterWorkspaceId ? (
            <button
              type="button"
              className="toolbar-active-button"
              onClick={() => handleExitChapterWorkspace(false)}
              title="Вернуться на верхний уровень проекта"
            >
              Назад к главам
            </button>
          ) : (
            <button
              type="button"
              className={chapterNavigatorOpen ? 'toolbar-active-button' : undefined}
              onClick={() => setChapterNavigatorOpen((value) => !value)}
              title="Открыть навигацию по главам"
            >
              Главы
            </button>
          )}
          <button type="button" onClick={handleEnsureStoryReferenceNodes}>Базы</button>
          <button type="button" onClick={handleEnsureCharacterRegistry}>Реестр персонажей</button>
          <button type="button" onClick={() => handleEnsureChapterTimeline(selectedNodeId ?? undefined)}>Таймлайн</button>
          <button type="button" onClick={handleEnsureChapterCollector}>Собиратель глав</button>
          <button type="button" onClick={() => void handleRestoreImageAssets()}>Восстановить медиа</button>
          <button type="button" onClick={() => handleCreatePromptNode(selectedNodeId ?? undefined)}>Prompt Node</button>
          <button type="button" onClick={() => handleCreateSceneWriterPromptNode(selectedNodeId ?? undefined)}>Scene Writer</button>
          <button type="button" onClick={() => handleCreateSplitNode(selectedNodeId ?? undefined)}>Split Node</button>
          <button type="button" onClick={handleUnloadLocalModels} disabled={isUnloadingModels}>
            {isUnloadingModels ? 'Выгружаю…' : 'Выгрузить модели'}
          </button>
          {!activeChapterWorkspaceId && (
            <button
              type="button"
              className={timelineFocusMode ? 'toolbar-active-button' : undefined}
              onClick={() => setTimelineFocusMode((value) => !value)}
              title="Спрятать промежуточные сцены и ассеты, оставив рабочий таймлайн"
            >
              {timelineFocusMode ? 'Все ноды' : 'Только таймлайн'}
            </button>
          )}
          <button type="button" onClick={() => setPendingProjectAction('new')}>Новый</button>
          <button
            type="button"
            onClick={() => void handleSaveProjectFolder()}
            disabled={isSavingFolder || !isFolderProjectSupported()}
            title={isFolderProjectSupported()
              ? 'Сохранить текущий проект, тексты и медиа в обычную папку'
              : 'Сохранение в папку поддерживается в Chrome и Edge'}
          >
            {isSavingFolder ? 'Сохраняю папку…' : 'Сохранить в папку'}
          </button>
          <button
            type="button"
            onClick={() => void handleOpenProjectFolder()}
            disabled={isOpeningFolder || !isFolderProjectSupported()}
            title={isFolderProjectSupported()
              ? 'Открыть ранее сохранённую папку проекта'
              : 'Открытие папки поддерживается в Chrome и Edge'}
          >
            {isOpeningFolder ? 'Открываю папку…' : 'Открыть папку'}
          </button>
          <button
            type="button"
            onClick={() => void handleSavePortableProject()}
            disabled={isSavingPackage}
            title="Скачать переносимый пакет с project.json, изображениями, аудио и видео"
          >
            {isSavingPackage ? 'Сохраняю ZIP…' : 'Скачать ZIP'}
          </button>
          <button type="button" onClick={handleExportJson} title="Скачать только структуру проекта без медиафайлов">
            Экспорт JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImportingProject}
          >
            {isImportingProject ? 'Открываю…' : 'Открыть проект'}
          </button>
          <button type="button" className="toolbar-danger-button" onClick={() => setPendingProjectAction('reset')}>Сброс</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".canva-story.zip,.zip,application/zip,application/x-zip-compressed,application/vnd.canva-story.project+zip,application/json,.json"
            onChange={handleImport}
            className="visually-hidden"
            hidden
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      </header>

      <main
        ref={canvasRef}
        className={`canvas-viewport${isPanning ? ' canvas-viewport--panning' : ''}`}
        style={gridStyle}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}
        aria-label="Канва проекта"
      >
        <svg className="connection-layer" aria-hidden="true">
          <g transform={svgWorldTransform}>
            {nodeEntries.map(([childId, childNode]) => childNode.parentId && visibleNodeIds.has(childId) && visibleNodeIds.has(childNode.parentId) && (
              <path
                key={`${childNode.parentId}-${childId}`}
                d={getConnectionPath(childNode.parentId, childId)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>

        <div className="canvas-world" style={{ transform: worldTransform }}>
          {visibleNodeEntries.map(([id, node]) => (
            <NodeRenderer
              key={id}
              id={id}
              node={node}
              allNodes={nodes}
              selected={selectedNodeId === id}
              pendingOutputNodeId={pendingOutputNodeId}
              onMouseDown={handleMouseDown}
              onResizeMouseDown={handleResizeMouseDown}
              onDelete={setDeleteCandidateId}
              onStartOutputConnection={handleStartOutputConnection}
              onConnectInput={handleConnectInput}
              onInputChange={handleInputChange}
              onThemeInputChange={handleThemeInputChange}
              onSystemPromptChange={handleSystemPromptChange}
              onPromptContextChange={handlePromptContextChange}
              onPromptKnowledgeChange={handlePromptKnowledgeChange}
              onPromptMemoryChange={handlePromptMemoryChange}
              onPromptTemplateChange={handlePromptTemplateChange}
              onRunPromptNode={handleRunPromptNode}
              onCreatePromptNode={handleCreatePromptNode}
              onCreateSceneWriterPromptNode={handleCreateSceneWriterPromptNode}
              onCreateSplitNode={handleCreateSplitNode}
              onAssemblePromptResultScenario={handleAssemblePromptResultScenario}
              onSplitModeChange={handleSplitModeChange}
              onSplitSeparatorChange={handleSplitSeparatorChange}
              onArrayPathChange={handleArrayPathChange}
              onRunSplitNode={handleRunSplitNode}
              onTogglePromptSnippet={handleTogglePromptSnippet}
              onModelChange={handleModelChange}
              onImagePipelineChange={handleImagePipelineChange}
              onDetailAssetImageProviderChange={handleDetailAssetImageProviderChange}
              onTimelineAssetPipelineChange={handleTimelineAssetPipelineChange}
              onTimelineSystemInsertPipelineChange={handleTimelineSystemInsertPipelineChange}
              onTimelineMasterChange={handleTimelineMasterChange}
              onSceneCountChange={handleSceneCountChange}
              onContinueAssociation={handleContinueAssociation}
              onScriptVisualize={handleScriptVisualization}
              onBuildScenarioFromBrief={handleBuildScenarioFromBrief}
              onImportReferenceFile={handleImportReferenceFile}
              onExtractChapterTopic={handleExtractChapterTopic}
              onPlanChapters={handlePlanChapters}
              onCreateChapterPlanNodes={handleCreateChapterPlanNodes}
              onBuildChapterKnowledge={handleBuildChapterKnowledge}
              onBuildSeasonSkeleton={handleBuildSeasonSkeleton}
              onBuildChapterMaterial={handleBuildChapterMaterial}
              onAutoBuildChapter={handleAutoBuildChapter}
              onEnsureChapterTimeline={handleEnsureChapterTimeline}
              onScenarioDetailClick={handleScenarioDetailClick}
              onCreateSceneNodes={handleCreateSceneNodes}
              onBuildCharacterMemory={handleBuildCharacterMemory}
              onBuildSceneDialogue={handleBuildSceneDialogue}
              onGenerateSceneLocationAsset={handleGenerateSceneLocationAsset}
              onComposeSceneFlux2={handleComposeSceneFlux2}
              onGenerateDetailAsset={handleGenerateDetailAsset}
              onEditNarration={handleEditNarration}
              onStoryStructureEdit={handleStoryStructureEdit}
              onNarrationEditorialLoop={handleNarrationEditorialLoop}
              onPrepareNarrationTts={handlePrepareNarrationTts}
              onSpeakNarration={handleSpeakNarration}
              onStopSpeech={handleStopSpeech}
              onGenerateOmniVoiceNarration={handleGenerateOmniVoiceNarration}
              onGenerateAlternateOmniVoiceNarration={handleGenerateAlternateOmniVoiceNarration}
              onGenerateSceneOmniVoiceNarration={handleGenerateSceneOmniVoiceNarration}
              onGenerateAlternateSceneOmniVoiceNarration={handleGenerateAlternateSceneOmniVoiceNarration}
              onGenerateSceneShotGrid={handleGenerateSceneShotGrid}
              onBuildSceneVideoClip={handleBuildSceneVideoClip}
              onGenerateChapterBackdrop={handleGenerateChapterBackdrop}
              onGenerateTimelineMissingAssets={handleGenerateTimelineMissingAssets}
              onBuildChapterSceneClips={handleBuildChapterSceneClips}
              onBuildChapterVideo={handleBuildChapterVideo}
              onBuildSeasonVideo={handleBuildSeasonVideo}
              onCopyToClipboard={handleCopyToClipboard}
              onRegenerateImageNode={handleRegenerateImageNode}
              onToggleReferenceImage={handleToggleReferenceImage}
              onSetCharacterCanonicalAsset={handleSetCharacterCanonicalAsset}
              textModelOptions={textModelOptions}
              imageProvider={imageGenerationSettings.provider}
              onCancelGeneration={handleCancelGeneration}
              focusChainExpanded={expandedFocusNodeIds.has(id)}
              onToggleFocusChain={toggleFocusChain}
              onOpenChapterWorkspace={handleOpenChapterWorkspace}
            />
          ))}
        </div>

        {activeChapterWorkspaceId && (
          <nav className="canvas-workspace-bar" aria-label="Навигация рабочего пространства главы">
            <button type="button" onClick={() => handleExitChapterWorkspace(false)}>Главы</button>
            <div className="canvas-workspace-bar__path">
              <span>{projectTitle}</span>
              <span aria-hidden="true">›</span>
              <strong>{activeChapterWorkspaceItem?.title ?? nodes[activeChapterWorkspaceId]?.label ?? 'Глава'}</strong>
              <span aria-hidden="true">›</span>
              <span>Ветка генерации</span>
            </div>
            <button type="button" onClick={() => handleExitChapterWorkspace(true)}>К таймлайну</button>
          </nav>
        )}

        {!activeChapterWorkspaceId && (
          <ChapterNavigator
            items={chapterNavigatorItems}
            open={chapterNavigatorOpen}
            onOpenChange={setChapterNavigatorOpen}
            onFocusNode={handleFocusChapterNode}
            onCreateTimeline={handleEnsureChapterTimeline}
            onOpenChapter={handleOpenChapterWorkspace}
          />
        )}

        <div className="canvas-help">
          {activeChapterWorkspaceId
            ? 'Ветка генерации главы · персонажи · локации · сцены · озвучка · медиа'
            : 'Верхний этаж проекта · главы · Scene Writer · таймлайны'}
        </div>
        <div className="canvas-controls" aria-label="Управление канвой">
          <button type="button" onClick={zoomOut} aria-label="Уменьшить масштаб">−</button>
          <button type="button" onClick={resetZoom} className="canvas-controls__value" aria-label="Масштаб 100%">
            {Math.round(viewport.zoom * 100)}%
          </button>
          <button type="button" onClick={zoomIn} aria-label="Увеличить масштаб">+</button>
          <span className="canvas-controls__divider" />
          <button type="button" onClick={centerView}>Центр</button>
          <button type="button" onClick={() => fitView()}>Показать всё</button>
        </div>
        {selectedNode && (
          <div className="selection-status">
            Выбрано: <strong>{selectedNode.label}</strong> · Delete — удалить · Esc — снять выбор
          </div>
        )}
      </main>

      {visibleNotice && (
        <div className={`app-toast app-toast--${visibleNotice.tone}`} role="status" aria-live="polite">
          <span>{visibleNotice.message}</span>
          <button type="button" onClick={dismissNotice} aria-label="Закрыть сообщение">×</button>
        </div>
      )}

      {deleteCandidate && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setDeleteCandidateId(null)}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="confirm-dialog__eyebrow">Подтвердите действие</span>
            <h2 id="delete-dialog-title">Удалить «{deleteCandidate.label}»?</h2>
            <p>Связанные дочерние ноды тоже будут удалены. Это действие нельзя отменить.</p>
            <div className="confirm-dialog__actions">
              <button type="button" onClick={() => setDeleteCandidateId(null)}>Отмена</button>
              <button type="button" className="danger-button" onClick={confirmDelete}>Удалить</button>
            </div>
          </section>
        </div>
      )}

      {pendingProjectAction && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setPendingProjectAction(null)}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="confirm-dialog__eyebrow">Несохранённые изменения можно экспортировать</span>
            <h2 id="project-dialog-title">
              {pendingProjectAction === 'new' ? 'Создать новый проект?' : 'Полностью сбросить локальный проект?'}
            </h2>
            <p>
              {pendingProjectAction === 'new'
                ? 'Текущая канва будет заменена чистым стартовым проектом.'
                : 'Локальная копия, ноды, координаты и настройки вида будут очищены.'}
            </p>
            <div className="confirm-dialog__actions">
              <button type="button" onClick={() => setPendingProjectAction(null)}>Отмена</button>
              {pendingProjectAction === 'new' && isFolderProjectSupported() && (
                <button
                  type="button"
                  onClick={() => void handleCreateProjectInFolder()}
                  disabled={isSavingFolder}
                >
                  {isSavingFolder ? 'Создаю…' : 'Создать в папке'}
                </button>
              )}
              <button type="button" className="danger-button" onClick={confirmProjectAction}>
                {pendingProjectAction === 'new' ? 'Создать локально' : 'Сбросить всё'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default App;
