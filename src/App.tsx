import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getGenerationMode } from './api';
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
  const [viewport, setViewport] = useState<ViewportState>(bootstrap.project.viewport);
  const {
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
  } = useNodeManagement(bootstrap.project.nodes);

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

  const getConnectionPath = (parentId: string, childId: string) => {
    const parentNode = nodes[parentId];
    const childNode = nodes[childId];
    if (!parentNode || !childNode) return '';
    const x1 = parentNode.x + (parentNode.width ?? 300);
    const y1 = parentNode.y + (parentNode.height ?? 220) / 2;
    const x2 = childNode.x;
    const y2 = childNode.y + (childNode.height ?? 220) / 2;
    const bend = Math.max(44, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  };

  const gridStyle = {
    backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };
  const worldTransform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

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
            <span className={`mode-badge mode-badge--${getGenerationMode()}`}>
              {getGenerationMode() === 'mock' ? 'Тестовый режим' : 'Mistral API'}
            </span>
          </div>
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
          <g transform={worldTransform}>
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
              onSceneCountChange={handleSceneCountChange}
              onContinueAssociation={handleContinueAssociation}
              onScriptVisualize={handleScriptVisualization}
              onScenarioDetailClick={handleScenarioDetailClick}
              onCreateSceneNodes={handleCreateSceneNodes}
              onGenerateScenePrompt={handleGenerateScenePrompt}
              onCopyToClipboard={handleCopyToClipboard}
              onGeneratePollinationsImage={handleGeneratePollinationsImage}
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
