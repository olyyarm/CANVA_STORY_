import React from 'react';
import { ImageProvider } from '../api';
import { getNewCharacterDescriptions } from '../characterRegistry';
import { DetailType, ImagePipeline, NodeData, NodesState } from '../types';
import { assetPath, getNodeIcon } from '../utils';

interface NodeRendererProps {
  id: string;
  node: NodeData;
  allNodes: NodesState;
  selected?: boolean;
  pendingOutputNodeId?: string | null;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>, nodeId: string) => void;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onThemeInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onSystemPromptChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onPromptContextChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onPromptKnowledgeChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onPromptMemoryChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onPromptTemplateChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onRunPromptNode: (nodeId: string) => Promise<void>;
  onSplitModeChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  onSplitSeparatorChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  onArrayPathChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  onRunSplitNode: (nodeId: string) => void;
  onCreatePromptNode: (sourceNodeId?: string) => void;
  onCreateSceneWriterPromptNode: (sourceNodeId?: string) => void;
  onCreateSplitNode: (sourceNodeId?: string) => void;
  onAssemblePromptResultScenario: (nodeId: string) => Promise<void>;
  onStartOutputConnection: (nodeId: string) => void;
  onConnectInput: (nodeId: string) => void;
  onTogglePromptSnippet: (nodeId: string) => void;
  onModelChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  onImagePipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  onTimelineAssetPipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  onTimelineSystemInsertPipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  onSceneCountChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  onContinueAssociation: (nodeId: string) => void;
  onScriptVisualize: (nodeId: string) => void;
  onBuildScenarioFromBrief: (nodeId: string) => Promise<void>;
  onImportReferenceFile: (nodeId: string, file: File) => Promise<void>;
  onExtractChapterTopic: (nodeId: string) => Promise<void>;
  onPlanChapters: (nodeId: string) => Promise<void>;
  onCreateChapterPlanNodes: (nodeId: string) => void;
  onBuildChapterKnowledge: (nodeId: string) => Promise<void>;
  onBuildSeasonSkeleton: (nodeId: string) => Promise<void>;
  onBuildChapterMaterial: (nodeId: string) => Promise<void>;
  onAutoBuildChapter: (nodeId: string) => Promise<void>;
  onEnsureChapterTimeline: (sourceNodeId?: string) => void;
  onScenarioDetailClick: (nodeId: string, detailType: DetailType) => void;
  onCreateSceneNodes: (nodeId: string) => void;
  onBuildCharacterMemory: (nodeId: string) => Promise<void>;
  onBuildSceneDialogue: (nodeId: string) => Promise<void>;
  onGenerateSceneLocationAsset: (nodeId: string, pipelineOverride?: ImagePipeline, modelOverride?: string) => Promise<void>;
  onComposeSceneFlux2: (nodeId: string, pipeline?: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose' | 'nano_banana_2_lite_compose'>) => Promise<void>;
  onGenerateDetailAsset: (nodeId: string, pipelineOverride?: ImagePipeline, modelOverride?: string) => Promise<void>;
  onEditNarration: (nodeId: string) => Promise<void>;
  onStoryStructureEdit: (nodeId: string) => Promise<void>;
  onNarrationEditorialLoop: (nodeId: string) => Promise<void>;
  onPrepareNarrationTts: (nodeId: string) => Promise<void>;
  onSpeakNarration: (nodeId: string) => void;
  onStopSpeech: () => void;
  onGenerateOmniVoiceNarration: (nodeId: string) => Promise<void>;
  onGenerateSceneOmniVoiceNarration: (nodeId: string) => Promise<void>;
  onBuildSceneVideoClip: (nodeId: string) => Promise<void>;
  onGenerateChapterBackdrop: (nodeId: string) => Promise<void>;
  onGenerateTimelineMissingAssets: (nodeId: string) => Promise<void>;
  onBuildChapterSceneClips: (nodeId: string) => Promise<void>;
  onBuildChapterVideo: (nodeId: string) => Promise<void>;
  onBuildSeasonVideo: (nodeId: string) => Promise<void>;
  onCopyToClipboard: (text: string) => void;
  onRegenerateImageNode: (nodeId: string) => Promise<void>;
  onToggleReferenceImage: (nodeId: string) => void;
  onSetCharacterCanonicalAsset: (nodeId: string) => void;
  textModelOptions: string[];
  imageProvider: ImageProvider;
  onCancelGeneration: (nodeId: string) => void;
  focusChainExpanded?: boolean;
  onToggleFocusChain?: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onResizeMouseDown?: (event: React.MouseEvent<HTMLButtonElement>, nodeId: string) => void;
}

const detailButtons: Array<{ type: DetailType; label: string }> = [
  { type: 'герои', label: 'Герои' },
  { type: 'локации', label: 'Локации' },
  { type: 'настроение', label: 'Настроение' },
  { type: 'закадр', label: 'Закадр' },
  { type: 'система', label: 'Система' },
];

const countDetailRows = (value?: string) =>
  value
    ?.split(/\n+/)
    .map((line) => line.trim())
    .filter((line) =>
      line.length > 0
      && !/^(герои|персонажи|список персонажей|итог|вывод)\s*[:.]?$/iu.test(line)
      && !/^персонажи не выявлены\b/iu.test(line))
    .length ?? 0;

const getModelOptions = (options: string[]) => {
  const cleanOptions = options.map((model) => model.trim()).filter(Boolean);
  return cleanOptions.length > 0 ? cleanOptions : ['local-model'];
};

const getAssetKind = (node: NodeData) =>
  typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';

const isDefaultReferenceImage = (node: NodeData) =>
  node.metadata?.isReference === true
  || (getAssetKind(node).startsWith('character_asset') && node.metadata?.isReference !== false);

const getSceneNumberFromLabel = (label: string) => {
  const match = label.match(/\d+/u);
  return match ? Number(match[0]) : 0;
};

const getChapterNumberFromNode = (node: NodeData) => {
  const sourceLabel = typeof node.metadata?.sourceLabel === 'string' ? node.metadata.sourceLabel : '';
  const match = `${node.label}\n${sourceLabel}`.match(/(?:глава|гл\.?)\s*0*(\d+)/iu);
  return match ? Number(match[1]) : null;
};

const getChapterCollectorEntries = (nodes: NodesState) =>
  Object.entries(nodes)
    .filter(([, candidate]) => candidate.nodeType === 'chapter_timeline')
    .map(([timelineId, timeline]) => {
      const videoEntry = Object.entries(nodes).find(([, candidate]) =>
        candidate.nodeType === 'video_output'
        && candidate.parentId === timelineId
        && Boolean(candidate.videoUrl));
      return {
        timelineId,
        timeline,
        chapterNumber: getChapterNumberFromNode(timeline),
        videoNode: videoEntry?.[1],
      };
    })
    .sort((first, second) =>
      (first.chapterNumber ?? Number.MAX_SAFE_INTEGER) - (second.chapterNumber ?? Number.MAX_SAFE_INTEGER)
      || first.timeline.label.localeCompare(second.timeline.label, 'ru', { numeric: true }));

const findSceneImageNode = (nodes: NodesState, sceneId: string, assetKinds: string[]) =>
  Object.values(nodes)
    .filter((candidate) =>
      candidate.nodeType === 'pollinations_image'
      && candidate.parentId === sceneId
      && typeof candidate.metadata?.assetKind === 'string'
      && assetKinds.includes(candidate.metadata.assetKind))
    .sort((first, second) =>
      assetKinds.indexOf(String(first.metadata?.assetKind))
      - assetKinds.indexOf(String(second.metadata?.assetKind)))[0];

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

const getTimelineScope = (nodes: NodesState, timelineNode: NodeData) => {
  const sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
    ? timelineNode.metadata.sourceScenarioId
    : timelineNode.parentId ?? '';
  const sourceChapterId = typeof timelineNode.metadata?.sourceChapterId === 'string'
    ? timelineNode.metadata.sourceChapterId
    : '';
  const rootIds = [sourceScenarioId, sourceChapterId].filter((nodeId, index, ids) =>
    Boolean(nodeId) && ids.indexOf(nodeId) === index);
  const scopedIds = new Set(rootIds);
  rootIds.forEach((rootId) => {
    getDescendantNodeIds(nodes, rootId).forEach((nodeId) => scopedIds.add(nodeId));
  });
  return { sourceScenarioId, sourceChapterId, scopedIds, hasScope: rootIds.length > 0 };
};

const findSystemInsertImageNode = (nodes: NodesState, sceneNumber: number, scopedIds?: Set<string>) =>
  Object.entries(nodes)
    .filter(([candidateId, candidate]) => {
      if (candidate.nodeType !== 'pollinations_image') return false;
      if (scopedIds && scopedIds.size > 0 && !scopedIds.has(candidateId)) return false;
      const assetKind = getAssetKind(candidate);
      const labelMatch = candidate.label.match(/Системная вставка\s+(\d+)(?:[.,]\d+)?/iu);
      const labelSceneNumber = labelMatch ? Number(labelMatch[1]) : null;
      return assetKind.startsWith(`system_insert:${sceneNumber}:`) || labelSceneNumber === sceneNumber;
    })
    .map(([, candidate]) => candidate)
    .sort((first, second) => first.label.localeCompare(second.label, 'ru', { numeric: true }))[0];

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

const getLocationAssetIndex = (node: NodeData) => {
  const match = getAssetKind(node).match(/^location_asset:(\d+)$/u);
  return match ? Number(match[1]) : null;
};

const getLocationDescriptions = (locationsText: string) =>
  locationsText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

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

  getMeaningfulTokens([node.label, node.masterPrompt ?? '', node.assetPrompt ?? ''].join('\n')).forEach((token) => {
    if (sceneTokens.has(token)) score += 4;
  });

  return score;
};

const findTimelineLocationNode = (nodes: NodesState, sceneId: string, scene: NodeData) => {
  const sceneLocation = findSceneImageNode(nodes, sceneId, ['scene_location']);
  if (sceneLocation) return sceneLocation;

  const locationAssets = Object.values(nodes).filter((node) =>
    node.nodeType === 'pollinations_image'
    && getAssetKind(node).startsWith('location_asset')
    && Boolean(node.imageUrl)
    && (!scene.parentId || nodes[node.parentId ?? '']?.parentId === scene.parentId));

  if (locationAssets.length === 1) return locationAssets[0];

  const sceneDescription = scene.sceneText || scene.inputValue || scene.label;
  const sceneNumber = getSceneNumberFromLabel(scene.label);
  const scoredLocationAssets = locationAssets
    .map((node) => {
      const locationDetail = nodes[node.parentId ?? ''];
      const locationDescriptions = getLocationDescriptions(locationDetail?.inputValue ?? '');
      const assetIndex = getLocationAssetIndex(node);
      const locationDescription = assetIndex === null ? '' : locationDescriptions[assetIndex] ?? '';
      return { node, score: scoreLocationReferenceMatch(node, sceneDescription, locationDescription, sceneNumber) };
    })
    .sort((left, right) => right.score - left.score);

  return scoredLocationAssets.find(({ score }) => score >= 20)?.node
    ?? scoredLocationAssets[0]?.node;
};

const getTimelineScenes = (nodes: NodesState, timelineNode: NodeData) => {
  const timelineScope = getTimelineScope(nodes, timelineNode);
  const sceneEntries = Object.entries(nodes)
    .filter(([, candidate]) =>
      candidate.nodeType === 'scene'
      && (!timelineScope.hasScope || timelineScope.scopedIds.has(candidate.parentId ?? '')));

  return sceneEntries.length > 0 || timelineScope.hasScope
    ? sceneEntries
    : Object.entries(nodes).filter(([, candidate]) => candidate.nodeType === 'scene');
};

const getSortedTimelineScenes = (nodes: NodesState, timelineNode: NodeData) => {
  const timelineScope = getTimelineScope(nodes, timelineNode);
  return getTimelineScenes(nodes, timelineNode)
    .sort(([, first], [, second]) =>
      getSceneNumberFromLabel(first.label) - getSceneNumberFromLabel(second.label)
      || first.label.localeCompare(second.label, 'ru', { numeric: true }))
    .map(([sceneId, scene]) => ({
      sceneId,
      scene,
      location: findTimelineLocationNode(nodes, sceneId, scene),
      characters: findSceneImageNode(nodes, sceneId, ['scene_characters']),
      frame: findSceneImageNode(nodes, sceneId, ['scene_flux2_frame', 'scene_frame']),
      systemFrame: findSystemInsertImageNode(nodes, getSceneNumberFromLabel(scene.label), timelineScope.scopedIds),
    }));
};

const getSystemInsertDetail = (nodes: NodesState, timelineNode: NodeData) => {
  const timelineScope = getTimelineScope(nodes, timelineNode);
  return Object.entries(nodes).find(([nodeId, candidate]) =>
    candidate.nodeType === 'script_detail'
    && candidate.label === 'Системные вставки'
    && (!timelineScope.hasScope || timelineScope.scopedIds.has(nodeId) || timelineScope.scopedIds.has(candidate.parentId ?? '')))?.[1];
};

const parseSystemInsertsByScene = (text = '') => {
  const inserts = new Map<number, string>();
  const matches = [...text.matchAll(/(?:^|\n)\s*После\s+сцены\s+(\d+)\s*:\s*([\s\S]*?)(?=\n\s*После\s+сцены\s+\d+\s*:|$)/giu)];
  matches.forEach((match) => {
    const sceneNumber = Number(match[1]);
    const body = match[2]?.trim();
    if (sceneNumber && body) inserts.set(sceneNumber, body);
  });
  return inserts;
};

const getRenderedNodeSize = (node: NodeData) => {
  const sourceKind = typeof node.metadata?.sourceKind === 'string' ? node.metadata.sourceKind : '';
  return {
    width: Math.max(
      node.width ?? 300,
      node.nodeType === 'prompt_node'
        ? 540
        : node.nodeType === 'split_node'
          ? 420
          : node.nodeType === 'character_registry'
            ? 440
            : node.nodeType === 'split_item'
            ? 420
            : node.nodeType === 'scene' ? 400 : sourceKind === 'chapter_plan' ? 440 : 0,
    ),
    height: Math.max(
      node.height ?? 220,
      node.nodeType === 'prompt_node'
        ? 760
        : node.nodeType === 'split_node'
          ? 340
          : node.nodeType === 'character_registry'
            ? 420
            : node.nodeType === 'split_item'
            ? 430
            : node.nodeType === 'scene' ? 520 : sourceKind === 'chapter_plan' ? 430 : 0,
    ),
  };
};

const NodeRenderer: React.FC<NodeRendererProps> = ({
  id,
  node,
  allNodes,
  selected = false,
  pendingOutputNodeId = null,
  onMouseDown,
  onInputChange,
  onThemeInputChange,
  onSystemPromptChange,
  onPromptContextChange,
  onPromptKnowledgeChange,
  onPromptMemoryChange,
  onPromptTemplateChange,
  onRunPromptNode,
  onSplitModeChange,
  onSplitSeparatorChange,
  onArrayPathChange,
  onRunSplitNode,
  onCreatePromptNode,
  onCreateSceneWriterPromptNode,
  onCreateSplitNode,
  onAssemblePromptResultScenario,
  onStartOutputConnection,
  onConnectInput,
  onTogglePromptSnippet,
  onModelChange,
  onImagePipelineChange,
  onTimelineAssetPipelineChange,
  onTimelineSystemInsertPipelineChange,
  onSceneCountChange,
  onContinueAssociation,
  onScriptVisualize,
  onBuildScenarioFromBrief,
  onImportReferenceFile,
  onExtractChapterTopic,
  onPlanChapters,
  onCreateChapterPlanNodes,
  onBuildChapterKnowledge,
  onBuildSeasonSkeleton,
  onBuildChapterMaterial,
  onAutoBuildChapter,
  onEnsureChapterTimeline,
  onScenarioDetailClick,
  onCreateSceneNodes,
  onBuildCharacterMemory,
  onBuildSceneDialogue,
  onGenerateSceneLocationAsset,
  onComposeSceneFlux2,
  onGenerateDetailAsset,
  onEditNarration,
  onStoryStructureEdit,
  onNarrationEditorialLoop,
  onPrepareNarrationTts,
  onSpeakNarration,
  onStopSpeech,
  onGenerateOmniVoiceNarration,
  onGenerateSceneOmniVoiceNarration,
  onBuildSceneVideoClip,
  onGenerateChapterBackdrop,
  onGenerateTimelineMissingAssets,
  onBuildChapterSceneClips,
  onBuildChapterVideo,
  onBuildSeasonVideo,
  onCopyToClipboard,
  onRegenerateImageNode,
  onToggleReferenceImage,
  onSetCharacterCanonicalAsset,
  textModelOptions,
  imageProvider,
  onCancelGeneration,
  focusChainExpanded = false,
  onToggleFocusChain,
  onDelete,
  onResizeMouseDown,
}) => {
  const [isImagePromptOpen, setImagePromptOpen] = React.useState(false);
  const stopMouseDown = (event: React.MouseEvent) => event.stopPropagation();
  const runWithoutDrag = (event: React.MouseEvent, action: () => void) => {
    event.stopPropagation();
    action();
  };
  const isTextOutput = node.nodeType === 'script_output' || node.nodeType === 'script_detail';
  const isSystemInsertDetail = node.nodeType === 'script_detail' && node.label === 'Системные вставки';
  const canGenerateDetailAsset = node.nodeType === 'script_detail'
    && (node.label === 'Герои' || node.label === 'Локации' || isSystemInsertDetail);
  const canBuildCharacterMemory = node.nodeType === 'script_detail' && node.label === 'Герои';
  const canBuildScenarioFromBrief = node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'brief_revision';
  const sourceKind = typeof node.metadata?.sourceKind === 'string' ? node.metadata.sourceKind : '';
  const canImportReferenceFile = node.nodeType === 'script_detail' && sourceKind === 'pdf_source';
  const canExtractChapterTopic = node.nodeType === 'script_detail' && sourceKind === 'pdf_source';
  const canPlanChapters = node.nodeType === 'script_detail' && sourceKind === 'chapter_planner';
  const canCreateChapterPlanNodes = node.nodeType === 'script_detail' && sourceKind === 'chapter_planner';
  const canBuildChapterKnowledge = node.nodeType === 'script_detail' && sourceKind === 'chapter_topic';
  const canBuildSeasonSkeleton = node.nodeType === 'script_detail' && sourceKind === 'chapter_knowledge';
  const canBuildChapterMaterial = node.nodeType === 'script_detail' && (sourceKind === 'season_skeleton' || sourceKind === 'chapter_plan');
  const isChapterPlanNode = sourceKind === 'chapter_plan';
  const isPromptSnippetNode = sourceKind === 'system_prompt_snippet';
  const canAutoBuildChapter = node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'chapter_material';
  const canSpeakNarration = node.nodeType === 'script_detail'
    && (node.label === 'Закадр' || node.metadata?.sourceKind === 'tts_cleanup');
  const isEditableReferenceNode = node.nodeType === 'script_detail'
    && (
      node.metadata?.sourceKind === 'format_bible'
      || node.metadata?.sourceKind === 'knowledge_base'
      || node.metadata?.sourceKind === 'season_memory'
      || node.metadata?.sourceKind === 'pdf_source'
      || node.metadata?.sourceKind === 'chapter_topic'
      || node.metadata?.sourceKind === 'chapter_planner'
      || node.metadata?.sourceKind === 'chapter_plan'
      || node.metadata?.sourceKind === 'chapter_knowledge'
      || node.metadata?.sourceKind === 'season_skeleton'
      || node.metadata?.sourceKind === 'chapter_material'
      || node.metadata?.sourceKind === 'chapter_facts'
      || node.metadata?.sourceKind === 'character_memory'
      || node.metadata?.sourceKind === 'scene_dialogue'
      || node.metadata?.sourceKind === 'system_prompt_snippet'
    );
  const detailRowCount = countDetailRows(node.inputValue);
  const newCharacterCount = node.nodeType === 'script_detail' && node.label === 'Ð“ÐµÑ€Ð¾Ð¸'
    ? getNewCharacterDescriptions(node.inputValue ?? '', allNodes).length
    : 0;
  const detailCharacterCount = node.nodeType === 'script_detail' && node.label === 'Ð“ÐµÑ€Ð¾Ð¸'
    ? newCharacterCount
    : detailRowCount;
  const detailImagePipelineValue = isSystemInsertDetail
    && node.imagePipeline === 'sdxl'
    && node.metadata?.imagePipeline === undefined
    ? 'ernie_image_turbo'
    : node.imagePipeline ?? (isSystemInsertDetail ? 'ernie_image_turbo' : 'z_image_turbo');
  const modelOptions = getModelOptions(textModelOptions);
  const selectedTextModel = node.selectedModel && modelOptions.includes(node.selectedModel)
    ? node.selectedModel
    : modelOptions[0];
  const isBusy = Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio || node.isLoadingVideo || node.isSpeaking);
  const showInlineModelSelect = (
    node.nodeType === 'script_output'
    || node.nodeType === 'scene'
    || node.nodeType === 'script_detail'
  ) && !canAutoBuildChapter && !isPromptSnippetNode;
  const canEditSystemPrompt = typeof node.systemPrompt === 'string'
    && node.nodeType !== 'pollinations_image'
    && node.nodeType !== 'prompt_node'
    && node.nodeType !== 'split_node'
    && node.nodeType !== 'split_item'
    && node.nodeType !== 'character_registry'
    && node.nodeType !== 'chapter_timeline'
    && node.nodeType !== 'video_output';
  const loadingLabel = node.isSpeaking
    ? 'Озвучиваем закадр...'
    : node.isLoadingAudio
      ? 'OmniVoice готовит озвучку в ComfyUI...'
      : node.isLoadingImage
      ? node.loadingProvider === 'comfyui'
        ? 'ComfyUI загружает модель или рендерит кадр...'
        : 'Pollinations создаёт кадр...'
      : node.loadingProvider === 'lmstudio'
        ? 'LM Studio загружает модель и готовит ответ...'
        : node.loadingProvider === 'comfygemini'
          ? 'ComfyUI отправляет текст в Gemini API...'
        : node.loadingProvider === 'mistral'
          ? 'Mistral API готовит ответ...'
          : node.loadingProvider === 'mock'
            ? 'Собираем тестовый ответ...'
            : 'Генерация идёт...';
  const visibleStatusMessage = node.statusMessage?.trim();
  const imagePrompt = node.nodeType === 'pollinations_image' ? node.masterPrompt?.trim() ?? '' : '';
  const promptContext = node.nodeType === 'pollinations_image' && typeof node.metadata?.promptContext === 'string'
    ? node.metadata.promptContext.trim()
    : '';
  const promptBundle = [
    imagePrompt ? `Image prompt:\n${imagePrompt}` : '',
    promptContext ? `\nРусский контекст:\n${promptContext}` : '',
  ].filter(Boolean).join('\n');
  const isReferenceImage = node.nodeType === 'pollinations_image' && isDefaultReferenceImage(node);
  const isCharacterAsset = node.nodeType === 'pollinations_image' && getAssetKind(node).startsWith('character_asset');
  const isCanonicalCharacterAsset = node.nodeType === 'pollinations_image' && node.metadata?.canonicalCharacter === true;
  const characterAssetPipelineValue = node.nodeType === 'pollinations_image'
    && (node.imagePipeline === 'z_image_turbo' || node.imagePipeline === 'ernie_image_turbo')
    ? node.imagePipeline
    : 'sdxl';
  const safeDownloadName = `${node.label.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'scene'}.webm`;
  const timelineScenes = node.nodeType === 'chapter_timeline' ? getSortedTimelineScenes(allNodes, node) : [];
  const timelineSystemInserts = node.nodeType === 'chapter_timeline'
    ? parseSystemInsertsByScene(getSystemInsertDetail(allNodes, node)?.inputValue)
    : new Map<number, string>();
  const timelineStats = {
    scenes: timelineScenes.length,
    locations: timelineScenes.filter(({ location }) => Boolean(location?.imageUrl)).length,
    characters: timelineScenes.filter(({ characters }) => Boolean(characters?.imageUrl)).length,
    frames: timelineScenes.filter(({ frame }) => Boolean(frame?.imageUrl)).length,
    audio: timelineScenes.filter(({ scene }) => Boolean(scene.audioUrl)).length,
    clips: timelineScenes.filter(({ scene }) => Boolean(scene.videoUrl)).length,
    inserts: timelineSystemInserts.size,
  };
  const timelineComposePipelineValue =
    node.nodeType === 'chapter_timeline'
    && (
      node.imagePipeline === 'flux2_compose'
      || node.imagePipeline === 'flux2_turbo_compose'
      || node.imagePipeline === 'nano_banana_2_lite_compose'
    )
      ? node.imagePipeline
      : 'nano_banana_2_lite_compose';
  const timelineAssetPipelineValue =
    node.nodeType === 'chapter_timeline'
    && (
      node.metadata?.timelineAssetPipeline === 'sdxl'
      || node.metadata?.timelineAssetPipeline === 'z_image_turbo'
      || node.metadata?.timelineAssetPipeline === 'ernie_image_turbo'
    )
      ? node.metadata.timelineAssetPipeline
      : 'z_image_turbo';
  const timelineSystemInsertPipelineValue =
    node.nodeType === 'chapter_timeline'
    && (
      node.metadata?.timelineSystemInsertPipeline === 'sdxl'
      || node.metadata?.timelineSystemInsertPipeline === 'z_image_turbo'
      || node.metadata?.timelineSystemInsertPipeline === 'ernie_image_turbo'
    )
      ? node.metadata.timelineSystemInsertPipeline
      : 'ernie_image_turbo';
  const chapterCollectorEntries = node.nodeType === 'chapter_collector'
    ? getChapterCollectorEntries(allNodes)
    : [];
  const chapterCollectorReadyCount = chapterCollectorEntries.filter((entry) => Boolean(entry.videoNode?.videoUrl)).length;
  const renderedNodeSize = getRenderedNodeSize(node);
  const isPendingOutput = pendingOutputNodeId === id;
  const canAcceptPendingOutput = Boolean(pendingOutputNodeId && pendingOutputNodeId !== id);
  const canToggleFocusChain = node.nodeType === 'split_item'
    && /^\s*(?:<<<SPLIT>>>\s*)?(?:ГЛАВА|CHAPTER)\b/iu.test(`${node.label}\n${node.inputValue ?? ''}`);

  const renderCopyButton = (text: string) => (
    <button
      type="button"
      className="node-icon-button node-copy-button"
      onMouseDown={stopMouseDown}
      onClick={(event) => runWithoutDrag(event, () => onCopyToClipboard(text))}
      aria-label="Копировать текст"
      title="Копировать текст"
    >
      <img src={assetPath('copy.svg')} alt="" />
    </button>
  );

  const renderModelSelect = (compact = true) => (
    <label className={`node-field${compact ? ' node-field--inline' : ''}`}>
      <span>Модель</span>
      <select
        value={selectedTextModel}
        onChange={(event) => onModelChange(event, id)}
        onMouseDown={stopMouseDown}
        disabled={node.isLoading}
      >
        {modelOptions.map((modelName) => (
          <option key={modelName} value={modelName}>{modelName}</option>
        ))}
      </select>
    </label>
  );

  const renderSystemPromptEditor = () => {
    if (!canEditSystemPrompt) return null;
    return (
      <details className="node-system-prompt" open={selected}>
        <summary onMouseDown={stopMouseDown}>Системный промпт</summary>
        <textarea
          value={node.systemPrompt ?? ''}
          onChange={(event) => onSystemPromptChange(event, id)}
          onMouseDown={stopMouseDown}
          placeholder="Инструкция, которую эта нода отправит модели..."
          disabled={node.isLoading}
        />
      </details>
    );
  };

  const renderTimelineBadge = (label: string, isReady: boolean, detail?: string) => (
    <span className={`chapter-timeline__badge${isReady ? ' chapter-timeline__badge--ready' : ''}`} title={detail}>
      <span>{label}</span>
      <strong>{isReady ? '✓' : '·'}</strong>
    </span>
  );

  return (
    <div
      id={`node-${id}`}
      className={`story-node story-node--${node.nodeType}${sourceKind ? ` story-node--source-${sourceKind}` : ''}${selected ? ' story-node--selected' : ''}${isBusy ? ' story-node--busy' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: renderedNodeSize.width,
        height: renderedNodeSize.height,
        zIndex: selected ? 1000 : (node.level ?? 1),
      }}
      onMouseDown={(event) => onMouseDown(event, id)}
      data-node-id={id}
    >
      <header className="story-node__header">
        <span className="story-node__icon" aria-hidden="true">
          <img src={getNodeIcon(node.nodeType, node.label)} alt="" />
        </span>
        <span className="story-node__title" title={node.label}>{node.label}</span>
        <span className="story-node__header-actions">
          {onToggleFocusChain && canToggleFocusChain && (
            <button
              type="button"
              className={`node-icon-button node-chain-button${focusChainExpanded ? ' node-chain-button--active' : ''}`}
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => onToggleFocusChain(id))}
              aria-label={focusChainExpanded ? 'Скрыть цепочку главы' : 'Показать цепочку главы'}
              title={focusChainExpanded ? 'Скрыть цепочку главы' : 'Показать цепочку главы'}
            >
              ◎
            </button>
          )}
          {node.nodeType === 'association' && node.canContinue && !node.isLoading && (
            <button
              type="button"
              className="node-icon-button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => onContinueAssociation(id))}
              aria-label="Показать ещё ассоциации"
              title="Показать ещё ассоциации"
            >
              +
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="node-icon-button node-delete-button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => onDelete(id))}
              aria-label={`Удалить «${node.label}»`}
              title="Удалить узел"
            >
              ×
            </button>
          )}
        </span>
      </header>

      <div className="story-node__body">
        {node.error && <div className="node-message node-message--error" role="alert">{node.error}</div>}
        {isBusy && (
          <div className="node-loading-message" role="status" aria-live="polite">
            <span className="node-loading-spinner" aria-hidden="true" />
            <span>{visibleStatusMessage || loadingLabel}</span>
          </div>
        )}
        {!isBusy && visibleStatusMessage && <div className="node-message">{visibleStatusMessage}</div>}

        {node.nodeType === 'text' && node.hasInput && (
          <>
            <textarea
              value={node.inputValue ?? ''}
              onChange={(event) => onInputChange(event, id)}
              onMouseDown={stopMouseDown}
              placeholder="Введите слово или образ…"
              aria-label="Слово для ассоциаций"
              disabled={node.isLoading}
            />
            <button
              type="button"
              className={`node-primary-button${node.isLoading ? ' node-primary-button--cancel' : ''}`}
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoading
                ? onCancelGeneration(id)
                : onContinueAssociation(id))}
            >
              {node.isLoading ? 'Отменить' : (node.buttonLabel ?? 'Ассоциации')}
            </button>
          </>
        )}

        {node.nodeType === 'script_input' && node.hasInput && (
          <>
            <label className="node-field node-field--grow">
              <span>Исходный сценарий</span>
              <textarea
                value={node.inputValue ?? ''}
                onChange={(event) => onInputChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="Опишите историю, действие или закадровый текст…"
                disabled={node.isLoading}
              />
            </label>
            <label className="node-field">
              <span>Стилистика <small>необязательно</small></span>
              <textarea
                className="node-textarea--compact"
                value={node.themeInputValue ?? ''}
                onChange={(event) => onThemeInputChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="Например: графический роман, дождливый неон…"
                disabled={node.isLoading}
              />
            </label>
            <div className="node-field-grid">
              <label className="node-field">
                <span>Сцен</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={node.sceneCount ?? 4}
                  onChange={(event) => onSceneCountChange(event, id)}
                  onMouseDown={stopMouseDown}
                  disabled={node.isLoading}
                />
              </label>
              {renderModelSelect(false)}
            </div>
            {node.statusMessage && <div className="node-message">{node.statusMessage}</div>}
            <button
              type="button"
              className={`node-primary-button${node.isLoading ? ' node-primary-button--cancel' : ''}`}
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoading
                ? onCancelGeneration(id)
                : onScriptVisualize(id))}
            >
              {node.isLoading ? 'Отменить генерацию' : (node.buttonLabel ?? 'Создать сцены')}
            </button>
          </>
        )}

        {node.nodeType === 'prompt_node' && (
          <>
            <div className="prompt-node-sockets" aria-label="Входы и выходы Prompt Node">
              <div className="prompt-node-socket-column">
                <span><i />TEXT</span>
                <span><i />CONTEXT</span>
                <span><i />KNOWLEDGE</span>
                <span><i />MEMORY</span>
              </div>
              <div className="prompt-node-socket-column prompt-node-socket-column--out">
                <button
                  type="button"
                  className={`node-socket-button node-socket-button--out${isPendingOutput ? ' node-socket-button--active' : ''}`}
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => onStartOutputConnection(id))}
                  title="Start connection from this RESULT"
                >
                  RESULT<i />
                </button>
              </div>
            </div>
            {renderModelSelect(false)}
            <label className="node-field">
              <span>TEXT <small>{node.parentId ? 'берётся из подключённой ноды, здесь можно дописать вручную' : 'ручной вход'}</small></span>
              <textarea
                className="node-textarea--compact"
                value={node.inputValue ?? ''}
                onChange={(event) => onInputChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="Ручной TEXT или заметка к подключённому результату..."
                disabled={node.isLoading}
              />
            </label>
            <label className="node-field">
              <span>CONTEXT</span>
              <textarea
                className="node-textarea--compact"
                value={node.promptContextValue ?? ''}
                onChange={(event) => onPromptContextChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="Дополнительный контекст..."
                disabled={node.isLoading}
              />
            </label>
            <div className="prompt-node-two-columns">
              <label className="node-field">
                <span>KNOWLEDGE</span>
                <textarea
                  className="node-textarea--compact"
                  value={node.promptKnowledgeValue ?? ''}
                  onChange={(event) => onPromptKnowledgeChange(event, id)}
                  onMouseDown={stopMouseDown}
                  placeholder="Факты, PDF-выжимка, база..."
                  disabled={node.isLoading}
                />
              </label>
              <label className="node-field">
                <span>MEMORY</span>
                <textarea
                  className="node-textarea--compact"
                  value={node.promptMemoryValue ?? ''}
                  onChange={(event) => onPromptMemoryChange(event, id)}
                  onMouseDown={stopMouseDown}
                  placeholder="Память сезона/главы..."
                  disabled={node.isLoading}
                />
              </label>
            </div>
            <details className="node-system-prompt" open>
              <summary>System Prompt</summary>
              <textarea
                value={node.systemPrompt ?? ''}
                onChange={(event) => onSystemPromptChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="Системная инструкция для этой Prompt Node..."
                disabled={node.isLoading}
              />
            </details>
            <label className="node-field">
              <span>User Prompt / template <small>можно использовать {'{{TEXT}}'}, {'{{CONTEXT}}'}, {'{{KNOWLEDGE}}'}, {'{{MEMORY}}'}</small></span>
              <textarea
                className="prompt-node-template"
                value={node.promptTemplateValue ?? ''}
                onChange={(event) => onPromptTemplateChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="Например: Сделай из TEXT план главы..."
                disabled={node.isLoading}
              />
            </label>
            <button
              type="button"
              className={`node-primary-button${node.isLoading ? ' node-primary-button--cancel' : ''}`}
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoading
                ? onCancelGeneration(id)
                : void onRunPromptNode(id))}
            >
              {node.isLoading ? 'Отменить' : 'Запустить Prompt Node'}
            </button>
            <label className="node-field prompt-node-result">
              <span>RESULT</span>
              <textarea
                value={node.promptResultValue ?? ''}
                readOnly
                onMouseDown={stopMouseDown}
                placeholder="Результат появится здесь и пойдёт в следующую Prompt Node..."
              />
            </label>
            {Boolean(node.promptResultValue?.trim()) && (
              <button
                type="button"
                className="node-secondary-button"
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => void onAssemblePromptResultScenario(id))}
                disabled={node.isLoading}
              >
                Автосбор сцен
              </button>
            )}
          </>
        )}

        {node.nodeType === 'split_node' && (
          <>
            <div className="split-node-sockets" aria-label="Вход и выход Split Node">
              <button
                type="button"
                className={`node-socket-button${canAcceptPendingOutput ? ' node-socket-button--accept' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => onConnectInput(id))}
                title="Connect selected RESULT to this Split Node"
              >
                <i />RESULT TEXT
              </button>
              <span>ITEMS<i /></span>
            </div>
            <label className="node-field node-field--inline">
              <span>Split mode</span>
              <select
                value={node.splitMode ?? 'json_path'}
                onChange={(event) => onSplitModeChange(event, id)}
                onMouseDown={stopMouseDown}
                disabled={node.isLoading}
              >
                <option value="separator">Separator</option>
                <option value="lines">Lines</option>
                <option value="json_path">JSON path</option>
              </select>
            </label>
            {node.splitMode !== 'json_path' && (
              <label className="node-field node-field--inline">
                <span>Separator</span>
                <input
                  value={node.splitSeparator ?? '<<<SPLIT>>>'}
                  onChange={(event) => onSplitSeparatorChange(event, id)}
                  onMouseDown={stopMouseDown}
                  placeholder="<<<SPLIT>>>"
                  disabled={node.isLoading || node.splitMode === 'lines'}
                />
              </label>
            )}
            {node.splitMode === 'json_path' && (
            <label className="node-field node-field--inline">
              <span>Array path</span>
              <input
                value={node.arrayPath ?? ''}
                onChange={(event) => onArrayPathChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="chapters"
                disabled={node.isLoading}
              />
            </label>
            )}
            <label className="node-field node-field--grow">
              <span>JSON fallback <small>если нет подключённого RESULT</small></span>
              <textarea
                value={node.inputValue ?? ''}
                onChange={(event) => onInputChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder='{"chapters":[{"id":"ch1","title":"Глава 1"}]}'
                disabled={node.isLoading}
              />
            </label>
            <button
              type="button"
              className="node-primary-button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => onRunSplitNode(id))}
            >
              Разделить массив
            </button>
          </>
        )}

        {node.nodeType === 'split_item' && (
          <>
            <label className="node-field node-field--grow">
              <span>Item data</span>
              <textarea
                value={node.inputValue ?? ''}
                readOnly
                onMouseDown={stopMouseDown}
              />
            </label>
            <div className="split-item-actions">
              <button
                type="button"
                className="node-primary-button split-item-actions__wide"
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => onCreateSceneWriterPromptNode(id))}
              >
                Scene Writer
              </button>
              <button
                type="button"
                className="node-secondary-button"
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => onCreatePromptNode(id))}
              >
                Prompt Node
              </button>
              <button
                type="button"
                className="node-secondary-button"
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => onCreateSplitNode(id))}
              >
                Split Node
              </button>
              <button
                type="button"
                className="node-secondary-button"
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => onEnsureChapterTimeline(id))}
              >
                Таймлайн
              </button>
            </div>
          </>
        )}

        {node.nodeType === 'character_registry' && (
          <>
            <div className="character-registry-sockets" aria-label="Character Registry">
              <span><i />CHARACTER IDS</span>
              <span>CANON<i /></span>
            </div>
            <label className="node-field node-field--grow character-registry-field">
              <span>Канонические персонажи</span>
              <textarea
                value={node.inputValue ?? ''}
                readOnly
                onMouseDown={stopMouseDown}
              />
            </label>
            <div className="node-message node-message--info">
              Используйте теги вроде @LIAM или @МАРТА в сценах. Если тег найден в реестре, композ возьмёт закреплённый ассет.
            </div>
          </>
        )}

        {isEditableReferenceNode && (
          <>
            <label className={`node-field ${isChapterPlanNode ? 'node-field--chapter-plan' : 'node-field--grow'}`}>
              <span>Материал</span>
              <textarea
                value={node.inputValue ?? ''}
                onChange={(event) => onInputChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="Добавьте правила формата, факты, профессии, кейсы или наблюдения..."
                disabled={node.isLoading}
              />
            </label>
            {canImportReferenceFile && (
              <label className="node-file-control" onMouseDown={stopMouseDown}>
                <span>Загрузить PDF / TXT / MD</span>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,text/plain,application/pdf"
                  disabled={node.isLoading}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) void onImportReferenceFile(id, file);
                  }}
                />
              </label>
            )}
            {canAutoBuildChapter && (
              <div className="node-field-grid">
                <label className="node-field">
                  <span>Сцен</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={node.sceneCount ?? 8}
                    onChange={(event) => onSceneCountChange(event, id)}
                    onMouseDown={stopMouseDown}
                    disabled={node.isLoading}
                  />
                </label>
                {renderModelSelect(false)}
              </div>
            )}
            {isPromptSnippetNode && (
              <button
                type="button"
                className={`node-secondary-button${node.metadata?.enabled === false ? '' : ' node-secondary-button--active'}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => onTogglePromptSnippet(id))}
              >
                {node.metadata?.enabled === false ? 'Включить фрагмент' : 'Фрагмент включён'}
              </button>
            )}
          </>
        )}

        {showInlineModelSelect && renderModelSelect()}
        {renderSystemPromptEditor()}

        {canExtractChapterTopic && (
          <button
            type="button"
            className={`node-secondary-button${node.isLoading ? ' node-secondary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => node.isLoading
              ? onCancelGeneration(id)
              : void onExtractChapterTopic(id))}
            disabled={Boolean(node.isLoadingImage)}
          >
            {node.isLoading ? 'Отменить извлечение' : 'Найти зерно истории'}
          </button>
        )}

        {canBuildChapterKnowledge && (
          <button
            type="button"
            className={`node-secondary-button${node.isLoading ? ' node-secondary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => node.isLoading
              ? onCancelGeneration(id)
              : void onBuildChapterKnowledge(id))}
            disabled={Boolean(node.isLoadingImage)}
          >
            {node.isLoading ? 'Отменить базу главы' : 'Собрать базу главы'}
          </button>
        )}

        {canPlanChapters && (
          <button
            type="button"
            className={`node-secondary-button${node.isLoading ? ' node-secondary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => node.isLoading
              ? onCancelGeneration(id)
              : void onPlanChapters(id))}
            disabled={Boolean(node.isLoadingImage)}
          >
            {node.isLoading ? 'Отменить план' : 'Спланировать главы'}
          </button>
        )}

        {canCreateChapterPlanNodes && (
          <button
            type="button"
            className="node-secondary-button"
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => onCreateChapterPlanNodes(id))}
            disabled={Boolean(node.isLoading || node.isLoadingImage)}
          >
            Создать ноды глав
          </button>
        )}

        {canBuildSeasonSkeleton && (
          <button
            type="button"
            className={`node-secondary-button${node.isLoading ? ' node-secondary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => node.isLoading
              ? onCancelGeneration(id)
              : void onBuildSeasonSkeleton(id))}
            disabled={Boolean(node.isLoadingImage)}
          >
            {node.isLoading ? 'Отменить скелет' : 'Собрать скелет сезона'}
          </button>
        )}

        {canBuildChapterMaterial && (
          <button
            type="button"
            className={`node-primary-button${node.isLoading ? ' node-primary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => node.isLoading
              ? onCancelGeneration(id)
              : void onBuildChapterMaterial(id))}
            disabled={Boolean(node.isLoadingImage)}
          >
            {node.isLoading ? 'Отменить материал' : sourceKind === 'chapter_plan' ? 'Развернуть главу' : 'Собрать материал главы'}
          </button>
        )}

        {node.nodeType === 'script_detail' && node.label === 'Закадр' && (
          <div className="node-segmented-actions node-segmented-actions--narration">
            <button
              type="button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoading
                ? onCancelGeneration(id)
                : void onEditNarration(id))}
              disabled={Boolean(node.isLoadingImage || node.isSpeaking)}
            >
              {node.isLoading ? 'Отменить' : 'Редактура закадра'}
            </button>
            <button
              type="button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoading
                ? onCancelGeneration(id)
                : void onStoryStructureEdit(id))}
              disabled={Boolean(node.isLoadingImage || node.isSpeaking)}
            >
              {node.isLoading ? 'Отменить' : 'Сюжетная редактура'}
            </button>
            <button
              type="button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoading
                ? onCancelGeneration(id)
                : void onPrepareNarrationTts(id))}
              disabled={Boolean(node.isLoadingImage || node.isSpeaking)}
            >
              {node.isLoading ? 'Отменить' : 'Подготовить TTS'}
            </button>
            <button
              type="button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoading
                ? onCancelGeneration(id)
                : void onNarrationEditorialLoop(id))}
              disabled={Boolean(node.isLoadingImage || node.isSpeaking)}
            >
              {node.isLoading ? 'Отменить' : 'Редактура луп'}
            </button>
          </div>
        )}

        {isTextOutput && node.inputValue && !isEditableReferenceNode && (
          <div className="node-output">
            <div className="node-output__text">{node.inputValue}</div>
            {renderCopyButton(node.inputValue)}
          </div>
        )}

        {canGenerateDetailAsset && node.pollinationsApiError && (
          <div className="node-message node-message--error" role="alert">{node.pollinationsApiError}</div>
        )}

        {canGenerateDetailAsset && imageProvider === 'comfyui' && (
          <label className="node-field node-field--inline">
            <span>Pipeline</span>
            <select
              value={detailImagePipelineValue}
              onChange={(event) => onImagePipelineChange(event, id)}
              onMouseDown={stopMouseDown}
              disabled={node.isLoadingImage}
            >
              <option value="sdxl">SDXL</option>
              <option value="z_image_turbo">Z-Image Turbo</option>
              <option value="ernie_image_turbo">ERNIE Image Turbo</option>
            </select>
          </label>
        )}

        {canGenerateDetailAsset && (
          <button
            type="button"
            className={`node-secondary-button${isBusy ? ' node-secondary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => isBusy
              ? onCancelGeneration(id)
              : void onGenerateDetailAsset(id))}
          >
            {isBusy
              ? 'Отменить ассет'
              : `${node.label === 'Герои'
                ? `Сгенерировать ${detailCharacterCount} героев`
                : isSystemInsertDetail
                  ? 'Сгенерировать системные вставки'
                  : 'Сгенерировать локации'} · ${imageProvider === 'comfyui' ? 'ComfyUI' : 'Pollinations'}`}
          </button>
        )}

        {canBuildCharacterMemory && (
          <button
            type="button"
            className={`node-secondary-button${isBusy ? ' node-secondary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => isBusy
              ? onCancelGeneration(id)
              : void onBuildCharacterMemory(id))}
            disabled={Boolean(node.isLoadingImage)}
          >
            {isBusy ? 'Отменить память' : 'Память персонажей'}
          </button>
        )}

        {canBuildScenarioFromBrief && (
          <button
            type="button"
            className={`node-primary-button${node.isLoading ? ' node-primary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => node.isLoading
              ? onCancelGeneration(id)
              : void onBuildScenarioFromBrief(id))}
            disabled={node.isLoadingImage}
          >
            {node.isLoading ? 'Отменить генерацию' : 'Собрать сценарий'}
          </button>
        )}

        {canAutoBuildChapter && (
          <button
            type="button"
            className={`node-primary-button${node.isLoading ? ' node-primary-button--cancel' : ''}`}
            onMouseDown={stopMouseDown}
            onClick={(event) => runWithoutDrag(event, () => node.isLoading
              ? onCancelGeneration(id)
              : void onAutoBuildChapter(id))}
            disabled={node.isLoadingImage}
          >
            {node.isLoading ? 'Отменить автосборку' : 'Автособрать главу'}
          </button>
        )}

        {canSpeakNarration && (
          <div className="node-segmented-actions node-segmented-actions--voice">
            <button
              type="button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isSpeaking
                ? onStopSpeech()
                : onSpeakNarration(id))}
              disabled={Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio)}
            >
              {node.isSpeaking ? 'Стоп' : 'Озвучить'}
            </button>
            <button
              type="button"
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoadingAudio
                ? onCancelGeneration(id)
                : void onGenerateOmniVoiceNarration(id))}
              disabled={Boolean(node.isLoading || node.isLoadingImage || node.isSpeaking)}
            >
              {node.isLoadingAudio ? 'Отменить OmniVoice' : 'OmniVoice'}
            </button>
          </div>
        )}

        {node.nodeType === 'script_detail' && node.audioUrl && (
          <div className="node-audio-player" onMouseDown={stopMouseDown}>
            <audio controls src={node.audioUrl} />
          </div>
        )}

        {node.nodeType === 'script_output' && (
          <div className="node-action-stack">
            <div className="node-segmented-actions">
              {detailButtons.map((button) => (
                <button
                  key={button.type}
                  type="button"
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => onScenarioDetailClick(id, button.type))}
                  disabled={node.isLoading}
                >
                  {button.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`node-secondary-button${node.isLoading ? ' node-secondary-button--cancel' : ''}`}
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => node.isLoading
                ? onCancelGeneration(id)
                : onCreateSceneNodes(id))}
            >
              {node.isLoading ? 'Отменить генерацию' : 'Создать/обновить сцены'}
            </button>
          </div>
        )}

        {node.nodeType === 'association' && (
          <div className="association-content">{node.label}</div>
        )}

        {node.nodeType === 'scene' && (
          <>
            <div className="node-output scene-output scene-node__description">
              <div className="node-output__text">
                {node.sceneText || node.inputValue || 'Описание сцены пока пусто.'}
              </div>
              {(node.sceneText || node.inputValue) && renderCopyButton(node.sceneText || node.inputValue || '')}
            </div>
            {node.pollinationsApiError && (
              <div className="node-message node-message--error" role="alert">{node.pollinationsApiError}</div>
            )}
            {imageProvider === 'comfyui' && (
              <label className="node-field node-field--inline">
                <span>Pipeline</span>
                <select
                  value={node.imagePipeline ?? 'z_image_turbo'}
                  onChange={(event) => onImagePipelineChange(event, id)}
                  onMouseDown={stopMouseDown}
                  disabled={node.isLoadingImage}
                >
                  <option value="sdxl">SDXL</option>
                  <option value="z_image_turbo">Z-Image Turbo</option>
                  <option value="ernie_image_turbo">ERNIE Image Turbo</option>
                </select>
              </label>
            )}
            <div className="scene-node__actions">
              <button
                type="button"
                className={`node-secondary-button${isBusy ? ' node-secondary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => isBusy
                  ? onCancelGeneration(id)
                  : void onGenerateSceneLocationAsset(id))}
              >
                {isBusy ? 'Отменить локацию' : `Локация · ${imageProvider === 'comfyui' ? 'ComfyUI' : 'Pollinations'}`}
              </button>
              <button
                type="button"
                className={`node-secondary-button${isBusy ? ' node-secondary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => isBusy
                  ? onCancelGeneration(id)
                  : void onBuildSceneDialogue(id))}
                disabled={Boolean(node.isLoadingImage || node.isLoadingAudio || node.isLoadingVideo)}
              >
                {isBusy ? 'Отменить диалог' : 'Диалог'}
              </button>
              {imageProvider === 'comfyui' && (
                <button
                  type="button"
                  className={`node-primary-button${isBusy ? ' node-primary-button--cancel' : ''}`}
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => isBusy
                    ? onCancelGeneration(id)
                    : void onComposeSceneFlux2(id, 'flux2_compose'))}
                >
                  {isBusy ? 'Отменить Flux2' : 'Собрать кадр Flux2'}
                </button>
              )}
              {imageProvider === 'comfyui' && (
                <button
                  type="button"
                  className={`node-secondary-button${isBusy ? ' node-secondary-button--cancel' : ''}`}
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => isBusy
                    ? onCancelGeneration(id)
                    : void onComposeSceneFlux2(id, 'flux2_turbo_compose'))}
                >
                  {isBusy ? 'Отменить Turbo' : 'Собрать кадр Flux2 Turbo'}
                </button>
              )}
              {imageProvider === 'comfyui' && (
                <button
                  type="button"
                  className={`node-secondary-button${isBusy ? ' node-secondary-button--cancel' : ''}`}
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => isBusy
                    ? onCancelGeneration(id)
                    : void onComposeSceneFlux2(id, 'nano_banana_2_lite_compose'))}
                >
                  {isBusy ? 'Отменить Banana' : 'Собрать кадр Nano Banana'}
                </button>
              )}
            </div>
            {imageProvider === 'comfyui' && (
              <div className="node-segmented-actions node-segmented-actions--voice scene-node__media-actions">
                <button
                  type="button"
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => node.isLoadingAudio
                    ? onCancelGeneration(id)
                    : void onGenerateSceneOmniVoiceNarration(id))}
                  disabled={Boolean(node.isLoading || node.isLoadingImage || node.isLoadingVideo)}
                >
                  {node.isLoadingAudio ? 'Отменить озвучку' : 'Озвучить сцену'}
                </button>
                <button
                  type="button"
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => node.isLoadingVideo
                    ? onCancelGeneration(id)
                    : void onBuildSceneVideoClip(id))}
                  disabled={Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio)}
                >
                  {node.isLoadingVideo ? 'Отменить клип' : 'Клип 16:9'}
                </button>
              </div>
            )}
            {node.audioUrl && (
              <div className="node-audio-player" onMouseDown={stopMouseDown}>
                <audio controls src={node.audioUrl} />
              </div>
            )}
            {node.videoUrl && (
              <div className="node-video-player" onMouseDown={stopMouseDown}>
                <video controls src={node.videoUrl} />
                <a className="node-download-link" href={node.videoUrl} download={safeDownloadName}>Скачать WebM</a>
              </div>
            )}
          </>
        )}

        {node.nodeType === 'chapter_timeline' && (
          <div className="chapter-timeline">
            <div className="chapter-timeline__settings">
              {renderModelSelect(false)}
              {imageProvider === 'comfyui' && (
                <>
                  <label className="node-field node-field--inline">
                    <span>Ассеты</span>
                    <select
                      value={timelineAssetPipelineValue}
                      onChange={(event) => onTimelineAssetPipelineChange(event, id)}
                      onMouseDown={stopMouseDown}
                      disabled={node.isLoadingVideo}
                    >
                      <option value="z_image_turbo">Z-Image Turbo</option>
                      <option value="sdxl">SDXL</option>
                      <option value="ernie_image_turbo">ERNIE Image Turbo</option>
                    </select>
                  </label>
                  <label className="node-field node-field--inline">
                    <span>Вставки</span>
                    <select
                      value={timelineSystemInsertPipelineValue}
                      onChange={(event) => onTimelineSystemInsertPipelineChange(event, id)}
                      onMouseDown={stopMouseDown}
                      disabled={node.isLoadingVideo}
                    >
                      <option value="ernie_image_turbo">ERNIE Image Turbo</option>
                      <option value="z_image_turbo">Z-Image Turbo</option>
                      <option value="sdxl">SDXL</option>
                    </select>
                  </label>
                  <label className="node-field node-field--inline">
                    <span>Compose</span>
                    <select
                      value={timelineComposePipelineValue}
                      onChange={(event) => onImagePipelineChange(event, id)}
                      onMouseDown={stopMouseDown}
                      disabled={node.isLoadingVideo}
                    >
                      <option value="nano_banana_2_lite_compose">Nano Banana</option>
                      <option value="flux2_turbo_compose">Flux2 Turbo</option>
                      <option value="flux2_compose">Flux2</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="chapter-timeline__summary">
              <span><strong>{timelineStats.scenes}</strong> сцен</span>
              <span><strong>{timelineStats.locations}</strong> локаций</span>
              <span><strong>{timelineStats.characters}</strong> героев</span>
              <span><strong>{timelineStats.frames}</strong> кадров</span>
              <span><strong>{timelineStats.audio}</strong> озвучек</span>
              <span><strong>{timelineStats.clips}</strong> клипов</span>
              <span><strong>{timelineStats.inserts}</strong> вставок</span>
              <button
                type="button"
                className={`node-secondary-button chapter-timeline__refresh${node.isLoadingImage ? ' node-secondary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => node.isLoadingImage
                  ? onCancelGeneration(id)
                  : void onGenerateChapterBackdrop(id))}
                disabled={Boolean(node.isLoading || node.isLoadingAudio || node.isLoadingVideo)}
              >
                {node.isLoadingImage ? 'Отменить фон' : 'Фон главы'}
              </button>
              <button
                type="button"
                className={`node-secondary-button chapter-timeline__refresh${node.isLoadingVideo ? ' node-secondary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => node.isLoadingVideo
                  ? onCancelGeneration(id)
                  : void onGenerateTimelineMissingAssets(id))}
                disabled={Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio || timelineStats.scenes === 0)}
              >
                {node.isLoadingVideo ? 'Остановить' : 'Добрать недостающее'}
              </button>
              <button
                type="button"
                className={`node-secondary-button chapter-timeline__refresh${node.isLoadingVideo ? ' node-secondary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => node.isLoadingVideo
                  ? onCancelGeneration(id)
                  : void onBuildChapterSceneClips(id))}
                disabled={Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio || timelineStats.scenes === 0)}
              >
                {node.isLoadingVideo ? 'Отменить очередь' : timelineStats.clips > 0 ? 'Пересобрать клипы' : 'Клипы по очереди'}
              </button>
              <button
                type="button"
                className={`node-secondary-button chapter-timeline__refresh${node.isLoadingVideo ? ' node-secondary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => node.isLoadingVideo
                  ? onCancelGeneration(id)
                  : void onBuildChapterVideo(id))}
                disabled={Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio || timelineStats.scenes === 0)}
              >
                {node.isLoadingVideo ? 'Отменить ролик' : 'Собрать ролик'}
              </button>
              <button
                type="button"
                className="node-secondary-button chapter-timeline__refresh"
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => onEnsureChapterTimeline(id))}
              >
                Обновить
              </button>
            </div>
            {node.pollinationsApiError && (
              <div className="node-message node-message--error" role="alert">{node.pollinationsApiError}</div>
            )}
            {timelineScenes.length === 0 ? (
              <div className="chapter-timeline__empty">
                Сцен пока нет. Сначала соберите сценарий, затем нажмите «Создать/обновить сцены».
              </div>
            ) : (
              <div className="chapter-timeline__rail" onMouseDown={stopMouseDown}>
                {timelineScenes.map(({ sceneId, scene, location, characters, frame, systemFrame }) => {
                  const sceneText = scene.sceneText || scene.inputValue || '';
                  const sceneNumber = getSceneNumberFromLabel(scene.label);
                  const systemInsert = timelineSystemInserts.get(sceneNumber);
                  const qaStatus = typeof frame?.metadata?.visionStatus === 'string'
                    ? frame.metadata.visionStatus
                    : 'ожидает';
                  const sceneBusy = Boolean(scene.isLoading || scene.isLoadingImage || scene.isLoadingAudio || scene.isLoadingVideo || scene.isSpeaking);
                  return (
                    <React.Fragment key={sceneId}>
                      <article className="chapter-timeline__scene">
                        <header className="chapter-timeline__scene-header">
                          <strong>{scene.label}</strong>
                          <span>{scene.productionStatus ?? 'draft'}</span>
                        </header>
                        <p className="chapter-timeline__scene-text">{sceneText}</p>
                        <div className="chapter-timeline__thumb-grid">
                          <div className="chapter-timeline__thumb">
                            {location?.imageUrl
                              ? <img src={location.imageUrl} alt={`Локация ${scene.label}`} draggable={false} />
                              : <span>Локация</span>}
                          </div>
                          <div className="chapter-timeline__thumb">
                            {frame?.imageUrl
                              ? <img src={frame.imageUrl} alt={`Кадр ${scene.label}`} draggable={false} />
                              : <span>Кадр</span>}
                          </div>
                        </div>
                        <div className="chapter-timeline__badges">
                          {renderTimelineBadge('Текст', Boolean(sceneText), 'Описание сцены')}
                          {renderTimelineBadge('Локация', Boolean(location?.imageUrl), location?.label)}
                          {renderTimelineBadge('Герои', Boolean(characters?.imageUrl), characters?.label)}
                          {renderTimelineBadge('Кадр', Boolean(frame?.imageUrl), frame?.label)}
                          {renderTimelineBadge('Аудио', Boolean(scene.audioUrl), 'Озвучка сцены')}
                          {renderTimelineBadge('Клип', Boolean(scene.videoUrl), '16:9 фрагмент')}
                          {renderTimelineBadge('Вставка', Boolean(systemInsert), systemInsert)}
                          {renderTimelineBadge('QA', qaStatus !== 'ожидает', `Vision: ${qaStatus}`)}
                        </div>
                        <div className="chapter-timeline__actions">
                          <button
                            type="button"
                            onMouseDown={stopMouseDown}
                            onClick={(event) => runWithoutDrag(event, () => sceneBusy
                              ? onCancelGeneration(sceneId)
                              : void onGenerateSceneLocationAsset(sceneId))}
                          >
                            {sceneBusy ? 'Отмена' : 'Локация'}
                          </button>
                          <button
                            type="button"
                            onMouseDown={stopMouseDown}
                            onClick={(event) => runWithoutDrag(event, () => sceneBusy
                              ? onCancelGeneration(sceneId)
                              : void onBuildSceneDialogue(sceneId))}
                            disabled={Boolean(scene.isLoadingImage || scene.isLoadingAudio || scene.isLoadingVideo)}
                          >
                            Диалог
                          </button>
                          {imageProvider === 'comfyui' && (
                            <button
                              type="button"
                              onMouseDown={stopMouseDown}
                              onClick={(event) => runWithoutDrag(event, () => sceneBusy
                                ? onCancelGeneration(sceneId)
                                : void onComposeSceneFlux2(sceneId, 'flux2_compose'))}
                            >
                              Flux2
                            </button>
                          )}
                          {imageProvider === 'comfyui' && (
                            <button
                              type="button"
                              onMouseDown={stopMouseDown}
                              onClick={(event) => runWithoutDrag(event, () => sceneBusy
                                ? onCancelGeneration(sceneId)
                                : void onComposeSceneFlux2(sceneId, 'flux2_turbo_compose'))}
                            >
                              Turbo
                            </button>
                          )}
                          {imageProvider === 'comfyui' && (
                            <button
                              type="button"
                              onMouseDown={stopMouseDown}
                              onClick={(event) => runWithoutDrag(event, () => sceneBusy
                                ? onCancelGeneration(sceneId)
                                : void onComposeSceneFlux2(sceneId, 'nano_banana_2_lite_compose'))}
                            >
                              Banana
                            </button>
                          )}
                          {imageProvider === 'comfyui' && (
                            <button
                              type="button"
                              onMouseDown={stopMouseDown}
                              onClick={(event) => runWithoutDrag(event, () => scene.isLoadingAudio
                                ? onCancelGeneration(sceneId)
                                : void onGenerateSceneOmniVoiceNarration(sceneId))}
                              disabled={Boolean(scene.isLoading || scene.isLoadingImage || scene.isLoadingVideo)}
                            >
                              Озвучка
                            </button>
                          )}
                          {imageProvider === 'comfyui' && (
                            <button
                              type="button"
                              onMouseDown={stopMouseDown}
                              onClick={(event) => runWithoutDrag(event, () => scene.isLoadingVideo
                                ? onCancelGeneration(sceneId)
                                : void onBuildSceneVideoClip(sceneId))}
                              disabled={Boolean(scene.isLoading || scene.isLoadingImage || scene.isLoadingAudio)}
                            >
                              Клип
                            </button>
                          )}
                        </div>
                      </article>
                      {systemInsert && (
                        <article className="chapter-timeline__scene chapter-timeline__scene--system">
                          <header className="chapter-timeline__scene-header">
                            <strong>СЦЕНА {sceneNumber}.5</strong>
                            <span>system</span>
                          </header>
                          <div className="chapter-timeline__insert">
                            <strong>Системная вставка</strong>
                            <span>{systemInsert}</span>
                          </div>
                          <div className="chapter-timeline__system-frame">
                            {systemFrame?.imageUrl
                              ? <img src={systemFrame.imageUrl} alt={`Системная вставка ${sceneNumber}.5`} draggable={false} loading="lazy" decoding="async" />
                              : <span>Кадр системной вставки</span>}
                          </div>
                          <div className="chapter-timeline__badges">
                            {renderTimelineBadge('Текст', true, systemInsert)}
                            {renderTimelineBadge('Кадр', Boolean(systemFrame?.imageUrl), systemFrame?.label ?? 'Ожидает генерацию системной картинки')}
                          </div>
                        </article>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {node.nodeType === 'chapter_collector' && (
          <div className="chapter-collector">
            <div className="chapter-timeline__summary">
              <span><strong>{chapterCollectorEntries.length}</strong> глав</span>
              <span><strong>{chapterCollectorReadyCount}</strong> роликов</span>
              <span><strong>{Math.max(0, chapterCollectorEntries.length - chapterCollectorReadyCount)}</strong> не готово</span>
              <button
                type="button"
                className={`node-secondary-button chapter-timeline__refresh${node.isLoadingVideo ? ' node-secondary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => node.isLoadingVideo
                  ? onCancelGeneration(id)
                  : void onBuildSeasonVideo(id))}
                disabled={Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio || chapterCollectorEntries.length === 0)}
              >
                {node.isLoadingVideo ? 'Отменить финал' : 'Собрать финальный ролик'}
              </button>
            </div>
            {node.pollinationsApiError && (
              <div className="node-message node-message--error" role="alert">{node.pollinationsApiError}</div>
            )}
            {chapterCollectorEntries.length === 0 ? (
              <div className="chapter-timeline__empty">
                Таймлайны глав пока не найдены. Создайте таймлайн для каждой главы, затем обновите собиратель.
              </div>
            ) : (
              <div className="chapter-collector__slots" onMouseDown={stopMouseDown}>
                {chapterCollectorEntries.map(({ timelineId, timeline, chapterNumber, videoNode }, index) => {
                  const isReady = Boolean(videoNode?.videoUrl);
                  return (
                    <article key={timelineId} className={`chapter-collector__slot${isReady ? ' chapter-collector__slot--ready' : ''}`}>
                      <span className="chapter-collector__slot-number">
                        {chapterNumber ? `Глава ${chapterNumber}` : `Глава ${index + 1}`}
                      </span>
                      <strong>{timeline.label.replace(/^Таймлайн\s*·\s*/iu, '')}</strong>
                      <em>{isReady ? (videoNode?.label ?? 'Ролик главы') : 'Ролик главы не собран'}</em>
                      <b>{isReady ? '✓' : '·'}</b>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {node.nodeType === 'video_output' && (
          <>
            {node.videoUrl ? (
              <div className="node-video-player" onMouseDown={stopMouseDown}>
                <video controls src={node.videoUrl} />
                <a className="node-download-link" href={node.videoUrl} download={safeDownloadName}>Скачать общий WebM</a>
              </div>
            ) : (
              <div className="chapter-timeline__empty">Ролик пока не собран.</div>
            )}
          </>
        )}

        {node.nodeType === 'pollinations_image' && (
          <>
            <div className="generated-image">
              {node.imageUrl
                ? (
                  <img
                    src={node.imageUrl}
                    alt={`Сгенерированный кадр для ${node.label}`}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                  />
                )
                : <span>Кадр недоступен после перезагрузки. Создайте его снова из сцены.</span>}
            </div>
            {imagePrompt && (
              <div className="generated-prompt-tools">
                <button
                  type="button"
                  className="node-secondary-button generated-prompt-toggle"
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => setImagePromptOpen((value) => !value))}
                >
                  {isImagePromptOpen ? 'Скрыть промпт' : 'Промпт'}
                </button>
                <button
                  type="button"
                  className="node-icon-button"
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => onCopyToClipboard(promptBundle))}
                  aria-label="Копировать промпт"
                  title="Копировать промпт"
                >
                  <img src={assetPath('copy.svg')} alt="" />
                </button>
              </div>
            )}
            {imagePrompt && (
              <div className="generated-image-actions">
                <button
                  type="button"
                  className={`node-secondary-button generated-reference-button${isReferenceImage ? ' generated-reference-button--active' : ''}`}
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => onToggleReferenceImage(id))}
                >
                  {isReferenceImage ? 'Референс ✓' : 'Референс'}
                </button>
                {isCharacterAsset && (
                  <button
                    type="button"
                    className={`node-secondary-button generated-canon-button${isCanonicalCharacterAsset ? ' generated-canon-button--active' : ''}`}
                    onMouseDown={stopMouseDown}
                    onClick={(event) => runWithoutDrag(event, () => onSetCharacterCanonicalAsset(id))}
                  >
                    {isCanonicalCharacterAsset ? 'Канон ✓' : 'Канон'}
                  </button>
                )}
                <button
                  type="button"
                  className={`node-secondary-button${node.isLoadingImage ? ' node-secondary-button--cancel' : ''}`}
                  onMouseDown={stopMouseDown}
                  onClick={(event) => runWithoutDrag(event, () => node.isLoadingImage
                    ? onCancelGeneration(id)
                    : void onRegenerateImageNode(id))}
                >
                  {node.isLoadingImage ? 'Отменить' : 'Новый seed'}
                </button>
              </div>
            )}
            {isCharacterAsset && imageProvider === 'comfyui' && (
              <label className="node-field node-field--inline">
                <span>Pipeline</span>
                <select
                  value={characterAssetPipelineValue}
                  onChange={(event) => onImagePipelineChange(event, id)}
                  onMouseDown={stopMouseDown}
                  disabled={node.isLoadingImage}
                >
                  <option value="sdxl">SDXL</option>
                  <option value="z_image_turbo">Z-Image Turbo</option>
                </select>
              </label>
            )}
            {imagePrompt && isImagePromptOpen && (
              <div className="generated-prompt-panel">
                <div className="generated-prompt-section">
                  <div className="generated-prompt-section__title">Image prompt</div>
                  <div className="generated-prompt-section__text">{imagePrompt}</div>
                </div>
                {promptContext && (
                  <div className="generated-prompt-section">
                    <div className="generated-prompt-section__title">Русский контекст</div>
                    <div className="generated-prompt-section__text">{promptContext}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {node.statusMessage && node.nodeType !== 'script_input' && node.nodeType !== 'chapter_timeline' && !isEditableReferenceNode && (
          <div className="node-message node-message--info">{node.statusMessage}</div>
        )}
      </div>

      {onResizeMouseDown && node.nodeType !== 'association' && (
        <button
          type="button"
          className="node-resize-handle"
          onMouseDown={(event) => onResizeMouseDown(event, id)}
          aria-label={`Изменить размер «${node.label}»`}
          title="Изменить размер"
        />
      )}
    </div>
  );
};

export default NodeRenderer;
