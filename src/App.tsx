// src/App.tsx - Добавляем генерацию деталей сценария
import React, { useState, useRef, useEffect, useCallback } from 'react';

// Определяем тип для данных ноды
interface NodeData {
  x: number;
  y: number;
  // color: string; // Убрано, используем Tailwind классы
  label: string; // Может быть заголовком или текстом ассоциации
  // borderColor: string; // Убрано, используем Tailwind классы
  // Флаги и данные для разных типов нод
  hasInput?: boolean;
  isLongInput?: boolean;
  hasButton?: boolean;
  buttonLabel?: string;
  inputValue?: string;      // Основной текст (ввод или результат генерации)
  outputNodeLabel?: string; // Метка для типа ноды 'СЦЕНАРИЙ ВИЗУАЛИЗАЦИЯ'
  nodeType?: 'text' | 'scene' | 'script_input' | 'script_output' | 'association' | 'script_detail'; // Явный тип ноды
  themeInputValue?: string; // Поле для темы/сеттинга в script_input
  selectedModel?: string; // НОВОЕ: Выбранная модель LLM для script_input
  // Флаги и данные для сгенерированных нод
  isLoading?: boolean;
  isGenerated?: boolean;
  canContinue?: boolean; // Для ассоциаций
  // Общие
  level?: number;
  parentId?: string;
  width?: number;
  height?: number;
  // Поля для генерации промпта сцены
  hasGenerationButton?: boolean; // Для узлов типа 'scene'
  masterPrompt?: string;       // Результат генерации для 'scene'
}

interface NodesState {
  [id: string]: NodeData;
}

const generateNodeId = () => `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

// --- Промпты ---
const COMMON_POSTFIX = "Не делай оценочных суждений, не используй заголовки, не используй markdown отвечай сразу на сообщение.";
const ASSOCIATE_SYSTEM_PROMPT = `Ты - помощник по ассоциациям. Получив слово или фразу, перечисли элементы, из которых оно может состоять, и вещи или концепции, с которыми оно ассоциируется. ${COMMON_POSTFIX}`;
const CONTINUE_ASSOCIATE_SYSTEM_PROMPT = `Для данной фразы приведи не более 3 очень кратких примеров или связанных концепций. ${COMMON_POSTFIX}`;
const SCENARIO_SYSTEM_PROMPT = `Ты - режиссер короткометражных роликов. Твоя задача - просмотреть этот текст (наговор из ролика) и придумать, как можно интересно и необычно визуализировать этот материал. Представь результат в виде подробного сценария с описанием сцен, действий и визуальных эффектов. Каждую сцену начинай с заголовка в формате 'Сцена N:', где N - номер сцены. ${COMMON_POSTFIX}`;
// Новые промпты для деталей сценария (добавляем COMMON_POSTFIX)
const HERO_DETAIL_SYSTEM_PROMPT = `Из следующего сценария отметь всех главных героев и выпиши их каждого одной строкой без переносов и без заголовков вот по такому шаблону: Имя/роль: «Главный герой: ученый по имени Грей» Внешность: рост/комплекция, черты лица, волосы, цвет глаз, Одежда/облик: тип костюма, аксессуары, стиль (повседневный, футуристический, фэнтези). ${COMMON_POSTFIX}`;
const LOCATION_DETAIL_SYSTEM_PROMPT = `Из следующего сценария отметь все локации которые там будут выпиши их каждую одной строкой без заголовков, разделить локации с помощью \\h использовать вот этот шаблон: Название/тип локации: «Средневековая библиотека», «Киберпанк-город», «Заброшенный храм». Основной стиль: реалистичный, фэнтези, стимпанк, sci-fi, постапокалипсис. Ключевые элементы окружения: архитектура, мебель, растительность, техника (например, «высокие каменные колонны и витражи», «неоновые вывески, летающие дроны»). Атмосфера/настроение: спокойная, мрачная, загадочная, праздничная. Освещение и время суток: солнечный день, сумерки с туманом, ночной город в лучах неона. Центральная деталь: большая статуя в центре зала, фонтаны, странные артефакты, массивные двери. Цветовая палитра: тёплые пастельные тона, яркий кислотный неон, холодные синеватые оттенки. Уровень детализации/стиль рисовки: ультрареалистичный, акварель, аниме, низкополигональный (low-poly). ${COMMON_POSTFIX}`;
const MOOD_DETAIL_SYSTEM_PROMPT = `Прочитай следующий сценарий. Для каждой сцены, пожалуйста, опиши общее настроение (mood) максимально подробно. Учитывай такие аспекты, как эмоциональный фон, тон повествования, доминирующие чувства персонажей, атмосферу окружающей обстановки и любые визуальные/аудиальные детали, которые усиливают это настроение. Не ограничивайся одним словом; дай развернутое, детализированное описание, показывающее, как именно это настроение ощущается зрителем. ${COMMON_POSTFIX}`;
// Промпт для генерации Master Prompt сцены
const SCENE_MASTER_PROMPT_SYSTEM_PROMPT = `Входные данные:
Сценарий, где каждая сцена имеет номер (например, “Сцена 1”), время (например, “0:00–0:05”) и краткое описание событий.
Персонажи: список с именами и подробными описаниями внешности, одежды и при необходимости — ключевых аксессуаров.
Локации: список с названием, архитектурным стилем, визуальными деталями, окружением.
Настроения (moods): список, где каждому настроению дано развернутое описание атмосферы/эмоционального фона.
Твоя задача:
Определить, какие персонажи и локации задействованы в конкретной сцене (по её номеру).
Учесть, какое настроение (mood) относится к этой сцене, и как это должно отражаться во внешнем виде, освещении или общем тоне описания.
Сформировать подробное текстовое описание (либо «master prompt»), предназначенное для генерации визуального материала (изображения, раскадровки и т. п.).
Если в сцене нет персонажей или нет локации, это явно укажи: «В этой сцене персонажи не присутствуют» или «Здесь только общий пейзаж».
Формат вывода:
Укажи название/номер сцены и её таймкод (например, «Сцена 1: 0:00–0:05»).
Опиши, какие персонажи (если есть), включая детали их внешнего вида, позы, выражения лица и т. д.
Опиши локацию (архитектуру, окружение, погодные условия), в зависимости от того, что подходит для этой сцены.
Отрази общее настроение (из списка moods): как оно выражается (цветовая гамма, освещение, эмоциональная атмосфера).
Сформируй единый развёрнутый текст, подходящий для text-to-image генератора, без избыточных деталей (например, внутренняя мотивация персонажей не нужна, если не влияет на визуал).
Пожалуйста, выдай результат в одном блоке текста, чтобы мы могли прямо использовать его в системе генерации (Midjourney, Stable Diffusion и т. п.).
Важно:
Не включай лишней информации, не относящейся к визуальному облику/атмосфере.
Соблюдай логику: если в источниках сказано, что Сцена 1 длится 0:00–0:05, а в ней появляется только Локация А и Персонаж Б, то не нужно добавлять другие локации и героев.
Если в сцене есть упоминание о погодных условиях (туман, облака, дождь), включи это в описание.
Если нет персонажа (например, только панорамный вид), опиши пейзаж и визуальное настроение.
Пример (упрощённый):
«Сцена 1 (0:00–0:05). Локация: Высокая крепость на скале, окружённая туманными облаками. Настроение: таинственно-спокойное, мягкий рассеянный свет. Персонажей нет. Итоговый prompt: “A grand medieval fortress rising out of swirling mist at dawn, soft ambient lighting, mysterious and tranquil mood…”»
Используй такой же подход для всех сцен, объединяя данные из сценария, списка персонажей, локаций и настроений. ${COMMON_POSTFIX}`;

// --- Основной компонент App ---
// --- Константы и утилиты ---
const llmModels = [
  "gemma-3-27b-it",
  "gemma-3-12b-it",
  "phi-4",
  "deepseek-r1-distill-qwen-32b",
  "deepseek-r1-distill-qwen-14b",
  "meta-llama-3.1-8b-instruct-128k"
];

const getNodeIcon = (nodeType?: string, label?: string): string => {
    // Используем относительные пути от папки public/ или убедитесь, что Vite обрабатывает эти пути
    // Если иконки лежат в src/, импортируйте их как модули
    switch (nodeType) {
        case 'text': return '/icon/text.png'; // Путь относительно public/
        case 'scene': return '/icon/location.png'; // Иконка локации для сцены
        case 'script_input': return '/icon/scenariy_vvod.png';
        case 'script_output': return '/icon/scenariy_generated.png';
        case 'association': return '/icon/generated_associacii_.png';
        case 'script_detail':
            if (label === 'Герои') return '/icon/character.png';
            if (label === 'Локации') return '/icon/location.png';
            if (label === 'Настроение') return '/icon/emotion.png';
            return '/icon/metaprompt.png'; // Иконка по умолчанию для деталей
        default: return '/icon/metaprompt.png'; // Иконка по умолчанию
    }
};


// --- Основной компонент App ---
function App() {
  const [nodes, setNodes] = useState<NodesState>({
     node1: { // ТЕКСТ
      nodeType: 'text', x: 50, y: 50, label: 'ТЕКСТ',
      hasInput: true, hasButton: true, buttonLabel: 'Ассоциации', inputValue: '',
      width: 350, height: 200, // Размеры под новый дизайн
      isLoading: false, level: 0,
    },
    node2: { // СЦЕНА (пример)
      nodeType: 'scene', x: 450, y: 50, label: 'СЦЕНА 1',
      width: 250, height: 250, level: 0, // Размеры под новый дизайн
      hasGenerationButton: true, // Добавляем кнопку по умолчанию для примера
      masterPrompt: '', isLoading: false,
    },
    scriptInputNode: { // СЦЕНАРИЙ (Ввод)
      nodeType: 'script_input', x: 50, y: 300, label: 'Сценарий (ввод)',
      hasInput: true, isLongInput: true, hasButton: true, buttonLabel: 'Визуализировать', inputValue: '', themeInputValue: '',
      width: 350, height: 400, // Увеличим высоту для нового поля и селекта
      isLoading: false, level: 0, outputNodeLabel: 'СЦЕНАРИЙ ВИЗУАЛИЗАЦИЯ',
      selectedModel: llmModels[0] || '', // Инициализируем первой моделью из списка
    }
  });

  const draggingNodeId = useRef<string | null>(null);
  const offset = useRef({ x: 0, y: 0 });

  // --- Обработчики перетаскивания --- (без изменений)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>, nodeId: string) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('textarea, button')) return;
    draggingNodeId.current = nodeId;
    const rect = e.currentTarget.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
    const currentLevel = nodes[nodeId]?.level ?? 1;
    e.currentTarget.style.zIndex = `${currentLevel + 10}`;
    Object.keys(nodes).forEach(id => {
        if (id !== nodeId) {
            const el = document.getElementById(`node-${id}`);
            if (el) el.style.zIndex = `${nodes[id]?.level ?? 1}`;
        }
    });
  }, [nodes]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingNodeId.current) return;
    const nodeId = draggingNodeId.current;
    const newX = e.clientX - offset.current.x;
    const newY = e.clientY - offset.current.y;
    setNodes(prevNodes => ({ ...prevNodes, [nodeId]: { ...prevNodes[nodeId], x: newX, y: newY } }));
  }, []);

  const handleMouseUp = useCallback(() => {
    if (draggingNodeId.current) {
       const nodeId = draggingNodeId.current;
       const el = document.getElementById(`node-${nodeId}`);
       if (el) el.style.zIndex = `${nodes[nodeId]?.level ?? 1}`;
       draggingNodeId.current = null;
    }
  }, [nodes]);
  // --- Конец обработчиков перетаскивания ---

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string): void => {
    const newValue = e.target.value;
    setNodes(prevNodes => ({ ...prevNodes, [nodeId]: { ...prevNodes[nodeId], inputValue: newValue } }));
  };
  
    // Новый обработчик для поля темы/сеттинга
    const handleThemeInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string): void => {
      const newValue = e.target.value;
      setNodes(prevNodes => ({ ...prevNodes, [nodeId]: { ...prevNodes[nodeId], themeInputValue: newValue } }));
    };
  // НОВЫЙ обработчик для выбора модели
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>, nodeId: string): void => {
    const newModel = e.target.value;
    setNodes(prevNodes => ({ ...prevNodes, [nodeId]: { ...prevNodes[nodeId], selectedModel: newModel } }));
  };

  // --- Универсальная функция для API запроса ---
  const callLmStudioAPI = useCallback(async (
      sourceNodeId: string,
      prompt: string, // Текст пользователя
      systemPrompt: string, // Системный промпт для LLM
      options: {
          model?: string; // НОВОЕ: Модель для использования
          maxResults?: number | null;
          outputNodeLabel?: string;
          isDetail?: boolean;
          max_tokens?: number;
      } = {}
  ): Promise<string | null> => {
      setNodes(prevNodes => ({ ...prevNodes, [sourceNodeId]: { ...prevNodes[sourceNodeId], isLoading: true } }));
      console.log(`[API] Calling LM Studio for node ${sourceNodeId}. Prompt type: ${systemPrompt.substring(0,20)}...`);
      try {
          const response = await fetch('http://localhost:1234/v1/chat/completions', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  model: options.model || "gemma-3-12b-it", // Используем модель из options или дефолтную
                  messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
                  temperature: 0.7,
                  max_tokens: options.max_tokens ?? (options.outputNodeLabel || options.isDetail ? 1500 : (options.maxResults ? options.maxResults * 30 + 20 : 150)), // Приоритет для options.max_tokens
                  stream: false
              }),
          });
          if (!response.ok) throw new Error(`API Error: ${response.status}`);
          const data = await response.json();
          const generatedContent = data.choices?.[0]?.message?.content?.trim();
          if (!generatedContent) throw new Error("Empty response from API");
          console.log('[API] LM Studio response OK.');
          setNodes(prevNodes => ({ ...prevNodes, [sourceNodeId]: { ...prevNodes[sourceNodeId], isLoading: false } }));
          return generatedContent;
      } catch (error) {
          console.error('[API] LM Studio API error:', error);
          setNodes(prevNodes => ({ ...prevNodes, [sourceNodeId]: { ...prevNodes[sourceNodeId], isLoading: false } }));
          alert(`Ошибка API: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
          return null;
      }
  }, []); // setNodes стабильна

  // --- Функции генерации ---
  const handleInitialAssociation = useCallback(async (sourceNodeId: string) => {
    console.log(`[HANDLER] handleInitialAssociation called for: ${sourceNodeId}`);
    const sourceNode = nodes[sourceNodeId];
    if (!sourceNode || !sourceNode.inputValue) return;
    const generatedContent = await callLmStudioAPI(sourceNodeId, sourceNode.inputValue, ASSOCIATE_SYSTEM_PROMPT);
    if (!generatedContent) return;
    const lines = generatedContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const newNodes: NodesState = {};
    const baseWidth = 200; const baseHeight = 50;
    const startX = sourceNode.x + (sourceNode.width ?? 150) + 40;
    let currentY = sourceNode.y; const sourceLevel = sourceNode.level ?? 0;
    lines.forEach((line) => {
        const cleanLine = line.replace(/^[\s*•-]*\s*(\d+\.\s*)?/, ''); if (!cleanLine) return;
        const newNodeId = generateNodeId();
        newNodes[newNodeId] = {
            nodeType: 'association', x: startX, y: currentY, label: cleanLine,
            width: baseWidth, height: baseHeight, isGenerated: true, canContinue: true,
            level: sourceLevel + 1, parentId: sourceNodeId,
        }; currentY += baseHeight + 15;
    });
    setNodes(prevNodes => ({ ...prevNodes, ...newNodes, [sourceNodeId]: { ...prevNodes[sourceNodeId], isLoading: false } }));
  }, [nodes, callLmStudioAPI]);

  const handleContinueAssociation = useCallback(async (sourceNodeId: string) => {
    console.log(`[HANDLER] handleContinueAssociation called for: ${sourceNodeId}`);
    const sourceNode = nodes[sourceNodeId];
    if (!sourceNode || !sourceNode.label) return;
    setNodes(prevNodes => ({ ...prevNodes, [sourceNodeId]: { ...prevNodes[sourceNodeId], canContinue: false } }));
    const generatedContent = await callLmStudioAPI(sourceNodeId, sourceNode.label, CONTINUE_ASSOCIATE_SYSTEM_PROMPT, { maxResults: 3 });
    if (!generatedContent) return;
    const lines = generatedContent.split('\n').map(line => line.trim()).filter(line => line.length > 0).slice(0, 3);
    const newNodes: NodesState = {};
    const baseWidth = 150; const baseHeight = 40;
    const startX = sourceNode.x + (sourceNode.width ?? 150) + 40;
    let currentY = sourceNode.y; const sourceLevel = sourceNode.level ?? 0;
    lines.forEach((line) => {
        const cleanLine = line.replace(/^[\s*•-]*\s*(\d+\.\s*)?/, ''); if (!cleanLine) return;
        const newNodeId = generateNodeId();
        newNodes[newNodeId] = {
            nodeType: 'association', x: startX, y: currentY, label: cleanLine,
            width: baseWidth, height: baseHeight, isGenerated: true, canContinue: false,
            level: sourceLevel + 1, parentId: sourceNodeId,
        }; currentY += baseHeight + 10;
    });
     setNodes(prevNodes => ({ ...prevNodes, ...newNodes, [sourceNodeId]: { ...prevNodes[sourceNodeId], isLoading: false, canContinue: false } }));
  }, [nodes, callLmStudioAPI]);

  const handleScriptVisualization = useCallback(async (sourceNodeId: string) => {
     console.log(`[HANDLER] handleScriptVisualization called for: ${sourceNodeId}`);
     const sourceNode = nodes[sourceNodeId];
     if (!sourceNode || !sourceNode.inputValue || !sourceNode.outputNodeLabel) return;
// Определяем системный промпт
let systemPromptToUse = SCENARIO_SYSTEM_PROMPT;
const theme = sourceNode.themeInputValue?.trim(); // Получаем тему/сеттинг

if (theme) {
  // Если тема задана, модифицируем системный промпт
  systemPromptToUse = `${SCENARIO_SYSTEM_PROMPT}\n\nВажно: При создании сценария обязательно учти и творчески переосмысли материал в соответствии со следующей темой/сеттингом: "${theme}".`;
  console.log(`[HANDLER] Using modified system prompt with theme: ${theme}`);
} else {
  console.log(`[HANDLER] Using standard system prompt.`);
}

// Определяем модель для API
const modelToUse = sourceNode.selectedModel || llmModels[1]; // Берем выбранную или вторую по умолчанию
console.log(`[HANDLER] Using model: ${modelToUse}`);
     
          // Вызываем API с правильным системным промптом
          const generatedContent = await callLmStudioAPI(sourceNodeId, sourceNode.inputValue, systemPromptToUse, {
               outputNodeLabel: sourceNode.outputNodeLabel,
               model: modelToUse // Передаем выбранную модель
          });
          if (!generatedContent) return;
     const newNodeId = generateNodeId();
     const newNodes: NodesState = {
       [newNodeId]: {
         nodeType: 'script_output', x: sourceNode.x + (sourceNode.width ?? 300) + 40, y: sourceNode.y,
         label: sourceNode.outputNodeLabel, // Title
         width: 400, height: 350, // Keep size for now, styles will adapt
         isGenerated: true, canContinue: false, level: (sourceNode.level ?? 0) + 1,
         isLoading: false, // Явно устанавливаем isLoading в false
         parentId: sourceNodeId, inputValue: generatedContent, // Store content here
         outputNodeLabel: sourceNode.outputNodeLabel
       }
     };
     setNodes(prevNodes => ({ ...prevNodes, ...newNodes, [sourceNodeId]: { ...prevNodes[sourceNodeId], isLoading: false} }));
   }, [nodes, callLmStudioAPI]);

   // Обработчик для кнопок деталей сценария
   const handleScenarioDetailClick = useCallback(async (sourceNodeId: string, detailType: 'герои' | 'локации' | 'настроение') => {
     console.log(`[SCENARIO BTN] Clicked on node ${sourceNodeId}, detail: ${detailType}`);
     const sourceNode = nodes[sourceNodeId]; // Это нода "СЦЕНАРИЙ ВИЗУАЛИЗАЦИЯ"
     if (!sourceNode || !sourceNode.inputValue || sourceNode.isLoading) return; // Проверяем наличие сценария в inputValue

     let systemPrompt = '';
     let newNodeLabel = '';
     let newNodeColor = 'bg-sky-700'; // Default color for details
     let newNodeWidth = 300;
     let newNodeHeight = 200;


     switch (detailType) {
       case 'герои':
         systemPrompt = HERO_DETAIL_SYSTEM_PROMPT;
         newNodeLabel = 'Герои';
         newNodeColor = 'bg-cyan-700';
         break;
       case 'локации':
         systemPrompt = LOCATION_DETAIL_SYSTEM_PROMPT;
         newNodeLabel = 'Локации';
         newNodeColor = 'bg-teal-700';
         newNodeHeight = 250; // Локации могут быть длиннее
         break;
       case 'настроение':
         systemPrompt = MOOD_DETAIL_SYSTEM_PROMPT;
         newNodeLabel = 'Настроение';
         newNodeColor = 'bg-emerald-700';
         newNodeHeight = 250; // Настроение тоже
         break;
       default:
         console.error("Unknown detail type:", detailType);
         return;
     }

     // Вызываем API для получения деталей
     const generatedContent = await callLmStudioAPI(sourceNodeId, sourceNode.inputValue, systemPrompt, { isDetail: true }); // Передаем сценарий как prompt
     if (!generatedContent) return;

     // Создаем новую ноду для деталей
     const newNodeId = generateNodeId();
     const newNodes: NodesState = {
       [newNodeId]: {
         nodeType: 'script_detail',
         x: sourceNode.x, // Позиционируем под родительской нодой
         y: sourceNode.y + (sourceNode.height ?? 350) + 20, // Ниже родителя
         label: newNodeLabel, // Заголовок ноды деталей
         width: newNodeWidth, height: newNodeHeight,
         isGenerated: true, canContinue: false, // Детали дальше не продолжаем
         level: (sourceNode.level ?? 0) + 1, // Уровень ниже родителя
         parentId: sourceNodeId,
         inputValue: generatedContent, // Сохраняем сгенерированные детали
       }
     };

     // Обновляем состояние, добавляя ноду деталей
     setNodes(prevNodes => ({ ...prevNodes, ...newNodes, [sourceNodeId]: { ...prevNodes[sourceNodeId], isLoading: false } }));

   }, [nodes, callLmStudioAPI]);


  // Обработчик для кнопки "Создать Узлы Сцен" (ручной ввод)
  const handleCreateSceneNodes = useCallback((sourceNodeId: string) => { // Убрал async, т.к. prompt синхронный
    console.log(`[SCENE CREATE] Clicked on node ${sourceNodeId}`);
    const sourceNode = nodes[sourceNodeId];

    // Проверяем только наличие ноды и флаг загрузки
    if (!sourceNode || sourceNode.isLoading) {
      console.log('[SCENE CREATE] Source node missing or loading.');
      return;
    }

    // Запрашиваем количество сцен у пользователя
    const sceneCountStr = window.prompt("Сколько сцен создать?");

    // Проверяем, нажал ли пользователь "Отмена"
    if (sceneCountStr === null) {
      console.log('[SCENE CREATE] User cancelled.');
      return;
    }

    // Преобразуем в число и проверяем корректность
    const sceneCount = parseInt(sceneCountStr, 10);
    if (isNaN(sceneCount) || sceneCount <= 0) {
      alert('Пожалуйста, введите корректное положительное число сцен.');
      console.log(`[SCENE CREATE] Invalid input: ${sceneCountStr}`);
      return;
    }

    console.log(`[SCENE CREATE] User requested ${sceneCount} scenes.`);

    // Рассчитываем позицию для новых нод
    const nodeWidth = 128;
    const nodeHeight = 128;
    const spacing = 15;
    const startX = sourceNode.x + (sourceNode.width ?? 400) + 40;
    let currentY = sourceNode.y;

    const newNodes: NodesState = {};
    for (let i = 1; i <= sceneCount; i++) {
      const newNodeId = generateNodeId();
      newNodes[newNodeId] = {
        nodeType: 'scene',
        x: startX,
        y: currentY,
        label: `СЦЕНА ${i}`,
        width: 250, // Новый размер
        height: 250, // Новый размер
        level: (sourceNode.level ?? 0) + 1,
        parentId: sourceNodeId,
        isGenerated: true, // Помечаем как сгенерированную
        canContinue: false, // Сцены не продолжаем
        // Новые поля для генерации промпта
        hasGenerationButton: true,
        masterPrompt: '',
        isLoading: false,
      };
      currentY += nodeHeight + spacing; // Сдвигаем Y для следующей ноды
    }

    // Обновляем состояние, добавляя новые ноды сцен
    setNodes(prevNodes => ({ ...prevNodes, ...newNodes }));
    console.log(`[SCENE CREATE] Added ${sceneCount} scene nodes.`);

  }, [nodes, setNodes]); // Зависимости те же

  // --- Генерация Master Prompt для сцены ---
  const handleGenerateScenePrompt = useCallback(async (sceneNodeId: string) => {
    console.log(`[SCENE PROMPT GEN] Triggered for node: ${sceneNodeId}`);
    // Немедленно устанавливаем isLoading и очищаем предыдущий результат
    setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: true, masterPrompt: '' } }));

    const sceneNode = nodes[sceneNodeId];

    // Базовые проверки
    if (!sceneNode || sceneNode.nodeType !== 'scene') {
      console.error("[SCENE PROMPT GEN] Error: Invalid node type or node not found for ID:", sceneNodeId);
      alert("Ошибка: Не удалось найти узел сцены.");
      setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
      return;
    }

    const parentId = sceneNode.parentId;
    if (!parentId) {
      console.error("[SCENE PROMPT GEN] Error: Scene node is missing parentId:", sceneNodeId);
      alert("Ошибка: Узел сцены не имеет родительского узла сценария.");
      setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
      return;
    }

    // 1. Найти родителя (узел сценария) и его текст
    const scriptOutputNode = nodes[parentId];
    if (!scriptOutputNode || scriptOutputNode.nodeType !== 'script_output' || !scriptOutputNode.inputValue) {
      console.error("[SCENE PROMPT GEN] Error: Parent node is not a valid script_output or missing inputValue. Parent ID:", parentId);
      alert("Ошибка: Не найден родительский узел 'СЦЕНАРИЙ ВИЗУАЛИЗАЦИЯ' или он пуст.");
      setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
      return;
    }
    const scenarioText = scriptOutputNode.inputValue;

    // 2. Найти узлы деталей (герои, локации, настроение) и их текст
    let heroesText = '';
    let locationsText = '';
    let moodText = '';
    let detailsFound = { heroes: false, locations: false, mood: false };

    Object.values(nodes).forEach(node => {
      if (node.parentId === parentId && node.nodeType === 'script_detail') {
        if (node.label === 'Герои' && node.inputValue) {
          heroesText = node.inputValue;
          detailsFound.heroes = true;
        } else if (node.label === 'Локации' && node.inputValue) {
          locationsText = node.inputValue;
          detailsFound.locations = true;
        } else if (node.label === 'Настроение' && node.inputValue) {
          moodText = node.inputValue;
          detailsFound.mood = true;
        }
      }
    });

    if (!detailsFound.heroes || !detailsFound.locations || !detailsFound.mood) {
      const missing = [
        !detailsFound.heroes ? "'Герои'" : "",
        !detailsFound.locations ? "'Локации'" : "",
        !detailsFound.mood ? "'Настроение'" : ""
      ].filter(Boolean).join(", ");
      console.error(`[SCENE PROMPT GEN] Error: Missing detail nodes or their content for parent ${parentId}. Missing: ${missing}`);
      alert(`Ошибка: Не найдены узлы деталей (${missing}) или их содержимое пусто для этого сценария.`);
      setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
      return;
    }

    // 3. Извлечь номер/label сцены
    const sceneLabel = sceneNode.label; // e.g., "СЦЕНА 1"
    if (!sceneLabel) {
        console.error("[SCENE PROMPT GEN] Error: Scene node is missing label:", sceneNodeId);
        alert("Ошибка: У узла сцены отсутствует метка (например, 'СЦЕНА 1').");
        setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
        return;
    }

    // 4. Сформировать промпты для LLM
    const systemPrompt = SCENE_MASTER_PROMPT_SYSTEM_PROMPT; // Используем константу
    const userPrompt = `
Сценарий:
---
${scenarioText}
---

Персонажи:
---
${heroesText}
---

Локации:
---
${locationsText}
---

Настроения:
---
${moodText}
---

Задача: Сгенерируй master prompt для визуализации ТОЛЬКО для сцены: "${sceneLabel}".
`;

    console.log(`[SCENE PROMPT GEN] Calling API for ${sceneLabel}`);
    // 5. Вызвать API
    // Увеличиваем max_tokens, так как и входной промпт, и ожидаемый результат могут быть объемными
    const generatedMasterPrompt = await callLmStudioAPI(
        sceneNodeId, // ID узла, для которого идет генерация (показывает индикатор загрузки на нем)
        userPrompt,
        systemPrompt,
        { max_tokens: 1500 } // Увеличили лимит токенов
    );

    // 6. Обработать результат
    if (generatedMasterPrompt) {
        setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false, masterPrompt: generatedMasterPrompt } }));
        console.log(`[SCENE PROMPT GEN] Master prompt generated successfully for ${sceneNodeId} (${sceneLabel})`);
    } else {
        // Ошибка API уже обработана в callLmStudioAPI (показан alert), просто сбрасываем isLoading
        setNodes(prev => ({ ...prev, [sceneNodeId]: { ...prev[sceneNodeId], isLoading: false } }));
        console.error(`[SCENE PROMPT GEN] Failed to generate master prompt for ${sceneNodeId} (${sceneLabel})`);
        // Можно добавить дополнительное уведомление, если alert из callLmStudioAPI недостаточен
        // alert("Не удалось сгенерировать промпт для сцены. Проверьте консоль для деталей.");
    }

}, [nodes, callLmStudioAPI, setNodes]); // Добавили setNodes в зависимости


  // Глобальные слушатели
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, true);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp, true); };
  }, [handleMouseMove, handleMouseUp]);

  // --- Расчет координат линии --- (без изменений)
  const getLineCoords = (parentId: string, childId: string) => {
    const parentNode = nodes[parentId]; const childNode = nodes[childId]; if (!parentNode || !childNode) return null;
    const x1 = parentNode.x + (parentNode.width ?? 0); const y1 = parentNode.y + (parentNode.height ?? 0) / 2;
    const x2 = childNode.x; const y2 = childNode.y + (childNode.height ?? 0) / 2;
    return { x1, y1, x2, y2 };
  }

  // --- Рендеринг ---
  return (
    <div className="w-screen h-screen bg-gray-800 overflow-hidden relative">
       {/* SVG слой для линий */}
       <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
         {Object.entries(nodes).map(([childId, childNode]) => {
           if (!childNode.parentId) return null; const coords = getLineCoords(childNode.parentId, childId); if (!coords) return null;
           return ( <line key={`${childNode.parentId}-${childId}`} x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2} stroke="#9ca3af" strokeWidth="2" /> );
         })}
       </svg>

      {/* Контейнер для нод */}
      <div className="absolute top-0 left-0 w-full h-full" id="canvas-area">
        {Object.entries(nodes).map(([id, node]) => (
          <div
            key={id} id={`node-${id}`}
            className={`node-background absolute rounded-2xl border border-[#3d3c4e] cursor-grab active:cursor-grabbing select-none flex flex-col text-white shadow-xl shadow-black/40`} // Заменили border-gray-700 на border-[#3d3c4e]
            style={{
              left: `${node.x}px`, top: `${node.y}px`,
              width: `${node.width}px`, height: `${node.height}px`,
              zIndex: node.level ?? 1, minHeight: '80px', // Минимальная высота
            }}
            onMouseDown={(e) => handleMouseDown(e, id)}
          >
            {/* --- Верхняя часть ноды (кнопки C, индикатор загрузки) --- */}
            {node.isGenerated && node.canContinue && !node.isLoading && ( /* Кнопка C для ассоциаций */
              <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleContinueAssociation(id); }} className="absolute top-0 right-0 w-5 h-5 bg-teal-500 hover:bg-teal-400 rounded-bl text-xs font-bold flex items-center justify-center z-20" title="Продолжить" onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}> C </button>
            )}
            {node.isLoading && ( <div className="absolute top-0 right-0 w-5 h-5 bg-gray-500 rounded-bl text-xs flex items-center justify-center z-20 animate-pulse">...</div> )}

            {/* --- Основное содержимое ноды --- */}
            <div className="flex-grow flex flex-col overflow-hidden p-4"> {/* Добавили p-4 сюда */}
                {/* Заголовок */}
                 {node.label && (
                    <div className="node-header flex items-center p-3 border-gray-700 flex-shrink-0"> {/* Убрал pl-6, управляется из index.css */}
                         {/* Добавил контейнер для иконки с фиксированным размером */}
                         <div className="w-8 h-8 mr-3 flex-shrink-0 flex items-center justify-center">
                             <img src={getNodeIcon(node.nodeType, node.label)} alt="icon" className="w-8 h-8 object-contain" /> {/* Применил w-8 h-8 прямо к img */}
                         </div>
                         <span className="text-[#f88507] font-bold text-xl">{node.label}</span> {/* Отступ теперь у родителя */}
                    </div>
                 )}

                {/* Поле ввода */}
                {/* Контейнер для основного контента (с отступами и прокруткой если надо) */}
                <div className={`flex-grow flex flex-col`}> {/* Убрали p-4 отсюда */}
                  {/* Поле ввода */}
                  {node.hasInput && (
                    <textarea value={node.inputValue} onChange={(e) => handleInputChange(e, id)}
                      className={`w-full bg-[#0a090f] border border-gray-700 text-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-500 mb-3 ${node.isLongInput ? 'min-h-[100px]' : 'h-20 flex-shrink-0'}`} // Вернул w-full, т.к. ширина из index.css убрана
                      placeholder={node.isLongInput ? "Введите текст сценария..." : "Введите слово..."}
                      rows={node.isLongInput ? 4 : 3} // Уменьшил rows для длинного ввода до 4
                      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()} disabled={node.isLoading}
                    />
                  )}
                
                                {/* Поле ввода Темы/Сеттинга (только для script_input) */}
                  {/* Поле ввода Темы/Сеттинга + Выбор модели (только для script_input) */}
                  {node.nodeType === 'script_input' && (
                    <>
                      <textarea value={node.themeInputValue} onChange={(e) => handleThemeInputChange(e, id)}
                        className="bg-[#0a090f] border border-gray-700 text-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-gray-500 flex-shrink-0 mb-3 mt-10" // Добавил mt-10 (40px)
                        placeholder="Стилизационный промпт (опционально)..."
                        rows={2} // Уменьшил rows до 2
                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()} disabled={node.isLoading}
                      />
                      <label htmlFor={`model-select-${id}`} className="text-orange-500 font-semibold text-sm block mb-1">Модель</label> {/* Убрал pl-6 */}
                      <select
                          id={`model-select-${id}`}
                          value={node.selectedModel}
                          onChange={(e) => handleModelChange(e, id)}
                          className="w-[300px] mx-auto bg-gray-900/70 border border-gray-700/80 text-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 flex-shrink-0 mb-3 appearance-none" // Задал w-[300px] и mx-auto для центрирования
                          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()} disabled={node.isLoading}
                      >
                          {llmModels.map(modelName => (
                              <option key={modelName} value={modelName}>{modelName}</option>
                          ))}
                      </select>
                    </>
                  )}

                {/* Кнопка генерации */}
                 {/* Кнопка генерации для 'text' и 'script_input' - перенесена внутрь div контента */}
                 {/* Обертка для кнопки с отступами и центрированием */}
                 {node.hasButton && (node.nodeType === 'text' || node.nodeType === 'script_input') && (
                     <div className="p-5 mt-auto flex justify-center"> {/* Добавили flex justify-center */}
                         <button onClick={() => {
                                 if (node.nodeType === 'text') { handleInitialAssociation(id); }
                                 else if (node.nodeType === 'script_input') { handleScriptVisualization(id); }
                             }}
                             className={`w-[300px] h-10 rounded-full py-2 text-sm font-bold text-center ${ node.isLoading ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-[#f88507] hover:bg-orange-500 text-[#0a090f] shadow-md' }`} // Заменил rounded-lg на rounded-full
                             onMouseDown={(e: React.MouseEvent) => e.stopPropagation()} disabled={node.isLoading}>
                             {node.isLoading ? 'Генерация...' : (node.buttonLabel ?? 'Сгенерировать')}
                         </button>
                     </div>
                 )}

                {/* Текст сгенерированной ноды */}
                {/* Текст сгенерированной ноды */}
                {node.isGenerated && node.inputValue && (
                    // Для нод типа script_output и script_detail используем div с прокруткой
                    (node.nodeType === 'script_output' || node.nodeType === 'script_detail') ? (
                        <div className="scenario-output-text text-left text-xs p-2 bg-black/20 border border-gray-600 rounded-lg break-words whitespace-pre-wrap flex-grow mb-2 mt-1 overflow-y-auto"> {/* Добавлен класс scenario-output-text, убран h-full */}
                            {node.inputValue}
                        </div>
                    ) : null // Ассоциации теперь просто label в заголовке, inputValue не показываем тут
                )}
                {/* Для ассоциаций показываем label внутри основного div, если нет заголовка (на всякий случай) */}
                {node.nodeType === 'association' && !node.label && node.inputValue && (
                     <div className="flex items-center justify-start text-left flex-grow text-sm p-1 break-words">
                         {node.inputValue}
                     </div>
                )}

                 {/* Кнопки деталей сценария (только для script_output) */}
                 {/* Кнопки деталей сценария + Создать сцены (только для script_output) */}
                 {node.nodeType === 'script_output' && !node.isLoading && (
                     <div className="mt-auto flex-shrink-0 pt-2 space-y-2"> {/* Используем space-y для вертикального расположения */}
                         <div className="flex space-x-2"> {/* Горизонтальный блок для деталей */}
                             <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleScenarioDetailClick(id, 'герои'); }} className="flex-1 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-600 text-gray-300 text-xs py-1 px-2 rounded-lg shadow" onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}>Герои</button>
                             <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleScenarioDetailClick(id, 'локации'); }} className="flex-1 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-600 text-gray-300 text-xs py-1 px-2 rounded-lg shadow" onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}>Локации</button>
                             <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleScenarioDetailClick(id, 'настроение'); }} className="flex-1 bg-gray-800/50 hover:bg-gray-700/60 border border-gray-600 text-gray-300 text-xs py-1 px-2 rounded-lg shadow" onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}>Настроение</button>
                         </div>
                         {/* Кнопка создания сцен ниже */}
                         <button onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleCreateSceneNodes(id); }} className="w-full bg-orange-500 hover:bg-orange-600 text-black text-sm font-semibold py-2 px-4 rounded-lg shadow" onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}>СЦЕНЫ (ГЕНЕРАЦИЯ)</button>
                     </div>
                 )}

                 {/* Содержимое для ноды "СЦЕНА" */}
                 {node.nodeType === 'scene' && (
                   <>
                     {/* Кнопка генерации промпта */}
                     {node.hasGenerationButton && !node.isLoading && (
                       <button
                         onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleGenerateScenePrompt(id); }}
                         className="flex-shrink-0 w-full rounded-lg p-2 text-xs mt-auto font-semibold bg-orange-500 hover:bg-orange-600 text-black" // Обновленные стили кнопки (оранжевый фон, черный текст)
                         onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                       >
                         Сгенерировать Prompt
                       </button>
                     )}

                     {/* Индикатор загрузки */}
                     {node.isLoading && (
                       <div className="text-center text-xs mt-auto animate-pulse p-2">Генерация...</div> // Позиционируем внизу
                     )}

                     {/* Отображение сгенерированного masterPrompt */}
                     {node.masterPrompt && !node.isLoading && (
                       <textarea
                         readOnly
                         value={node.masterPrompt}
                         className="w-full bg-black/30 border border-gray-600 text-gray-200 rounded-lg p-2 text-[10px] mt-2 flex-grow resize-none focus:outline-none focus:ring-1 focus:ring-orange-500 overflow-y-auto" // Обновленные стили textarea + overflow
                         rows={8} // Больше строк
                         onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                         onClick={(e: React.MouseEvent<HTMLTextAreaElement>) => (e.target as HTMLTextAreaElement).select()}
                       />
                     )}

                     {/* Заполнитель, если нет промпта и не загрузка, чтобы кнопка была внизу */}
                     {!node.masterPrompt && !node.isLoading && !node.hasGenerationButton && (
                         <div className="flex-grow"></div>
                     )}
                     {/* Если есть кнопка, но нет промпта и не загрузка, тоже нужен заполнитель */}
                      {!node.masterPrompt && !node.isLoading && node.hasGenerationButton && (
                         <div className="flex-grow"></div>
                     )}
                   </>
                 )}
                 {/* Закрывающий div для основного контента */}
                 </div> {/* Закрываем div контента */}
            </div> {/* Закрываем промежуточный div (строка 616) */}
          </div>
        ))}
        {/* Конец маппинга узлов */}
      </div>
    </div>
  );
}

export default App;
