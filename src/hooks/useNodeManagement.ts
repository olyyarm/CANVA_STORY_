import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { generateImage, generateText, GenerationSettings, ImageGenerationSettings } from '../api';
import {
  ASSOCIATE_SYSTEM_PROMPT,
  CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT,
  HERO_DETAIL_SYSTEM_PROMPT,
  LOCATION_ASSET_PROMPT_SYSTEM_PROMPT,
  LOCATION_DETAIL_SYSTEM_PROMPT,
  MISTRAL_MODELS,
  MOOD_DETAIL_SYSTEM_PROMPT,
  SCENARIO_SYSTEM_PROMPT,
  SCENE_CHARACTER_LAYER_PROMPT_SYSTEM_PROMPT,
  SCENE_LOCATION_PROMPT_SYSTEM_PROMPT,
  SCENE_MASTER_PROMPT_SYSTEM_PROMPT,
} from '../constants';
import {
  AppNotice,
  DetailType,
  GenerationOperation,
  GenerationRequest,
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
  handleScenarioDetailClick: (sourceNodeId: string, detailType: DetailType) => Promise<void>;
  handleCreateSceneNodes: (sourceNodeId: string) => void;
  handleGenerateScenePrompt: (sceneNodeId: string) => Promise<void>;
  handleGenerateSceneLocationAsset: (sceneNodeId: string) => Promise<void>;
  handleGenerateSceneCharacterLayer: (sceneNodeId: string) => Promise<void>;
  handleGenerateDetailAsset: (detailNodeId: string) => Promise<void>;
  handleCopyToClipboard: (textToCopy: string) => Promise<void>;
  handleGeneratePollinationsImage: (nodeId: string) => Promise<void>;
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
};

const getExistingChild = (nodes: NodesState, parentId: string, predicate: (node: NodeData) => boolean) =>
  Object.entries(nodes).find(([, node]) => node.parentId === parentId && predicate(node));

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

const upsertScenarioGraph = (
  previousNodes: NodesState,
  sourceNodeId: string,
  generatedContent: string,
  requestedSceneCount: number,
) => {
  const sourceNode = previousNodes[sourceNodeId];
  if (!sourceNode) return previousNodes;

  const existingOutput = getExistingChild(
    previousNodes,
    sourceNodeId,
    (node) => node.nodeType === 'script_output',
  );
  const outputNodeId = existingOutput?.[0] ?? generateNodeId();
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
  ) => {
    if (activeRequests.current.has(nodeId) || nodesRef.current[nodeId]?.isLoading) return null;
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
      prompt: script,
      systemPrompt,
      model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount,
    }, `Разбиваем историю на ${sceneCount} сцен…`);
    if (!result) return;

    setNodes((previousNodes) => upsertScenarioGraph(previousNodes, sourceNodeId, result, sceneCount));
    showNotice('success', `Сценарий и ${parseSceneBlocks(result, sceneCount).length} сцен готовы.`);
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleScenarioDetailClick = useCallback(async (sourceNodeId: string, detailType: DetailType) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    if (!sourceNode?.inputValue || sourceNode.isLoading) return;
    const config = detailConfig[detailType];
    const result = await requestText(sourceNodeId, {
      operation: config.operation,
      prompt: sourceNode.inputValue,
      systemPrompt: config.systemPrompt,
      model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount: sourceNode.sceneCount,
    }, `Готовим раздел «${config.label}»…`);
    if (!result) return;

    setNodes((previousNodes) => {
      const currentSource = previousNodes[sourceNodeId];
      if (!currentSource) return previousNodes;
      const existing = getExistingChild(
        previousNodes,
        sourceNodeId,
        (node) => node.nodeType === 'script_detail' && node.label === config.label,
      );
      const nodeId = existing?.[0] ?? generateNodeId();
      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'script_detail',
          x: existing?.[1].x ?? currentSource.x + config.column * 326,
          y: existing?.[1].y ?? currentSource.y + (currentSource.height ?? 390) + 36,
          label: config.label,
          width: existing?.[1].width ?? 302,
          height: existing?.[1].height ?? 280,
          isGenerated: true,
          level: (currentSource.level ?? 0) + 1,
          parentId: sourceNodeId,
          inputValue: result,
          error: undefined,
        },
      };
    });
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
      updateNode(detailNodeId, {
        isLoading: true,
        loadingProvider: generationSettings.mode,
        error: undefined,
        pollinationsApiError: undefined,
        statusMessage: isCharacters
          ? 'Собираем SDXL prompt для character sheet...'
          : 'Собираем SDXL prompt для location sheet...',
      });

      const assetPrompt = await generateText({
        operation: isCharacters ? 'character_asset_prompt' : 'location_asset_prompt',
        prompt: description,
        systemPrompt: isCharacters ? CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT : LOCATION_ASSET_PROMPT_SYSTEM_PROMPT,
        model: detailNode.selectedModel || MISTRAL_MODELS[0],
      }, controller.signal, generationSettings);

      updateNode(detailNodeId, {
        isLoading: false,
        isLoadingImage: true,
        loadingProvider: imageGenerationSettings.provider,
        assetPrompt,
        statusMessage: isCharacters
          ? 'Генерируем персонажей в полный рост...'
          : 'Генерируем лист локаций...',
      });

      const imageUrl = await generateImage(
        assetPrompt,
        detailNode.imagePipeline ?? 'sdxl',
        imageGenerationSettings,
        isCharacters ? 'character_asset' : 'location_asset',
        controller.signal,
      );
      upsertImageNode(
        detailNodeId,
        imageUrl,
        'Ассет',
        isCharacters ? 'character_asset' : 'location_asset',
        0,
        assetPrompt,
        description,
      );
      showNotice('success', isCharacters ? 'Ассет героев создан.' : 'Ассет локаций создан.');
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
  }, [generationSettings, imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

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

  const handleCancelGeneration = useCallback((nodeId: string) => {
    activeRequests.current.get(nodeId)?.abort();
    activeRequests.current.get(`image:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-location:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-characters:${nodeId}`)?.abort();
    activeRequests.current.get(`detail-asset:${nodeId}`)?.abort();
  }, []);

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
    handleScenarioDetailClick,
    handleCreateSceneNodes,
    handleGenerateScenePrompt,
    handleGenerateSceneLocationAsset,
    handleGenerateSceneCharacterLayer,
    handleGenerateDetailAsset,
    handleCopyToClipboard,
    handleGeneratePollinationsImage,
    handleCancelGeneration,
  };
};
