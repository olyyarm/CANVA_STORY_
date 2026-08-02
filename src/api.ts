import { createMockCompletion } from './mockData';
import { ChatApiResponse, GenerationRequest, ImagePipeline, ImagePromptKind } from './types';

const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';
export const LM_STUDIO_DEFAULT_ENDPOINT = 'http://localhost:1234/v1/chat/completions';
export const LM_STUDIO_DEFAULT_MODEL = 'local-model';
export const COMFYUI_DEFAULT_ENDPOINT = 'http://localhost:8188';
export const COMFYUI_DEFAULT_CHECKPOINT = 'SDXL\\sd_xl_base_1.0.safetensors';

export type GenerationMode = 'mock' | 'mistral' | 'lmstudio';
export type ImageProvider = 'pollinations' | 'comfyui';

export interface GenerationSettings {
  mode: GenerationMode;
  lmStudioEndpoint: string;
  lmStudioModel: string;
}

export interface ImageGenerationSettings {
  provider: ImageProvider;
  comfyEndpoint: string;
  comfyCheckpoint: string;
  comfyUnloadModel: boolean;
}

export const getDefaultGenerationMode = (): GenerationMode => {
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY?.trim();
  const forceMock = String(import.meta.env.VITE_MOCK_MODE).toLowerCase() === 'true';
  return apiKey && !forceMock ? 'mistral' : 'mock';
};

export const getDefaultGenerationSettings = (): GenerationSettings => ({
  mode: getDefaultGenerationMode(),
  lmStudioEndpoint: LM_STUDIO_DEFAULT_ENDPOINT,
  lmStudioModel: LM_STUDIO_DEFAULT_MODEL,
});

export const getDefaultImageGenerationSettings = (): ImageGenerationSettings => ({
  provider: 'pollinations',
  comfyEndpoint: COMFYUI_DEFAULT_ENDPOINT,
  comfyCheckpoint: COMFYUI_DEFAULT_CHECKPOINT,
  comfyUnloadModel: true,
});

const getErrorMessage = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const data = value as Record<string, unknown>;
  const detail = data.detail;
  const error = data.error;

  if (typeof data.message === 'string') return data.message;
  if (detail && typeof detail === 'object' && typeof (detail as Record<string, unknown>).message === 'string') {
    return (detail as Record<string, unknown>).message as string;
  }
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, unknown>).message as string;
  }
  return '';
};

const normalizeContent = (content: ChatApiResponse['choices'][number]['message']['content']) => {
  if (typeof content === 'string') return content.trim();
  return content.map((chunk) => chunk.text ?? '').join('').trim();
};

const getLmStudioEndpoint = (value: string) => {
  const endpoint = value.trim() || LM_STUDIO_DEFAULT_ENDPOINT;
  const normalized = endpoint.replace(/\/+$/, '');
  if (normalized.endsWith('/chat/completions')) return normalized;
  if (normalized.endsWith('/v1')) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
};

const callMistralAPI = async (request: GenerationRequest, signal?: AbortSignal): Promise<string> => {
  const apiKey = import.meta.env.VITE_MISTRAL_API_KEY?.trim();
  if (!apiKey) throw new Error('Ключ Mistral не настроен. Включён тестовый режим.');

  const response = await fetch(MISTRAL_ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.prompt },
      ],
    }),
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const payload: unknown = await response.json();
      details = getErrorMessage(payload) || details;
    } catch {
      // A non-JSON response still has a useful HTTP status.
    }
    throw new Error(`Mistral вернул ошибку ${response.status}${details ? `: ${details}` : ''}`);
  }

  const data: ChatApiResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Mistral вернул пустой ответ. Попробуйте ещё раз.');

  const normalized = normalizeContent(content);
  if (!normalized) throw new Error('Mistral вернул ответ без текста.');
  return normalized;
};

const callLmStudioAPI = async (
  request: GenerationRequest,
  settings: GenerationSettings,
  signal?: AbortSignal,
): Promise<string> => {
  const response = await fetch(getLmStudioEndpoint(settings.lmStudioEndpoint), {
    method: 'POST',
    signal,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.lmStudioModel.trim() || LM_STUDIO_DEFAULT_MODEL,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.prompt },
      ],
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const payload: unknown = await response.json();
      details = getErrorMessage(payload) || details;
    } catch {
      // LM Studio can also return a plain text error.
    }
    throw new Error(`LM Studio вернул ошибку ${response.status}${details ? `: ${details}` : ''}`);
  }

  const data: ChatApiResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LM Studio вернул пустой ответ. Проверьте локальную модель и endpoint.');

  const normalized = normalizeContent(content);
  if (!normalized) throw new Error('LM Studio вернул ответ без текста.');
  return normalized;
};

export const generateText = (
  request: GenerationRequest,
  signal?: AbortSignal,
  settings = getDefaultGenerationSettings(),
): Promise<string> => {
  if (settings.mode === 'mock') return createMockCompletion(request, signal);
  if (settings.mode === 'lmstudio') return callLmStudioAPI(request, settings, signal);
  return callMistralAPI(request, signal);
};

const wait = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Запрос отменён', 'AbortError'));
      },
      { once: true },
    );
  });

const getComfyBaseUrl = (value: string) => (value.trim() || COMFYUI_DEFAULT_ENDPOINT).replace(/\/+$/, '');

const readResponseDetails = async (response: Response) => {
  try {
    const payload: unknown = await response.json();
    const message = getErrorMessage(payload);
    return message || JSON.stringify(payload);
  } catch {
    try {
      return await response.text();
    } catch {
      return response.statusText;
    }
  }
};

const getComfyError = (action: string, response: Response, details: string) =>
  `${action}: ${response.status}${details ? ` · ${details.slice(0, 600)}` : ''}`;

const getComfyCheckpointNames = async (baseUrl: string, signal?: AbortSignal) => {
  const response = await fetch(`${baseUrl}/object_info/CheckpointLoaderSimple`, { signal });
  if (!response.ok) return null;
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object') return null;
  const info = data as Record<string, { input?: { required?: { ckpt_name?: unknown[] } } }>;
  const ckptField = info.CheckpointLoaderSimple?.input?.required?.ckpt_name;
  const names = Array.isArray(ckptField?.[0]) ? ckptField[0] : [];
  return names.filter((name): name is string => typeof name === 'string');
};

const getCheckpointFileName = (value: string) => value.split(/[\\/]/).pop()?.toLowerCase() ?? value.toLowerCase();

const resolveComfyCheckpoint = async (
  baseUrl: string,
  configuredCheckpoint: string,
  signal?: AbortSignal,
) => {
  const checkpoint = configuredCheckpoint.trim() || COMFYUI_DEFAULT_CHECKPOINT;
  const names = await getComfyCheckpointNames(baseUrl, signal);
  if (!names || names.includes(checkpoint)) return checkpoint;

  const exactCaseInsensitiveMatch = names.find((name) => name.toLowerCase() === checkpoint.toLowerCase());
  if (exactCaseInsensitiveMatch) return exactCaseInsensitiveMatch;

  const fileNameMatch = names.find((name) => getCheckpointFileName(name) === getCheckpointFileName(checkpoint));
  if (fileNameMatch) return fileNameMatch;

  const sdxlCandidates = names.filter((name) => /sdxl|sd_xl|xl/i.test(name));
  const suggestions = (sdxlCandidates.length > 0 ? sdxlCandidates : names).slice(0, 8).join(', ');
  throw new Error(
    `ComfyUI не нашёл checkpoint "${checkpoint}". Укажите точное имя из ComfyUI/models/checkpoints. Доступно: ${suggestions || 'список пуст'}.`,
  );
};

const SDXL_NEGATIVE_PROMPTS: Record<ImagePromptKind, string> = {
  default: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'distorted anatomy',
    'extra fingers',
  ].join(', '),
  scene_location: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'people',
    'person',
    'human',
    'character',
    'face',
    'hands',
    'body',
    'silhouette of a person',
    'foreground character',
  ].join(', '),
  scene_characters: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'distorted anatomy',
    'extra fingers',
    'missing fingers',
    'bad hands',
    'cropped head',
    'cropped legs',
    'out of frame',
    'close-up',
    'portrait',
    'bust',
    'waist-up crop',
    'photorealistic',
    'photograph',
    'photo',
    'cartoon',
    'chibi',
    'anime',
    '3d render',
    'gender swap',
    'cloned faces',
    'same face on different characters',
    'identical outfits',
    'same cloak on every character',
    'same medallion on every character',
    'detailed background',
  ].join(', '),
  character_asset: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'distorted anatomy',
    'extra fingers',
    'missing fingers',
    'bad hands',
    'cropped head',
    'cropped legs',
    'out of frame',
    'close-up',
    'portrait',
    'bust',
    'waist-up crop',
    'photorealistic',
    'photograph',
    'photo',
    'cartoon',
    'chibi',
    'anime',
    '3d render',
    'cloned faces',
    'same face on different characters',
    'identical outfits',
    'same cloak on every character',
    'same medallion on every character',
  ].join(', '),
  location_asset: [
    'text',
    'watermark',
    'logo',
    'blurry',
    'low quality',
    'people',
    'person',
    'foreground character',
    'close-up portrait',
  ].join(', '),
};

const buildComfySdxlWorkflow = (prompt: string, checkpoint: string, promptKind: ImagePromptKind) => {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        cfg: 7,
        denoise: 1,
        latent_image: ['5', 0],
        model: ['4', 0],
        negative: ['7', 0],
        positive: ['6', 0],
        sampler_name: 'euler',
        scheduler: 'normal',
        seed,
        steps: 28,
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: checkpoint.trim() || COMFYUI_DEFAULT_CHECKPOINT,
      },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        batch_size: 1,
        height: 1024,
        width: 1024,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['4', 1],
        text: prompt,
      },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['4', 1],
        text: SDXL_NEGATIVE_PROMPTS[promptKind],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: ['4', 2],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'CANVA_STORY_SDXL',
        images: ['8', 0],
      },
    },
  };
};

interface ComfyPromptResponse {
  prompt_id?: string;
}

interface ComfyImageRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: ComfyImageRef[] }>;
}

const getImageFromComfyHistory = (value: unknown): ComfyImageRef | null => {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.values(value as Record<string, ComfyHistoryEntry>);
  for (const entry of entries) {
    const outputs = entry.outputs ? Object.values(entry.outputs) : [];
    for (const output of outputs) {
      const image = output.images?.[0];
      if (image?.filename) return image;
    }
  }
  return null;
};

const generateComfyImage = async (
  prompt: string,
  pipeline: ImagePipeline,
  settings: ImageGenerationSettings,
  promptKind: ImagePromptKind,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  try {
    if (pipeline !== 'sdxl') throw new Error('Пока подключён только pipeline SDXL.');
    const checkpoint = await resolveComfyCheckpoint(baseUrl, settings.comfyCheckpoint, signal);
    const workflow = buildComfySdxlWorkflow(prompt, checkpoint, promptKind);
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-${Date.now()}`;

    const promptResponse = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, prompt: workflow }),
    });
    if (!promptResponse.ok) {
      throw new Error(getComfyError('ComfyUI не принял SDXL workflow', promptResponse, await readResponseDetails(promptResponse)));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id. Проверьте workflow в консоли ComfyUI.');

    let image: ComfyImageRef | null = null;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      await wait(1000, signal);
      const historyResponse = await fetch(`${baseUrl}/history/${promptData.prompt_id}`, { signal });
      if (!historyResponse.ok) continue;
      image = getImageFromComfyHistory(await historyResponse.json());
      if (image) break;
    }
    if (!image) throw new Error('ComfyUI не вернул изображение за отведённое время. Проверьте, не упал ли workflow в окне ComfyUI.');

    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, { signal });
    if (!viewResponse.ok) {
      throw new Error(getComfyError('ComfyUI не отдал готовое изображение', viewResponse, await readResponseDetails(viewResponse)));
    }

    const blob = await viewResponse.blob();
    if (settings.comfyUnloadModel) {
      fetch(`${baseUrl}/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ free_memory: true, unload_models: true }),
      }).catch(() => undefined);
    }
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте, что ComfyUI запущен, endpoint указан верно и разрешён CORS (--enable-cors-header).`);
    }
    throw error;
  }
};

const generatePollinationsImage = async (prompt: string, signal?: AbortSignal) => {
  const width = 1280;
  const height = 768;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?model=flux&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=1&private=1`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Сервис изображений вернул ошибку ${response.status}.`);
  return URL.createObjectURL(await response.blob());
};

export const generateImage = (
  prompt: string,
  pipeline: ImagePipeline,
  settings: ImageGenerationSettings,
  promptKind: ImagePromptKind = 'default',
  signal?: AbortSignal,
) => {
  if (settings.provider === 'comfyui') return generateComfyImage(prompt, pipeline, settings, promptKind, signal);
  return generatePollinationsImage(prompt, signal);
};
