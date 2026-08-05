import React from 'react';
import { ImageProvider } from '../api';
import { MISTRAL_MODELS } from '../constants';
import { DetailType, ImagePipeline, NodeData, NodesState } from '../types';
import { assetPath, getNodeIcon } from '../utils';

interface NodeRendererProps {
  id: string;
  node: NodeData;
  allNodes: NodesState;
  selected?: boolean;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>, nodeId: string) => void;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onThemeInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onModelChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  onImagePipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  onSceneCountChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  onContinueAssociation: (nodeId: string) => void;
  onScriptVisualize: (nodeId: string) => void;
  onBuildScenarioFromBrief: (nodeId: string) => Promise<void>;
  onAutoBuildChapter: (nodeId: string) => Promise<void>;
  onEnsureChapterTimeline: () => void;
  onScenarioDetailClick: (nodeId: string, detailType: DetailType) => void;
  onCreateSceneNodes: (nodeId: string) => void;
  onGenerateSceneLocationAsset: (nodeId: string) => Promise<void>;
  onComposeSceneFlux2: (nodeId: string, pipeline?: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose'>) => Promise<void>;
  onGenerateDetailAsset: (nodeId: string) => Promise<void>;
  onEditNarration: (nodeId: string) => Promise<void>;
  onNarrationEditorialLoop: (nodeId: string) => Promise<void>;
  onPrepareNarrationTts: (nodeId: string) => Promise<void>;
  onSpeakNarration: (nodeId: string) => void;
  onStopSpeech: () => void;
  onGenerateOmniVoiceNarration: (nodeId: string) => Promise<void>;
  onGenerateSceneOmniVoiceNarration: (nodeId: string) => Promise<void>;
  onBuildSceneVideoClip: (nodeId: string) => Promise<void>;
  onCopyToClipboard: (text: string) => void;
  onRegenerateImageNode: (nodeId: string) => Promise<void>;
  onToggleReferenceImage: (nodeId: string) => void;
  imageProvider: ImageProvider;
  onCancelGeneration: (nodeId: string) => void;
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
  value?.split(/\n+/).map((line) => line.trim()).filter(Boolean).length ?? 0;

const getAssetKind = (node: NodeData) =>
  typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';

const isDefaultReferenceImage = (node: NodeData) =>
  node.metadata?.isReference === true
  || (getAssetKind(node).startsWith('character_asset') && node.metadata?.isReference !== false);

const getSceneNumberFromLabel = (label: string) => {
  const match = label.match(/\d+/u);
  return match ? Number(match[0]) : 0;
};

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

const scoreLocationReferenceMatch = (node: NodeData, sceneDescription: string, locationDescription: string) => {
  const sceneText = normalizeMatchText(sceneDescription);
  const sceneTokens = new Set(getMeaningfulTokens(sceneDescription));
  const locationName = getLocationName(locationDescription || node.label, 0);
  let score = 0;

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
  return locationAssets
    .map((node) => {
      const locationDetail = nodes[node.parentId ?? ''];
      const locationDescriptions = getLocationDescriptions(locationDetail?.inputValue ?? '');
      const assetIndex = getLocationAssetIndex(node);
      const locationDescription = assetIndex === null ? '' : locationDescriptions[assetIndex] ?? '';
      return { node, score: scoreLocationReferenceMatch(node, sceneDescription, locationDescription) };
    })
    .sort((left, right) => right.score - left.score)
    .find(({ score }) => score >= 20)?.node;
};

const getTimelineScenes = (nodes: NodesState, timelineNode: NodeData) => {
  const sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
    ? timelineNode.metadata.sourceScenarioId
    : timelineNode.parentId;
  const sceneEntries = Object.entries(nodes)
    .filter(([, candidate]) =>
      candidate.nodeType === 'scene'
      && (!sourceScenarioId || candidate.parentId === sourceScenarioId));

  return sceneEntries
    .length > 0 ? sceneEntries : Object.entries(nodes).filter(([, candidate]) => candidate.nodeType === 'scene');
};

const getSortedTimelineScenes = (nodes: NodesState, timelineNode: NodeData) =>
  getTimelineScenes(nodes, timelineNode)
    .sort(([, first], [, second]) =>
      getSceneNumberFromLabel(first.label) - getSceneNumberFromLabel(second.label)
      || first.label.localeCompare(second.label, 'ru', { numeric: true }))
    .map(([sceneId, scene]) => ({
      sceneId,
      scene,
      location: findTimelineLocationNode(nodes, sceneId, scene),
      characters: findSceneImageNode(nodes, sceneId, ['scene_characters']),
      frame: findSceneImageNode(nodes, sceneId, ['scene_flux2_frame', 'scene_frame']),
    }));

const getSystemInsertDetail = (nodes: NodesState, timelineNode: NodeData) => {
  const sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
    ? timelineNode.metadata.sourceScenarioId
    : timelineNode.parentId;
  return Object.values(nodes).find((candidate) =>
    candidate.nodeType === 'script_detail'
    && candidate.label === 'Системные вставки'
    && (!sourceScenarioId || candidate.parentId === sourceScenarioId));
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

const NodeRenderer: React.FC<NodeRendererProps> = ({
  id,
  node,
  allNodes,
  selected = false,
  onMouseDown,
  onInputChange,
  onThemeInputChange,
  onModelChange,
  onImagePipelineChange,
  onSceneCountChange,
  onContinueAssociation,
  onScriptVisualize,
  onBuildScenarioFromBrief,
  onAutoBuildChapter,
  onEnsureChapterTimeline,
  onScenarioDetailClick,
  onCreateSceneNodes,
  onGenerateSceneLocationAsset,
  onComposeSceneFlux2,
  onGenerateDetailAsset,
  onEditNarration,
  onNarrationEditorialLoop,
  onPrepareNarrationTts,
  onSpeakNarration,
  onStopSpeech,
  onGenerateOmniVoiceNarration,
  onGenerateSceneOmniVoiceNarration,
  onBuildSceneVideoClip,
  onCopyToClipboard,
  onRegenerateImageNode,
  onToggleReferenceImage,
  imageProvider,
  onCancelGeneration,
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
  const canGenerateDetailAsset = node.nodeType === 'script_detail' && (node.label === 'Герои' || node.label === 'Локации');
  const canBuildScenarioFromBrief = node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'brief_revision';
  const canAutoBuildChapter = node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'chapter_material';
  const canSpeakNarration = node.nodeType === 'script_detail'
    && (node.label === 'Закадр' || node.metadata?.sourceKind === 'tts_cleanup');
  const isEditableReferenceNode = node.nodeType === 'script_detail'
    && (
      node.metadata?.sourceKind === 'format_bible'
      || node.metadata?.sourceKind === 'knowledge_base'
      || node.metadata?.sourceKind === 'season_memory'
      || node.metadata?.sourceKind === 'chapter_material'
    );
  const detailRowCount = countDetailRows(node.inputValue);
  const isBusy = Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio || node.isLoadingVideo || node.isSpeaking);
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

  const renderTimelineBadge = (label: string, isReady: boolean, detail?: string) => (
    <span className={`chapter-timeline__badge${isReady ? ' chapter-timeline__badge--ready' : ''}`} title={detail}>
      <span>{label}</span>
      <strong>{isReady ? '✓' : '·'}</strong>
    </span>
  );

  return (
    <div
      id={`node-${id}`}
      className={`story-node story-node--${node.nodeType}${selected ? ' story-node--selected' : ''}${isBusy ? ' story-node--busy' : ''}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 300,
        height: node.height ?? 220,
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
              <label className="node-field">
                <span>Модель</span>
                <select
                  value={node.selectedModel ?? MISTRAL_MODELS[0]}
                  onChange={(event) => onModelChange(event, id)}
                  onMouseDown={stopMouseDown}
                  disabled={node.isLoading}
                >
                  {MISTRAL_MODELS.map((modelName) => (
                    <option key={modelName} value={modelName}>{modelName}</option>
                  ))}
                </select>
              </label>
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

        {isEditableReferenceNode && (
          <>
            <label className="node-field node-field--grow">
              <span>Материал</span>
              <textarea
                value={node.inputValue ?? ''}
                onChange={(event) => onInputChange(event, id)}
                onMouseDown={stopMouseDown}
                placeholder="Добавьте правила формата, факты, профессии, кейсы или наблюдения..."
                disabled={node.isLoading}
              />
            </label>
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
                <label className="node-field">
                  <span>Модель</span>
                  <select
                    value={node.selectedModel ?? MISTRAL_MODELS[0]}
                    onChange={(event) => onModelChange(event, id)}
                    onMouseDown={stopMouseDown}
                    disabled={node.isLoading}
                  >
                    {MISTRAL_MODELS.map((modelName) => (
                      <option key={modelName} value={modelName}>{modelName}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </>
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
              value={node.imagePipeline ?? 'sdxl'}
              onChange={(event) => onImagePipelineChange(event, id)}
              onMouseDown={stopMouseDown}
              disabled={node.isLoadingImage}
            >
              <option value="sdxl">SDXL</option>
              <option value="z_image_turbo">Z-Image Turbo</option>
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
              : `${node.label === 'Герои' ? `Сгенерировать ${detailRowCount || ''} героев`.replace('  ', ' ') : 'Сгенерировать локации'} · ${imageProvider === 'comfyui' ? 'ComfyUI' : 'Pollinations'}`}
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
              {node.isLoading ? 'Отменить' : 'Редактура'}
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
            <div className="node-output scene-output">
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
                  value={node.imagePipeline ?? 'sdxl'}
                  onChange={(event) => onImagePipelineChange(event, id)}
                  onMouseDown={stopMouseDown}
                  disabled={node.isLoadingImage}
                >
                  <option value="sdxl">SDXL</option>
                  <option value="z_image_turbo">Z-Image Turbo</option>
                </select>
              </label>
            )}
            <button
              type="button"
              className={`node-secondary-button${isBusy ? ' node-secondary-button--cancel' : ''}`}
              onMouseDown={stopMouseDown}
              onClick={(event) => runWithoutDrag(event, () => isBusy
                ? onCancelGeneration(id)
                : void onGenerateSceneLocationAsset(id))}
            >
              {isBusy ? 'Отменить локацию' : `Сгенерировать локацию сцены · ${imageProvider === 'comfyui' ? 'ComfyUI' : 'Pollinations'}`}
            </button>
            {imageProvider === 'comfyui' && (
              <>
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
              </>
            )}
            {imageProvider === 'comfyui' && (
              <div className="node-segmented-actions node-segmented-actions--voice">
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
                className="node-secondary-button chapter-timeline__refresh"
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, onEnsureChapterTimeline)}
              >
                Обновить
              </button>
            </div>
            {timelineScenes.length === 0 ? (
              <div className="chapter-timeline__empty">
                Сцен пока нет. Сначала соберите сценарий, затем нажмите «Создать/обновить сцены».
              </div>
            ) : (
              <div className="chapter-timeline__rail" onMouseDown={stopMouseDown}>
                {timelineScenes.map(({ sceneId, scene, location, characters, frame }) => {
                  const sceneText = scene.sceneText || scene.inputValue || '';
                  const sceneNumber = getSceneNumberFromLabel(scene.label);
                  const systemInsert = timelineSystemInserts.get(sceneNumber);
                  const qaStatus = typeof frame?.metadata?.visionStatus === 'string'
                    ? frame.metadata.visionStatus
                    : 'ожидает';
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
                            <span>{systemInsert}</span>
                          </div>
                          <div className="chapter-timeline__badges">
                            {renderTimelineBadge('Текст', true, systemInsert)}
                            {renderTimelineBadge('Кадр', false, 'Ожидает генерацию системной картинки')}
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

        {node.nodeType === 'pollinations_image' && (
          <>
            <div className="generated-image">
              {node.imageUrl
                ? <img src={node.imageUrl} alt={`Сгенерированный кадр для ${node.label}`} draggable={false} />
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

        {node.statusMessage && node.nodeType !== 'script_input' && node.nodeType !== 'chapter_timeline' && (
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
