import { MAX_SCENE_COUNT, MIN_SCENE_COUNT } from './constants';

export const generateNodeId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `node-${crypto.randomUUID()}`;
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const assetPath = (fileName: string) => {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}${fileName}`;
};

export const getNodeIcon = (nodeType?: string, label?: string) => {
  switch (nodeType) {
    case 'text':
      return assetPath('text.png');
    case 'scene':
      return assetPath('location.png');
    case 'script_input':
      return assetPath('scenariy_vvod.png');
    case 'script_output':
      return assetPath('scenariy_generated.png');
    case 'association':
      return assetPath('generated_associacii_.png');
    case 'script_detail':
      if (label === 'Герои') return assetPath('character.png');
      if (label === 'Локации') return assetPath('location.png');
      if (label === 'Настроение') return assetPath('emotion.png');
      if (label === 'Закадр') return assetPath('text.png');
      return assetPath('metaprompt.png');
    case 'prompt_node':
      return assetPath('metaprompt.png');
    case 'split_node':
      return assetPath('generated_associacii_.png');
    case 'split_item':
      return assetPath('text.png');
    case 'character_registry':
      return assetPath('character.png');
    case 'chapter_timeline':
      return assetPath('scenariy_generated.png');
    case 'chapter_collector':
      return assetPath('generated_associacii_.png');
    case 'video_output':
      return assetPath('generated_associacii_.png');
    default:
      return assetPath('metaprompt.png');
  }
};

export const calculateTextWidth = (text: string, font = '400 14px Arial') => {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return text.length * 8 + 40;
    context.font = font;
    return Math.ceil(context.measureText(text).width) + 40;
  } catch {
    return text.length * 8 + 40;
  }
};

export const clampSceneCount = (value: number) =>
  Math.min(MAX_SCENE_COUNT, Math.max(MIN_SCENE_COUNT, Math.round(value)));

export interface ParsedScene {
  label: string;
  text: string;
}

export const parseSceneBlocks = (text: string, fallbackCount: number): ParsedScene[] => {
  const matches = [...text.matchAll(/(?:^|\n)\s*(?:<<<SPLIT>>>\s*)?((?:Сцена|СЦЕНА)\s*0*(\d+)\s*(?::|[-–—])?[^\n]*)([\s\S]*?)(?=\n\s*(?:<<<SPLIT>>>\s*)?(?:Сцена|СЦЕНА)\s*0*\d+\s*(?::|[-–—])?|$)/giu)];
  if (matches.length > 0) {
    return matches.map((match, index) => ({
      label: `СЦЕНА ${String(Number(match[2]) || index + 1).padStart(2, '0')}`,
      text: `${match[1]}${match[3]}`.trim(),
    }));
  }

  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const count = clampSceneCount(fallbackCount);
  return Array.from({ length: count }, (_, index) => ({
    label: `СЦЕНА ${index + 1}`,
    text: paragraphs[index] ?? paragraphs[paragraphs.length - 1] ?? text.trim(),
  }));
};

export const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Произошла неизвестная ошибка.';
