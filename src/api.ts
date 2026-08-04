import { createMockCompletion } from './mockData';
import { ChatApiResponse, GenerationRequest, ImagePipeline, ImagePromptKind } from './types';

const MISTRAL_ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';
export const LM_STUDIO_DEFAULT_ENDPOINT = 'http://localhost:1234/v1/chat/completions';
export const LM_STUDIO_DEFAULT_MODEL = 'local-model';
export const COMFYUI_DEFAULT_ENDPOINT = 'http://localhost:8188';
export const COMFYUI_DEFAULT_CHECKPOINT = 'SDXL\\sd_xl_base_1.0.safetensors';
const FLUX2_DIFFUSION_MODEL = 'flux2_dev_fp8mixed.safetensors';
const FLUX2_TEXT_ENCODER = 'mistral_3_small_flux2_fp8.safetensors';
const FLUX2_VAE = 'flux2-vae.safetensors';
const FLUX2_TURBO_LORA = 'Flux_2-Turbo-LoRA_comfyui.safetensors';
const COMFY_SDXL_TIMEOUT_MS = 4 * 60 * 1000;
const COMFY_FLUX2_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const COMFY_TTS_TIMEOUT_MS = 45 * 60 * 1000;

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
}

export interface Flux2CharacterReference {
  imageUrl: string;
  label: string;
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

const getLmStudioBaseUrl = (value: string) => {
  const endpoint = value.trim() || LM_STUDIO_DEFAULT_ENDPOINT;
  const normalized = endpoint.replace(/\/+$/, '');
  if (normalized.endsWith('/v1/chat/completions')) return normalized.slice(0, -'/v1/chat/completions'.length);
  if (normalized.endsWith('/v1')) return normalized.slice(0, -'/v1'.length);
  if (normalized.endsWith('/api/v1')) return normalized.slice(0, -'/api/v1'.length);
  return normalized;
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
    const nodeDetails = getComfyNodeErrorDetails(payload);
    if (nodeDetails) return nodeDetails;
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

const getComfyNodeErrorDetails = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const nodeErrors = (value as Record<string, unknown>).node_errors;
  if (!nodeErrors || typeof nodeErrors !== 'object') return '';

  const lines = Object.entries(nodeErrors as Record<string, unknown>).flatMap(([nodeId, nodeError]) => {
    if (!nodeError || typeof nodeError !== 'object') return [];
    const data = nodeError as Record<string, unknown>;
    const classType = typeof data.class_type === 'string' ? data.class_type : 'node';
    const errors = Array.isArray(data.errors) ? data.errors : [];
    return errors.map((error) => {
      if (!error || typeof error !== 'object') return `${classType} ${nodeId}: validation error`;
      const details = error as Record<string, unknown>;
      const message = typeof details.message === 'string' ? details.message : 'validation error';
      const field = typeof details.details === 'string' ? ` (${details.details})` : '';
      return `${classType} ${nodeId}: ${message}${field}`;
    });
  });

  return lines.join('; ');
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

interface ComfyAudioRef {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyUploadResponse {
  name?: string;
  subfolder?: string;
  type?: string;
}

interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: ComfyImageRef[]; audio?: ComfyAudioRef[]; audios?: ComfyAudioRef[] }>;
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: unknown[];
  };
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

const getAudioFromComfyHistory = (value: unknown): ComfyAudioRef | null => {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.values(value as Record<string, ComfyHistoryEntry>);
  for (const entry of entries) {
    const outputs = entry.outputs ? Object.values(entry.outputs) : [];
    for (const output of outputs) {
      const audio = output.audio?.[0] ?? output.audios?.[0];
      if (audio?.filename) return audio;
    }
  }
  return null;
};

const getComfyExecutionFailure = (value: unknown) => {
  if (!value || typeof value !== 'object') return '';
  const entries = Object.values(value as Record<string, ComfyHistoryEntry>);
  for (const entry of entries) {
    if (entry.status?.status_str !== 'error') continue;
    const messages = entry.status.messages ?? [];
    const lastEvent = [...messages].reverse().find((message) => {
      if (!Array.isArray(message)) return false;
      return message[0] === 'execution_error' || message[0] === 'execution_interrupted';
    });
    if (!Array.isArray(lastEvent)) return 'ComfyUI остановил выполнение workflow.';
    const eventType = String(lastEvent[0]);
    const eventData = lastEvent[1] && typeof lastEvent[1] === 'object'
      ? lastEvent[1] as Record<string, unknown>
      : {};
    const nodeType = typeof eventData.node_type === 'string' ? ` в ${eventData.node_type}` : '';
    if (eventType === 'execution_interrupted') return `ComfyUI прервал выполнение workflow${nodeType}.`;
    const exception = typeof eventData.exception_message === 'string' ? `: ${eventData.exception_message}` : '';
    return `ComfyUI остановил workflow${nodeType}${exception}`;
  }
  return '';
};

const waitForComfyImage = async (
  baseUrl: string,
  promptId: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await wait(1000, signal);
    const historyResponse = await fetch(`${baseUrl}/history/${promptId}`, { signal });
    if (!historyResponse.ok) continue;
    const history: unknown = await historyResponse.json();
    const image = getImageFromComfyHistory(history);
    if (image) return image;
    const failure = getComfyExecutionFailure(history);
    if (failure) throw new Error(failure);
  }
  return null;
};

const waitForComfyAudio = async (
  baseUrl: string,
  promptId: string,
  timeoutMs: number,
  signal?: AbortSignal,
) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await wait(2000, signal);
    const historyResponse = await fetch(`${baseUrl}/history/${promptId}`, { signal });
    if (!historyResponse.ok) continue;
    const history: unknown = await historyResponse.json();
    const audio = getAudioFromComfyHistory(history);
    if (audio) return audio;
    const failure = getComfyExecutionFailure(history);
    if (failure) throw new Error(failure);
  }
  return null;
};

const freeComfyModels = async (baseUrl: string, signal?: AbortSignal) => {
  const response = await fetch(`${baseUrl}/free`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ free_memory: true, unload_models: true }),
  });
  if (!response.ok) throw new Error(`ComfyUI не выгрузил модели: ${response.status}`);
};

export const unloadComfyModels = async (settings: ImageGenerationSettings, signal?: AbortSignal) => {
  await freeComfyModels(getComfyBaseUrl(settings.comfyEndpoint), signal);
};

const buildComfyOmniVoiceDesignWorkflow = (
  text: string,
  voiceInstruct: string,
) => {
  const seed = Math.floor(Math.random() * 2_000_000_000);
  return {
    '1': {
      class_type: 'OmniVoiceVoiceDesignTTS',
      inputs: {
        model: 'OmniVoice-bf16',
        text,
        voice_instruct: voiceInstruct,
        steps: 32,
        guidance_scale: 2,
        t_shift: 0.1,
        speed: 1,
        duration: 0,
        device: 'auto',
        dtype: 'auto',
        attention: 'auto',
        seed,
        position_temperature: 5,
        class_temperature: 0,
        layer_penalty_factor: 5,
        denoise: true,
        postprocess_output: true,
        keep_model_loaded: true,
      },
    },
    '2': {
      class_type: 'PreviewAudio',
      inputs: {
        audio: ['1', 0],
      },
    },
  };
};

export const generateComfyOmniVoiceDesignAudio = async (
  text: string,
  voiceInstruct: string,
  settings: ImageGenerationSettings,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  try {
    if (settings.provider !== 'comfyui') throw new Error('OmniVoice работает только через ComfyUI.');
    const workflow = buildComfyOmniVoiceDesignWorkflow(text, voiceInstruct);
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-omnivoice-${Date.now()}`;

    const promptResponse = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, prompt: workflow }),
    });
    if (!promptResponse.ok) {
      throw new Error(getComfyError('ComfyUI не принял OmniVoice workflow', promptResponse, await readResponseDetails(promptResponse)));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id для OmniVoice workflow.');

    const audio = await waitForComfyAudio(baseUrl, promptData.prompt_id, COMFY_TTS_TIMEOUT_MS, signal);
    if (!audio) throw new Error('OmniVoice не вернул аудио за 45 минут. ComfyUI может ещё считать озвучку, проверьте его окно.');

    const params = new URLSearchParams({
      filename: audio.filename,
      subfolder: audio.subfolder ?? '',
      type: audio.type ?? 'temp',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, { signal });
    if (!viewResponse.ok) {
      throw new Error(getComfyError('ComfyUI не отдал готовое OmniVoice аудио', viewResponse, await readResponseDetails(viewResponse)));
    }

    return URL.createObjectURL(await viewResponse.blob());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте ComfyUI, OmniVoice-ноды и CORS.`);
    }
    throw error;
  }
};

interface LmStudioModelEntry {
  key?: string;
  loaded_instances?: { id?: string }[];
}

interface LmStudioModelsResponse {
  models?: LmStudioModelEntry[];
}

export const unloadLmStudioModels = async (settings: GenerationSettings, signal?: AbortSignal) => {
  const baseUrl = getLmStudioBaseUrl(settings.lmStudioEndpoint);
  const modelsResponse = await fetch(`${baseUrl}/api/v1/models`, { signal });
  if (!modelsResponse.ok) {
    throw new Error(`LM Studio не отдал список моделей: ${modelsResponse.status}`);
  }

  const data: LmStudioModelsResponse = await modelsResponse.json();
  const instanceIds = (data.models ?? [])
    .flatMap((model) => model.loaded_instances ?? [])
    .map((instance) => instance.id)
    .filter((id): id is string => Boolean(id));

  await Promise.all(instanceIds.map(async (instanceId) => {
    const response = await fetch(`${baseUrl}/api/v1/models/unload`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: instanceId }),
    });
    if (!response.ok) {
      throw new Error(`LM Studio не выгрузил ${instanceId}: ${response.status}`);
    }
  }));

  return instanceIds.length;
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
    if (pipeline !== 'sdxl') throw new Error('Этот генератор ожидает pipeline SDXL.');
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

    const image = await waitForComfyImage(baseUrl, promptData.prompt_id, COMFY_SDXL_TIMEOUT_MS, signal);
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

    return URL.createObjectURL(await viewResponse.blob());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте, что ComfyUI запущен, endpoint указан верно и разрешён CORS (--enable-cors-header).`);
    }
    throw error;
  }
};

const uploadComfyInputImage = async (
  baseUrl: string,
  imageUrl: string,
  filenamePrefix: string,
  signal?: AbortSignal,
) => {
  const sourceResponse = await fetch(imageUrl, { signal });
  if (!sourceResponse.ok) throw new Error(`Не удалось прочитать исходную картинку для Flux2: ${sourceResponse.status}.`);
  const blob = await sourceResponse.blob();
  const extension = blob.type.includes('jpeg') ? 'jpg' : 'png';
  const fileName = `${filenamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const formData = new FormData();
  formData.append('image', new File([blob], fileName, { type: blob.type || 'image/png' }));
  formData.append('type', 'input');
  formData.append('overwrite', 'true');

  const response = await fetch(`${baseUrl}/upload/image`, {
    method: 'POST',
    signal,
    body: formData,
  });
  if (!response.ok) {
    throw new Error(getComfyError('ComfyUI не принял reference image', response, await readResponseDetails(response)));
  }
  const payload: ComfyUploadResponse = await response.json();
  return payload.name || fileName;
};

const loadCanvasImage = async (imageUrl: string, signal?: AbortSignal) => {
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) throw new Error(`Не удалось прочитать character reference для Flux2: ${response.status}.`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  return { image, objectUrl };
};

const createCharacterReferenceBoard = async (
  references: Flux2CharacterReference[],
  signal?: AbortSignal,
) => {
  const loadedImages = await Promise.all(references.map((reference) => loadCanvasImage(reference.imageUrl, signal)));
  const size = 1024;
  const count = loadedImages.length;
  const columns = count <= 2 ? count : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог собрать reference-board для Flux2.');

  context.fillStyle = '#d8d4ca';
  context.fillRect(0, 0, size, size);
  const cellWidth = size / columns;
  const cellHeight = size / rows;
  const padding = Math.max(18, Math.min(cellWidth, cellHeight) * 0.06);

  loadedImages.forEach(({ image }, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const targetX = column * cellWidth + padding;
    const targetY = row * cellHeight + padding;
    const targetWidth = cellWidth - padding * 2;
    const targetHeight = cellHeight - padding * 2;
    const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    context.drawImage(
      image,
      targetX + (targetWidth - drawWidth) / 2,
      targetY + (targetHeight - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
  });

  loadedImages.forEach(({ objectUrl }) => URL.revokeObjectURL(objectUrl));
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('Браузер не смог сохранить reference-board для Flux2.'));
    }, 'image/png');
  });
  return URL.createObjectURL(blob);
};

const buildComfyFlux2ComposeWorkflow = (
  prompt: string,
  backgroundImageName: string,
  characterImageName: string,
  pipeline: ImagePipeline,
) => {
  const seed = Math.floor(Math.random() * 1_000_000_000_000);
  const isTurbo = pipeline === 'flux2_turbo_compose';
  const steps = isTurbo ? 8 : 20;
  return {
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['38', 0],
        text: prompt,
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['13', 0],
        vae: ['10', 0],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'CANVA_STORY_FLUX2',
        images: ['8', 0],
      },
    },
    '10': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: FLUX2_VAE,
      },
    },
    '12': {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: FLUX2_DIFFUSION_MODEL,
        weight_dtype: 'default',
      },
    },
    '13': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['25', 0],
        guider: ['22', 0],
        sampler: ['16', 0],
        sigmas: ['48', 0],
        latent_image: ['47', 0],
      },
    },
    '16': {
      class_type: 'KSamplerSelect',
      inputs: {
        sampler_name: 'euler',
      },
    },
    '22': {
      class_type: 'BasicGuider',
      inputs: {
        model: [isTurbo ? '49' : '12', 0],
        conditioning: ['43', 0],
      },
    },
    '25': {
      class_type: 'RandomNoise',
      inputs: {
        noise_seed: seed,
      },
    },
    '26': {
      class_type: 'FluxGuidance',
      inputs: {
        guidance: 4,
        conditioning: ['6', 0],
      },
    },
    '38': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: FLUX2_TEXT_ENCODER,
        type: 'flux2',
        device: 'default',
      },
    },
    '39': {
      class_type: 'ReferenceLatent',
      inputs: {
        conditioning: ['26', 0],
        latent: ['40', 0],
      },
    },
    '40': {
      class_type: 'VAEEncode',
      inputs: {
        pixels: ['41', 0],
        vae: ['10', 0],
      },
    },
    '41': {
      class_type: 'ImageScaleToTotalPixels',
      inputs: {
        upscale_method: 'area',
        megapixels: 1,
        resolution_steps: 1,
        image: ['42', 0],
      },
    },
    '42': {
      class_type: 'LoadImage',
      inputs: {
        image: backgroundImageName,
      },
    },
    '43': {
      class_type: 'ReferenceLatent',
      inputs: {
        conditioning: ['39', 0],
        latent: ['44', 0],
      },
    },
    '44': {
      class_type: 'VAEEncode',
      inputs: {
        pixels: ['45', 0],
        vae: ['10', 0],
      },
    },
    '45': {
      class_type: 'ImageScaleToTotalPixels',
      inputs: {
        upscale_method: 'area',
        megapixels: 1,
        resolution_steps: 1,
        image: ['46', 0],
      },
    },
    '46': {
      class_type: 'LoadImage',
      inputs: {
        image: characterImageName,
      },
    },
    '47': {
      class_type: 'EmptyFlux2LatentImage',
      inputs: {
        width: 1024,
        height: 1024,
        batch_size: 1,
      },
    },
    '48': {
      class_type: 'Flux2Scheduler',
      inputs: {
        steps,
        width: 1024,
        height: 1024,
      },
    },
    ...(isTurbo
      ? {
          '49': {
            class_type: 'LoraLoaderModelOnly',
            inputs: {
              model: ['12', 0],
              lora_name: FLUX2_TURBO_LORA,
              strength_model: 1,
            },
          },
        }
      : {}),
  };
};

export const generateComfyFlux2ComposeImage = async (
  prompt: string,
  backgroundImageUrl: string,
  characterReferences: Flux2CharacterReference[] | string,
  pipeline: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose'>,
  settings: ImageGenerationSettings,
  signal?: AbortSignal,
) => {
  const baseUrl = getComfyBaseUrl(settings.comfyEndpoint);
  let referenceBoardUrl: string | null = null;
  try {
    if (settings.provider !== 'comfyui') throw new Error('Flux2 compose работает только через ComfyUI.');
    const normalizedReferences = Array.isArray(characterReferences)
      ? characterReferences.filter((reference) => reference.imageUrl)
      : [{ imageUrl: characterReferences, label: 'character reference' }];
    if (normalizedReferences.length === 0) throw new Error('Для Flux2 нужен хотя бы один character reference.');
    const characterImageUrl = normalizedReferences.length === 1
      ? normalizedReferences[0].imageUrl
      : await createCharacterReferenceBoard(normalizedReferences, signal);
    if (normalizedReferences.length > 1) referenceBoardUrl = characterImageUrl;
    const [backgroundImageName, characterImageName] = await Promise.all([
      uploadComfyInputImage(baseUrl, backgroundImageUrl, 'canva-story-bg', signal),
      uploadComfyInputImage(baseUrl, characterImageUrl, 'canva-story-ref', signal),
    ]);
    const workflow = buildComfyFlux2ComposeWorkflow(prompt, backgroundImageName, characterImageName, pipeline);
    const clientId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `canva-story-flux2-${Date.now()}`;

    const promptResponse = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, prompt: workflow }),
    });
    if (!promptResponse.ok) {
      throw new Error(getComfyError('ComfyUI не принял Flux2 workflow', promptResponse, await readResponseDetails(promptResponse)));
    }
    const promptData: ComfyPromptResponse = await promptResponse.json();
    if (!promptData.prompt_id) throw new Error('ComfyUI не вернул prompt_id для Flux2 workflow.');

    const image = await waitForComfyImage(baseUrl, promptData.prompt_id, COMFY_FLUX2_TIMEOUT_MS, signal);
    if (!image) throw new Error('Flux2 не вернул изображение за 6 часов. ComfyUI может ещё считать кадр, проверьте его окно и output.');

    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? '',
      type: image.type ?? 'output',
    });
    const viewResponse = await fetch(`${baseUrl}/view?${params.toString()}`, { signal });
    if (!viewResponse.ok) {
      throw new Error(getComfyError('ComfyUI не отдал готовое Flux2 изображение', viewResponse, await readResponseDetails(viewResponse)));
    }

    const blob = await viewResponse.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      throw new Error(`Не удалось подключиться к ComfyUI по адресу ${baseUrl}. Проверьте ComfyUI и CORS.`);
    }
    throw error;
  } finally {
    if (referenceBoardUrl) URL.revokeObjectURL(referenceBoardUrl);
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
