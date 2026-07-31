import React from 'react';
import { MISTRAL_MODELS } from '../constants';
import { DetailType, NodeData } from '../types';
import { assetPath, getNodeIcon } from '../utils';

interface NodeRendererProps {
  id: string;
  node: NodeData;
  selected?: boolean;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>, nodeId: string) => void;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onThemeInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  onModelChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  onSceneCountChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  onContinueAssociation: (nodeId: string) => void;
  onScriptVisualize: (nodeId: string) => void;
  onScenarioDetailClick: (nodeId: string, detailType: DetailType) => void;
  onCreateSceneNodes: (nodeId: string) => void;
  onGenerateScenePrompt: (nodeId: string) => void;
  onCopyToClipboard: (text: string) => void;
  onGeneratePollinationsImage: (nodeId: string) => Promise<void>;
  onCancelGeneration: (nodeId: string) => void;
  onDelete?: (nodeId: string) => void;
  onResizeMouseDown?: (event: React.MouseEvent<HTMLButtonElement>, nodeId: string) => void;
}

const detailButtons: Array<{ type: DetailType; label: string }> = [
  { type: 'герои', label: 'Герои' },
  { type: 'локации', label: 'Локации' },
  { type: 'настроение', label: 'Настроение' },
];

const NodeRenderer: React.FC<NodeRendererProps> = ({
  id,
  node,
  selected = false,
  onMouseDown,
  onInputChange,
  onThemeInputChange,
  onModelChange,
  onSceneCountChange,
  onContinueAssociation,
  onScriptVisualize,
  onScenarioDetailClick,
  onCreateSceneNodes,
  onGenerateScenePrompt,
  onCopyToClipboard,
  onGeneratePollinationsImage,
  onCancelGeneration,
  onDelete,
  onResizeMouseDown,
}) => {
  const stopMouseDown = (event: React.MouseEvent) => event.stopPropagation();
  const runWithoutDrag = (event: React.MouseEvent, action: () => void) => {
    event.stopPropagation();
    action();
  };
  const isTextOutput = node.nodeType === 'script_output' || node.nodeType === 'script_detail';

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
      className={`story-node story-node--${node.nodeType}${selected ? ' story-node--selected' : ''}`}
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

        {isTextOutput && node.inputValue && (
          <div className="node-output">
            <div className="node-output__text">{node.inputValue}</div>
            {renderCopyButton(node.inputValue)}
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
              {node.isLoading ? 'Отменить генерацию' : 'Синхронизировать сцены'}
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
                {node.masterPrompt || node.sceneText || 'Описание сцены пока пусто.'}
              </div>
              {node.masterPrompt && renderCopyButton(node.masterPrompt)}
            </div>
            {node.pollinationsApiError && (
              <div className="node-message node-message--error" role="alert">{node.pollinationsApiError}</div>
            )}
            {!node.masterPrompt ? (
              <button
                type="button"
                className={`node-primary-button${node.isLoading ? ' node-primary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => node.isLoading
                  ? onCancelGeneration(id)
                  : onGenerateScenePrompt(id))}
              >
                {node.isLoading ? 'Отменить генерацию' : 'Собрать визуальный промпт'}
              </button>
            ) : (
              <button
                type="button"
                className={`node-secondary-button${node.isLoadingImage ? ' node-secondary-button--cancel' : ''}`}
                onMouseDown={stopMouseDown}
                onClick={(event) => runWithoutDrag(event, () => node.isLoadingImage
                  ? onCancelGeneration(id)
                  : void onGeneratePollinationsImage(id))}
              >
                {node.isLoadingImage ? 'Отменить создание кадра' : 'Создать тестовый кадр'}
              </button>
            )}
          </>
        )}

        {node.nodeType === 'pollinations_image' && (
          <div className="generated-image">
            {node.imageUrl
              ? <img src={node.imageUrl} alt={`Сгенерированный кадр для ${node.label}`} draggable={false} />
              : <span>Кадр недоступен после перезагрузки. Создайте его снова из сцены.</span>}
          </div>
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
