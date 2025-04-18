// src/api.ts
import { ChatApiResponse } from './types'; // Changed from IoNetResponse (will rename type later)

// Renamed function to callMistralAPI
export async function callMistralAPI(prompt: string, model: string, systemPrompt: string = "You are a helpful assistant."): Promise<string> {
  // Use Mistral API key from .env
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY;

  if (!apiKey) {
    console.error("Mistral API key is missing. Please set VITE_MISTRAL_API_KEY in your .env file.");
    throw new Error("API ключ Mistral отсутствует.");
  }

  // Mistral API endpoint
  const url = "https://api.mistral.ai/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json", // Recommended by Mistral docs
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
        // Mistral error structure might differ, trying common fields
        errorDetails = errorData?.detail?.message || errorData?.message || errorData?.error?.message || JSON.stringify(errorData);
      } catch (jsonError) {
         // Если тело не JSON или пустое, используем statusText
      }
      console.error("Mistral API Error:", response.status, errorDetails);
      throw new Error(`Ошибка API Mistral: ${response.status} - ${errorDetails}`);
    }

    // Use the renamed type ChatApiResponse
    const data: ChatApiResponse = await response.json();

    // Check response structure (Mistral format should be compatible)
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
         console.error("Invalid response structure from Mistral API:", data);
         throw new Error("Некорректная структура ответа от API Mistral.");
    }

    // Опциональная обработка блока <think> (закомментировано, как в плане)
    let modified_text = data.choices[0].message.content;
    // if (modified_text.includes("</think>\n\n")) {
    //     modified_text = modified_text.split('</think>\n\n')[1];
    // }

    return modified_text;

  } catch (error) {
    // Update error context
    console.error("Error calling Mistral API:", error);
    // Пробрасываем ошибку для обработки в UI
    throw error instanceof Error ? error : new Error("Неизвестная ошибка при вызове API Mistral.");
  }
}