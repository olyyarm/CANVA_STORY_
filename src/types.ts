// src/types.ts
export interface NodeData {
x: number;
y: number;
label: string;
hasInput?: boolean;
isLongInput?: boolean;
hasButton?: boolean;
buttonLabel?: string;
inputValue?: string;
outputNodeLabel?: string;
// Added 'pollinations_image' type
nodeType?: 'text' | 'scene' | 'script_input' | 'script_output' | 'association' | 'script_detail' | 'pollinations_image';
themeInputValue?: string;
selectedModel?: string;
isLoading?: boolean; // General loading for API calls like prompt generation
isGenerated?: boolean;
canContinue?: boolean;
fullAssociations?: string[];
nextAssociationIndex?: number;
level?: number;
parentId?: string;
width?: number;
height?: number;
hasGenerationButton?: boolean; // For scene prompt generation button
masterPrompt?: string; // Remains on scene node
isLoadingImage?: boolean; // Loading state for Pollinations image generation (remains on scene node)
imageUrl?: string; // URL for the generated image (now specific to 'pollinations_image' node)
pollinationsApiError?: string; // Error message from Pollinations API (remains on scene node for feedback)
}

export interface NodesState {
[id: string]: NodeData;
}

// Типы для ответа API чат-комплишн (подходят для Mistral, IoNet и др.)
// Убедитесь, что эти типы соответствуют реальному ответу API
interface ChatMessage { // Renamed from IoNetMessage
  role: 'system' | 'user' | 'assistant'; // Добавить 'tool', если используется Function Calling
  content: string;
}

interface ChatChoice { // Renamed from IoNetChoice
  index: number;
  message: ChatMessage; // Use renamed ChatMessage
  finish_reason?: string;
}

// Renamed from IoNetResponse
export interface ChatApiResponse {
  id: string;
  object: string; // e.g., "chat.completion"
  created: number;
  model: string;
  choices: ChatChoice[]; // Use renamed ChatChoice
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// TODO: Проверить типы для узлов (Nodes), чтобы они корректно работали с Mistral моделями.
// (Может быть, не нужно изменений, если selectedModel уже строка)
