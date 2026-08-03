import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  generateComfyFlux2ComposeImage,
  generateImage,
  generateText,
  GenerationSettings,
  ImageGenerationSettings,
} from '../api';
import {
  ASSOCIATE_SYSTEM_PROMPT,
  CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT,
  CHAPTER_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_CHAPTER_MATERIAL,
  DEFAULT_FORMAT_BIBLE,
  DEFAULT_KNOWLEDGE_BASE,
  DEFAULT_SEASON_MEMORY,
  HERO_DETAIL_SYSTEM_PROMPT,
  LOCATION_ASSET_PROMPT_SYSTEM_PROMPT,
  LOCATION_DETAIL_SYSTEM_PROMPT,
  MISTRAL_MODELS,
  MOOD_DETAIL_SYSTEM_PROMPT,
  NARRATION_DETAIL_SYSTEM_PROMPT,
  NARRATION_EDIT_SYSTEM_PROMPT,
  SCENARIO_SYSTEM_PROMPT,
  SCENE_CHARACTER_LAYER_PROMPT_SYSTEM_PROMPT,
  SCENE_LOCATION_PROMPT_SYSTEM_PROMPT,
  SCENE_MASTER_PROMPT_SYSTEM_PROMPT,
  SEASON_MEMORY_UPDATE_SYSTEM_PROMPT,
  STORY_BRIEF_REVISION_SYSTEM_PROMPT,
  TTS_CLEANUP_SYSTEM_PROMPT,
} from '../constants';
import {
  AppNotice,
  DetailType,
  GenerationOperation,
  GenerationRequest,
  ImagePipeline,
  ImagePromptKind,
  NodeData,
  NodesState,
} from '../types';
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
  handleModelChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleImagePipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleSceneCountChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  handleContinueAssociation: (sourceNodeId: string) => Promise<void>;
  handleScriptVisualization: (sourceNodeId: string) => Promise<void>;
  handleBuildScenarioFromBrief: (briefNodeId: string) => Promise<void>;
  handleAutoBuildChapter: (chapterMaterialNodeId: string) => Promise<void>;
  handleEnsureStoryReferenceNodes: () => void;
  handleScenarioDetailClick: (sourceNodeId: string, detailType: DetailType) => Promise<void>;
  handleCreateSceneNodes: (sourceNodeId: string) => void;
  handleGenerateScenePrompt: (sceneNodeId: string) => Promise<void>;
  handleGenerateSceneLocationAsset: (sceneNodeId: string) => Promise<void>;
  handleGenerateSceneCharacterLayer: (sceneNodeId: string) => Promise<void>;
  handleComposeSceneFlux2: (sceneNodeId: string, pipeline?: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose'>) => Promise<void>;
  handleGenerateDetailAsset: (detailNodeId: string) => Promise<void>;
  handleEditNarration: (detailNodeId: string) => Promise<void>;
  handleNarrationEditorialLoop: (detailNodeId: string) => Promise<void>;
  handlePrepareNarrationTts: (detailNodeId: string) => Promise<void>;
  handleCopyToClipboard: (textToCopy: string) => Promise<void>;
  handleGeneratePollinationsImage: (nodeId: string) => Promise<void>;
  handleRegenerateImageNode: (nodeId: string) => Promise<void>;
  handleToggleReferenceImage: (nodeId: string) => void;
  handleCancelGeneration: (nodeId: string) => void;
}

const detailConfig: Record<DetailType, {
  label: string;
  operation: GenerationOperation;
  systemPrompt: string;
  column: number;
}> = {
  герои: { label: 'Герои', operation: 'heroes', systemPrompt: HERO_DETAIL_SYSTEM_PROMPT, column: 0 },
  локации: { label: 'Локации', operation: 'locations', systemPrompt: LOCATION_DETAIL_SYSTEM_PROMPT, column: 1 },
  настроение: { label: 'Настроение', operation: 'mood', systemPrompt: MOOD_DETAIL_SYSTEM_PROMPT, column: 2 },
  закадр: { label: 'Закадр', operation: 'narration', systemPrompt: NARRATION_DETAIL_SYSTEM_PROMPT, column: 3 },
};

const getExistingChild = (nodes: NodesState, parentId: string, predicate: (node: NodeData) => boolean) =>
  Object.entries(nodes).find(([, node]) => node.parentId === parentId && predicate(node));

const referenceSourceKinds = new Set(['format_bible', 'knowledge_base', 'season_memory']);

const getSourceKind = (node?: NodeData) =>
  typeof node?.metadata?.sourceKind === 'string' ? node.metadata.sourceKind : '';

const findNodeBySourceKind = (nodes: NodesState, sourceKind: string) =>
  Object.entries(nodes).find(([, node]) => node.nodeType === 'script_detail' && getSourceKind(node) === sourceKind);

const getStoryReferenceContext = (nodes: NodesState) => {
  const references = Object.values(nodes)
    .filter((node) =>
      node.nodeType === 'script_detail'
      && typeof node.metadata?.sourceKind === 'string'
      && referenceSourceKinds.has(node.metadata.sourceKind)
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

const buildChapterPrompt = (material: string, nodes: NodesState) =>
  withStoryReferenceContext([
    'Материал текущей главы:',
    material,
    'Задача: собрать главу как последовательный сценарий сцен. Используй материал главы как главный источник, а базы проекта и сезонную память как контекст.',
  ].join('\n\n'), nodes);

const isEditorialReviewText = (text: string) =>
  /^(отлично|хорошо|замечательно|прекрасно|резюме получилось|получилось)/iu.test(text.trim())
  || /(понравил[оа]сь|сильный момент|очень информативн|структурированн|учитывающ|полезно для дальнейшего)/iu.test(text);

const upsertScriptDetailNode = (
  previousNodes: NodesState,
  parentId: string,
  label: string,
  inputValue: string,
  options: {
    column?: number;
    width?: number;
    height?: number;
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
  const nextNode: NodeData = {
    ...existing?.[1],
    nodeType: 'script_detail',
    x: existing?.[1].x ?? parentNode.x + column * 326,
    y: existing?.[1].y ?? parentNode.y + (parentNode.height ?? 390) + 36,
    label,
    width: existing?.[1].width ?? options.width ?? 302,
    height: existing?.[1].height ?? options.height ?? 280,
    isGenerated: true,
    level: (parentNode.level ?? 0) + 1,
    parentId,
    inputValue,
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

const getSceneNumber = (label: string) => {
  const match = label.match(/сцена\s*(\d+)/iu);
  return match ? Number(match[1]) : null;
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
  const firstPart = description.split(/[;.\n]/)[0]?.trim() || '';
  const normalized = firstPart
    .replace(/^ID\/Имя или роль\s*[—-]\s*/iu, '')
    .replace(/^ID\/Имя или роль\s*—\s*/iu, '')
    .trim();
  return (normalized || `Персонаж ${index + 1}`).slice(0, 48);
};

const getCharacterDescriptions = (heroesText: string) =>
  heroesText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const imagePromptKinds = new Set<ImagePromptKind>([
  'default',
  'scene_location',
  'scene_characters',
  'character_asset',
  'location_asset',
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

const getReferenceLabel = (node: NodeData) =>
  typeof node.metadata?.promptContext === 'string'
    ? getCharacterName(node.metadata.promptContext, 0)
    : node.label;

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
      x: existingSceneNode?.x ?? outputNode.x + (outputNode.width ?? 440) + 56 + column * 348,
      y: existingSceneNode?.y ?? outputNode.y + row * 328,
      label: scene.label,
      width: existingSceneNode?.width ?? 320,
      height: existingSceneNode?.height ?? 290,
      level: (outputNode.level ?? 0) + 1,
      parentId: outputNodeId,
      isGenerated: true,
      hasGenerationButton: true,
      masterPrompt: existingSceneNode?.masterPrompt ?? '',
      sceneText: scene.text,
      inputValue: scene.text,
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
): UseNodeManagementReturn => {
  const [nodes, setNodesState] = useState<NodesState>(initialNodes);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const nodesRef = useRef(nodes);
  const activeRequests = useRef(new Map<string, AbortController>());
  const noticeCounter = useRef(0);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => () => {
    activeRequests.current.forEach((controller) => controller.abort());
    activeRequests.current.clear();
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
      return await generateText(request, controller.signal, generationSettings);
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

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { inputValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handleThemeInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { themeInputValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handleModelChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    updateNode(nodeId, { selectedModel: event.target.value, error: undefined });
  }, [updateNode]);

  const handleImagePipelineChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    updateNode(nodeId, { imagePipeline: event.target.value === 'sdxl' ? 'sdxl' : 'sdxl', pollinationsApiError: undefined });
  }, [updateNode]);

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
    const result = await requestText(sourceNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(script, nodesRef.current),
      systemPrompt,
      model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount,
    }, `Разбиваем историю на ${sceneCount} сцен…`);
    if (!result) return;

    setNodes((previousNodes) => upsertScenarioGraph(previousNodes, sourceNodeId, result, sceneCount));
    showNotice('success', `Сценарий и ${parseSceneBlocks(result, sceneCount).length} сцен готовы.`);
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleEnsureStoryReferenceNodes = useCallback(() => {
    setNodes((previousNodes) => {
      const existingFormatBible = Object.values(previousNodes).some(
        (node) => node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'format_bible',
      );
      const existingKnowledgeBase = Object.values(previousNodes).some(
        (node) => node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'knowledge_base',
      );
      const existingSeasonMemory = Object.values(previousNodes).some(
        (node) => node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'season_memory',
      );
      const existingChapterMaterial = Object.values(previousNodes).some(
        (node) => node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'chapter_material',
      );
      if (existingFormatBible && existingKnowledgeBase && existingSeasonMemory && existingChapterMaterial) {
        showNotice('info', 'Базы и материалы уже есть на канве.');
        return previousNodes;
      }

      const anchor = Object.values(previousNodes).find((node) => node.nodeType === 'script_input')
        ?? Object.values(previousNodes)[0];
      const anchorX = anchor?.x ?? 40;
      const anchorY = anchor?.y ?? 40;
      const nextNodes = { ...previousNodes };

      if (!existingFormatBible) {
        nextNodes[generateNodeId()] = {
          nodeType: 'script_detail',
          x: anchorX + 450,
          y: anchorY,
          label: 'Библия формата',
          width: 420,
          height: 300,
          isGenerated: true,
          level: anchor?.level ?? 0,
          inputValue: DEFAULT_FORMAT_BIBLE,
          error: undefined,
          metadata: {
            sourceKind: 'format_bible',
          },
        };
      }

      if (!existingKnowledgeBase) {
        nextNodes[generateNodeId()] = {
          nodeType: 'script_detail',
          x: anchorX + 890,
          y: anchorY,
          label: 'База знаний',
          width: 430,
          height: 300,
          isGenerated: true,
          level: anchor?.level ?? 0,
          inputValue: DEFAULT_KNOWLEDGE_BASE,
          error: undefined,
          metadata: {
            sourceKind: 'knowledge_base',
          },
        };
      }

      if (!existingSeasonMemory) {
        nextNodes[generateNodeId()] = {
          nodeType: 'script_detail',
          x: anchorX + 450,
          y: anchorY + 330,
          label: 'Сезонная память',
          width: 420,
          height: 300,
          isGenerated: true,
          level: anchor?.level ?? 0,
          inputValue: DEFAULT_SEASON_MEMORY,
          error: undefined,
          metadata: {
            sourceKind: 'season_memory',
          },
        };
      }

      if (!existingChapterMaterial) {
        nextNodes[generateNodeId()] = {
          nodeType: 'script_detail',
          x: anchorX + 890,
          y: anchorY + 330,
          label: 'Материал главы',
          width: 430,
          height: 360,
          isGenerated: true,
          level: anchor?.level ?? 0,
          inputValue: DEFAULT_CHAPTER_MATERIAL,
          selectedModel: anchor?.selectedModel || MISTRAL_MODELS[0],
          sceneCount: 8,
          error: undefined,
          metadata: {
            sourceKind: 'chapter_material',
          },
        };
      }

      showNotice('success', 'Базы, сезонная память и материал главы готовы.');
      return nextNodes;
    });
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
    const systemPrompt = theme
      ? `${SCENARIO_SYSTEM_PROMPT}\nСтилистическое направление: ${theme}.`
      : SCENARIO_SYSTEM_PROMPT;
    const result = await requestText(briefNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(brief, nodesRef.current),
      systemPrompt,
      model: briefNode.selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount,
    }, `Собираем ${sceneCount} сцен из редакторской заявки...`);
    if (!result) return;

    setNodes((previousNodes) => upsertScenarioGraph(previousNodes, briefNode.parentId ?? '', result, sceneCount));
    showNotice('success', `Сценарий пересобран из редакторской заявки: ${parseSceneBlocks(result, sceneCount).length} сцен.`);
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
    const scenario = await requestText(chapterMaterialNodeId, {
      operation: 'scenario',
      prompt: buildChapterPrompt(material, nodesRef.current),
      systemPrompt: SCENARIO_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, `Автосборка: пишем ${sceneCount} сцен главы...`);
    if (!scenario) {
      updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на создании сценария.' });
      return;
    }

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
    for (const config of Object.values(detailConfig)) {
      setChapterAutoStatus(`Автосборка: готовим «${config.label}»...`);
      const detailText = await requestText(outputNodeId, {
        operation: config.operation,
        prompt: withStoryReferenceContext(scenario, nodesRef.current),
        systemPrompt: config.systemPrompt,
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
      }));
    }

    const chapterSummaryPrompt = withStoryReferenceContext([
      'Ниже входные материалы готовой главы. Не оценивай их качество и не комментируй, хорошо ли они написаны. Извлеки только факты истории для сезонной памяти.',
      `Материал главы:\n${material}`,
      `Сценарий главы:\n${scenario}`,
      ...detailResults.map((detail) => `${detail.label}:\n${detail.text}`),
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
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleScenarioDetailClick = useCallback(async (sourceNodeId: string, detailType: DetailType) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    if (!sourceNode?.inputValue || sourceNode.isLoading) return;
    const config = detailConfig[detailType];
    const result = await requestText(sourceNodeId, {
      operation: config.operation,
      prompt: withStoryReferenceContext(sourceNode.inputValue, nodesRef.current),
      systemPrompt: config.systemPrompt,
      model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount: sourceNode.sceneCount,
    }, `Готовим раздел «${config.label}»…`);
    if (!result) return;

    setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, sourceNodeId, config.label, result, {
      column: config.column,
    }));
    showNotice('success', `Раздел «${config.label}» готов.`);
  }, [requestText, setNodes, showNotice]);

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
      const existing = getExistingChild(
        previousNodes,
        parentNodeId,
        (node) => node.nodeType === 'pollinations_image' && node.metadata?.assetKind === assetKind,
      );
      if (existing?.[1].imageUrl?.startsWith('blob:')) URL.revokeObjectURL(existing[1].imageUrl);
      const imageNodeId = existing?.[0] ?? generateNodeId();
      const parentWidth = parentNode.width ?? 320;
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
          y: existing?.[1].y ?? parentNode.y + offsetIndex * 250,
          width: existing?.[1].width ?? 320,
          height: existing?.[1].height ?? 220,
          parentId: parentNodeId,
          imageUrl,
          masterPrompt: imagePrompt,
          level: (parentNode.level ?? 0) + 1,
          metadata: {
            ...existing?.[1].metadata,
            assetKind,
            promptContext,
            promptKind: assetKind,
            imageProvider: imageGenerationSettings.provider,
            imagePipeline: parentNode.imagePipeline ?? 'sdxl',
            ...metadataPatch,
          },
        },
      };
    });
  }, [imageGenerationSettings.provider, setNodes]);

  const handleGenerateSceneLocationAsset = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || !outputNode?.inputValue || sceneNode.isLoading || sceneNode.isLoadingImage) return;

    const requestId = `scene-location:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    const details = Object.values(currentNodes).filter(
      (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
    );
    const findDetail = (label: string) => details.find((node) => node.label === label)?.inputValue || 'Не задано';
    const sceneDescription = sceneNode.sceneText || sceneNode.inputValue || outputNode.inputValue;
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
        statusMessage: 'Определяем локацию сцены и собираем SDXL prompt...',
      });

      const locationPrompt = await generateText({
        operation: 'scene_location_prompt',
        prompt,
        systemPrompt: SCENE_LOCATION_PROMPT_SYSTEM_PROMPT,
        model: sceneNode.selectedModel || outputNode.selectedModel || MISTRAL_MODELS[0],
        sceneLabel: sceneNode.label,
      }, controller.signal, generationSettings);

      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: true,
        loadingProvider: imageGenerationSettings.provider,
        assetPrompt: locationPrompt,
        productionStatus: 'in_production',
        statusMessage: 'Генерируем фон локации без персонажей...',
      });

      const imageUrl = await generateImage(
        locationPrompt,
        sceneNode.imagePipeline ?? 'sdxl',
        imageGenerationSettings,
        'scene_location',
        controller.signal,
      );
      upsertImageNode(sceneNodeId, imageUrl, 'Локация', 'scene_location', 0, locationPrompt, prompt);
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
      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [generationSettings, imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

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
        statusMessage: 'Выбираем героев сцены и собираем SDXL prompt...',
      });

      const characterPrompt = await generateText({
        operation: 'scene_character_layer_prompt',
        prompt,
        systemPrompt: SCENE_CHARACTER_LAYER_PROMPT_SYSTEM_PROMPT,
        model: sceneNode.selectedModel || outputNode.selectedModel || MISTRAL_MODELS[0],
        sceneLabel: sceneNode.label,
      }, controller.signal, generationSettings);

      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: true,
        loadingProvider: imageGenerationSettings.provider,
        statusMessage: 'Генерируем слой персонажей на чистом фоне...',
      });

      const imageUrl = await generateImage(
        characterPrompt,
        sceneNode.imagePipeline ?? 'sdxl',
        imageGenerationSettings,
        'scene_characters',
        controller.signal,
      );
      upsertImageNode(sceneNodeId, imageUrl, 'Персонажи', 'scene_characters', 1, characterPrompt, prompt);
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
    pipeline: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose'> = 'flux2_compose',
  ) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoading || sceneNode.isLoadingImage) return;

    const locationNode = Object.values(currentNodes).find((node) =>
      node.parentId === sceneNodeId
      && node.nodeType === 'pollinations_image'
      && getAssetKind(node) === 'scene_location'
      && Boolean(node.imageUrl));
    const characterAssets = Object.values(currentNodes).filter((node) =>
      node.nodeType === 'pollinations_image'
      && getAssetKind(node).startsWith('character_asset')
      && Boolean(node.imageUrl));
    const referenceNode = characterAssets.find((node) => node.metadata?.isReference === true) ?? characterAssets[0];

    if (!locationNode?.imageUrl) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала сгенерируйте локацию этой сцены.' });
      return;
    }
    if (!referenceNode?.imageUrl) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала сгенерируйте или отметьте референс персонажа.' });
      return;
    }

    const isTurbo = pipeline === 'flux2_turbo_compose';
    const requestId = `flux2-compose:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    const sceneDescription = sceneNode.sceneText || sceneNode.inputValue || sceneNode.label;
    const referenceLabel = getReferenceLabel(referenceNode);
    const composePrompt = [
      `Use the first reference image as the background location plate for ${sceneNode.label}.`,
      `Use the second reference image as the character identity reference for ${referenceLabel}.`,
      'Create one coherent story frame: place the character naturally inside the location, matching perspective, scale, light direction, shadows, color palette, and painterly style.',
      'Preserve the character identity, clothing, body type, and face from the character reference. Preserve the architecture and mood from the location reference.',
      `Scene action: ${sceneDescription}`,
      'Do not create a character sheet, turnaround, lineup, text, watermark, UI, border, split-screen, or collage.',
    ].join(' ');
    const promptContext = [
      `Сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneDescription}`,
      `Локация-референс: ${locationNode.label}`,
      `Персонаж-референс: ${referenceNode.label}`,
    ].join('\n\n');

    try {
      updateNode(sceneNodeId, {
        isLoadingImage: true,
        loadingProvider: 'comfyui',
        pollinationsApiError: undefined,
        statusMessage: isTurbo
          ? 'Flux2 Turbo поставлен в очередь и собирает кадр на 8 шагах...'
          : 'Flux2 поставлен в очередь и собирает кадр из локации и референса...',
      });

      const imageUrl = await generateComfyFlux2ComposeImage(
        composePrompt,
        locationNode.imageUrl,
        referenceNode.imageUrl,
        pipeline,
        imageGenerationSettings,
        controller.signal,
      );
      upsertImageNode(sceneNodeId, imageUrl, isTurbo ? 'Кадр Flux2 Turbo' : 'Кадр Flux2', 'scene_flux2_frame', isTurbo ? 3 : 2, composePrompt, promptContext, {
        backgroundNodeId: Object.entries(currentNodes).find(([, node]) => node === locationNode)?.[0] ?? '',
        characterReferenceNodeId: Object.entries(currentNodes).find(([, node]) => node === referenceNode)?.[0] ?? '',
        imagePipeline: pipeline,
      });
      showNotice('success', `${isTurbo ? 'Flux2 Turbo' : 'Flux2'} собрал кадр для «${sceneNode.label}».`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Сборка кадра Flux2 отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(sceneNodeId, {
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

  const handleGenerateDetailAsset = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const description = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail' || detailNode.isLoading || detailNode.isLoadingImage) return;
    if (detailNode.label !== 'Герои' && detailNode.label !== 'Локации') return;
    if (!description) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте или заполните описание.' });
      return;
    }

    const requestId = `detail-asset:${detailNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    const isCharacters = detailNode.label === 'Герои';

    try {
      if (isCharacters) {
        const characterDescriptions = getCharacterDescriptions(description);
        setNodes((previousNodes) => {
          const nextNodes = { ...previousNodes };
          Object.entries(previousNodes).forEach(([nodeId, node]) => {
            const assetKind = typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';
            if (
              node.parentId === detailNodeId
              && node.nodeType === 'pollinations_image'
              && assetKind.startsWith('character_asset')
            ) {
              if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
              delete nextNodes[nodeId];
            }
          });
          return nextNodes;
        });

        const generatedPrompts: string[] = [];
        for (let index = 0; index < characterDescriptions.length; index += 1) {
          const characterDescription = characterDescriptions[index];
          const characterName = getCharacterName(characterDescription, index);
          updateNode(detailNodeId, {
            isLoading: true,
            loadingProvider: generationSettings.mode,
            error: undefined,
            pollinationsApiError: undefined,
            statusMessage: `Собираем prompt персонажа ${index + 1}/${characterDescriptions.length}: ${characterName}`,
          });

          const assetPrompt = await generateText({
            operation: 'character_asset_prompt',
            prompt: characterDescription,
            systemPrompt: CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT,
            model: detailNode.selectedModel || MISTRAL_MODELS[0],
          }, controller.signal, generationSettings);
          generatedPrompts.push(`${characterName}\n${assetPrompt}`);

          updateNode(detailNodeId, {
            isLoading: false,
            isLoadingImage: true,
            loadingProvider: imageGenerationSettings.provider,
            assetPrompt: generatedPrompts.join('\n\n'),
            statusMessage: `Генерируем референс ${index + 1}/${characterDescriptions.length}: ${characterName}`,
          });

          const imageUrl = await generateImage(
            assetPrompt,
            detailNode.imagePipeline ?? 'sdxl',
            imageGenerationSettings,
            'character_asset',
            controller.signal,
          );
          upsertImageNode(
            detailNodeId,
            imageUrl,
            `Ассет ${index + 1} · ${characterName}`,
            `character_asset:${index}`,
            index,
            assetPrompt,
            characterDescription,
          );
        }

        showNotice('success', `Создано референсов персонажей: ${characterDescriptions.length}.`);
        return;
      }

      updateNode(detailNodeId, {
        isLoading: true,
        loadingProvider: generationSettings.mode,
        error: undefined,
        pollinationsApiError: undefined,
        statusMessage: 'Собираем SDXL prompt для location sheet...',
      });

      const assetPrompt = await generateText({
        operation: 'location_asset_prompt',
        prompt: description,
        systemPrompt: LOCATION_ASSET_PROMPT_SYSTEM_PROMPT,
        model: detailNode.selectedModel || MISTRAL_MODELS[0],
      }, controller.signal, generationSettings);

      updateNode(detailNodeId, {
        isLoading: false,
        isLoadingImage: true,
        loadingProvider: imageGenerationSettings.provider,
        assetPrompt,
        statusMessage: 'Генерируем лист локаций...',
      });

      const imageUrl = await generateImage(
        assetPrompt,
        detailNode.imagePipeline ?? 'sdxl',
        imageGenerationSettings,
        'location_asset',
        controller.signal,
      );
      upsertImageNode(
        detailNodeId,
        imageUrl,
        'Ассет',
        'location_asset',
        0,
        assetPrompt,
        description,
      );
      showNotice('success', 'Ассет локаций создан.');
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
  }, [generationSettings, imageGenerationSettings, setNodes, showNotice, updateNode, upsertImageNode]);

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
    const revisedScenario = await requestText(detailNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(revisedBrief, nodesRef.current),
      systemPrompt: scenarioSystemPrompt,
      model,
      sceneCount,
    }, `Редактура луп: пересобираем ${sceneCount} сцен...`, true);
    if (!revisedScenario) return;

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
  }, [requestText, setNodes, showNotice, updateNode]);

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
      return {
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
            cleanedAt: new Date().toISOString(),
          },
        },
      };
    });
    showNotice('success', 'TTS-текст подготовлен.');
  }, [requestText, setNodes, showNotice, updateNode]);

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
        parentNode.masterPrompt,
        parentNode.imagePipeline ?? 'sdxl',
        imageGenerationSettings,
        'default',
        controller.signal,
      );
      upsertImageNode(parentNodeId, imageUrl, 'Кадр', 'scene_frame', 0, parentNode.masterPrompt, parentNode.inputValue ?? '');
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

    updateNode(nodeId, {
      isLoadingImage: true,
      loadingProvider: imageGenerationSettings.provider,
      pollinationsApiError: undefined,
      statusMessage: 'Перегенерируем с новым seed...',
    });

    try {
      const assetKind = getAssetKind(node);
      let imageUrl: string;
      if (assetKind === 'scene_flux2_frame') {
        const backgroundNodeId = typeof node.metadata?.backgroundNodeId === 'string' ? node.metadata.backgroundNodeId : '';
        const characterReferenceNodeId = typeof node.metadata?.characterReferenceNodeId === 'string' ? node.metadata.characterReferenceNodeId : '';
        const backgroundNode = nodesRef.current[backgroundNodeId];
        const characterNode = nodesRef.current[characterReferenceNodeId];
        if (!backgroundNode?.imageUrl || !characterNode?.imageUrl) {
          throw new Error('Не найдены исходная локация или персонаж для повторной сборки Flux2.');
        }
        const composePipeline = node.imagePipeline === 'flux2_turbo_compose' ? 'flux2_turbo_compose' : 'flux2_compose';
        imageUrl = await generateComfyFlux2ComposeImage(
          prompt,
          backgroundNode.imageUrl,
          characterNode.imageUrl,
          composePipeline,
          imageGenerationSettings,
          controller.signal,
        );
      } else {
        imageUrl = await generateImage(
          prompt,
          node.imagePipeline ?? 'sdxl',
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
            isLoadingImage: false,
            loadingProvider: undefined,
            pollinationsApiError: undefined,
            statusMessage: undefined,
            metadata: {
              ...currentNode.metadata,
              imageProvider: imageGenerationSettings.provider,
              imagePipeline: assetKind === 'scene_flux2_frame'
                ? currentNode.imagePipeline === 'flux2_turbo_compose' ? 'flux2_turbo_compose' : 'flux2_compose'
                : currentNode.imagePipeline ?? 'sdxl',
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
      const isReference = node.metadata?.isReference === true;
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

  const handleCancelGeneration = useCallback((nodeId: string) => {
    activeRequests.current.get(nodeId)?.abort();
    activeRequests.current.get(`image:${nodeId}`)?.abort();
    activeRequests.current.get(`reroll-image:${nodeId}`)?.abort();
    activeRequests.current.get(`flux2-compose:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-location:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-characters:${nodeId}`)?.abort();
    activeRequests.current.get(`detail-asset:${nodeId}`)?.abort();
    updateNode(nodeId, {
      isLoading: false,
      isLoadingImage: false,
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
    handleModelChange,
    handleImagePipelineChange,
    handleSceneCountChange,
    handleContinueAssociation,
    handleScriptVisualization,
    handleBuildScenarioFromBrief,
    handleAutoBuildChapter,
    handleEnsureStoryReferenceNodes,
    handleScenarioDetailClick,
    handleCreateSceneNodes,
    handleGenerateScenePrompt,
    handleGenerateSceneLocationAsset,
    handleGenerateSceneCharacterLayer,
    handleComposeSceneFlux2,
    handleGenerateDetailAsset,
    handleEditNarration,
    handleNarrationEditorialLoop,
    handlePrepareNarrationTts,
    handleCopyToClipboard,
    handleGeneratePollinationsImage,
    handleRegenerateImageNode,
    handleToggleReferenceImage,
    handleCancelGeneration,
  };
};
