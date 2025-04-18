Адаптированный план: Интеграция генерации изображений Pollinations

Задача: Интегрировать API Pollinations для генерации изображений в узлы типа "СЦЕНА", учитывая текущую структуру кода с хуками и компонентами.

Подход: Прямой вызов API Pollinations из фронтенда. Логика вызова API будет добавлена в хук useNodeManagement, а UI-элементы - в компонент NodeRenderer.

graph TD
    subgraph "UI (NodeRenderer.tsx)"
        A[Кнопка "ГИ" на узле "СЦЕНА"] -->|Клик| B(Вызов handleGeneratePollinationsImage);
        B --> C{Обновление UI};
        C -->|Загрузка| D[Отображение Spinner];
        C -->|Успех| E[Отображение Thumbnail];
        C -->|Ошибка| F[Отображение Иконки ошибки];
        E -->|Клик по Thumbnail| G[Просмотр полного изображения (модальное окно - опционально)];
    end

    subgraph "Логика (useNodeManagement.ts)"
        H(handleGeneratePollinationsImage) -->|Получает nodeId| I[Получение masterPrompt узла];
        I -->|Проверка промпта| J{Промпт есть?};
        J -- Да --> K[Установка isLoadingImage=true];
        J -- Нет --> L[Выход];
        K --> M[Формирование URL API Pollinations];
        M --> N[Вызов fetch API];
        N --> O{Ответ API};
        O -- Успех (200 OK) --> P[Получение blob];
        P --> Q[Создание Object URL];
        Q --> R[Отзыв старого Object URL (если был)];
        R --> S[Обновление узла: isLoadingImage=false, pollinationsImageUrl=newUrl];
        O -- Ошибка --> T[Получение текста ошибки];
        T --> U[Обновление узла: isLoadingImage=false, pollinationsApiError=errorText];
        S --> C;
        U --> C;
    end

    subgraph "Данные (types.ts)"
      V[Интерфейс NodeData] --> W(Добавить поля: isLoadingImage?, pollinationsImageUrl?, pollinationsApiError?);
    end

    B -- Передает nodeId --> H;
    H -- Обновляет состояние --> C;


Детали реализации:

src/types.ts:

Добавить в интерфейс NodeData следующие необязательные поля:

isLoadingImage?: boolean;

pollinationsImageUrl?: string; // Для хранения Object URL

pollinationsApiError?: string; // Для текста ошибки

src/hooks/useNodeManagement.ts:

Добавить новую функцию: handleGeneratePollinationsImage = async (nodeId: string) внутрь хука.

Получить актуальное состояние узла node = nodes[nodeId] (использовать setNodes с колбэком).

Проверить node и node.masterPrompt.

Установить состояние загрузки: setNodes(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], isLoadingImage: true, pollinationsImageUrl: undefined, pollinationsApiError: undefined } })).

Сформировать URL для API Pollinations (использовать node.masterPrompt, размеры 900x600 по умолчанию, model=flux, nologo=1, enhance=1, private=1). Важно: Использовать encodeURIComponent для masterPrompt.

Выполнить fetch(apiUrl, { method: 'GET' }).

В try...catch блоке:

Если response.ok:

Получить blob = await response.blob().

Перед созданием нового URL: Отозвать старый pollinationsImageUrl с помощью URL.revokeObjectURL, если он существует.

Создать imageUrl = URL.createObjectURL(blob).

Обновить состояние: setNodes(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], isLoadingImage: false, pollinationsImageUrl: imageUrl } })).

Если !response.ok:

Получить текст ошибки errorText = await response.text().

Обновить состояние: setNodes(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], isLoadingImage: false, pollinationsApiError: errorText || 'Неизвестная ошибка API' } })).

В catch (error):

Обновить состояние с текстом ошибки: setNodes(prev => ({ ...prev, [nodeId]: { ...prev[nodeId], isLoadingImage: false, pollinationsApiError: error.message || 'Сетевая ошибка' } })).

Обновить возвращаемое значение хука: Добавить handleGeneratePollinationsImage в интерфейс UseNodeManagementReturn и вернуть эту функцию из useNodeManagement.

src/components/NodeRenderer.tsx:

Получить пропсы: Компонент должен получать handleGeneratePollinationsImage, node.isLoadingImage, node.pollinationsImageUrl, node.pollinationsApiError, node.masterPrompt.

Внутри рендера узла scene:

Добавить <button> "ГИ" (стили: оранжевый, круглый, маленький).

Установить title="Сгенерировать изображение (Требуется Master Prompt на английском языке)".

Установить disabled={!node.masterPrompt || node.isLoadingImage}.

Установить onClick={() => handleGeneratePollinationsImage(node.id)}.

Условный рендеринг рядом с кнопкой:

Если node.isLoadingImage - показать spinner.

Если node.pollinationsImageUrl и !node.isLoadingImage - показать <img> (миниатюра).

Если node.pollinationsApiError и !node.isLoadingImage - показать иконку ошибки с title={node.pollinationsApiError}.

src/api.ts (Опционально):

Можно вынести логику fetch запроса к Pollinations в отдельную функцию.