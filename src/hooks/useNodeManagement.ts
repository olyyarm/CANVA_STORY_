import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { generateText, GenerationSettings } from '../api';
import {
  ASSOCIATE_SYSTEM_PROMPT,
  HERO_DETAIL_SYSTEM_PROMPT,
  LOCATION_DETAIL_SYSTEM_PROMPT,
  MISTRAL_MODELS,
  MOOD_DETAIL_SYSTEM_PROMPT,
  SCENARIO_SYSTEM_PROMPT,
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
  handleSceneCountChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  handleContinueAssociation: (sourceNodeId: string) => Promise<void>;
  handleScriptVisualization: (sourceNodeId: string) => Promise<void>;
  handleScenarioDetailClick: (sourceNodeId: string, detailType: DetailType) => Promise<void>;
  handleCreateSceneNodes: (sourceNodeId: string) => void;
  handleGenerateScenePrompt: (sceneNodeId: string) => Promise<void>;
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

const mockImageUrl = (label: string) => {
  const safeLabel = label.replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#20242b"/><stop offset="1" stop-color="#111317"/></linearGradient></defs><rect width="800" height="480" fill="url(#g)"/><circle cx="620" cy="110" r="150" fill="#d9873d" opacity=".18"/><path d="M0 365L180 220L310 330L470 190L800 400V480H0Z" fill="#303640"/><text x="48" y="70" fill="#f0f2f5" font-family="Arial" font-size="28">${safeLabel}</text><text x="48" y="108" fill="#aeb5bf" font-family="Arial" font-size="18">Тестовый кадр · изображение не сохраняется в проект</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const useNodeManagement = (
  initialNodes: NodesState,
  generationSettings: GenerationSettings,
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
    updateNode(nodeId, { isLoading: true, error: undefined, statusMessage });

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
      updateNode(nodeId, { isLoading: false, statusMessage: undefined });
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

  const upsertImageNode = useCallback((parentNodeId: string, imageUrl: string) => {
    setNodes((previousNodes) => {
      const parentNode = previousNodes[parentNodeId];
      if (!parentNode) return previousNodes;
      const existing = getExistingChild(
        previousNodes,
        parentNodeId,
        (node) => node.nodeType === 'pollinations_image',
      );
      if (existing?.[1].imageUrl?.startsWith('blob:')) URL.revokeObjectURL(existing[1].imageUrl);
      const imageNodeId = existing?.[0] ?? generateNodeId();
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
          label: `Кадр · ${parentNode.label}`,
          x: existing?.[1].x ?? parentNode.x + ((parentNode.width ?? 320) + 28) * 2,
          y: existing?.[1].y ?? parentNode.y,
          width: existing?.[1].width ?? 320,
          height: existing?.[1].height ?? 220,
          parentId: parentNodeId,
          imageUrl,
          level: (parentNode.level ?? 0) + 1,
        },
      };
    });
  }, [setNodes]);

  const handleGeneratePollinationsImage = useCallback(async (parentNodeId: string) => {
    const parentNode = nodesRef.current[parentNodeId];
    if (!parentNode?.masterPrompt || parentNode.isLoadingImage) return;
    const requestId = `image:${parentNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    updateNode(parentNodeId, { isLoadingImage: true, pollinationsApiError: undefined });

    try {
      if (generationSettings.mode === 'mock') {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 350);
          controller.signal.addEventListener('abort', () => {
            window.clearTimeout(timer);
            reject(new DOMException('Запрос отменён', 'AbortError'));
          }, { once: true });
        });
        upsertImageNode(parentNodeId, mockImageUrl(parentNode.label));
      } else {
        const width = 1280;
        const height = 768;
        const encodedPrompt = encodeURIComponent(parentNode.masterPrompt);
        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=0&nologo=true&enhance=1&private=1`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Сервис изображений вернул ошибку ${response.status}.`);
        const blob = await response.blob();
        upsertImageNode(parentNodeId, URL.createObjectURL(blob));
      }
      showNotice('success', 'Кадр создан. Он не включается в localStorage и JSON проекта.');
    } catch (error) {
      if (!isAbortError(error)) {
        const message = errorMessage(error);
        updateNode(parentNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(parentNodeId, { isLoadingImage: false });
    }
  }, [generationSettings.mode, showNotice, updateNode, upsertImageNode]);

  const handleCancelGeneration = useCallback((nodeId: string) => {
    activeRequests.current.get(nodeId)?.abort();
    activeRequests.current.get(`image:${nodeId}`)?.abort();
  }, []);

  return {
    nodes,
    setNodes,
    notice,
    clearNotice,
    handleInputChange,
    handleThemeInputChange,
    handleModelChange,
    handleSceneCountChange,
    handleContinueAssociation,
    handleScriptVisualization,
    handleScenarioDetailClick,
    handleCreateSceneNodes,
    handleGenerateScenePrompt,
    handleCopyToClipboard,
    handleGeneratePollinationsImage,
    handleCancelGeneration,
  };
};
