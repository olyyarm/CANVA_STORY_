import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GenerationMode,
  GenerationSettings,
  ImageGenerationSettings,
  ImageProvider,
  COMFYUI_DEFAULT_CHECKPOINT,
  COMFYUI_DEFAULT_ENDPOINT,
  getDefaultGenerationSettings,
  getDefaultImageGenerationSettings,
  LM_STUDIO_DEFAULT_ENDPOINT,
  LM_STUDIO_DEFAULT_MODEL,
} from './api';
import NodeRenderer from './components/NodeRenderer';
import { useCanvasNavigation } from './hooks/useCanvasNavigation';
import { useDraggableNodes } from './hooks/useDraggableNodes';
import { useNodeManagement } from './hooks/useNodeManagement';
import {
  clearSavedProject,
  createProjectDocument,
  loadSavedProject,
  parseProjectJson,
  projectSnapshot,
  projectToJson,
  saveProject,
} from './project';
import { AppNotice, NodesState, ProjectDocument, ViewportState } from './types';
import './App.css';

const GENERATION_SETTINGS_STORAGE_KEY = 'canva-story.generation-settings.v1';
const IMAGE_GENERATION_SETTINGS_STORAGE_KEY = 'canva-story.image-generation-settings.v1';

const generationModeLabels: Record<GenerationMode, string> = {
  mock: 'Тестовый режим',
  mistral: 'Mistral API',
  lmstudio: 'LM Studio',
};

const imageProviderLabels: Record<ImageProvider, string> = {
  pollinations: 'Pollinations',
  comfyui: 'ComfyUI',
};

const isGenerationMode = (value: unknown): value is GenerationMode =>
  value === 'mock' || value === 'mistral' || value === 'lmstudio';

const isImageProvider = (value: unknown): value is ImageProvider =>
  value === 'pollinations' || value === 'comfyui';

const loadGenerationSettings = (): GenerationSettings => {
  const fallback = getDefaultGenerationSettings();
  try {
    const saved = localStorage.getItem(GENERATION_SETTINGS_STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<GenerationSettings>;
    return {
      mode: isGenerationMode(parsed.mode) ? parsed.mode : fallback.mode,
      lmStudioEndpoint: typeof parsed.lmStudioEndpoint === 'string'
        ? parsed.lmStudioEndpoint
        : LM_STUDIO_DEFAULT_ENDPOINT,
      lmStudioModel: typeof parsed.lmStudioModel === 'string'
        ? parsed.lmStudioModel
        : LM_STUDIO_DEFAULT_MODEL,
    };
  } catch {
    return fallback;
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
      comfyUnloadModel: typeof parsed.comfyUnloadModel === 'boolean'
        ? parsed.comfyUnloadModel
        : true,
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

const App = () => {
  const [bootstrap] = useState(() => {
    const savedProject = loadSavedProject();
    return { project: savedProject ?? createProjectDocument(), restored: Boolean(savedProject) };
  });
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<ProjectDocument>(bootstrap.project);
  const previousNodeCount = useRef(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [pendingProjectAction, setPendingProjectAction] = useState<'new' | 'reset' | null>(null);
  const [projectTitle, setProjectTitle] = useState(bootstrap.project.title);
  const [projectNotice, setProjectNotice] = useState<AppNotice | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(loadGenerationSettings);
  const [imageGenerationSettings, setImageGenerationSettings] = useState<ImageGenerationSettings>(loadImageGenerationSettings);
  const [viewport, setViewport] = useState<ViewportState>(bootstrap.project.viewport);
  const {
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
    handleGenerateSceneLocationAsset,
    handleGenerateSceneCharacterLayer,
    handleGenerateDetailAsset,
    handleCopyToClipboard,
    handleCancelGeneration,
  } = useNodeManagement(bootstrap.project.nodes, generationSettings, imageGenerationSettings);

  const clearSelection = useCallback(() => setSelectedNodeId(null), []);
  const {
    isPanning,
    handleCanvasMouseDown,
    handleWheel,
    fitView,
    centerView,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useCanvasNavigation({
    canvasRef,
    nodes,
    viewport,
    setViewport,
    onBackgroundClick: clearSelection,
  });
  const { handleMouseDown, handleResizeMouseDown } = useDraggableNodes({
    nodes,
    setNodes,
    zoom: viewport.zoom,
    onSelect: setSelectedNodeId,
  });

  const nodeEntries = useMemo(() => Object.entries(nodes), [nodes]);
  const selectedNode = selectedNodeId ? nodes[selectedNodeId] : undefined;
  const deleteCandidate = deleteCandidateId ? nodes[deleteCandidateId] : undefined;
  const visibleNotice = projectNotice ?? notice;
  const lmStudioEndpoint = generationSettings.lmStudioEndpoint.trim();
  const comfyEndpoint = imageGenerationSettings.comfyEndpoint.trim();
  const hasLmStudioMixedContentRisk = generationSettings.mode === 'lmstudio'
    && window.location.protocol === 'https:'
    && lmStudioEndpoint.startsWith('http://')
    && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(lmStudioEndpoint);
  const hasComfyMixedContentRisk = imageGenerationSettings.provider === 'comfyui'
    && window.location.protocol === 'https:'
    && comfyEndpoint.startsWith('http://')
    && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(comfyEndpoint);

  const showProjectNotice = useCallback((tone: AppNotice['tone'], message: string) => {
    setProjectNotice({ id: Date.now(), tone, message });
  }, []);

  const dismissNotice = useCallback(() => {
    setProjectNotice(null);
    clearNotice();
  }, [clearNotice]);

  useEffect(() => {
    if (!visibleNotice) return;
    const timer = window.setTimeout(dismissNotice, 3800);
    return () => window.clearTimeout(timer);
  }, [dismissNotice, visibleNotice]);

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
    setSaveStatus('saving');
    const timer = window.setTimeout(() => {
      try {
        const snapshot = projectSnapshot(projectRef.current, nodes, viewport, projectTitle);
        saveProject(snapshot);
        projectRef.current = snapshot;
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 550);
    return () => window.clearTimeout(timer);
  }, [nodes, projectTitle, viewport]);

  useEffect(() => {
    const saveBeforeUnload = () => {
      try {
        saveProject(projectSnapshot(projectRef.current, nodes, viewport, projectTitle));
      } catch {
        // The visible save indicator reports quota or storage failures during normal work.
      }
    };
    window.addEventListener('beforeunload', saveBeforeUnload);
    return () => window.removeEventListener('beforeunload', saveBeforeUnload);
  }, [nodes, projectTitle, viewport]);

  useEffect(() => {
    const nodeCount = nodeEntries.length;
    if (bootstrap.restored && previousNodeCount.current === 0) {
      previousNodeCount.current = nodeCount;
      return;
    }
    if (nodeCount > previousNodeCount.current) {
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
        const imageUrl = nextNodes[nodeId]?.imageUrl;
        if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
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
    setNodes(project.nodes);
    setViewport(project.viewport);
    setProjectTitle(project.title);
    setSelectedNodeId(null);
    setDeleteCandidateId(null);
    setPendingProjectAction(null);
    setSaveStatus('saved');
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
    showProjectNotice(
      'success',
      pendingProjectAction === 'new'
        ? 'Создан новый локальный проект.'
        : 'Локальные данные очищены, восстановлен стартовый проект.',
    );
  }, [applyProject, pendingProjectAction, showProjectNotice]);

  const handleExport = useCallback(() => {
    const snapshot = projectSnapshot(projectRef.current, nodes, viewport, projectTitle);
    const blob = new Blob([projectToJson(snapshot)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = snapshot.title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'canva-story-project';
    link.href = url;
    link.download = `${safeTitle}.canva-story.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showProjectNotice('success', 'Проект экспортирован в JSON без тяжёлых изображений.');
  }, [nodes, projectTitle, showProjectNotice, viewport]);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const importedProject = parseProjectJson(await file.text());
      saveProject(importedProject);
      applyProject(importedProject);
      showProjectNotice('success', `Проект «${importedProject.title}» импортирован.`);
    } catch (error) {
      setSaveStatus('error');
      showProjectNotice('error', error instanceof Error ? error.message : 'Не удалось импортировать проект.');
    }
  }, [applyProject, showProjectNotice]);

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

  const handleComfyUnloadModelChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setImageGenerationSettings((settings) => ({ ...settings, comfyUnloadModel: event.target.checked }));
  }, []);

  const getConnectionPath = (parentId: string, childId: string) => {
    const parentNode = nodes[parentId];
    const childNode = nodes[childId];
    if (!parentNode || !childNode) return '';
    const parentWidth = parentNode.width ?? 300;
    const parentHeight = parentNode.height ?? 220;
    const childWidth = childNode.width ?? 300;
    const childHeight = childNode.height ?? 220;
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
            <span className={`save-indicator save-indicator--${saveStatus}`}>
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
                  placeholder={LM_STUDIO_DEFAULT_MODEL}
                  aria-label="Модель LM Studio"
                />
              </>
            )}
          </div>
          {hasLmStudioMixedContentRisk && (
            <div className="generation-warning" role="status">
              GitHub Pages работает по HTTPS. Для HTTP-адреса в домашней сети браузер может потребовать локальный запуск приложения или HTTPS/proxy.
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
            {imageGenerationSettings.provider === 'comfyui' && (
              <>
                <input
                  className="generation-endpoint-input"
                  value={imageGenerationSettings.comfyEndpoint}
                  onChange={handleComfyEndpointChange}
                  placeholder={COMFYUI_DEFAULT_ENDPOINT}
                  aria-label="Endpoint ComfyUI"
                />
                <input
                  className="generation-model-input"
                  value={imageGenerationSettings.comfyCheckpoint}
                  onChange={handleComfyCheckpointChange}
                  placeholder={COMFYUI_DEFAULT_CHECKPOINT}
                  aria-label="Checkpoint SDXL для ComfyUI"
                />
                <label className="generation-toggle">
                  <input
                    type="checkbox"
                    checked={imageGenerationSettings.comfyUnloadModel}
                    onChange={handleComfyUnloadModelChange}
                  />
                  <span>Выгружать</span>
                </label>
              </>
            )}
          </div>
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
          <span className="node-count">{nodeEntries.length} нод</span>
          <button type="button" onClick={() => setPendingProjectAction('new')}>Новый</button>
          <button type="button" onClick={handleExport}>Экспорт</button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>Импорт</button>
          <button type="button" className="toolbar-danger-button" onClick={() => setPendingProjectAction('reset')}>Сброс</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
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
            {nodeEntries.map(([childId, childNode]) => childNode.parentId && (
              <path
                key={`${childNode.parentId}-${childId}`}
                d={getConnectionPath(childNode.parentId, childId)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        </svg>

        <div className="canvas-world" style={{ transform: worldTransform }}>
          {nodeEntries.map(([id, node]) => (
            <NodeRenderer
              key={id}
              id={id}
              node={node}
              selected={selectedNodeId === id}
              onMouseDown={handleMouseDown}
              onResizeMouseDown={handleResizeMouseDown}
              onDelete={setDeleteCandidateId}
              onInputChange={handleInputChange}
              onThemeInputChange={handleThemeInputChange}
              onModelChange={handleModelChange}
              onImagePipelineChange={handleImagePipelineChange}
              onSceneCountChange={handleSceneCountChange}
              onContinueAssociation={handleContinueAssociation}
              onScriptVisualize={handleScriptVisualization}
              onScenarioDetailClick={handleScenarioDetailClick}
              onCreateSceneNodes={handleCreateSceneNodes}
              onGenerateSceneLocationAsset={handleGenerateSceneLocationAsset}
              onGenerateSceneCharacterLayer={handleGenerateSceneCharacterLayer}
              onGenerateDetailAsset={handleGenerateDetailAsset}
              onCopyToClipboard={handleCopyToClipboard}
              imageProvider={imageGenerationSettings.provider}
              onCancelGeneration={handleCancelGeneration}
            />
          ))}
        </div>

        <div className="canvas-help">
          Перетаскивайте ноды · тяните фон для панорамы · колесо мыши меняет масштаб
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
              <button type="button" className="danger-button" onClick={confirmProjectAction}>
                {pendingProjectAction === 'new' ? 'Создать проект' : 'Сбросить всё'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default App;
