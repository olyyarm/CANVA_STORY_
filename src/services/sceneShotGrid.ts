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
  locationText?: string;
  moodText?: string;
}

export const SCENE_SHOT_DEFINITIONS: readonly SceneShotDefinition[] = [
  { index: 1, role: 'location_establishing', label: 'Локация · общий план' },
  { index: 2, role: 'location_atmosphere', label: 'Локация · атмосферная деталь' },
  { index: 3, role: 'character_context', label: 'Персонаж · действие в пространстве' },
  { index: 4, role: 'character_emotion', label: 'Персонаж · эмоция крупно' },
] as const;

export const buildSceneShotGridPrompt = ({
  sceneLabel,
  sceneText,
  visualPrompt = '',
  narrationText = '',
  locationText = '',
  moodText = '',
}: SceneShotGridPromptInput) => [
  'Use the attached source frame as the strict visual continuity reference.',
  'Return exactly ONE horizontal 16:9 contact sheet containing a precise 2 by 2 grid.',
  'Every quadrant must itself be a horizontal 16:9 cinematic frame.',
  'The grid boundaries must be exactly at 50% of the sheet width and 50% of the sheet height.',
  'Fill all four quadrants edge-to-edge. No outer margins, gutters, borders, captions, labels, UI, logos, or watermarks.',
  '',
  'All four quadrants belong to the SAME story scene and preserve the exact characters, faces, clothing, location, time of day, lighting, color style, and continuity from the source frame.',
  'The four panels must be visibly different shots. Never repeat the same framing, shot size, camera height, camera direction, pose, or composition in two panels.',
  'Exactly TWO panels must primarily reveal the LOCATION and exactly TWO panels must primarily reveal the CHARACTER.',
  'Do not invent new characters, plot events, injuries, costume changes, clues, weapons, documents, tools, or handheld props.',
  'A character may hold an object only when that exact object is explicitly mentioned in the scene or narration, or clearly visible in the source frame. Otherwise keep the hands empty and natural.',
  'Mood controls light, palette, weather, sound-implied atmosphere, and visual tension. Mood must not create a new story event.',
  '',
  'Quadrants, in reading order from top-left to bottom-right:',
  '1. LOCATION ESTABLISHING SHOT: an extreme-wide or wide master shot that clearly explains what kind of place this is, its scale, architecture, foreground, middle ground, background, entrances, exits, and the character position. The character is small and is not the visual subject.',
  '2. LOCATION ATMOSPHERE INSERT: a low, high, or close environmental cutaway with no character as the subject. Show material, age, weather, decay, light, sound-implied detail, or a small diegetic micro-detail supported by the narration and mood. For example, a rat near a puddle is acceptable only if the described place genuinely supports damp basement decay. Never turn this detail into a new clue or event.',
  '3. CHARACTER IN CONTEXT: a medium-wide or full-body shot showing the character posture, physical state, and current action inside the established space. This composition must not resemble panels 1 or 2.',
  '4. CHARACTER EMOTION: a close-up or medium close-up of the face, gaze, breathing, or a narration-relevant physical reaction. If a face close-up is unsuitable, use a first-person or over-the-shoulder view. Do not repeat a hand close-up or the composition of any other panel.',
  '',
  'Before rendering, silently audit the sheet: two location-led panels, two character-led panels, four different shot scales and camera positions, no duplicated composition, and no invented handheld object.',
  '',
  `Scene: ${sceneLabel}`,
  `Scene description:\n${sceneText.trim()}`,
  visualPrompt.trim() ? `Existing visual prompt:\n${visualPrompt.trim()}` : '',
  locationText.trim() ? `Location continuity and spatial context:\n${locationText.trim()}` : '',
  narrationText.trim() ? `Narration context and storyboard themes (do not add events beyond it):\n${narrationText.trim()}` : '',
  moodText.trim() ? `Mood direction (atmosphere only, not new story facts):\n${moodText.trim()}` : '',
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
