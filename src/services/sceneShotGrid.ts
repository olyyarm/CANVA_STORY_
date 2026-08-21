import { SceneShotRole } from '../types';

export const SCENE_SHOT_GRID_COLUMNS = 2;
export const SCENE_SHOT_GRID_ROWS = 2;
export const SCENE_SHOT_WIDTH = 1024;
export const SCENE_SHOT_HEIGHT = 576;

export interface SceneShotDefinition {
  index: number;
  role: SceneShotRole;
  label: string;
}

export interface SceneShotCrop extends SceneShotDefinition {
  blob: Blob;
  imageUrl: string;
}

export interface SceneShotGridPromptInput {
  sceneLabel: string;
  sceneText: string;
  visualPrompt?: string;
  narrationText?: string;
}

export const SCENE_SHOT_DEFINITIONS: readonly SceneShotDefinition[] = [
  { index: 1, role: 'detail', label: 'Смысловая деталь' },
  { index: 2, role: 'emotion', label: 'Эмоция крупно' },
  { index: 3, role: 'angle', label: 'Другой ракурс' },
  { index: 4, role: 'pov', label: 'POV или через плечо' },
] as const;

export const buildSceneShotGridPrompt = ({
  sceneLabel,
  sceneText,
  visualPrompt = '',
  narrationText = '',
}: SceneShotGridPromptInput) => [
  'Use the attached source frame as the strict visual continuity reference.',
  'Return exactly ONE horizontal 16:9 contact sheet containing a precise 2 by 2 grid.',
  'Every quadrant must itself be a horizontal 16:9 cinematic frame.',
  'The grid boundaries must be exactly at 50% of the sheet width and 50% of the sheet height.',
  'Fill all four quadrants edge-to-edge. No outer margins, gutters, borders, captions, labels, UI, logos, or watermarks.',
  '',
  'All four quadrants belong to the SAME story scene and preserve the exact characters, faces, clothing, location, props, time of day, lighting, color style, and continuity from the source frame.',
  'Do not invent new characters, objects, actions, plot events, injuries, or changes of costume.',
  'Vary only camera position, framing, and the immediately visible micro-moment inside the same scene.',
  '',
  'Quadrants, in reading order from top-left to bottom-right:',
  '1. A meaningful close detail of an existing action, hand, object, clue, or environmental feature that is genuinely present in the scene.',
  '2. A close-up reaction or emotion of the most relevant visible character.',
  '3. A clearly different cinematic angle: high angle, low angle, wide angle, or side view, whichever best fits the scene.',
  '4. A first-person, over-the-shoulder, or third-person observational view that complements the other three panels.',
  '',
  `Scene: ${sceneLabel}`,
  `Scene description:\n${sceneText.trim()}`,
  visualPrompt.trim() ? `Existing visual prompt:\n${visualPrompt.trim()}` : '',
  narrationText.trim() ? `Narration context (do not add events beyond it):\n${narrationText.trim()}` : '',
].filter(Boolean).join('\n\n');

const loadImage = async (imageUrl: string, signal?: AbortSignal) => {
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) throw new Error(`Не удалось прочитать лист дополнительных планов: ${response.status}.`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const image = new Image();
  image.src = objectUrl;
  try {
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const canvasToPng = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Браузер не смог вырезать дополнительный план из листа.'));
  }, 'image/png');
});

const getCenteredSixteenByNineBounds = (width: number, height: number) => {
  const targetAspect = 16 / 9;
  const sourceAspect = width / height;
  if (sourceAspect > targetAspect) {
    const cropWidth = height * targetAspect;
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height };
  }
  const cropHeight = width / targetAspect;
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight };
};

export const splitSceneShotGrid = async (
  sheetImageUrl: string,
  signal?: AbortSignal,
): Promise<SceneShotCrop[]> => {
  const image = await loadImage(sheetImageUrl, signal);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Nano Banana вернула пустой лист дополнительных планов.');

  const sheetBounds = getCenteredSixteenByNineBounds(sourceWidth, sourceHeight);
  const sourceCellWidth = sheetBounds.width / SCENE_SHOT_GRID_COLUMNS;
  const sourceCellHeight = sheetBounds.height / SCENE_SHOT_GRID_ROWS;

  return Promise.all(SCENE_SHOT_DEFINITIONS.map(async (definition, arrayIndex) => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const column = arrayIndex % SCENE_SHOT_GRID_COLUMNS;
    const row = Math.floor(arrayIndex / SCENE_SHOT_GRID_COLUMNS);
    const canvas = document.createElement('canvas');
    canvas.width = SCENE_SHOT_WIDTH;
    canvas.height = SCENE_SHOT_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не смог подготовить canvas для нарезки листа.');
    context.drawImage(
      image,
      sheetBounds.x + column * sourceCellWidth,
      sheetBounds.y + row * sourceCellHeight,
      sourceCellWidth,
      sourceCellHeight,
      0,
      0,
      SCENE_SHOT_WIDTH,
      SCENE_SHOT_HEIGHT,
    );
    const blob = await canvasToPng(canvas);
    return {
      ...definition,
      blob,
      imageUrl: URL.createObjectURL(blob),
    };
  }));
};
