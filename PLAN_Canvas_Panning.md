# План реализации панорамирования холста

Цель: Добавить возможность перемещать (панорамировать) холст в проекте "Canva Story" с помощью перетаскивания фона мышью.

## Шаги реализации

1.  **Подготовка состояния в `src/App.tsx`:**
    *   Добавить состояние для хранения текущего смещения холста: `const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });`
    *   Добавить состояние для отслеживания активного панорамирования: `const [isPanning, setIsPanning] = useState(false);`
    *   Добавить `ref` для хранения начальной точки панорамирования: `const panStartRef = useRef({ startX: 0, startY: 0, initialOffsetX: 0, initialOffsetY: 0 });`

2.  **Изменение CSS и структуры в `src/App.tsx`:**
    *   Убрать `overflow-hidden` с основного `div` (строка 70 в текущей версии).
    *   Применить `transform: translate(${canvasOffset.x}px, ${canvasOffset.y}px)` к контейнерам SVG (строка 72) и узлов (`div#canvas-area`, строка 93), чтобы они смещались синхронно.

3.  **Реализация обработчиков панорамирования в `src/App.tsx`:**
    *   **`handlePanMouseDown(event: React.MouseEvent)`:**
        *   Добавить этот обработчик на основной `div` (контейнер холста).
        *   Проверить, что клик был именно по фону (`event.target === event.currentTarget`).
        *   Если клик по фону:
            *   `event.preventDefault()` и `event.stopPropagation()`.
            *   `setIsPanning(true)`.
            *   Сохранить начальные координаты мыши и текущее смещение: `panStartRef.current = { startX: event.clientX, startY: event.clientY, initialOffsetX: canvasOffset.x, initialOffsetY: canvasOffset.y };`
    *   **`handlePanMouseMove(event: MouseEvent)`:**
        *   Добавить глобальный слушатель `mousemove` на `window` (в `useEffect`).
        *   Если `isPanning === true`:
            *   Рассчитать новое смещение:
                *   `const dx = event.clientX - panStartRef.current.startX;`
                *   `const dy = event.clientY - panStartRef.current.startY;`
                *   `setCanvasOffset({ x: panStartRef.current.initialOffsetX + dx, y: panStartRef.current.initialOffsetY + dy });`
    *   **`handlePanMouseUp(event: MouseEvent)`:**
        *   Добавить глобальный слушатель `mouseup` на `window` (в `useEffect`).
        *   Если `isPanning === true`:
            *   `setIsPanning(false)`.

4.  **Корректировка перетаскивания узлов (`src/hooks/useDraggableNodes.ts`):**
    *   Передать текущее `canvasOffset` в хук `useDraggableNodes`.
    *   В `handleMouseMove` внутри хука, при расчете `newX` и `newY` (строки 56-57 в текущей версии), учесть `canvasOffset`:
        *   `let newX = event.clientX - canvasRect.left - offset.current.x - canvasOffset.x;`
        *   `let newY = event.clientY - canvasRect.top - offset.current.y - canvasOffset.y;`
        *   *(Примечание: Это упрощенный расчет без учета масштабирования. Если в будущем будет добавлен зум, формулу нужно будет скорректировать)*

## Визуализация плана (Mermaid)

```mermaid
graph TD
    A[Начало: Холст зафиксирован] --> B(1. Добавить состояние: canvasOffset, isPanning, panStartRef);
    B --> C(2. Изменить CSS/Структуру: убрать overflow-hidden, применить transform к SVG и #canvas-area);
    C --> D{3. Реализовать обработчики панорамирования};
    D -- mousedown на фон --> E[handlePanMouseDown: Установить isPanning=true, запомнить panStartRef];
    D -- mousemove (глобально) --> F{Проверить isPanning};
    F -- Да --> G[handlePanMouseMove: Рассчитать новое canvasOffset, обновить состояние];
    F -- Нет --> H[Ничего не делать];
    D -- mouseup (глобально) --> I{Проверить isPanning};
    I -- Да --> J[handlePanMouseUp: Установить isPanning=false];
    I -- Нет --> K[Ничего не делать];
    J --> L(4. Скорректировать useDraggableNodes: передать canvasOffset, учесть его при расчете координат узла);
    G --> L;
    L --> M[Конец: Холст можно панорамировать перетаскиванием фона];

    subgraph "Обработка событий панорамирования"
        direction LR
        E --> F;
        F --> I;
    end

    subgraph "Обновление UI"
        direction TB
        G --> TransformApply[Применить transform(canvasOffset) к SVG и #canvas-area];
    end

    subgraph "Взаимодействие с узлами"
        direction TB
        L --> DragNodesUpdate[useDraggableNodes учитывает canvasOffset при расчете newX/newY];
    end