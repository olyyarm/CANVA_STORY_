// src/App.tsx - Refactored
import React, { useState, useRef } from 'react'; // Added useState, useRef
// Import removed by insert_content operation above
import { NodesState } from './types';
import { MISTRAL_MODELS } from './constants'; // Changed from IONET_MODELS
import { useNodeManagement } from './hooks/useNodeManagement';
import { useDraggableNodes } from './hooks/useDraggableNodes';
import NodeRenderer from './components/NodeRenderer';
import './App.css';

// Начальное состояние узлов
const initialNodesState: NodesState = {
node1: {
nodeType: 'text', x: 50, y: 50, label: 'ТЕКСТ',
hasInput: true, hasButton: true, buttonLabel: 'Ассоциации', inputValue: '',
width: 350, height: 200,
isLoading: false, level: 0,
},
node2: { // Example scene node
nodeType: 'scene', x: 450, y: 50, label: 'СЦЕНА 1',
width: 300, height: 300, level: 0,
hasGenerationButton: true,
masterPrompt: '', // Initialize as empty
isLoading: false, // For prompt generation
isLoadingImage: false, // For Pollinations image generation
pollinationsApiError: undefined, // For Pollinations API errors
},
scriptInputNode: {
nodeType: 'script_input', x: 50, y: 300, label: 'Сценарий (ввод)',
hasInput: true, isLongInput: true, hasButton: true, buttonLabel: 'Визуализировать', inputValue: '', themeInputValue: '',
width: 350, height: 400,
isLoading: false, level: 0, outputNodeLabel: 'СЦЕНАРИЙ ВИЗУАЛИЗАЦИЯ',
selectedModel: MISTRAL_MODELS[0] || '', // Changed from IONET_MODELS
}
};

function App() {
  // Состояния и ref для панорамирования холста
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ startX: 0, startY: 0, initialOffsetX: 0, initialOffsetY: 0 });


// Используем хук для управления узлами
const {
nodes,
setNodes,
handleInputChange,
handleThemeInputChange,
handleModelChange,
handleContinueAssociation,
handleScriptVisualization,
handleScenarioDetailClick,
handleCreateSceneNodes,
handleGenerateScenePrompt,
handleCopyToClipboard,
handleGeneratePollinationsImage
} = useNodeManagement(initialNodesState);

// Используем хук для перетаскивания, передаем canvasOffset
const { handleMouseDown } = useDraggableNodes({ nodes, setNodes });

// Функция расчета координат линии
const getLineCoords = (parentId: string, childId: string): { x1: number; y1: number; x2: number; y2: number } | null => {
const parentNode = nodes[parentId];
const childNode = nodes[childId];
if (!parentNode || !childNode) return null;
const x1 = parentNode.x + (parentNode.width ?? 150);
const y1 = parentNode.y + (parentNode.height ?? 50) / 2;
const x2 = childNode.x;
const y2 = childNode.y + (childNode.height ?? 50) / 2;
return { x1, y1, x2, y2 };
}

 // --- Обработчики панорамирования ---
 const handlePanMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
   console.log("handlePanMouseDown triggered"); // DEBUG
   // Панорамирование только при клике на сам фон, а не на дочерние элементы (узлы)
   if (event.target === event.currentTarget) {
     console.log("Panning started on background"); // DEBUG
     event.preventDefault();
     event.stopPropagation();
     setIsPanning(true);
     panStartRef.current = {
       startX: event.clientX,
       startY: event.clientY,
       initialOffsetX: canvasOffset.x,
       initialOffsetY: canvasOffset.y,
     };
     // Можно добавить класс для изменения курсора во время панорамирования, если нужно
     // document.body.style.cursor = 'grabbing';
   }
 };

 const handlePanMouseMove = (event: MouseEvent) => {
   // console.log("handlePanMouseMove triggered, isPanning:", isPanning); // DEBUG (can be noisy)
   if (!isPanning) return;
   console.log("Panning detected, calculating offset..."); // DEBUG
   event.preventDefault();
   const dx = event.clientX - panStartRef.current.startX;
   const dy = event.clientY - panStartRef.current.startY;
   setCanvasOffset({
     x: panStartRef.current.initialOffsetX + dx,
     y: panStartRef.current.initialOffsetY + dy,
   });
 };

 const handlePanMouseUp = (event: MouseEvent) => {
   // console.log("handlePanMouseUp triggered, isPanning:", isPanning); // DEBUG
   if (isPanning) {
     console.log("Panning stopped"); // DEBUG
     event.preventDefault();
     setIsPanning(false);
     // Возвращаем стандартный курсор
     // document.body.style.cursor = 'default';
   }
 };

 // --- Эффект для глобальных слушателей панорамирования ---
 React.useEffect(() => {
   // Добавляем слушатели только если isPanning === true, чтобы не слушать без дела?
   // Нет, mouseup нужно слушать всегда, чтобы завершить панорамирование, если оно началось
   window.addEventListener('mousemove', handlePanMouseMove);
   window.addEventListener('mouseup', handlePanMouseUp);

   // Очистка слушателей при размонтировании компонента
   return () => {
     window.removeEventListener('mousemove', handlePanMouseMove);
     window.removeEventListener('mouseup', handlePanMouseUp);
   };
 }, [isPanning]); // Перезапускаем эффект при изменении isPanning (для handlePanMouseMove), но mouseup должен быть всегда
 // ^^^^ ПРОВЕРКА: Зависимость от isPanning нужна, чтобы handlePanMouseMove получал актуальное значение isPanning.
 // handlePanMouseUp тоже будет использовать актуальное isPanning благодаря замыканию.

return (
// Removed overflow-hidden, Added onMouseDown for panning, Added dotted background class
<div className="w-screen h-screen bg-gray-800 relative canvas-background-dotted" onMouseDown={handlePanMouseDown}>
{/* SVG слой для линий - Applying transform */}
<svg
  className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
  style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)` }}
>
{Object.entries(nodes).map(([childId, childNode]) => {
if (!childNode.parentId) return null;
const coords = getLineCoords(childNode.parentId, childId);
if (!coords) return null;
return (
// Using string concatenation for the key as a workaround
<line
key={childNode.parentId + '-' + childId} // Simplified key syntax
x1={coords.x1}
y1={coords.y1}
x2={coords.x2}
y2={coords.y2}
stroke="#9ca3af"
strokeWidth="2"
/>
);
})}
</svg>

{/* Контейнер для нод - Applying transform */}
  <div
    className="absolute top-0 left-0 w-full h-full pointer-events-none" // Added pointer-events-none
    id="canvas-area"
    style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px)` }}
  >
    {Object.entries(nodes).map(([id, node]) => (
      <NodeRenderer // NodeRenderer should re-enable pointer events
        key={id}
        id={id}
        node={node}
        onMouseDown={handleMouseDown}
        onInputChange={handleInputChange}
        onThemeInputChange={handleThemeInputChange}
        onModelChange={handleModelChange}
        onContinueAssociation={handleContinueAssociation}
        onScriptVisualize={handleScriptVisualization}
        onScenarioDetailClick={handleScenarioDetailClick}
        onCreateSceneNodes={handleCreateSceneNodes}
        onGenerateScenePrompt={handleGenerateScenePrompt}
        onCopyToClipboard={handleCopyToClipboard}
        onGeneratePollinationsImage={handleGeneratePollinationsImage}
      />
    ))}
  </div>
</div>


);
}

export default App;