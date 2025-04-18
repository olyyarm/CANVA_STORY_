План v2: Отдельная нода для изображения Pollinations

Задача: Изменить логику генерации изображений Pollinations так, чтобы сгенерированное изображение отображалось в отдельной дочерней ноде, а не внутри ноды "СЦЕНА".

Подход: Ввести новый тип ноды 'pollinations_image', которая будет создаваться/обновляться как дочерняя для ноды "СЦЕНА" после успешной генерации изображения. Изображение внутри этой ноды будет масштабироваться с помощью CSS.

graph TD
    subgraph "UI (NodeRenderer.tsx)"
        A[Кнопка 'ГИ' на 'СЦЕНА'] -->|Клик| B(Вызов handleGeneratePollinationsImage);
        C["Рендер 'СЦЕНА'"] --> D["Кнопка 'ГИ'"];
        C --> E{"node.isLoadingImage?"};
        E -- Да --> F[Индикатор загрузки рядом с 'ГИ'];
        E -- Нет --> G{"node.pollinationsApiError?"};
        G -- Да --> H[Индикатор ошибки '⚠️' рядом с 'ГИ'];
        I["Рендер 'pollinations_image'"] --> J["<img> с src=node.imageUrl"];
        J --> K[CSS: object-fit: contain];
    end

    subgraph "Логика (useNodeManagement.ts)"
        L(handleGeneratePollinationsImage) -->|nodeId| M[Найти 'СЦЕНА'];
        M --> N{Промпт есть?};
        N -- Да --> O[Установить isLoadingImage=true на 'СЦЕНА'];
        N -- Нет --> P[Выход/Ошибка];
        O --> Q[Вызов fetch API Pollinations];
        Q --> R{Ответ API};
        R -- Успех --> S[Создать Object URL];
        S --> T{Найти дочернюю 'pollinations_image'?};
        T -- Да --> U[Обновить imageUrl существующей ноды-картинки];
        T -- Нет --> V[Создать новую ноду 'pollinations_image'];
        V --> W[Добавить новую ноду в state];
        U --> X[Обновить 'СЦЕНА': isLoadingImage=false, clear error];
        W --> X;
        R -- Ошибка --> Y[Обновить 'СЦЕНА': isLoadingImage=false, set error];
    end

    subgraph "Данные (types.ts)"
      Z[Интерфейс NodeData] --> AA(Добавить тип 'pollinations_image');
      AA --> AB(Добавить imageUrl для 'pollinations_image');
      Z --> AC(Убрать pollinationsImageUrl с 'scene');
    end

    B --> L;
    L -- Обновляет state --> C;
    L -- Обновляет state --> I;


Детали реализации:

src/types.ts:

В nodeType добавить 'pollinations_image'.

В интерфейс NodeData добавить поле imageUrl?: string; (для типа pollinations_image).

Удалить поле pollinationsImageUrl?: string; из NodeData (оно больше не нужно на узле scene). Поля isLoadingImage и pollinationsApiError остаются на scene.

src/hooks/useNodeManagement.ts:

В функции handleGeneratePollinationsImage:

При успехе (получен blob, создан newImageUrl):

Искать в nodes дочерний узел с parentId === nodeId и nodeType === 'pollinations_image'.

Если найден (existingImageNodeId):

Получить текущее состояние existingImageNode = nodes[existingImageNodeId].

Если у existingImageNode есть imageUrl, отозвать его: URL.revokeObjectURL(existingImageNode.imageUrl).

Обновить существующую ноду: setNodes(prev => ({ ...prev, [existingImageNodeId]: { ...prev[existingImageNodeId], imageUrl: newImageUrl } })).

Если не найден:

Сгенерировать newImageNodeId.

Рассчитать позицию newX, newY (например, под родительской нодой scene).

Задать newWidth, newHeight (например, 200x150).

Создать объект newImageNodeData: { nodeType: 'pollinations_image', x: newX, y: newY, width: newWidth, height: newHeight, parentId: nodeId, imageUrl: newImageUrl, level: (parentNode.level ?? 0) + 1 }.

Добавить новую ноду: setNodes(prev => ({ ...prev, [newImageNodeId]: newImageNodeData })).

В обоих случаях обновить родительскую ноду scene: setNodes(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], isLoadingImage: false, pollinationsApiError: undefined } })).

При ошибке API:

Обновить только родительскую ноду scene: setNodes(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], isLoadingImage: false, pollinationsApiError: 'текст ошибки' } })).

src/components/NodeRenderer.tsx:

В рендеринге узла scene:

Удалить рендеринг <img> с node.pollinationsImageUrl.

Индикатор ошибки ⚠️ (node.pollinationsApiError) и индикатор загрузки spin (node.isLoadingImage) оставить рядом с кнопкой "ГИ".

Добавить новый блок: else if (node.nodeType === 'pollinations_image') { ... }.

Внутри этого блока:

Рендерить <div className="w-full h-full p-1"> (или с другими отступами).

Внутри div рендерить <img> с:

src={node.imageUrl}

className="w-full h-full object-contain"

alt="Pollinations Image"

onMouseDown={stopPropagation}

src/App.tsx (Возможно):

В initialNodesState убрать инициализацию полей pollinationsImageUrl, isLoadingImage, pollinationsApiError для ноды scene, если они там были добавлены ранее. (Хотя в последней версии их там не было).

Этот план создаст отдельные, связанные ноды для изображений, что улучшит структуру и отображение.