# План рефакторинга App.tsx

**Задача:** Разделить большой компонент `src/App.tsx` на более мелкие, управляемые модули для улучшения читаемости и поддержки.

**Предлагаемая структура:**

1.  **Типы данных (`src/types.ts`):**
    *   Вынести интерфейсы `NodeData` и `NodesState`.
2.  **Константы (`src/constants.ts`):**
    *   Вынести все строки с промптами (`COMMON_POSTFIX`, `ASSOCIATE_SYSTEM_PROMPT` и т.д.).
    *   Вынести массив `llmModels`.
3.  **Утилиты (`src/utils.ts`):**
    *   Вынести функции `generateNodeId`, `getNodeIcon`, `calculateTextWidth`.
4.  **Логика API (`src/api.ts`):**
    *   Вынести функцию `callLmStudioAPI`.
5.  **Хуки (`src/hooks/`):**
    *   **`useDraggableNodes.ts`**: Кастомный хук для логики перетаскивания узлов.
    *   **`useNodeManagement.ts`**: Основной хук для управления состоянием узлов и обработчиками действий (использует `callLmStudioAPI`).
6.  **Компоненты (`src/components/`):**
    *   **`NodeRenderer.tsx`**: Компонент для рендеринга одного узла.
7.  **Обновленный `App.tsx`:**
    *   Импортировать вынесенные модули.
    *   Использовать кастомные хуки.
    *   Оставить только основную структуру и рендеринг `NodeRenderer` в цикле.

**Визуализация структуры (Mermaid):**

```mermaid
graph TD
    App[App.tsx] -->|использует| useDraggableNodes[hooks/useDraggableNodes.ts]
    App -->|использует| useNodeManagement[hooks/useNodeManagement.ts]
    App -->|рендерит| NodeRenderer[components/NodeRenderer.tsx]
    App -->|импорт| Types[types.ts]
    App -->|импорт| Constants[constants.ts]
    App -->|импорт| Utils[utils.ts]

    useNodeManagement -->|использует| Api[api.ts]
    useNodeManagement -->|импорт| Types
    useNodeManagement -->|импорт| Constants
    useNodeManagement -->|импорт| Utils

    NodeRenderer -->|импорт| Types
    NodeRenderer -->|импорт| Utils

    Api -->|импорт| Types
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
IGNORE_WHEN_COPYING_END