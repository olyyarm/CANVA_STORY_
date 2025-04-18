Обновленный План Интеграции API ai.io.net

Этот план описывает шаги по полной замене текущей интеграции с локальным LM Studio на использование API ai.io.net в проекте, основываясь на логике из orex_node.py.

Шаги:

Настройка Переменных Окружения:

Создать файл .env в корне проекта (d:/SD/CANVA_STORY_/.env), если его нет.

Добавить строку .env в файл .gitignore (проверить/добавить), чтобы предотвратить коммит ключа.

В .env добавить строку с вашим API ключом:

VITE_IONET_API_KEY=io-v2-eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJvd25lciI6IjkzNzVlZmFlLWNkZjgtNDU2ZS1iZmQzLWMzOGRjNjhmOGE2MiIsImV4cCI6NDg5NzEyNjA0OH0.EMMn7wQXXPbeAXJxbuHro5lWVfLWVb8ZCA-9sEOF0Z7wvGqflJ5ss3JLmW52kIYApAdLbZnhHtcql3qr7aP9AQ


(Внимание: Убедитесь, что это ваш актуальный ключ. Не добавляйте .env в Git!)

Обновление Списка Моделей (src/constants.ts):

Найти или создать экспорт константы (например, IONET_MODELS) в src/constants.ts.

Заполнить её списком моделей из orex_node.py (строки 29-59):

export const IONET_MODELS = [
  "deepseek-ai/DeepSeek-R1",
  "Qwen/QwQ-32B",
  "meta-llama/Llama-3.2-90B-Vision-Instruct",
  "deepseek-ai/DeepSeek-R1-Distill-Llama-70B",
  "meta-llama/Llama-3.3-70B-Instruct",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
  "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
  "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
  "microsoft/phi-4",
  "mistralai/Mistral-Large-Instruct-2411",
  "neuralmagic/Llama-3.1-Nemotron-70B-Instruct-HF-FP8-dynamic",
  "google/gemma-2-9b-it",
  "nvidia/AceMath-7B-Instruct",
  "CohereForAI/aya-expanse-32b",
  "Qwen/Qwen2.5-Coder-32B-Instruct",
  "THUDM/glm-4-9b-chat",
  "CohereForAI/c4ai-command-r-plus-08-2024",
  "tiiuae/Falcon3-10B-Instruct",
  "NovaSky-AI/Sky-T1-32B",
  "bespokelabs/Bespoke-Stratos-32B",
  "netease-youdao/Confucius-o1-14B",
  "Qwen/Qwen2.5-1.5B-Instruct",
  "mistralai/Ministral-8B-Instruct-2410",
  "openbmb/MiniCPM3-4B",
  "jinaai/ReaderLM-v2",
  "ibm-granite/granite-3.1-8b-instruct",
  "microsoft/Phi-3.5-mini-instruct",
  "ozone-ai/0x-lite",
  "mixedbread-ai/mxbai-embed-large-v1"
];
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
TypeScript
IGNORE_WHEN_COPYING_END

Модификация src/api.ts:

Полностью удалить функцию callLmStudioAPI (или аналогичную) и связанные с ней импорты/хелперы.

Создать новую асинхронную функцию callIoNetAPI с обработкой ошибок:

import { IoNetResponse } from './types'; // Предполагаемый тип

export async function callIoNetAPI(prompt: string, model: string, systemPrompt: string = "You are a helpful assistant."): Promise<string> {
  const apiKey = import.meta.env.VITE_IONET_API_KEY;

  if (!apiKey) {
    console.error("IoNet API key is missing. Please set VITE_IONET_API_KEY in your .env file.");
    throw new Error("API ключ IoNet отсутствует.");
  }

  const url = "https://api.intelligence.io.solutions/api/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`
  };
  const body = JSON.stringify({
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ]
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body
    });

    if (!response.ok) {
      // Попытка получить детали ошибки из тела ответа
      let errorDetails = response.statusText;
      try {
        const errorData = await response.json();
        errorDetails = errorData?.message || errorData?.error?.message || JSON.stringify(errorData);
      } catch (jsonError) {
         // Если тело не JSON или пустое, используем statusText
      }
      console.error("IoNet API Error:", response.status, errorDetails);
      throw new Error(`Ошибка API IoNet: ${response.status} - ${errorDetails}`);
    }

    const data: IoNetResponse = await response.json(); // Используем тип

    if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
         console.error("Invalid response structure from IoNet API:", data);
         throw new Error("Некорректная структура ответа от API IoNet.");
    }

    // Опциональная обработка блока <think> (по аналогии с orex_node.py)
    let modified_text = data.choices[0].message.content;
    // if (modified_text.includes("</think>\n\n")) {
    //     modified_text = modified_text.split('</think>\n\n')[1];
    // }

    return modified_text;

  } catch (error) {
    console.error("Error calling IoNet API:", error);
    // Пробрасываем ошибку для обработки в UI
    throw error instanceof Error ? error : new Error("Неизвестная ошибка при вызове API IoNet.");
  }
}
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
TypeScript
IGNORE_WHEN_COPYING_END

Обновление Типов (src/types.ts):

Добавить или обновить интерфейсы для структуры ответа API:

// Убедитесь, что эти типы соответствуют реальному ответу API
interface IoNetMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface IoNetChoice {
  index: number;
  message: IoNetMessage;
  finish_reason?: string; // Добавлено опциональное поле
}

export interface IoNetResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: IoNetChoice[];
  usage?: { // Добавлено опциональное поле
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Также проверить и при необходимости обновить типы для узлов (Nodes),
// чтобы они могли хранить/использовать новые модели.
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
TypeScript
IGNORE_WHEN_COPYING_END

Обновление UI:

Проанализировать код src/App.tsx, src/hooks/useNodeManagement.ts, src/components/NodeRenderer.tsx и другие компоненты/хуки, которые:

Предоставляют список моделей для выбора.

Вызывают функцию API для генерации текста.

Отображают результат генерации.

Заменить использование старой константы моделей (LM_STUDIO_MODELS?) и вызов callLmStudioAPI на IONET_MODELS и callIoNetAPI.

В UI компоненте, который вызывает callIoNetAPI, обернуть вызов в блок try...catch. Отображать сообщение об ошибке пользователю в случае неудачи (например, через alert, компонент уведомлений или обновление состояния узла).

Очистка:

После успешной интеграции и тестирования, найти и удалить все неиспользуемые артефакты, связанные с LM Studio (старые константы моделей, функции API, типы TypeScript, возможно, специфические элементы UI).

Диаграмма Последовательности (Mermaid):
sequenceDiagram
    participant User
    participant UI Component (e.g., NodeRenderer)
    participant api.ts (callIoNetAPI)
    participant Environment (.env)
    participant IoNetAPI

    Environment-->>api.ts (callIoNetAPI): VITE_IONET_API_KEY
    User->>UI Component (e.g., NodeRenderer): Запускает генерацию (выбирает модель io.net, вводит промпт)
    UI Component (e.g., NodeRenderer)->>api.ts (callIoNetAPI): callIoNetAPI(prompt, model)
    alt API Key Exists
        api.ts (callIoNetAPI)->>IoNetAPI: POST /api/v1/chat/completions (Headers + Body with model, messages, apiKey)
        alt Success Response (2xx)
            IoNetAPI-->>api.ts (callIoNetAPI): 200 OK (JSON response with choices)
            api.ts (callIoNetAPI)-->>UI Component (e.g., NodeRenderer): return generated_text (string)
            UI Component (e.g., NodeRenderer)->>User: Отображает результат
        else Error Response (4xx, 5xx) or Network Error
            IoNetAPI-->>api.ts (callIoNetAPI): Error response or Network Failure
            api.ts (callIoNetAPI)-->>UI Component (e.g., NodeRenderer): throws Error(message)
            UI Component (e.g., NodeRenderer)->>User: Отображает сообщение об ошибке (из пойманной ошибки)
        end
    else API Key Missing
        api.ts (callIoNetAPI)-->>UI Component (e.g., NodeRenderer): throws Error("API ключ IoNet отсутствует.")
        UI Component (e.g., NodeRenderer)->>User: Отображает сообщение об ошибке (из пойманной ошибки)
    end
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Mermaid
IGNORE_WHEN_COPYING_END