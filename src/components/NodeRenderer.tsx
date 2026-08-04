import React from 'react';
import { ImageProvider } from '../api';
import { MISTRAL_MODELS } from '../constants';
import { DetailType, ImagePipeline, NodeData } from '../types';
import { assetPath, getNodeIcon } from '../utils';

interface NodeRendererProps {
  id: string;
  node: NodeData;
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
];

const countDetailRows = (value?: string) =>
  value?.split(/\n+/).map((line) => line.trim()).filter(Boolean).length ?? 0;

const getAssetKind = (node: NodeData) =>
  typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';

const isDefaultReferenceImage = (node: NodeData) =>
  node.metadata?.isReference === true
  || (getAssetKind(node).startsWith('character_asset') && node.metadata?.isReference !== false);

const NodeRenderer: React.FC<NodeRendererProps> = ({
  id,
  node,
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
  const isBusy = Boolean(node.isLoading || node.isLoadingImage || node.isLoadingAudio || node.isSpeaking);
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
          </>
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

        {node.statusMessage && node.nodeType !== 'script_input' && (
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
