import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Flux2CharacterReference,
  generateComfyFlux2ComposeImage,
  generateComfyOmniVoiceDesignAudio,
  generateImage,
  generateText,
  GenerationSettings,
  ImageGenerationSettings,
} from '../api';
import {
  ASSOCIATE_SYSTEM_PROMPT,
  CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT,
  CHAPTER_SUMMARY_SYSTEM_PROMPT,
  DEFAULT_CHAPTER_MATERIAL,
  DEFAULT_FORMAT_BIBLE,
  DEFAULT_KNOWLEDGE_BASE,
  DEFAULT_SEASON_MEMORY,
  HERO_DETAIL_SYSTEM_PROMPT,
  LOCATION_ASSET_PROMPT_SYSTEM_PROMPT,
  LOCATION_DETAIL_SYSTEM_PROMPT,
  MISTRAL_MODELS,
  MOOD_DETAIL_SYSTEM_PROMPT,
  NARRATION_DETAIL_SYSTEM_PROMPT,
  NARRATION_EDIT_SYSTEM_PROMPT,
  SCENARIO_SYSTEM_PROMPT,
  SCENE_CHARACTER_LAYER_PROMPT_SYSTEM_PROMPT,
  SCENE_LOCATION_PROMPT_SYSTEM_PROMPT,
  SCENE_MASTER_PROMPT_SYSTEM_PROMPT,
  SEASON_MEMORY_UPDATE_SYSTEM_PROMPT,
  STORY_BRIEF_REVISION_SYSTEM_PROMPT,
  SYSTEM_INSERTS_DETAIL_SYSTEM_PROMPT,
  TTS_CLEANUP_SYSTEM_PROMPT,
} from '../constants';
import {
  AppNotice,
  DetailType,
  GenerationOperation,
  GenerationRequest,
  ImagePipeline,
  ImagePromptKind,
  NodeData,
  NodesState,
} from '../types';
import {
  calculateTextWidth,
  clampSceneCount,
  errorMessage,
  generateNodeId,
  isAbortError,
  parseSceneBlocks,
} from '../utils';

interface UseNodeManagementReturn {
  nodes: NodesState;
  setNodes: Dispatch<SetStateAction<NodesState>>;
  notice: AppNotice | null;
  clearNotice: () => void;
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handleThemeInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => void;
  handleModelChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleImagePipelineChange: (event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => void;
  handleSceneCountChange: (event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => void;
  handleContinueAssociation: (sourceNodeId: string) => Promise<void>;
  handleScriptVisualization: (sourceNodeId: string) => Promise<void>;
  handleBuildScenarioFromBrief: (briefNodeId: string) => Promise<void>;
  handleAutoBuildChapter: (chapterMaterialNodeId: string) => Promise<void>;
  handleEnsureStoryReferenceNodes: () => void;
  handleEnsureChapterTimeline: () => void;
  handleScenarioDetailClick: (sourceNodeId: string, detailType: DetailType) => Promise<void>;
  handleCreateSceneNodes: (sourceNodeId: string) => void;
  handleGenerateScenePrompt: (sceneNodeId: string) => Promise<void>;
  handleGenerateSceneLocationAsset: (sceneNodeId: string) => Promise<void>;
  handleGenerateSceneCharacterLayer: (sceneNodeId: string) => Promise<void>;
  handleComposeSceneFlux2: (sceneNodeId: string, pipeline?: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose'>) => Promise<void>;
  handleGenerateDetailAsset: (detailNodeId: string) => Promise<void>;
  handleEditNarration: (detailNodeId: string) => Promise<void>;
  handleNarrationEditorialLoop: (detailNodeId: string) => Promise<void>;
  handlePrepareNarrationTts: (detailNodeId: string) => Promise<void>;
  handleSpeakNarration: (detailNodeId: string) => void;
  handleStopSpeech: () => void;
  handleGenerateOmniVoiceNarration: (detailNodeId: string) => Promise<void>;
  handleGenerateSceneOmniVoiceNarration: (sceneNodeId: string) => Promise<void>;
  handleBuildSceneVideoClip: (sceneNodeId: string) => Promise<void>;
  handleBuildChapterVideo: (timelineNodeId: string) => Promise<void>;
  handleCopyToClipboard: (textToCopy: string) => Promise<void>;
  handleGeneratePollinationsImage: (nodeId: string) => Promise<void>;
  handleRegenerateImageNode: (nodeId: string) => Promise<void>;
  handleToggleReferenceImage: (nodeId: string) => void;
  handleCancelGeneration: (nodeId: string) => void;
}

const detailConfig: Record<DetailType, {
  label: string;
  operation: GenerationOperation;
  systemPrompt: string;
  column: number;
}> = {
  герои: { label: 'Герои', operation: 'heroes', systemPrompt: HERO_DETAIL_SYSTEM_PROMPT, column: 0 },
  локации: { label: 'Локации', operation: 'locations', systemPrompt: LOCATION_DETAIL_SYSTEM_PROMPT, column: 1 },
  настроение: { label: 'Настроение', operation: 'mood', systemPrompt: MOOD_DETAIL_SYSTEM_PROMPT, column: 2 },
  закадр: { label: 'Закадр', operation: 'narration', systemPrompt: NARRATION_DETAIL_SYSTEM_PROMPT, column: 3 },
  система: { label: 'Системные вставки', operation: 'system_inserts', systemPrompt: SYSTEM_INSERTS_DETAIL_SYSTEM_PROMPT, column: 4 },
};

const getExistingChild = (nodes: NodesState, parentId: string, predicate: (node: NodeData) => boolean) =>
  Object.entries(nodes).find(([, node]) => node.parentId === parentId && predicate(node));

const referenceSourceKinds = new Set(['format_bible', 'knowledge_base', 'season_memory']);

const getSourceKind = (node?: NodeData) =>
  typeof node?.metadata?.sourceKind === 'string' ? node.metadata.sourceKind : '';

const findNodeBySourceKind = (nodes: NodesState, sourceKind: string) =>
  Object.entries(nodes).find(([, node]) => node.nodeType === 'script_detail' && getSourceKind(node) === sourceKind);

const getStoryReferenceContext = (nodes: NodesState) => {
  const references = Object.values(nodes)
    .filter((node) =>
      node.nodeType === 'script_detail'
      && typeof node.metadata?.sourceKind === 'string'
      && referenceSourceKinds.has(node.metadata.sourceKind)
      && node.inputValue?.trim())
    .sort((first, second) => first.label.localeCompare(second.label, 'ru'));

  if (references.length === 0) return '';
  return references
    .map((node) => `${node.label}:\n${node.inputValue?.trim()}`)
    .join('\n\n');
};

const withStoryReferenceContext = (prompt: string, nodes: NodesState) => {
  const context = getStoryReferenceContext(nodes);
  if (!context) return prompt;
  return [
    prompt,
    'Справочные базы проекта. Используй как ориентир для структуры, фактуры, профессий, лазеек и эмоционального тона. Не копируй дословно, если это пример или шаблон.',
    context,
  ].join('\n\n');
};

const getProjectVisualStyle = (nodes: NodesState) =>
  Object.values(nodes).find((node) => node.nodeType === 'script_input' && node.themeInputValue?.trim())
    ?.themeInputValue?.trim() ?? '';

const negativeImagePromptClausePattern =
  /\b(?:no|not|without|avoid|exclude|never|don't|do not|negative prompt)\b|(?:^|\s)non-[a-z]|(?:^|\s)без\s/iu;

const negativeImagePromptSentenceStartPattern =
  /^(?:no|not|without|avoid|exclude|never|don't|do not|negative prompt)\b|^(?:без|не)\s/iu;

const sanitizePositiveImagePrompt = (text: string) =>
  text
    .split(/\n+/u)
    .map((paragraph) => {
      const sentences = paragraph.match(/[^.!?]+[.!?]?/gu) ?? [paragraph];
      return sentences
        .map((sentence) => {
          const trimmed = sentence.trim();
          if (!trimmed || negativeImagePromptSentenceStartPattern.test(trimmed)) return '';
          const ending = /[.!?]$/u.test(trimmed) ? trimmed[trimmed.length - 1] : '';
          const body = ending ? trimmed.slice(0, -1) : trimmed;
          const clauses = body
            .split(/[,;]\s*/u)
            .map((clause) => clause.trim())
            .filter((clause) => clause && !negativeImagePromptClausePattern.test(clause));
          if (clauses.length === 0) return '';
          return `${clauses.join(', ')}${ending || '.'}`;
        })
        .filter(Boolean)
        .join(' ');
    })
    .filter(Boolean)
    .join('\n\n')
    .trim();

const withProjectVisualStyle = (prompt: string, nodes: NodesState) => {
  const style = sanitizePositiveImagePrompt(getProjectVisualStyle(nodes));
  if (!style) return prompt;
  return [
    'Project visual style. Apply this style consistently to every generated image in the project:',
    style,
    'Keep the same rendering language, medium, line quality, realism level, palette logic, and finish across all character and location assets.',
    prompt,
  ].join('\n\n');
};

const appendProjectVisualStyleToImagePrompt = (imagePrompt: string, nodes: NodesState) => {
  const cleanImagePrompt = sanitizePositiveImagePrompt(imagePrompt);
  const style = sanitizePositiveImagePrompt(getProjectVisualStyle(nodes));
  if (!style) return cleanImagePrompt;
  const normalizedPrompt = cleanImagePrompt.toLocaleLowerCase('en');
  const normalizedStyle = style.toLocaleLowerCase('en');
  if (normalizedPrompt.includes(normalizedStyle)) return cleanImagePrompt;
  return sanitizePositiveImagePrompt([
    cleanImagePrompt,
    `Visual style: ${style}. Keep this exact rendering language, medium, line quality, realism level, palette logic, and finish consistent with every other project image.`,
  ].join('\n\n'));
};

const buildChapterPrompt = (material: string, nodes: NodesState) =>
  withStoryReferenceContext([
    'Материал текущей главы:',
    material,
    'Задача: собрать главу как последовательный сценарий сцен. Используй материал главы как главный источник, а базы проекта и сезонную память как контекст.',
    'Каждая сцена должна быть не паузой для размышления, а маленьким событием: ближайшая цель героя, препятствие, физическое действие, реакция мира или другого персонажа, профессиональная лазейка, решение и крючок на следующую сцену.',
    'Закадр потом будет озвучивать эти действия, поэтому заложи в сценарий видимые поступки: герой встаёт, прячет предмет, идёт к двери, встречает союзника или противника, отвечает на угрозу, делает сделку, ошибается, меняет план.',
  ].join('\n\n'), nodes);

const isEditorialReviewText = (text: string) =>
  /^(отлично|хорошо|замечательно|прекрасно|резюме получилось|получилось)/iu.test(text.trim())
  || /(понравил[оа]сь|сильный момент|очень информативн|структурированн|учитывающ|полезно для дальнейшего)/iu.test(text);

const cleanupBrowserSpeechText = (text: string) =>
  text
    .replace(/Сцена\s*\d+\s*[:.\-–—]?\s*/giu, '\n')
    .replace(/Закадровый текст\s*:\s*/giu, '')
    .replace(/Смысловой акцент\s*:\s*[^\n]+/giu, '')
    .replace(/\s+/g, ' ')
    .trim();

const splitSpeechText = (text: string) => {
  const sentences = text.match(/[^.!?…]+[.!?…]?/gu) ?? [text];
  const chunks: string[] = [];
  let current = '';
  sentences.forEach((sentence) => {
    const trimmed = sentence.trim();
    if (!trimmed) return;
    const next = `${current} ${trimmed}`.trim();
    if (next.length > 700 && current) {
      chunks.push(current);
      current = trimmed;
    } else {
      current = next;
    }
  });
  if (current) chunks.push(current);
  return chunks;
};

const OMNIVOICE_NARRATOR_VOICE =
  'male, middle-aged, low pitch, russian accent';

const getSceneNumber = (label: string) => {
  const match = label.match(/\d+/u);
  return match ? Number(match[0]) : null;
};

const countSystemInsertBlocks = (text = '') =>
  [...text.matchAll(/(?:^|\n)\s*После\s+сцены\s+\d+\s*:/giu)].length;

const extractSceneNarration = (narration: string, sceneLabel: string) => {
  const sceneNumber = getSceneNumber(sceneLabel);
  if (!sceneNumber) return cleanupBrowserSpeechText(narration);

  const normalized = narration.replace(/\r\n/g, '\n');
  const sceneMatch = new RegExp(`(?:^|\\n)\\s*Сцена\\s*${sceneNumber}\\s*[:.\\-–—]?`, 'iu').exec(normalized);
  if (!sceneMatch) return '';

  const blockStart = sceneMatch.index + sceneMatch[0].length;
  const rest = normalized.slice(blockStart);
  const nextSceneMatch = /\n\s*Сцена\s*\d+\s*[:.\-–—]?/iu.exec(rest);
  return cleanupBrowserSpeechText(rest.slice(0, nextSceneMatch?.index ?? undefined));
};

const loadImageElement = (imageUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не удалось загрузить картинку для 16:9 клипа.'));
    image.src = imageUrl;
  });

const pickSupportedVideoMimeType = () => {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
};

const drawCenteredImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  drawWidth: number,
  drawHeight: number,
) => {
  context.drawImage(
    image,
    x - drawWidth / 2,
    y - drawHeight / 2,
    drawWidth,
    drawHeight,
  );
};

const drawAnimatedStillFrame = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  progress: number,
) => {
  const easedProgress = Math.min(1, Math.max(0, progress));
  const centerX = width / 2;
  const centerY = height / 2;
  const coverScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const backgroundScale = coverScale * 1.5;
  const backgroundDrift = (easedProgress - 0.5) * 28;

  context.fillStyle = '#101318';
  context.fillRect(0, 0, width, height);
  context.save();
  context.filter = 'blur(28px)';
  drawCenteredImage(
    context,
    image,
    centerX + backgroundDrift,
    centerY - backgroundDrift * 0.35,
    image.naturalWidth * backgroundScale,
    image.naturalHeight * backgroundScale,
  );
  context.restore();

  context.fillStyle = 'rgba(0, 0, 0, 0.2)';
  context.fillRect(0, 0, width, height);

  const containScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const foregroundScale = containScale * (0.78 - easedProgress * 0.08);
  const foregroundY = centerY + (easedProgress - 0.5) * 18;
  const foregroundWidth = image.naturalWidth * foregroundScale;
  const foregroundHeight = image.naturalHeight * foregroundScale;

  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.35)';
  context.shadowBlur = 30;
  context.shadowOffsetY = 16;
  drawCenteredImage(context, image, centerX, foregroundY, foregroundWidth, foregroundHeight);
  context.restore();
};

const buildStillImageVideoClip = async (
  imageUrl: string,
  audioUrl: string,
  signal?: AbortSignal,
) => {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Браузер не поддерживает MediaRecorder, поэтому не может собрать клип.');
  }

  const [image, audioResponse] = await Promise.all([
    loadImageElement(imageUrl),
    fetch(audioUrl, { signal }),
  ]);
  if (!audioResponse.ok) throw new Error(`Не удалось прочитать аудио для клипа: ${audioResponse.status}.`);

  const audioBuffer = await audioResponse.arrayBuffer();
  const audioContext = new AudioContext();
  const decodedAudio = await audioContext.decodeAudioData(audioBuffer.slice(0));
  const audioSource = audioContext.createBufferSource();
  audioSource.buffer = decodedAudio;
  const audioDestination = audioContext.createMediaStreamDestination();
  audioSource.connect(audioDestination);

  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог подготовить canvas для 16:9 клипа.');
  drawAnimatedStillFrame(context, image, canvas.width, canvas.height, 0);

  const canvasStream = canvas.captureStream(30);
  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);
  const mimeType = pickSupportedVideoMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let frameId = 0;
  let startedAt = 0;
  const paintFrame = () => {
    const elapsed = startedAt ? audioContext.currentTime - startedAt : 0;
    const progress = decodedAudio.duration > 0 ? elapsed / decodedAudio.duration : 0;
    drawAnimatedStillFrame(context, image, canvas.width, canvas.height, progress);
    frameId = requestAnimationFrame(paintFrame);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Браузер остановил запись клипа из-за ошибки.'));
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
    };
    audioSource.onended = () => {
      recorder.stop();
    };
  });

  await audioContext.resume();
  recorder.start(500);
  startedAt = audioContext.currentTime;
  audioSource.start();
  paintFrame();
  if (signal) {
    signal.addEventListener('abort', () => {
      audioSource.stop();
      if (recorder.state !== 'inactive') recorder.stop();
    }, { once: true });
  }

  const blob = await finished;
  cancelAnimationFrame(frameId);
  stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();
  return URL.createObjectURL(blob);
};

const createVideoElement = (videoUrl: string) =>
  new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('Не удалось загрузить один из клипов главы для сборки ролика.'));
  });

const drawVideoCoverFrame = (
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
) => {
  const sourceWidth = video.videoWidth || width;
  const sourceHeight = video.videoHeight || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.fillStyle = '#101318';
  context.fillRect(0, 0, width, height);
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
};

const waitForVideoEnd = (video: HTMLVideoElement, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.onended = null;
      video.onerror = null;
    };
    video.onended = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Браузер остановил воспроизведение одного из клипов главы.'));
    };
    signal?.addEventListener('abort', () => {
      cleanup();
      video.pause();
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

const buildChapterVideoFromClips = async (
  clipUrls: string[],
  signal?: AbortSignal,
) => {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Браузер не поддерживает MediaRecorder, поэтому не может собрать общий ролик.');
  }
  if (clipUrls.length === 0) {
    throw new Error('Нет готовых клипов для сборки общего ролика.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог подготовить canvas для общего ролика.');

  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();
  const canvasStream = canvas.captureStream(30);
  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);
  const mimeType = pickSupportedVideoMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let frameId = 0;
  let activeVideo: HTMLVideoElement | null = null;
  const paintFrame = () => {
    if (activeVideo) drawVideoCoverFrame(context, activeVideo, canvas.width, canvas.height);
    frameId = requestAnimationFrame(paintFrame);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Браузер остановил запись общего ролика из-за ошибки.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
  });

  try {
    await audioContext.resume();
    recorder.start(500);
    paintFrame();

    for (const clipUrl of clipUrls) {
      const video = await createVideoElement(clipUrl);
      activeVideo = video;
      const source = audioContext.createMediaElementSource(video);
      source.connect(audioDestination);
      drawVideoCoverFrame(context, video, canvas.width, canvas.height);
      const ended = waitForVideoEnd(video, signal);
      await video.play();
      await ended;
      source.disconnect();
      video.removeAttribute('src');
      video.load();
    }

    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await finished;
    return URL.createObjectURL(blob);
  } finally {
    cancelAnimationFrame(frameId);
    stream.getTracks().forEach((track) => track.stop());
    if (recorder.state !== 'inactive') recorder.stop();
    activeVideo?.pause();
    await audioContext.close();
  }
};

const upsertScriptDetailNode = (
  previousNodes: NodesState,
  parentId: string,
  label: string,
  inputValue: string,
  options: {
    column?: number;
    width?: number;
    height?: number;
    metadata?: NodeData['metadata'];
  } = {},
) => {
  const parentNode = previousNodes[parentId];
  if (!parentNode) return previousNodes;
  const existing = getExistingChild(
    previousNodes,
    parentId,
    (node) => node.nodeType === 'script_detail' && node.label === label,
  );
  const nodeId = existing?.[0] ?? generateNodeId();
  const column = options.column ?? 0;
  const nextNode: NodeData = {
    ...existing?.[1],
    nodeType: 'script_detail',
    x: existing?.[1].x ?? parentNode.x + column * 326,
    y: existing?.[1].y ?? parentNode.y + (parentNode.height ?? 390) + 36,
    label,
    width: existing?.[1].width ?? options.width ?? 302,
    height: existing?.[1].height ?? options.height ?? 280,
    isGenerated: true,
    level: (parentNode.level ?? 0) + 1,
    parentId,
    inputValue,
    error: undefined,
    metadata: {
      ...existing?.[1].metadata,
      ...options.metadata,
    },
  };
  return {
    ...previousNodes,
    [nodeId]: nextNode,
  };
};

const upsertVideoOutputNode = (
  previousNodes: NodesState,
  parentId: string,
  videoUrl: string,
  label = 'Ролик главы',
) => {
  const parentNode = previousNodes[parentId];
  if (!parentNode) return previousNodes;
  const existing = getExistingChild(
    previousNodes,
    parentId,
    (node) => node.nodeType === 'video_output' && node.label === label,
  );
  const nodeId = existing?.[0] ?? generateNodeId();
  if (existing?.[1].videoUrl?.startsWith('blob:')) URL.revokeObjectURL(existing[1].videoUrl);
  return {
    ...previousNodes,
    [nodeId]: {
      ...existing?.[1],
      nodeType: 'video_output' as const,
      x: existing?.[1].x ?? parentNode.x + (parentNode.width ?? 1180) + 36,
      y: existing?.[1].y ?? parentNode.y,
      label,
      width: existing?.[1].width ?? 430,
      height: existing?.[1].height ?? 360,
      isGenerated: true,
      level: (parentNode.level ?? 0) + 1,
      parentId,
      videoUrl,
      statusMessage: 'Общий ролик главы готов.',
      metadata: {
        ...existing?.[1].metadata,
        sourceKind: 'chapter_video',
        sourceTimelineId: parentId,
        videoFormat: 'webm',
        videoAspectRatio: '16:9',
        videoGeneratedAt: new Date().toISOString(),
      },
    },
  };
};

const getReferencedSceneNumbers = (text: string) => {
  const markerIndex = text.toLocaleLowerCase('ru').lastIndexOf('сцен');
  if (markerIndex < 0) return null;
  const tail = text.slice(markerIndex);
  const numbers = new Set<number>();
  const pattern = /(\d+)\s*[–—-]\s*(\d+)|(\d+)/gu;
  for (const match of tail.matchAll(pattern)) {
    if (match[1] && match[2]) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      const step = start <= end ? 1 : -1;
      for (let value = start; value !== end + step; value += step) numbers.add(value);
    } else if (match[3]) {
      numbers.add(Number(match[3]));
    }
  }
  return numbers.size > 0 ? numbers : null;
};

const getSceneHeroScope = (heroesText: string, sceneLabel: string) => {
  const sceneNumber = getSceneNumber(sceneLabel);
  const lines = heroesText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!sceneNumber || lines.length === 0) return { allowed: heroesText || 'Не задано', excluded: '' };

  const allowed: string[] = [];
  const excluded: string[] = [];
  lines.forEach((line) => {
    const sceneNumbers = getReferencedSceneNumbers(line);
    if (!sceneNumbers || sceneNumbers.has(sceneNumber)) {
      allowed.push(line);
    } else {
      excluded.push(line);
    }
  });

  return {
    allowed: allowed.join('\n') || 'В списке героев нет персонажей, явно привязанных к этой сцене.',
    excluded: excluded.join('\n'),
  };
};

const getCharacterName = (description: string, index: number) => {
  const firstLine = description.split(/\n/)[0]?.trim() || '';
  const normalized = firstLine
    .replace(/^\d+[.)]\s*/u, '')
    .replace(/^ID\/Имя или роль\s*[—-]\s*/iu, '')
    .replace(/^ID\/Имя или роль\s*—\s*/iu, '')
    .split(/\s*[—–-]\s*/u)[0]
    ?.replace(/[;:,.]+$/u, '')
    .trim();
  return (normalized || `Персонаж ${index + 1}`).slice(0, 48);
};

const getCharacterDescriptions = (heroesText: string) =>
  heroesText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const getLocationDescriptions = (locationsText: string) =>
  locationsText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const getLocationName = (description: string, index: number) => {
  const firstLine = description.split(/\n/)[0]?.trim() || '';
  const normalized = firstLine
    .replace(/^\d+[.)]\s*/u, '')
    .replace(/^Локация\s*\d+\s*[—–-]\s*/iu, '')
    .split(/\s*[—–-]\s*/u)[0]
    ?.replace(/[;:,.]+$/u, '')
    .trim();
  return (normalized || `Локация ${index + 1}`).slice(0, 48);
};

const imagePromptKinds = new Set<ImagePromptKind>([
  'default',
  'scene_location',
  'scene_characters',
  'character_asset',
  'location_asset',
]);

const getImagePromptKind = (node: NodeData): ImagePromptKind => {
  const promptKind = typeof node.metadata?.promptKind === 'string' ? node.metadata.promptKind.split(':')[0] : '';
  if (imagePromptKinds.has(promptKind as ImagePromptKind)) return promptKind as ImagePromptKind;
  const assetKind = typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind.split(':')[0] : '';
  if (imagePromptKinds.has(assetKind as ImagePromptKind)) return assetKind as ImagePromptKind;
  return 'default';
};

const getAssetKind = (node: NodeData) =>
  typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';

const getImageReferenceText = (node: NodeData) =>
  [
    node.label,
    node.masterPrompt ?? '',
    node.assetPrompt ?? '',
    typeof node.metadata?.promptContext === 'string' ? node.metadata.promptContext : '',
    typeof node.metadata?.referenceContext === 'string' ? node.metadata.referenceContext : '',
  ].join('\n');

const MAX_SCENE_CHARACTER_REFERENCES = 6;

const getCharacterAssetIndex = (node: NodeData) => {
  const match = getAssetKind(node).match(/^character_asset:(\d+)$/u);
  return match ? Number(match[1]) : null;
};

const getLocationAssetIndex = (node: NodeData) => {
  const match = getAssetKind(node).match(/^location_asset:(\d+)$/u);
  return match ? Number(match[1]) : null;
};

const isCharacterReferenceNode = (node: NodeData) =>
  node.metadata?.isReference === true
  || (getAssetKind(node).startsWith('character_asset') && node.metadata?.isReference !== false);

const findBestSceneFrameNode = (nodes: NodesState, sceneNodeId: string) => {
  const priorityByAssetKind: Record<string, number> = {
    scene_flux2_frame: 4,
    scene_frame: 3,
    scene_location: 2,
  };
  const candidates = Object.values(nodes)
    .filter((node) => node.parentId === sceneNodeId && node.nodeType === 'pollinations_image' && Boolean(node.imageUrl))
    .sort((first, second) =>
      (priorityByAssetKind[getAssetKind(second)] ?? 1) - (priorityByAssetKind[getAssetKind(first)] ?? 1));
  return candidates[0];
};

const getReferenceLabel = (node: NodeData) =>
  typeof node.metadata?.promptContext === 'string'
    ? getCharacterName(node.metadata.promptContext, 0)
    : node.label;

const getReferenceDescription = (node: NodeData) =>
  [
    node.label,
    typeof node.metadata?.promptContext === 'string' ? node.metadata.promptContext : '',
    typeof node.metadata?.referenceContext === 'string' ? node.metadata.referenceContext : '',
  ].join('\n');

const normalizeMatchText = (text: string) =>
  text.toLocaleLowerCase('ru').replace(/ё/gu, 'е');

const getMeaningfulTokens = (text: string) => {
  const stopWords = new Set([
    'сцена',
    'локация',
    'ассет',
    'день',
    'ночь',
    'место',
    'пространство',
    'открытое',
    'закрытое',
    'интерьер',
    'экстерьер',
    'помещение',
    'кадр',
    'план',
    'свет',
    'цвет',
    'палитра',
    'фон',
    'scene',
    'location',
    'asset',
    'background',
    'plate',
  ]);
  return [...new Set(normalizeMatchText(text).match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((token) => token.length >= 4 && !stopWords.has(token));
};

const scoreLocationReferenceMatch = (
  node: NodeData,
  sceneDescription: string,
  locationDescription: string,
) => {
  const sceneText = normalizeMatchText(sceneDescription);
  const sceneTokens = new Set(getMeaningfulTokens(sceneDescription));
  const locationName = getLocationName(locationDescription || node.label, 0);
  let score = 0;

  getMeaningfulTokens(locationName).forEach((token) => {
    if (sceneText.includes(token)) score += 90;
  });

  getMeaningfulTokens(locationDescription).forEach((token) => {
    if (sceneTokens.has(token)) score += 12;
  });

  getMeaningfulTokens(getImageReferenceText(node)).forEach((token) => {
    if (sceneTokens.has(token)) score += 4;
  });

  return score;
};

const selectSceneLocationReference = (
  nodes: NodesState,
  sceneNodeId: string,
  sceneNode: NodeData,
  sceneDescription: string,
) => {
  const sceneLocationNode = Object.values(nodes).find((node) =>
    node.parentId === sceneNodeId
    && node.nodeType === 'pollinations_image'
    && getAssetKind(node) === 'scene_location'
    && Boolean(node.imageUrl));
  if (sceneLocationNode) return sceneLocationNode;

  const locationDetailEntry = Object.entries(nodes).find(([nodeId, node]) =>
    node.parentId === sceneNode.parentId
    && node.nodeType === 'script_detail'
    && Object.values(nodes).some((candidate) =>
      candidate.parentId === nodeId
      && candidate.nodeType === 'pollinations_image'
      && getAssetKind(candidate).startsWith('location_asset')));
  const locationDetail = locationDetailEntry?.[1];
  const locationDescriptions = getLocationDescriptions(locationDetail?.inputValue ?? '');
  const locationAssets = Object.values(nodes).filter((node) =>
    node.nodeType === 'pollinations_image'
    && getAssetKind(node).startsWith('location_asset')
    && Boolean(node.imageUrl)
    && (!sceneNode.parentId || nodes[node.parentId ?? '']?.parentId === sceneNode.parentId));

  if (locationAssets.length === 1) return locationAssets[0];

  return locationAssets
    .map((node) => {
      const assetIndex = getLocationAssetIndex(node);
      const locationDescription = assetIndex === null ? '' : locationDescriptions[assetIndex] ?? '';
      return { node, score: scoreLocationReferenceMatch(node, sceneDescription, locationDescription) };
    })
    .sort((left, right) => right.score - left.score)
    .find(({ score }) => score >= 20)?.node;
};

const getReferenceMatchScore = (node: NodeData, sceneLabel: string, sceneDescription: string, fallbackIndex: number) => {
  const sceneNumber = getSceneNumber(sceneLabel);
  const referenceText = getReferenceDescription(node);
  const referenceTextLower = referenceText.toLocaleLowerCase('ru');
  const sceneTextLower = `${sceneLabel}\n${sceneDescription}`.toLocaleLowerCase('ru');
  const sceneNumbers = getReferencedSceneNumbers(referenceText);
  let score = Math.max(0, 12 - fallbackIndex);

  if (sceneNumber && sceneNumbers?.has(sceneNumber)) score += 50;
  if (sceneNumber && sceneNumbers && !sceneNumbers.has(sceneNumber)) score -= 80;
  if (!sceneNumbers && /(все[х\s]+сцен|каждой сцен|all scenes)/iu.test(referenceText)) score += 45;

  const referenceLabel = getReferenceLabel(node).toLocaleLowerCase('ru');
  const nameTokens = referenceLabel
    .split(/[^\p{L}\p{N}]+/gu)
    .filter((token) => token.length >= 3 && !/^(ассет|герой|персонаж|мужчин|женщин)$/iu.test(token));
  nameTokens.forEach((token) => {
    if (sceneTextLower.includes(token)) score += 70;
  });

  if (/(главн|алекс|протагонист)/iu.test(referenceTextLower) && /(герой|алекс|он\b|его\b|ему\b)/iu.test(sceneTextLower)) {
    score += 55;
  }
  if (/(женск|женщина|девушк)/iu.test(referenceTextLower) && /(женщина|девушка|она\b|её\b|ей\b)/iu.test(sceneTextLower)) {
    score += 70;
  }
  if (/(управляющ)/iu.test(referenceTextLower) && /управляющ/iu.test(sceneTextLower)) score += 70;
  if (/(торговец|торговк)/iu.test(referenceTextLower) && /торгов/iu.test(sceneTextLower)) score += 70;
  if (/(стражник|страж)/iu.test(referenceTextLower) && /страж/iu.test(sceneTextLower)) score += 70;
  if (/(прохож|наблюдател)/iu.test(referenceTextLower) && /(прохож|наблюдател|толп)/iu.test(sceneTextLower)) score += 60;

  return score;
};

const selectBestCharacterReference = (nodes: NodeData[], sceneLabel: string, sceneDescription: string) =>
  nodes
    .map((node, index) => ({ node, score: getReferenceMatchScore(node, sceneLabel, sceneDescription, index) }))
    .sort((left, right) => right.score - left.score)[0]?.node;

const selectSceneCharacterReferences = (
  nodes: NodesState,
  sceneNode: NodeData,
  sceneDescription: string,
) => {
  const sceneNumber = getSceneNumber(sceneNode.label);
  const details = Object.values(nodes).filter(
    (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
  );
  const heroesText = details.find((node) => node.label === 'Герои')?.inputValue ?? '';
  const characterDescriptions = getCharacterDescriptions(heroesText);
  const characterAssets = Object.values(nodes).filter((node) =>
    node.nodeType === 'pollinations_image'
    && getAssetKind(node).startsWith('character_asset')
    && isCharacterReferenceNode(node)
    && Boolean(node.imageUrl));

  const scored = characterAssets.map((node, index) => {
    const assetIndex = getCharacterAssetIndex(node);
    const description = assetIndex === null ? '' : characterDescriptions[assetIndex] ?? '';
    const sceneNumbers = description ? getReferencedSceneNumbers(description) : null;
    let score = getReferenceMatchScore(node, sceneNode.label, sceneDescription, index);
    if (sceneNumber && sceneNumbers?.has(sceneNumber)) score += 150;
    if (sceneNumber && sceneNumbers && !sceneNumbers.has(sceneNumber)) score -= 250;
    if (description && !sceneNumbers && /(все[х\s]+сцен|каждой сцен|all scenes)/iu.test(description)) score += 130;
    return { node, score };
  }).sort((left, right) => right.score - left.score);

  const selected = scored
    .filter(({ score }) => score >= 60)
    .slice(0, MAX_SCENE_CHARACTER_REFERENCES)
    .map(({ node }) => node);

  if (selected.length > 0) return selected;
  const fallback = selectBestCharacterReference(characterAssets, sceneNode.label, sceneDescription);
  return fallback ? [fallback] : [];
};

const toFlux2CharacterReference = (node: NodeData): Flux2CharacterReference => ({
  imageUrl: node.imageUrl ?? '',
  label: getReferenceLabel(node),
});

const upsertScenarioGraph = (
  previousNodes: NodesState,
  sourceNodeId: string,
  generatedContent: string,
  requestedSceneCount: number,
  preferredOutputNodeId?: string,
) => {
  const sourceNode = previousNodes[sourceNodeId];
  if (!sourceNode) return previousNodes;

  const existingOutput = getExistingChild(
    previousNodes,
    sourceNodeId,
    (node) => node.nodeType === 'script_output',
  );
  const outputNodeId = existingOutput?.[0] ?? preferredOutputNodeId ?? generateNodeId();
  const existingOutputNode = existingOutput?.[1];
  const outputNode: NodeData = {
    nodeType: 'script_output',
    x: existingOutputNode?.x ?? sourceNode.x + (sourceNode.width ?? 360) + 56,
    y: existingOutputNode?.y ?? sourceNode.y,
    label: sourceNode.outputNodeLabel ?? 'СЦЕНАРИЙ ВИЗУАЛИЗАЦИИ',
    width: existingOutputNode?.width ?? 440,
    height: existingOutputNode?.height ?? 390,
    isGenerated: true,
    level: (sourceNode.level ?? 0) + 1,
    parentId: sourceNodeId,
    inputValue: generatedContent,
    selectedModel: sourceNode.selectedModel,
    sceneCount: requestedSceneCount,
    statusMessage: 'Сценарий готов. Дополните детали или откройте сцены.',
  };

  const scenes = parseSceneBlocks(generatedContent, requestedSceneCount);
  outputNode.sceneCount = scenes.length;
  const nextNodes: NodesState = { ...previousNodes, [outputNodeId]: outputNode };
  const existingScenes = Object.entries(previousNodes)
    .filter(([, node]) => node.parentId === outputNodeId && node.nodeType === 'scene')
    .sort(([, first], [, second]) => first.label.localeCompare(second.label, 'ru', { numeric: true }));
  const keptSceneIds = new Set<string>();

  scenes.forEach((scene, index) => {
    const existingScene = existingScenes[index];
    const sceneNodeId = existingScene?.[0] ?? generateNodeId();
    const existingSceneNode = existingScene?.[1];
    const column = index % 2;
    const row = Math.floor(index / 2);
    keptSceneIds.add(sceneNodeId);
    nextNodes[sceneNodeId] = {
      ...existingSceneNode,
      nodeType: 'scene',
      x: existingSceneNode?.x ?? outputNode.x + (outputNode.width ?? 440) + 56 + column * 348,
      y: existingSceneNode?.y ?? outputNode.y + row * 328,
      label: scene.label,
      width: existingSceneNode?.width ?? 320,
      height: existingSceneNode?.height ?? 290,
      level: (outputNode.level ?? 0) + 1,
      parentId: outputNodeId,
      isGenerated: true,
      hasGenerationButton: true,
      masterPrompt: existingSceneNode?.masterPrompt ?? '',
      sceneText: scene.text,
      inputValue: scene.text,
      selectedModel: sourceNode.selectedModel,
      entityRef: existingSceneNode?.entityRef ?? { type: 'scene', id: sceneNodeId },
      productionStatus: existingSceneNode?.productionStatus ?? 'draft',
      error: undefined,
    };
  });

  existingScenes.forEach(([sceneId]) => {
    if (keptSceneIds.has(sceneId)) return;
    Object.entries(nextNodes).forEach(([nodeId, node]) => {
      if (nodeId === sceneId || node.parentId === sceneId) delete nextNodes[nodeId];
    });
  });

  return nextNodes;
};

export const useNodeManagement = (
  initialNodes: NodesState,
  generationSettings: GenerationSettings,
  imageGenerationSettings: ImageGenerationSettings,
): UseNodeManagementReturn => {
  const [nodes, setNodesState] = useState<NodesState>(initialNodes);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const nodesRef = useRef(nodes);
  const activeRequests = useRef(new Map<string, AbortController>());
  const noticeCounter = useRef(0);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakingNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => () => {
    activeRequests.current.forEach((controller) => controller.abort());
    activeRequests.current.clear();
    window.speechSynthesis?.cancel();
  }, []);

  const setNodes = useCallback<Dispatch<SetStateAction<NodesState>>>((action) => {
    setNodesState((previousNodes) => {
      const nextNodes = typeof action === 'function' ? action(previousNodes) : action;
      nodesRef.current = nextNodes;
      return nextNodes;
    });
  }, []);

  const showNotice = useCallback((tone: AppNotice['tone'], message: string) => {
    noticeCounter.current += 1;
    setNotice({ id: noticeCounter.current, tone, message });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const updateNode = useCallback((nodeId: string, patch: Partial<NodeData>) => {
    setNodes((previousNodes) => {
      const node = previousNodes[nodeId];
      return node ? { ...previousNodes, [nodeId]: { ...node, ...patch } } : previousNodes;
    });
  }, [setNodes]);

  const requestText = useCallback(async (
    nodeId: string,
    request: GenerationRequest,
    statusMessage: string,
    continueLoading = false,
  ) => {
    if (activeRequests.current.has(nodeId)) {
      const message = 'По этой ноде уже есть активный запрос. Дождитесь ответа или нажмите отмену.';
      updateNode(nodeId, { error: message, statusMessage: undefined });
      showNotice('info', message);
      return null;
    }
    if (!continueLoading && nodesRef.current[nodeId]?.isLoading) {
      const message = 'Нода ещё помечена как занятая предыдущим запросом. Нажмите отмену и попробуйте снова.';
      updateNode(nodeId, { error: message, statusMessage: undefined });
      showNotice('info', message);
      return null;
    }
    const controller = new AbortController();
    activeRequests.current.set(nodeId, controller);
    updateNode(nodeId, {
      isLoading: true,
      loadingProvider: generationSettings.mode,
      error: undefined,
      statusMessage,
    });

    try {
      return await generateText(request, controller.signal, generationSettings);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация отменена. Сохранён последний готовый результат.');
        return null;
      }
      const message = errorMessage(error);
      updateNode(nodeId, { error: message });
      showNotice('error', message);
      return null;
    } finally {
      activeRequests.current.delete(nodeId);
      updateNode(nodeId, { isLoading: false, loadingProvider: undefined, statusMessage: undefined });
    }
  }, [generationSettings, showNotice, updateNode]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { inputValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handleThemeInputChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>, nodeId: string) => {
    updateNode(nodeId, { themeInputValue: event.target.value, error: undefined });
  }, [updateNode]);

  const handleModelChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    updateNode(nodeId, { selectedModel: event.target.value, error: undefined });
  }, [updateNode]);

  const handleImagePipelineChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>, nodeId: string) => {
    const nextPipeline = event.target.value === 'z_image_turbo' ? 'z_image_turbo' : 'sdxl';
    updateNode(nodeId, { imagePipeline: nextPipeline, pollinationsApiError: undefined });
  }, [updateNode]);

  const handleSceneCountChange = useCallback((event: React.ChangeEvent<HTMLInputElement>, nodeId: string) => {
    updateNode(nodeId, { sceneCount: clampSceneCount(Number(event.target.value)), error: undefined });
  }, [updateNode]);

  const handleContinueAssociation = useCallback(async (sourceNodeId: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    if (!sourceNode || sourceNode.isLoading) return;
    const prompt = (sourceNode.nodeType === 'text' ? sourceNode.inputValue : sourceNode.label)?.trim();
    if (!prompt) {
      updateNode(sourceNodeId, { error: 'Сначала введите слово или короткую фразу.' });
      return;
    }

    let associations = sourceNode.fullAssociations;
    if (!associations) {
      const result = await requestText(sourceNodeId, {
        operation: 'associations',
        prompt,
        systemPrompt: ASSOCIATE_SYSTEM_PROMPT,
        model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      }, 'Ищем ассоциации…');
      if (!result) return;
      associations = result.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    }

    setNodes((previousNodes) => {
      const currentSource = previousNodes[sourceNodeId];
      if (!currentSource) return previousNodes;
      const startIndex = currentSource.nextAssociationIndex ?? 0;
      const batch = associations.slice(startIndex, startIndex + 5);
      if (batch.length === 0) {
        showNotice('info', 'Все подготовленные ассоциации уже показаны.');
        return previousNodes;
      }

      const nextNodes = { ...previousNodes };
      const children = Object.values(previousNodes).filter((node) => node.parentId === sourceNodeId);
      const childStartY = children.length > 0
        ? Math.max(...children.map((node) => node.y + (node.height ?? 56))) + 12
        : currentSource.y;

      batch.forEach((label, index) => {
        const nodeId = generateNodeId();
        nextNodes[nodeId] = {
          nodeType: 'association',
          x: currentSource.x + (currentSource.width ?? 360) + 44,
          y: childStartY + index * 68,
          label,
          width: Math.min(320, Math.max(150, calculateTextWidth(label))),
          height: 56,
          isGenerated: true,
          canContinue: true,
          level: (currentSource.level ?? 0) + 1,
          parentId: sourceNodeId,
        };
      });
      nextNodes[sourceNodeId] = {
        ...currentSource,
        fullAssociations: associations,
        nextAssociationIndex: startIndex + batch.length,
        error: undefined,
      };
      return nextNodes;
    });
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleScriptVisualization = useCallback(async (sourceNodeId: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    const script = sourceNode?.inputValue?.trim();
    if (!sourceNode || sourceNode.isLoading) return;
    if (!script) {
      updateNode(sourceNodeId, { error: 'Добавьте текст сценария — хотя бы одно предложение.' });
      return;
    }

    const sceneCount = clampSceneCount(sourceNode.sceneCount ?? 4);
    const theme = sourceNode.themeInputValue?.trim();
    const systemPrompt = theme
      ? `${SCENARIO_SYSTEM_PROMPT}\nСтилистическое направление: ${theme}.`
      : SCENARIO_SYSTEM_PROMPT;
    const result = await requestText(sourceNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(script, nodesRef.current),
      systemPrompt,
      model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount,
    }, `Разбиваем историю на ${sceneCount} сцен…`);
    if (!result) return;

    setNodes((previousNodes) => upsertScenarioGraph(previousNodes, sourceNodeId, result, sceneCount));
    showNotice('success', `Сценарий и ${parseSceneBlocks(result, sceneCount).length} сцен готовы.`);
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleEnsureStoryReferenceNodes = useCallback(() => {
    setNodes((previousNodes) => {
      const existingFormatBible = Object.values(previousNodes).some(
        (node) => node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'format_bible',
      );
      const existingKnowledgeBase = Object.values(previousNodes).some(
        (node) => node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'knowledge_base',
      );
      const existingSeasonMemory = Object.values(previousNodes).some(
        (node) => node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'season_memory',
      );
      const existingChapterMaterial = Object.values(previousNodes).some(
        (node) => node.nodeType === 'script_detail' && node.metadata?.sourceKind === 'chapter_material',
      );
      if (existingFormatBible && existingKnowledgeBase && existingSeasonMemory && existingChapterMaterial) {
        showNotice('info', 'Базы и материалы уже есть на канве.');
        return previousNodes;
      }

      const anchor = Object.values(previousNodes).find((node) => node.nodeType === 'script_input')
        ?? Object.values(previousNodes)[0];
      const anchorX = anchor?.x ?? 40;
      const anchorY = anchor?.y ?? 40;
      const nextNodes = { ...previousNodes };

      if (!existingFormatBible) {
        nextNodes[generateNodeId()] = {
          nodeType: 'script_detail',
          x: anchorX + 450,
          y: anchorY,
          label: 'Библия формата',
          width: 420,
          height: 300,
          isGenerated: true,
          level: anchor?.level ?? 0,
          inputValue: DEFAULT_FORMAT_BIBLE,
          error: undefined,
          metadata: {
            sourceKind: 'format_bible',
          },
        };
      }

      if (!existingKnowledgeBase) {
        nextNodes[generateNodeId()] = {
          nodeType: 'script_detail',
          x: anchorX + 890,
          y: anchorY,
          label: 'База знаний',
          width: 430,
          height: 300,
          isGenerated: true,
          level: anchor?.level ?? 0,
          inputValue: DEFAULT_KNOWLEDGE_BASE,
          error: undefined,
          metadata: {
            sourceKind: 'knowledge_base',
          },
        };
      }

      if (!existingSeasonMemory) {
        nextNodes[generateNodeId()] = {
          nodeType: 'script_detail',
          x: anchorX + 450,
          y: anchorY + 330,
          label: 'Сезонная память',
          width: 420,
          height: 300,
          isGenerated: true,
          level: anchor?.level ?? 0,
          inputValue: DEFAULT_SEASON_MEMORY,
          error: undefined,
          metadata: {
            sourceKind: 'season_memory',
          },
        };
      }

      if (!existingChapterMaterial) {
        nextNodes[generateNodeId()] = {
          nodeType: 'script_detail',
          x: anchorX + 890,
          y: anchorY + 330,
          label: 'Материал главы',
          width: 430,
          height: 360,
          isGenerated: true,
          level: anchor?.level ?? 0,
          inputValue: DEFAULT_CHAPTER_MATERIAL,
          selectedModel: anchor?.selectedModel || MISTRAL_MODELS[0],
          sceneCount: 8,
          error: undefined,
          metadata: {
            sourceKind: 'chapter_material',
          },
        };
      }

      showNotice('success', 'Базы, сезонная память и материал главы готовы.');
      return nextNodes;
    });
  }, [setNodes, showNotice]);

  const handleEnsureChapterTimeline = useCallback(() => {
    setNodes((previousNodes) => {
      const existing = Object.entries(previousNodes).find(
        ([, node]) => node.nodeType === 'chapter_timeline',
      );
      const scenarioEntry = Object.entries(previousNodes).find(
        ([, node]) => node.nodeType === 'script_output',
      );
      const anchor = scenarioEntry?.[1]
        ?? Object.values(previousNodes).find((node) => node.nodeType === 'script_input')
        ?? Object.values(previousNodes)[0];
      const nodeId = existing?.[0] ?? generateNodeId();
      const sceneCount = Object.values(previousNodes).filter((node) => node.nodeType === 'scene').length;
      const x = existing?.[1].x ?? (anchor?.x ?? 40);
      const y = existing?.[1].y ?? ((anchor?.y ?? 40) + (anchor?.height ?? 360) + 52);
      const systemInsertDetail = Object.values(previousNodes).find((node) =>
        node.nodeType === 'script_detail'
        && node.label === 'Системные вставки'
        && (!scenarioEntry?.[0] || node.parentId === scenarioEntry[0]));
      const timelineItemCount = sceneCount + countSystemInsertBlocks(systemInsertDetail?.inputValue);
      const timelineRows = Math.max(1, Math.ceil(Math.max(timelineItemCount, 1) / 5));
      const preferredWidth = 1260;
      const preferredHeight = Math.min(1680, Math.max(640, 118 + timelineRows * 306));

      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'chapter_timeline',
          x,
          y,
          label: 'Таймлайн главы',
          width: Math.max(existing?.[1].width ?? 0, preferredWidth),
          height: Math.max(existing?.[1].height ?? 0, preferredHeight),
          isGenerated: true,
          level: 12,
          parentId: scenarioEntry?.[0],
          productionStatus: sceneCount > 0 ? 'in_production' : 'draft',
          statusMessage: sceneCount > 0
            ? `Собрано сцен: ${sceneCount}. Таймлайн обновляется по текущим нодам.`
            : 'Сначала соберите сценарий и сцены, потом вернитесь к таймлайну.',
          metadata: {
            ...existing?.[1].metadata,
            sourceKind: 'chapter_timeline',
            sourceScenarioId: scenarioEntry?.[0] ?? '',
          },
        },
      };
    });
    showNotice('success', 'Таймлайн главы готов.');
  }, [setNodes, showNotice]);

  const handleBuildScenarioFromBrief = useCallback(async (briefNodeId: string) => {
    const briefNode = nodesRef.current[briefNodeId];
    const brief = briefNode?.inputValue?.trim();
    const sourceNode = briefNode?.parentId ? nodesRef.current[briefNode.parentId] : undefined;
    if (
      !briefNode
      || briefNode.nodeType !== 'script_detail'
      || briefNode.metadata?.sourceKind !== 'brief_revision'
      || briefNode.isLoading
      || !sourceNode
    ) return;
    if (!brief) {
      updateNode(briefNodeId, { error: 'В заявке редактора нет текста для сборки сценария.' });
      return;
    }

    const sceneCount = clampSceneCount(briefNode.sceneCount ?? sourceNode.sceneCount ?? 4);
    const theme = sourceNode.themeInputValue?.trim();
    const systemPrompt = theme
      ? `${SCENARIO_SYSTEM_PROMPT}\nСтилистическое направление: ${theme}.`
      : SCENARIO_SYSTEM_PROMPT;
    const result = await requestText(briefNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(brief, nodesRef.current),
      systemPrompt,
      model: briefNode.selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount,
    }, `Собираем ${sceneCount} сцен из редакторской заявки...`);
    if (!result) return;

    setNodes((previousNodes) => upsertScenarioGraph(previousNodes, briefNode.parentId ?? '', result, sceneCount));
    showNotice('success', `Сценарий пересобран из редакторской заявки: ${parseSceneBlocks(result, sceneCount).length} сцен.`);
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleAutoBuildChapter = useCallback(async (chapterMaterialNodeId: string) => {
    const materialNode = nodesRef.current[chapterMaterialNodeId];
    const material = materialNode?.inputValue?.trim();
    if (!materialNode) {
      showNotice('error', 'Не удалось найти ноду материала главы.');
      return;
    }
    if (materialNode.nodeType !== 'script_detail' || getSourceKind(materialNode) !== 'chapter_material') {
      const message = 'Эта кнопка может запускать автосборку только из ноды «Материал главы».';
      updateNode(chapterMaterialNodeId, { error: message });
      showNotice('error', message);
      return;
    }
    if (materialNode.isLoading) {
      const message = 'Автосборка для этой ноды уже идёт. Если это старый зависший запуск, нажмите отмену.';
      updateNode(chapterMaterialNodeId, { error: message });
      showNotice('info', message);
      return;
    }
    if (!material) {
      updateNode(chapterMaterialNodeId, { error: 'Вставьте материал главы перед автосборкой.' });
      return;
    }

    updateNode(chapterMaterialNodeId, {
      error: undefined,
      statusMessage: 'Клик получен. Запускаем автосборку главы...',
    });
    showNotice('info', 'Автосборка главы запущена.');
    const setChapterAutoStatus = (statusMessage: string) => {
      updateNode(chapterMaterialNodeId, { error: undefined, statusMessage });
      showNotice('info', statusMessage);
    };
    const sceneCount = clampSceneCount(materialNode.sceneCount ?? 8);
    const model = materialNode.selectedModel || MISTRAL_MODELS[0];
    const scenario = await requestText(chapterMaterialNodeId, {
      operation: 'scenario',
      prompt: buildChapterPrompt(material, nodesRef.current),
      systemPrompt: SCENARIO_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, `Автосборка: пишем ${sceneCount} сцен главы...`);
    if (!scenario) {
      updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на создании сценария.' });
      return;
    }

    setChapterAutoStatus('Сценарий главы создан. Создаём ноды сцен и готовим детали...');
    const existingOutputEntry = getExistingChild(
      nodesRef.current,
      chapterMaterialNodeId,
      (node) => node.nodeType === 'script_output',
    );
    const outputNodeId = existingOutputEntry?.[0] ?? generateNodeId();
    setNodes((previousNodes) => upsertScenarioGraph(
      previousNodes,
      chapterMaterialNodeId,
      scenario,
      sceneCount,
      outputNodeId,
    ));

    const detailResults: Array<{ label: string; text: string }> = [];
    for (const config of Object.values(detailConfig)) {
      setChapterAutoStatus(`Автосборка: готовим «${config.label}»...`);
      const detailText = await requestText(outputNodeId, {
        operation: config.operation,
        prompt: withStoryReferenceContext(scenario, nodesRef.current),
        systemPrompt: config.systemPrompt,
        model,
        sceneCount,
      }, `Автосборка: готовим «${config.label}»...`, true);
      if (!detailText) {
        updateNode(chapterMaterialNodeId, { error: `Автосборка остановилась на разделе «${config.label}».` });
        return;
      }
      detailResults.push({ label: config.label, text: detailText });
      setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, outputNodeId, config.label, detailText, {
        column: config.column,
      }));
    }

    const chapterSummaryPrompt = withStoryReferenceContext([
      'Ниже входные материалы готовой главы. Не оценивай их качество и не комментируй, хорошо ли они написаны. Извлеки только факты истории для сезонной памяти.',
      `Материал главы:\n${material}`,
      `Сценарий главы:\n${scenario}`,
      ...detailResults.map((detail) => `${detail.label}:\n${detail.text}`),
      'Выход: заполни шаблон резюме из system prompt. Начни строго со строки "Глава:".',
    ].join('\n\n'), nodesRef.current);
    setChapterAutoStatus('Автосборка: делаем резюме главы...');
    let chapterSummary = await requestText(outputNodeId, {
      operation: 'chapter_summary',
      prompt: chapterSummaryPrompt,
      systemPrompt: CHAPTER_SUMMARY_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Автосборка: делаем резюме главы...', true);
    if (!chapterSummary) {
      updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на резюме главы.' });
      return;
    }
    if (isEditorialReviewText(chapterSummary)) {
      setChapterAutoStatus('Резюме похоже на комментарий редактора. Переписываем в память главы...');
      const repairedSummary = await requestText(outputNodeId, {
        operation: 'chapter_summary',
        prompt: [
          'Предыдущий ответ ошибочный: он оценивал качество текста вместо резюме главы.',
          `Ошибочный ответ:\n${chapterSummary}`,
          'Перепиши заново. Не используй ни одной фразы похвалы или оценки. Начни строго со строки "Глава:".',
          chapterSummaryPrompt,
        ].join('\n\n'),
        systemPrompt: CHAPTER_SUMMARY_SYSTEM_PROMPT,
        model,
        sceneCount,
      }, 'Автосборка: переписываем резюме главы...', true);
      if (!repairedSummary || isEditorialReviewText(repairedSummary)) {
        updateNode(chapterMaterialNodeId, { error: 'Модель снова вернула комментарий вместо резюме. Попробуйте другую модель или перезапустите автосборку.' });
        return;
      }
      chapterSummary = repairedSummary;
    }

    setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, outputNodeId, 'Резюме главы', chapterSummary, {
      column: 4,
      width: 360,
      height: 280,
      metadata: {
        sourceKind: 'chapter_summary',
      },
    }));

    const seasonMemoryEntry = findNodeBySourceKind(nodesRef.current, 'season_memory');
    const oldSeasonMemory = seasonMemoryEntry?.[1].inputValue?.trim() || DEFAULT_SEASON_MEMORY;
    setChapterAutoStatus('Автосборка: обновляем сезонную память...');
    const updatedSeasonMemory = await requestText(outputNodeId, {
      operation: 'season_memory_update',
      prompt: [
        `Старая сезонная память:\n${oldSeasonMemory}`,
        `Новое резюме главы:\n${chapterSummary}`,
        'Задача: обновить сезонную память для следующей главы.',
      ].join('\n\n'),
      systemPrompt: SEASON_MEMORY_UPDATE_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Автосборка: обновляем сезонную память...', true);
    if (!updatedSeasonMemory) {
      updateNode(chapterMaterialNodeId, { error: 'Автосборка остановилась на обновлении сезонной памяти.' });
      return;
    }

    setNodes((previousNodes) => {
      const existing = findNodeBySourceKind(previousNodes, 'season_memory');
      if (existing) {
        return {
          ...previousNodes,
          [existing[0]]: {
            ...existing[1],
            inputValue: updatedSeasonMemory,
            error: undefined,
            statusMessage: 'Сезонная память обновлена.',
          },
        };
      }
      const currentMaterial = previousNodes[chapterMaterialNodeId] ?? materialNode;
      return {
        ...previousNodes,
        [generateNodeId()]: {
          nodeType: 'script_detail',
          x: currentMaterial.x - 450,
          y: currentMaterial.y,
          label: 'Сезонная память',
          width: 420,
          height: 300,
          isGenerated: true,
          level: currentMaterial.level ?? 0,
          inputValue: updatedSeasonMemory,
          error: undefined,
          statusMessage: 'Сезонная память обновлена.',
          metadata: {
            sourceKind: 'season_memory',
          },
        },
      };
    });

    updateNode(chapterMaterialNodeId, {
      error: undefined,
      statusMessage: 'Автосборка завершена: сценарий, детали, закадр, резюме и сезонная память готовы.',
    });
    showNotice('success', 'Глава собрана: сценарий, детали, закадр, резюме и сезонная память готовы.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleScenarioDetailClick = useCallback(async (sourceNodeId: string, detailType: DetailType) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    if (!sourceNode?.inputValue || sourceNode.isLoading) return;
    const config = detailConfig[detailType];
    const result = await requestText(sourceNodeId, {
      operation: config.operation,
      prompt: withStoryReferenceContext(sourceNode.inputValue, nodesRef.current),
      systemPrompt: config.systemPrompt,
      model: sourceNode.selectedModel || MISTRAL_MODELS[0],
      sceneCount: sourceNode.sceneCount,
    }, `Готовим раздел «${config.label}»…`);
    if (!result) return;

    setNodes((previousNodes) => upsertScriptDetailNode(previousNodes, sourceNodeId, config.label, result, {
      column: config.column,
    }));
    showNotice('success', `Раздел «${config.label}» готов.`);
  }, [requestText, setNodes, showNotice]);

  const handleCreateSceneNodes = useCallback((sourceNodeId: string) => {
    const sourceNode = nodesRef.current[sourceNodeId];
    if (!sourceNode?.inputValue) return;
    setNodes((previousNodes) => {
      const parentInput = sourceNode.parentId ? previousNodes[sourceNode.parentId] : undefined;
      return upsertScenarioGraph(
        previousNodes,
        sourceNode.parentId ?? sourceNodeId,
        sourceNode.inputValue ?? '',
        sourceNode.sceneCount ?? parentInput?.sceneCount ?? 4,
      );
    });
    showNotice('success', 'Сцены синхронизированы со сценарием.');
  }, [setNodes, showNotice]);

  const handleGenerateScenePrompt = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || !outputNode?.inputValue || sceneNode.isLoading) return;

    const details = Object.values(currentNodes).filter(
      (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
    );
    const findDetail = (label: string) => details.find((node) => node.label === label)?.inputValue || 'Не задано';
    const prompt = [
      `Нужная сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneNode.sceneText || sceneNode.inputValue || outputNode.inputValue}`,
      `Персонажи:\n${findDetail('Герои')}`,
      `Локации:\n${findDetail('Локации')}`,
      `Настроение:\n${findDetail('Настроение')}`,
      `Закадровый смысл:\n${findDetail('Закадр')}`,
    ].join('\n\n');
    const result = await requestText(sceneNodeId, {
      operation: 'scene_prompt',
      prompt,
      systemPrompt: SCENE_MASTER_PROMPT_SYSTEM_PROMPT,
      model: sceneNode.selectedModel || outputNode.selectedModel || MISTRAL_MODELS[0],
      sceneLabel: sceneNode.label,
    }, 'Собираем визуальный промпт…');
    if (!result) return;

    updateNode(sceneNodeId, {
      masterPrompt: result,
      error: undefined,
      productionStatus: 'ready',
      statusMessage: 'Промпт готов к копированию или генерации кадра.',
    });
    showNotice('success', `Промпт для «${sceneNode.label}» готов.`);
  }, [requestText, showNotice, updateNode]);

  const handleCopyToClipboard = useCallback(async (textToCopy: string) => {
    if (!textToCopy.trim()) {
      showNotice('info', 'В этом блоке пока нет текста для копирования.');
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      showNotice('success', 'Текст скопирован.');
    } catch {
      showNotice('error', 'Браузер не разрешил копирование. Выделите текст вручную.');
    }
  }, [showNotice]);

  const upsertImageNode = useCallback((
    parentNodeId: string,
    imageUrl: string,
    labelPrefix = 'Кадр',
    assetKind = 'scene_frame',
    offsetIndex = 0,
    imagePrompt = '',
    promptContext = '',
    metadataPatch: NonNullable<NodeData['metadata']> = {},
  ) => {
    setNodes((previousNodes) => {
      const parentNode = previousNodes[parentNodeId];
      if (!parentNode) return previousNodes;
      const isCharacterAsset = assetKind.startsWith('character_asset');
      const isWideImageAsset = !isCharacterAsset;
      const existing = getExistingChild(
        previousNodes,
        parentNodeId,
        (node) => node.nodeType === 'pollinations_image' && node.metadata?.assetKind === assetKind,
      );
      if (existing?.[1].imageUrl?.startsWith('blob:')) URL.revokeObjectURL(existing[1].imageUrl);
      const imageNodeId = existing?.[0] ?? generateNodeId();
      const parentWidth = parentNode.width ?? 320;
      const defaultImageSize = isCharacterAsset
        ? { width: 320, height: 520 }
        : { width: 420, height: 300 };
      const shouldResizeExistingWideImage = isWideImageAsset
        && existing?.[1].width === 360
        && existing?.[1].height === 360;
      return {
        ...previousNodes,
        [parentNodeId]: {
          ...parentNode,
          isLoadingImage: false,
          pollinationsApiError: undefined,
        },
        [imageNodeId]: {
          ...existing?.[1],
          nodeType: 'pollinations_image',
          label: `${labelPrefix} · ${parentNode.label}`,
          x: existing?.[1].x ?? parentNode.x + parentWidth + 36,
          y: existing?.[1].y ?? parentNode.y + offsetIndex * (defaultImageSize.height + 36),
          width: shouldResizeExistingWideImage ? defaultImageSize.width : existing?.[1].width ?? defaultImageSize.width,
          height: shouldResizeExistingWideImage ? defaultImageSize.height : existing?.[1].height ?? defaultImageSize.height,
          parentId: parentNodeId,
          imageUrl,
          masterPrompt: imagePrompt,
          level: (parentNode.level ?? 0) + 1,
          metadata: {
            ...existing?.[1].metadata,
            assetKind,
            promptContext,
            promptKind: assetKind,
            imageProvider: imageGenerationSettings.provider,
            imagePipeline: parentNode.imagePipeline ?? 'sdxl',
            ...(isCharacterAsset ? {
              isReference: existing?.[1].metadata?.isReference ?? true,
              referencePrompt: imagePrompt,
              referenceContext: promptContext,
            } : {}),
            ...metadataPatch,
          },
        },
      };
    });
  }, [imageGenerationSettings.provider, setNodes]);

  const handleGenerateSceneLocationAsset = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || !outputNode?.inputValue || sceneNode.isLoading || sceneNode.isLoadingImage) return;

    const requestId = `scene-location:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    const details = Object.values(currentNodes).filter(
      (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
    );
    const findDetail = (label: string) => details.find((node) => node.label === label)?.inputValue || 'Не задано';
    const sceneDescription = sceneNode.sceneText || sceneNode.inputValue || outputNode.inputValue;
    const prompt = [
      `Нужная сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneDescription}`,
      `Список локаций проекта:\n${findDetail('Локации')}`,
      `Настроение сцены:\n${findDetail('Настроение')}`,
      'Задача: выбери или уточни конкретную локацию этой сцены и подготовь фон без персонажей.',
    ].join('\n\n');

    try {
      updateNode(sceneNodeId, {
        isLoading: true,
        loadingProvider: generationSettings.mode,
        error: undefined,
        pollinationsApiError: undefined,
        statusMessage: 'Определяем локацию сцены и собираем image prompt...',
      });

      const locationPrompt = await generateText({
        operation: 'scene_location_prompt',
        prompt: withProjectVisualStyle(prompt, currentNodes),
        systemPrompt: SCENE_LOCATION_PROMPT_SYSTEM_PROMPT,
        model: sceneNode.selectedModel || outputNode.selectedModel || MISTRAL_MODELS[0],
        sceneLabel: sceneNode.label,
      }, controller.signal, generationSettings);
      const styledLocationPrompt = appendProjectVisualStyleToImagePrompt(locationPrompt, currentNodes);

      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: true,
        loadingProvider: imageGenerationSettings.provider,
        assetPrompt: styledLocationPrompt,
        productionStatus: 'in_production',
        statusMessage: 'Генерируем фон локации без персонажей...',
      });

      const imageUrl = await generateImage(
        styledLocationPrompt,
        sceneNode.imagePipeline ?? 'sdxl',
        imageGenerationSettings,
        'scene_location',
        controller.signal,
      );
      upsertImageNode(sceneNodeId, imageUrl, 'Локация', 'scene_location', 0, styledLocationPrompt, withProjectVisualStyle(prompt, currentNodes));
      showNotice('success', `Локация для «${sceneNode.label}» создана.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация локации сцены отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [generationSettings, imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

  const handleGenerateSceneCharacterLayer = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || !outputNode?.inputValue || sceneNode.isLoading || sceneNode.isLoadingImage) return;

    const requestId = `scene-characters:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    const details = Object.values(currentNodes).filter(
      (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail',
    );
    const heroesNode = details.find((node) => node.label === 'Герои');
    const findDetail = (label: string) => details.find((node) => node.label === label)?.inputValue || 'Не задано';
    const sceneDescription = sceneNode.sceneText || sceneNode.inputValue || outputNode.inputValue;
    const heroScope = getSceneHeroScope(heroesNode?.inputValue || '', sceneNode.label);
    const prompt = [
      `Нужная сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneDescription}`,
      `Герои, разрешённые для этой сцены:\n${heroScope.allowed}`,
      heroScope.excluded ? `Герои, которых нельзя добавлять в эту сцену:\n${heroScope.excluded}` : '',
      `Стилевой якорь героев:\n${heroesNode?.assetPrompt || 'Character sheet ещё не сгенерирован, сохраняй стиль по текстовому описанию героев.'}`,
      `Локация сцены:\n${sceneNode.assetPrompt || findDetail('Локации')}`,
      `Настроение сцены:\n${findDetail('Настроение')}`,
      'Задача: подготовь персонажей этой сцены отдельным слоем для последующего наложения на фон.',
    ].filter(Boolean).join('\n\n');

    try {
      updateNode(sceneNodeId, {
        isLoading: true,
        loadingProvider: generationSettings.mode,
        error: undefined,
        pollinationsApiError: undefined,
        statusMessage: 'Выбираем героев сцены и собираем image prompt...',
      });

      const characterPrompt = await generateText({
        operation: 'scene_character_layer_prompt',
        prompt: withProjectVisualStyle(prompt, currentNodes),
        systemPrompt: SCENE_CHARACTER_LAYER_PROMPT_SYSTEM_PROMPT,
        model: sceneNode.selectedModel || outputNode.selectedModel || MISTRAL_MODELS[0],
        sceneLabel: sceneNode.label,
      }, controller.signal, generationSettings);
      const styledCharacterPrompt = appendProjectVisualStyleToImagePrompt(characterPrompt, currentNodes);

      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: true,
        loadingProvider: imageGenerationSettings.provider,
        statusMessage: 'Генерируем слой персонажей на чистом фоне...',
      });

      const imageUrl = await generateImage(
        styledCharacterPrompt,
        sceneNode.imagePipeline ?? 'sdxl',
        imageGenerationSettings,
        'scene_characters',
        controller.signal,
      );
      upsertImageNode(sceneNodeId, imageUrl, 'Персонажи', 'scene_characters', 1, styledCharacterPrompt, withProjectVisualStyle(prompt, currentNodes));
      showNotice('success', `Персонажи для «${sceneNode.label}» созданы.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация персонажей сцены отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(sceneNodeId, {
        isLoading: false,
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [generationSettings, imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

  const handleComposeSceneFlux2 = useCallback(async (
    sceneNodeId: string,
    pipeline: Extract<ImagePipeline, 'flux2_compose' | 'flux2_turbo_compose'> = 'flux2_compose',
  ) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoading || sceneNode.isLoadingImage) return;

    const sceneDescription = sceneNode.sceneText || sceneNode.inputValue || sceneNode.label;
    const locationNode = selectSceneLocationReference(currentNodes, sceneNodeId, sceneNode, sceneDescription);
    const referenceNodes = selectSceneCharacterReferences(currentNodes, sceneNode, sceneDescription);
    const referenceLabels = referenceNodes.map(getReferenceLabel);
    const referenceNodeIds = referenceNodes.map((referenceNode) =>
      Object.entries(currentNodes).find(([, node]) => node === referenceNode)?.[0] ?? '',
    ).filter(Boolean);

    if (!locationNode?.imageUrl) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала сгенерируйте локацию этой сцены или общий ассет подходящей локации.' });
      return;
    }
    if (referenceNodes.length === 0 || referenceNodes.some((referenceNode) => !referenceNode.imageUrl)) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала сгенерируйте или отметьте референс персонажа.' });
      return;
    }

    const isTurbo = pipeline === 'flux2_turbo_compose';
    const requestId = `flux2-compose:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    const referenceSummary = referenceLabels.map((label, index) => `${index + 1}. ${label}`).join('; ');
    const projectVisualStyle = sanitizePositiveImagePrompt(getProjectVisualStyle(currentNodes));
    const composePrompt = [
      projectVisualStyle ? `Project visual style: ${projectVisualStyle}. Keep this same rendering language, realism level, palette logic, and painterly finish in the final composed frame.` : '',
      `Use the first reference image as the background location plate for ${sceneNode.label}.`,
      referenceNodes.length > 1
        ? `Use the second reference image as a character reference board. It contains these character references in reading order: ${referenceSummary}.`
        : `Use the second reference image as the character identity reference for ${referenceSummary}.`,
      'Create one coherent cinematic story frame inside the location as a single continuous image.',
      referenceNodes.length > 1
        ? 'Use the character reference board as an identity guide. Select the characters required by the scene action from the listed references, place each required character naturally in the same environment, and keep their relative scale believable.'
        : 'Place the referenced character naturally inside the location.',
      referenceNodes.length > 1
        ? 'For every included character, preserve the matching identity, clothing, body type, face, age, and role from its numbered reference. Keep character identities separate and readable.'
        : 'Preserve the character identity, clothing, body type, face, age, and role from the character reference.',
      'Match perspective, scale, light direction, shadows, color palette, and painterly style to the location plate. Preserve the architecture and mood from the location reference.',
      `Scene action: ${sceneDescription}`,
      'Compose the action with clear staging: foreground, midground, and background should read as one continuous scene.',
    ].filter(Boolean).join(' ');
    const promptContext = [
      `Сцена: ${sceneNode.label}`,
      `Описание сцены:\n${sceneDescription}`,
      `Локация-референс: ${locationNode.label}`,
      `Персонажи-референсы:\n${referenceNodes.map((referenceNode, index) => `${index + 1}. ${referenceNode.label} — ${getReferenceLabel(referenceNode)}`).join('\n')}`,
    ].join('\n\n');

    try {
      updateNode(sceneNodeId, {
        isLoadingImage: true,
        loadingProvider: 'comfyui',
        pollinationsApiError: undefined,
        statusMessage: isTurbo
          ? 'Flux2 Turbo поставлен в очередь и собирает кадр на 8 шагах...'
          : 'Flux2 поставлен в очередь и собирает кадр из локации и референса...',
      });

      const imageUrl = await generateComfyFlux2ComposeImage(
        composePrompt,
        locationNode.imageUrl,
        referenceNodes.map(toFlux2CharacterReference),
        pipeline,
        imageGenerationSettings,
        controller.signal,
      );
      upsertImageNode(sceneNodeId, imageUrl, isTurbo ? 'Кадр Flux2 Turbo' : 'Кадр Flux2', 'scene_flux2_frame', isTurbo ? 3 : 2, composePrompt, promptContext, {
        backgroundNodeId: Object.entries(currentNodes).find(([, node]) => node === locationNode)?.[0] ?? '',
        characterReferenceNodeId: referenceNodeIds[0] ?? '',
        characterReferenceNodeIds: referenceNodeIds.join(','),
        imagePipeline: pipeline,
      });
      showNotice('success', `${isTurbo ? 'Flux2 Turbo' : 'Flux2'} собрал кадр для «${sceneNode.label}».`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Сборка кадра Flux2 отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(sceneNodeId, {
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

  const handleGenerateDetailAsset = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const description = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail' || detailNode.isLoading || detailNode.isLoadingImage) return;
    if (detailNode.label !== 'Герои' && detailNode.label !== 'Локации') return;
    if (!description) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте или заполните описание.' });
      return;
    }

    const requestId = `detail-asset:${detailNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    const isCharacters = detailNode.label === 'Герои';

    try {
      if (isCharacters) {
        const characterDescriptions = getCharacterDescriptions(description);
        setNodes((previousNodes) => {
          const nextNodes = { ...previousNodes };
          Object.entries(previousNodes).forEach(([nodeId, node]) => {
            const assetKind = typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';
            if (
              node.parentId === detailNodeId
              && node.nodeType === 'pollinations_image'
              && assetKind.startsWith('character_asset')
            ) {
              if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
              delete nextNodes[nodeId];
            }
          });
          return nextNodes;
        });

        const generatedPrompts: string[] = [];
        for (let index = 0; index < characterDescriptions.length; index += 1) {
          const characterDescription = characterDescriptions[index];
          const characterName = getCharacterName(characterDescription, index);
          updateNode(detailNodeId, {
            isLoading: true,
            loadingProvider: generationSettings.mode,
            error: undefined,
            pollinationsApiError: undefined,
            statusMessage: `Собираем prompt персонажа ${index + 1}/${characterDescriptions.length}: ${characterName}`,
          });

          const assetPrompt = await generateText({
            operation: 'character_asset_prompt',
            prompt: withProjectVisualStyle(characterDescription, nodesRef.current),
            systemPrompt: CHARACTER_ASSET_PROMPT_SYSTEM_PROMPT,
            model: detailNode.selectedModel || MISTRAL_MODELS[0],
          }, controller.signal, generationSettings);
          const styledAssetPrompt = appendProjectVisualStyleToImagePrompt(assetPrompt, nodesRef.current);
          generatedPrompts.push(`${characterName}\n${styledAssetPrompt}`);

          updateNode(detailNodeId, {
            isLoading: false,
            isLoadingImage: true,
            loadingProvider: imageGenerationSettings.provider,
            assetPrompt: generatedPrompts.join('\n\n'),
            statusMessage: `Генерируем референс ${index + 1}/${characterDescriptions.length}: ${characterName}`,
          });

          const imageUrl = await generateImage(
            styledAssetPrompt,
            detailNode.imagePipeline ?? 'sdxl',
            imageGenerationSettings,
            'character_asset',
            controller.signal,
          );
          upsertImageNode(
            detailNodeId,
            imageUrl,
            `Ассет ${index + 1} · ${characterName}`,
            `character_asset:${index}`,
            index,
            styledAssetPrompt,
            withProjectVisualStyle(characterDescription, nodesRef.current),
          );
        }

        showNotice('success', `Создано референсов персонажей: ${characterDescriptions.length}.`);
        return;
      }

      const locationDescriptions = getLocationDescriptions(description);
      setNodes((previousNodes) => {
        const nextNodes = { ...previousNodes };
        Object.entries(previousNodes).forEach(([nodeId, node]) => {
          const assetKind = typeof node.metadata?.assetKind === 'string' ? node.metadata.assetKind : '';
          if (
            node.parentId === detailNodeId
            && node.nodeType === 'pollinations_image'
            && assetKind.startsWith('location_asset')
          ) {
            if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
            delete nextNodes[nodeId];
          }
        });
        return nextNodes;
      });

      const generatedPrompts: string[] = [];
      for (let index = 0; index < locationDescriptions.length; index += 1) {
        const locationDescription = locationDescriptions[index];
        const locationName = getLocationName(locationDescription, index);
        updateNode(detailNodeId, {
          isLoading: true,
          loadingProvider: generationSettings.mode,
          error: undefined,
          pollinationsApiError: undefined,
          statusMessage: `Собираем prompt локации ${index + 1}/${locationDescriptions.length}: ${locationName}`,
        });

        const assetPrompt = await generateText({
          operation: 'location_asset_prompt',
          prompt: withProjectVisualStyle(locationDescription, nodesRef.current),
          systemPrompt: LOCATION_ASSET_PROMPT_SYSTEM_PROMPT,
          model: detailNode.selectedModel || MISTRAL_MODELS[0],
        }, controller.signal, generationSettings);
        const styledAssetPrompt = appendProjectVisualStyleToImagePrompt(assetPrompt, nodesRef.current);
        generatedPrompts.push(`${locationName}\n${styledAssetPrompt}`);

        updateNode(detailNodeId, {
          isLoading: false,
          isLoadingImage: true,
          loadingProvider: imageGenerationSettings.provider,
          assetPrompt: generatedPrompts.join('\n\n'),
          statusMessage: `Генерируем локацию ${index + 1}/${locationDescriptions.length}: ${locationName}`,
        });

        const imageUrl = await generateImage(
          styledAssetPrompt,
          detailNode.imagePipeline ?? 'sdxl',
          imageGenerationSettings,
          'location_asset',
          controller.signal,
        );
        upsertImageNode(
          detailNodeId,
          imageUrl,
          `Ассет ${index + 1} · ${locationName}`,
          `location_asset:${index}`,
          index,
          styledAssetPrompt,
          withProjectVisualStyle(locationDescription, nodesRef.current),
        );
      }
      showNotice('success', `Создано референсов локаций: ${locationDescriptions.length}.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Генерация ассета отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(detailNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(detailNodeId, {
        isLoading: false,
        isLoadingImage: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [generationSettings, imageGenerationSettings, setNodes, showNotice, updateNode, upsertImageNode]);

  const handleEditNarration = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const narration = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail' || detailNode.label !== 'Закадр' || detailNode.isLoading) return;
    if (!narration) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте закадровый текст.' });
      return;
    }

    const parentNode = detailNode.parentId ? nodesRef.current[detailNode.parentId] : undefined;
    const prompt = [
      `Сценарий:\n${parentNode?.inputValue || 'Не задано'}`,
      `Текущий закадр:\n${narration}`,
      'Задача: отредактируй закадр как смысловой двигатель истории.',
    ].join('\n\n');
    const result = await requestText(detailNodeId, {
      operation: 'narration_edit',
      prompt: withStoryReferenceContext(prompt, nodesRef.current),
      systemPrompt: NARRATION_EDIT_SYSTEM_PROMPT,
      model: detailNode.selectedModel || parentNode?.selectedModel || MISTRAL_MODELS[0],
      sceneCount: detailNode.sceneCount ?? parentNode?.sceneCount,
    }, 'Редактируем закадр и усиливаем смысл...');
    if (!result) return;

    updateNode(detailNodeId, {
      inputValue: result,
      error: undefined,
      statusMessage: 'Закадр отредактирован.',
      metadata: {
        ...detailNode.metadata,
        editedAt: new Date().toISOString(),
      },
    });
    showNotice('success', 'Закадр отредактирован.');
  }, [requestText, showNotice, updateNode]);

  const handleNarrationEditorialLoop = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const narration = detailNode?.inputValue?.trim();
    const outputNode = detailNode?.parentId ? nodesRef.current[detailNode.parentId] : undefined;
    const sourceNode = outputNode?.parentId ? nodesRef.current[outputNode.parentId] : undefined;
    if (
      !detailNode
      || detailNode.nodeType !== 'script_detail'
      || detailNode.label !== 'Закадр'
      || detailNode.isLoading
      || !outputNode
      || outputNode.nodeType !== 'script_output'
      || !sourceNode
    ) return;
    if (!narration) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте закадровый текст.' });
      return;
    }

    const sourceNodeId = outputNode.parentId ?? '';
    const sceneCount = clampSceneCount(outputNode.sceneCount ?? sourceNode.sceneCount ?? detailNode.sceneCount ?? 4);
    const model = detailNode.selectedModel || outputNode.selectedModel || sourceNode.selectedModel || MISTRAL_MODELS[0];
    const briefPrompt = [
      `Исходная короткая заявка:\n${sourceNode.inputValue || 'Не задано'}`,
      `Текущий сценарий:\n${outputNode.inputValue || 'Не задано'}`,
      `Сильные идеи из закадра:\n${narration}`,
      'Задача: собери расширенную заявку для следующего прохода.',
    ].join('\n\n');

    const revisedBrief = await requestText(detailNodeId, {
      operation: 'brief_revision',
      prompt: withStoryReferenceContext(briefPrompt, nodesRef.current),
      systemPrompt: STORY_BRIEF_REVISION_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Редактура луп: поднимаем сильные идеи в заявку...');
    if (!revisedBrief) return;

    const theme = sourceNode.themeInputValue?.trim();
    const scenarioSystemPrompt = theme
      ? `${SCENARIO_SYSTEM_PROMPT}\nСтилистическое направление: ${theme}.`
      : SCENARIO_SYSTEM_PROMPT;
    const revisedScenario = await requestText(detailNodeId, {
      operation: 'scenario',
      prompt: withStoryReferenceContext(revisedBrief, nodesRef.current),
      systemPrompt: scenarioSystemPrompt,
      model,
      sceneCount,
    }, `Редактура луп: пересобираем ${sceneCount} сцен...`, true);
    if (!revisedScenario) return;

    const revisedNarration = await requestText(detailNodeId, {
      operation: 'narration',
      prompt: withStoryReferenceContext(revisedScenario, nodesRef.current),
      systemPrompt: NARRATION_DETAIL_SYSTEM_PROMPT,
      model,
      sceneCount,
    }, 'Редактура луп: пересобираем закадр...', true);
    if (!revisedNarration) return;

    setNodes((previousNodes) => {
      let nextNodes = upsertScenarioGraph(previousNodes, sourceNodeId, revisedScenario, sceneCount);
      const currentOutput = nextNodes[detailNode.parentId ?? ''];
      const currentDetail = nextNodes[detailNodeId];
      if (!currentOutput || !currentDetail) return nextNodes;
      const sceneIds = new Set(Object.entries(nextNodes)
        .filter(([, node]) => node.parentId === detailNode.parentId && node.nodeType === 'scene')
        .map(([nodeId]) => nodeId));
      nextNodes = { ...nextNodes };
      Object.entries(nextNodes).forEach(([nodeId, node]) => {
        if (node.nodeType === 'pollinations_image' && node.parentId && sceneIds.has(node.parentId)) {
          if (node.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.imageUrl);
          delete nextNodes[nodeId];
        }
      });
      const existingBrief = getExistingChild(
        nextNodes,
        currentOutput.parentId ?? '',
        (node) => node.nodeType === 'script_detail' && node.label === 'Заявка · редактура',
      );
      const briefNodeId = existingBrief?.[0] ?? generateNodeId();
      nextNodes = {
        ...nextNodes,
        [detailNodeId]: {
          ...currentDetail,
          inputValue: revisedNarration,
          error: undefined,
          statusMessage: 'Редакторский луп завершён.',
          metadata: {
            ...currentDetail.metadata,
            editorialLoopAt: new Date().toISOString(),
          },
        },
        [briefNodeId]: {
          ...existingBrief?.[1],
          nodeType: 'script_detail',
          x: existingBrief?.[1].x ?? currentDetail.x,
          y: existingBrief?.[1].y ?? currentDetail.y + (currentDetail.height ?? 280) + 36,
          label: 'Заявка · редактура',
          width: existingBrief?.[1].width ?? 420,
          height: existingBrief?.[1].height ?? 280,
          isGenerated: true,
          level: (currentDetail.level ?? 0) + 1,
          parentId: sourceNodeId,
          inputValue: revisedBrief,
          error: undefined,
          metadata: {
            ...existingBrief?.[1].metadata,
            sourceKind: 'brief_revision',
            sourceNarrationNodeId: detailNodeId,
            revisedAt: new Date().toISOString(),
          },
        },
      };
      return nextNodes;
    });
    showNotice('success', 'Редакторский луп завершён: заявка, сценарий и закадр обновлены.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handlePrepareNarrationTts = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const narration = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail' || detailNode.label !== 'Закадр' || detailNode.isLoading) return;
    if (!narration) {
      updateNode(detailNodeId, { error: 'Сначала сгенерируйте закадровый текст.' });
      return;
    }

    const parentNode = detailNode.parentId ? nodesRef.current[detailNode.parentId] : undefined;
    const result = await requestText(detailNodeId, {
      operation: 'tts_cleanup',
      prompt: narration,
      systemPrompt: TTS_CLEANUP_SYSTEM_PROMPT,
      model: detailNode.selectedModel || parentNode?.selectedModel || MISTRAL_MODELS[0],
      sceneCount: detailNode.sceneCount ?? parentNode?.sceneCount,
    }, 'Чистим закадр для TTS...');
    if (!result) return;

    setNodes((previousNodes) => {
      const currentDetail = previousNodes[detailNodeId];
      if (!currentDetail) return previousNodes;
      const existing = getExistingChild(
        previousNodes,
        detailNodeId,
        (node) => node.nodeType === 'script_detail' && node.label === 'TTS · Закадр',
      );
      const nodeId = existing?.[0] ?? generateNodeId();
      return {
        ...previousNodes,
        [nodeId]: {
          ...existing?.[1],
          nodeType: 'script_detail',
          x: existing?.[1].x ?? currentDetail.x + (currentDetail.width ?? 302) + 36,
          y: existing?.[1].y ?? currentDetail.y,
          label: 'TTS · Закадр',
          width: existing?.[1].width ?? 360,
          height: existing?.[1].height ?? 280,
          isGenerated: true,
          level: (currentDetail.level ?? 0) + 1,
          parentId: detailNodeId,
          inputValue: result,
          error: undefined,
          metadata: {
            ...existing?.[1].metadata,
            sourceKind: 'tts_cleanup',
            sourceNodeId: detailNodeId,
            cleanedAt: new Date().toISOString(),
          },
        },
      };
    });
    showNotice('success', 'TTS-текст подготовлен.');
  }, [requestText, setNodes, showNotice, updateNode]);

  const handleStopSpeech = useCallback(() => {
    window.speechSynthesis.cancel();
    speechUtteranceRef.current = null;
    const speakingNodeId = speakingNodeIdRef.current;
    speakingNodeIdRef.current = null;
    if (speakingNodeId) {
      updateNode(speakingNodeId, {
        isSpeaking: false,
        statusMessage: 'Озвучка остановлена.',
      });
    }
    showNotice('info', 'Озвучка остановлена.');
  }, [showNotice, updateNode]);

  const handleSpeakNarration = useCallback((detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const rawText = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail') return;
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      const message = 'Браузер не поддерживает встроенную озвучку. Нужен Chrome, Edge или другой браузер с Web Speech API.';
      updateNode(detailNodeId, { error: message });
      showNotice('error', message);
      return;
    }
    if (!rawText) {
      updateNode(detailNodeId, { error: 'В этой ноде нет текста для озвучки.' });
      return;
    }

    const previousNodeId = speakingNodeIdRef.current;
    window.speechSynthesis.cancel();
    if (previousNodeId && previousNodeId !== detailNodeId) {
      updateNode(previousNodeId, { isSpeaking: false, statusMessage: undefined });
    }

    const text = cleanupBrowserSpeechText(rawText);
    const chunks = splitSpeechText(text);
    if (chunks.length === 0) {
      updateNode(detailNodeId, { error: 'После очистки не осталось текста для озвучки.' });
      return;
    }

    const synth = window.speechSynthesis;
    const voices = synth.getVoices();
    const russianVoice = voices.find((voice) => voice.lang.toLocaleLowerCase().startsWith('ru'))
      ?? voices.find((voice) => /russian|рус/i.test(voice.name))
      ?? null;
    speakingNodeIdRef.current = detailNodeId;
    updateNode(detailNodeId, {
      error: undefined,
      isSpeaking: true,
      statusMessage: `Озвучиваем закадр: 1/${chunks.length}`,
    });

    const finishSpeech = (statusMessage: string) => {
      if (speakingNodeIdRef.current !== detailNodeId) return;
      speakingNodeIdRef.current = null;
      speechUtteranceRef.current = null;
      updateNode(detailNodeId, {
        isSpeaking: false,
        statusMessage,
      });
    };

    const speakChunk = (index: number) => {
      if (speakingNodeIdRef.current !== detailNodeId) return;
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      speechUtteranceRef.current = utterance;
      utterance.lang = 'ru-RU';
      utterance.rate = 0.95;
      utterance.pitch = 1;
      if (russianVoice) utterance.voice = russianVoice;
      utterance.onend = () => {
        if (speakingNodeIdRef.current !== detailNodeId) return;
        if (index + 1 < chunks.length) {
          updateNode(detailNodeId, { statusMessage: `Озвучиваем закадр: ${index + 2}/${chunks.length}` });
          speakChunk(index + 1);
        } else {
          finishSpeech('Озвучка завершена.');
          showNotice('success', 'Озвучка завершена.');
        }
      };
      utterance.onerror = () => {
        finishSpeech('Озвучка остановилась из-за ошибки браузерного голоса.');
        updateNode(detailNodeId, { error: 'Браузерный голос остановился из-за ошибки. Попробуйте другой голос в системе или подготовьте TTS-текст заново.' });
      };
      synth.speak(utterance);
    };

    speakChunk(0);
  }, [showNotice, updateNode]);

  const handleGenerateOmniVoiceNarration = useCallback(async (detailNodeId: string) => {
    const detailNode = nodesRef.current[detailNodeId];
    const rawText = detailNode?.inputValue?.trim();
    if (!detailNode || detailNode.nodeType !== 'script_detail') return;
    if (!rawText) {
      updateNode(detailNodeId, { error: 'В этой ноде нет текста для озвучки.' });
      return;
    }

    const text = cleanupBrowserSpeechText(rawText);
    if (!text) {
      updateNode(detailNodeId, { error: 'После очистки не осталось текста для озвучки.' });
      return;
    }

    const requestId = `tts:${detailNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(detailNodeId, {
        isLoadingAudio: true,
        loadingProvider: 'comfyui',
        error: undefined,
        pollinationsApiError: undefined,
        statusMessage: 'OmniVoice поставлен в очередь ComfyUI и готовит озвучку...',
      });

      const audioUrl = await generateComfyOmniVoiceDesignAudio(
        text,
        OMNIVOICE_NARRATOR_VOICE,
        imageGenerationSettings,
        controller.signal,
      );

      setNodes((previousNodes) => {
        const currentNode = previousNodes[detailNodeId];
        if (!currentNode) return previousNodes;
        if (currentNode.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.audioUrl);
        return {
          ...previousNodes,
          [detailNodeId]: {
            ...currentNode,
            audioUrl,
            isLoadingAudio: false,
            loadingProvider: undefined,
            statusMessage: 'OmniVoice озвучка готова.',
            metadata: {
              ...currentNode.metadata,
              ttsProvider: 'omnivoice',
              voiceInstruct: OMNIVOICE_NARRATOR_VOICE,
              ttsGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', 'OmniVoice озвучка готова.');
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'OmniVoice озвучка отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(detailNodeId, { error: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(detailNodeId, {
        isLoadingAudio: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [imageGenerationSettings, setNodes, showNotice, updateNode]);

  const handleGenerateSceneOmniVoiceNarration = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    const outputNode = sceneNode?.parentId ? currentNodes[sceneNode.parentId] : undefined;
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoadingAudio) return;

    const narrationNode = Object.values(currentNodes).find(
      (node) => node.parentId === sceneNode.parentId && node.nodeType === 'script_detail' && node.label === 'Закадр',
    );
    const sceneNarration = narrationNode?.inputValue
      ? extractSceneNarration(narrationNode.inputValue, sceneNode.label)
      : '';
    const fallbackText = cleanupBrowserSpeechText(sceneNode.sceneText || sceneNode.inputValue || outputNode?.inputValue || '');
    const text = sceneNarration || fallbackText;
    if (!text) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Не найден закадровый текст для этой сцены. Сначала создайте или подготовьте ноду «Закадр».' });
      return;
    }

    const requestId = `tts-scene:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(sceneNodeId, {
        isLoadingAudio: true,
        loadingProvider: 'comfyui',
        pollinationsApiError: undefined,
        statusMessage: 'OmniVoice озвучивает эту сцену мужским голосом...',
      });

      const audioUrl = await generateComfyOmniVoiceDesignAudio(
        text,
        OMNIVOICE_NARRATOR_VOICE,
        imageGenerationSettings,
        controller.signal,
      );

      setNodes((previousNodes) => {
        const currentNode = previousNodes[sceneNodeId];
        if (!currentNode) return previousNodes;
        if (currentNode.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.audioUrl);
        return {
          ...previousNodes,
          [sceneNodeId]: {
            ...currentNode,
            audioUrl,
            isLoadingAudio: false,
            loadingProvider: undefined,
            statusMessage: 'Озвучка сцены готова.',
            metadata: {
              ...currentNode.metadata,
              ttsProvider: 'omnivoice',
              voiceInstruct: OMNIVOICE_NARRATOR_VOICE,
              sceneNarrationText: text,
              ttsGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', `Озвучка для «${sceneNode.label}» готова.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Озвучка сцены отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(sceneNodeId, {
        isLoadingAudio: false,
        loadingProvider: undefined,
        statusMessage: undefined,
      });
    }
  }, [imageGenerationSettings, setNodes, showNotice, updateNode]);

  const handleBuildSceneVideoClip = useCallback(async (sceneNodeId: string) => {
    const currentNodes = nodesRef.current;
    const sceneNode = currentNodes[sceneNodeId];
    if (!sceneNode || sceneNode.nodeType !== 'scene' || sceneNode.isLoadingVideo) return;
    if (!sceneNode.audioUrl) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала озвучьте эту сцену OmniVoice.' });
      return;
    }
    const frameNode = findBestSceneFrameNode(currentNodes, sceneNodeId);
    if (!frameNode?.imageUrl) {
      updateNode(sceneNodeId, { pollinationsApiError: 'Сначала соберите или сгенерируйте кадр для этой сцены.' });
      return;
    }

    const requestId = `scene-video:${sceneNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(sceneNodeId, {
        isLoadingVideo: true,
        pollinationsApiError: undefined,
        statusMessage: 'Собираем 16:9 WebM клип из кадра и озвучки...',
      });

      const videoUrl = await buildStillImageVideoClip(frameNode.imageUrl, sceneNode.audioUrl, controller.signal);

      setNodes((previousNodes) => {
        const currentNode = previousNodes[sceneNodeId];
        if (!currentNode) return previousNodes;
        if (currentNode.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.videoUrl);
        return {
          ...previousNodes,
          [sceneNodeId]: {
            ...currentNode,
            videoUrl,
            isLoadingVideo: false,
            statusMessage: 'Клип 16:9 готов.',
            metadata: {
              ...currentNode.metadata,
              videoFormat: 'webm',
              videoAspectRatio: '16:9',
              videoFrameSource: frameNode.label,
              videoGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', `Клип 16:9 для «${sceneNode.label}» готов.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Сборка клипа отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(sceneNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(sceneNodeId, {
        isLoadingVideo: false,
        statusMessage: undefined,
      });
    }
  }, [setNodes, showNotice, updateNode]);

  const handleBuildChapterVideo = useCallback(async (timelineNodeId: string) => {
    const currentNodes = nodesRef.current;
    const timelineNode = currentNodes[timelineNodeId];
    if (!timelineNode || timelineNode.nodeType !== 'chapter_timeline' || timelineNode.isLoadingVideo) return;

    const sourceScenarioId = typeof timelineNode.metadata?.sourceScenarioId === 'string'
      ? timelineNode.metadata.sourceScenarioId
      : timelineNode.parentId;
    const sceneEntries = Object.entries(currentNodes)
      .filter(([, candidate]) =>
        candidate.nodeType === 'scene'
        && (!sourceScenarioId || candidate.parentId === sourceScenarioId))
      .sort(([, first], [, second]) =>
        (getSceneNumber(first.label) ?? 0) - (getSceneNumber(second.label) ?? 0)
        || first.label.localeCompare(second.label, 'ru', { numeric: true }));

    const missingClipLabels = sceneEntries
      .filter(([, scene]) => !scene.videoUrl)
      .map(([, scene]) => scene.label);
    if (sceneEntries.length === 0) {
      updateNode(timelineNodeId, { pollinationsApiError: 'Сначала создайте сцены для таймлайна.' });
      return;
    }
    if (missingClipLabels.length > 0) {
      updateNode(timelineNodeId, {
        pollinationsApiError: `Сначала соберите клипы для всех сцен. Не хватает: ${missingClipLabels.join(', ')}.`,
      });
      return;
    }

    const clipUrls = sceneEntries
      .map(([, scene]) => scene.videoUrl)
      .filter((clipUrl): clipUrl is string => Boolean(clipUrl));
    const requestId = `chapter-video:${timelineNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    try {
      updateNode(timelineNodeId, {
        isLoadingVideo: true,
        pollinationsApiError: undefined,
        statusMessage: `Собираем общий ролик главы из ${clipUrls.length} клипов...`,
      });

      const videoUrl = await buildChapterVideoFromClips(clipUrls, controller.signal);
      setNodes((previousNodes) => {
        const currentNode = previousNodes[timelineNodeId];
        if (!currentNode) return previousNodes;
        const withVideoNode = upsertVideoOutputNode(previousNodes, timelineNodeId, videoUrl);
        return {
          ...withVideoNode,
          [timelineNodeId]: {
            ...currentNode,
            isLoadingVideo: false,
            statusMessage: 'Общий ролик главы готов.',
            metadata: {
              ...currentNode.metadata,
              chapterClipCount: clipUrls.length,
              videoGeneratedAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', `Общий ролик главы собран из ${clipUrls.length} клипов.`);
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Сборка общего ролика отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(timelineNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(timelineNodeId, {
        isLoadingVideo: false,
        statusMessage: undefined,
      });
    }
  }, [setNodes, showNotice, updateNode]);

  const handleGeneratePollinationsImage = useCallback(async (parentNodeId: string) => {
    const parentNode = nodesRef.current[parentNodeId];
    if (!parentNode?.masterPrompt || parentNode.isLoadingImage) return;
    const requestId = `image:${parentNodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);
    updateNode(parentNodeId, {
      isLoadingImage: true,
      loadingProvider: imageGenerationSettings.provider,
      pollinationsApiError: undefined,
    });

    try {
      const imageUrl = await generateImage(
        appendProjectVisualStyleToImagePrompt(parentNode.masterPrompt, nodesRef.current),
        parentNode.imagePipeline ?? 'sdxl',
        imageGenerationSettings,
        'default',
        controller.signal,
      );
      upsertImageNode(parentNodeId, imageUrl, 'Кадр', 'scene_frame', 0, appendProjectVisualStyleToImagePrompt(parentNode.masterPrompt, nodesRef.current), parentNode.inputValue ?? '');
      showNotice('success', 'Кадр создан. Он не включается в localStorage и JSON проекта.');
    } catch (error) {
      if (!isAbortError(error)) {
        const message = errorMessage(error);
        updateNode(parentNodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(parentNodeId, { isLoadingImage: false, loadingProvider: undefined });
    }
  }, [imageGenerationSettings, showNotice, updateNode, upsertImageNode]);

  const handleRegenerateImageNode = useCallback(async (nodeId: string) => {
    const node = nodesRef.current[nodeId];
    const prompt = node?.masterPrompt?.trim();
    if (!node || node.nodeType !== 'pollinations_image' || !prompt || node.isLoadingImage) return;

    const requestId = `reroll-image:${nodeId}`;
    if (activeRequests.current.has(requestId)) return;
    const controller = new AbortController();
    activeRequests.current.set(requestId, controller);

    updateNode(nodeId, {
      isLoadingImage: true,
      loadingProvider: imageGenerationSettings.provider,
      pollinationsApiError: undefined,
      statusMessage: 'Перегенерируем с новым seed...',
    });

    try {
      const assetKind = getAssetKind(node);
      const styledPrompt = appendProjectVisualStyleToImagePrompt(prompt, nodesRef.current);
      let imageUrl: string;
      if (assetKind === 'scene_flux2_frame') {
        const backgroundNodeId = typeof node.metadata?.backgroundNodeId === 'string' ? node.metadata.backgroundNodeId : '';
        const characterReferenceNodeIds = typeof node.metadata?.characterReferenceNodeIds === 'string'
          ? node.metadata.characterReferenceNodeIds.split(',').map((value) => value.trim()).filter(Boolean)
          : [];
        const characterReferenceNodeId = typeof node.metadata?.characterReferenceNodeId === 'string' ? node.metadata.characterReferenceNodeId : '';
        const backgroundNode = nodesRef.current[backgroundNodeId];
        const characterNodes = (characterReferenceNodeIds.length > 0 ? characterReferenceNodeIds : [characterReferenceNodeId])
          .map((referenceNodeId) => nodesRef.current[referenceNodeId])
          .filter((referenceNode): referenceNode is NodeData => Boolean(referenceNode?.imageUrl));
        if (!backgroundNode?.imageUrl || characterNodes.length === 0) {
          throw new Error('Не найдены исходная локация или персонаж для повторной сборки Flux2.');
        }
        const composePipeline = node.imagePipeline === 'flux2_turbo_compose' ? 'flux2_turbo_compose' : 'flux2_compose';
        imageUrl = await generateComfyFlux2ComposeImage(
          styledPrompt,
          backgroundNode.imageUrl,
          characterNodes.map(toFlux2CharacterReference),
          composePipeline,
          imageGenerationSettings,
          controller.signal,
        );
      } else {
        imageUrl = await generateImage(
          styledPrompt,
          node.imagePipeline ?? 'sdxl',
          imageGenerationSettings,
          getImagePromptKind(node),
          controller.signal,
        );
      }

      setNodes((previousNodes) => {
        const currentNode = previousNodes[nodeId];
        if (!currentNode || currentNode.nodeType !== 'pollinations_image') return previousNodes;
        if (currentNode.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(currentNode.imageUrl);
        return {
          ...previousNodes,
          [nodeId]: {
            ...currentNode,
            imageUrl,
            masterPrompt: styledPrompt,
            isLoadingImage: false,
            loadingProvider: undefined,
            pollinationsApiError: undefined,
            statusMessage: undefined,
            metadata: {
              ...currentNode.metadata,
              imageProvider: imageGenerationSettings.provider,
              imagePipeline: assetKind === 'scene_flux2_frame'
                ? currentNode.imagePipeline === 'flux2_turbo_compose' ? 'flux2_turbo_compose' : 'flux2_compose'
                : currentNode.imagePipeline ?? 'sdxl',
              ...(isCharacterReferenceNode(currentNode) ? {
                referencePrompt: styledPrompt,
                referenceContext: typeof currentNode.metadata?.promptContext === 'string' ? currentNode.metadata.promptContext : '',
              } : {}),
              rerolledAt: new Date().toISOString(),
            },
          },
        };
      });
      showNotice('success', 'Картинка перегенерирована с новым seed.');
    } catch (error) {
      if (isAbortError(error)) {
        showNotice('info', 'Перегенерация отменена.');
      } else {
        const message = errorMessage(error);
        updateNode(nodeId, { pollinationsApiError: message });
        showNotice('error', message);
      }
    } finally {
      activeRequests.current.delete(requestId);
      updateNode(nodeId, { isLoadingImage: false, loadingProvider: undefined, statusMessage: undefined });
    }
  }, [imageGenerationSettings, setNodes, showNotice, updateNode]);

  const handleToggleReferenceImage = useCallback((nodeId: string) => {
    setNodes((previousNodes) => {
      const node = previousNodes[nodeId];
      if (!node || node.nodeType !== 'pollinations_image') return previousNodes;
      const isReference = isCharacterReferenceNode(node);
      return {
        ...previousNodes,
        [nodeId]: {
          ...node,
          metadata: {
            ...node.metadata,
            isReference: !isReference,
            referencePrompt: node.masterPrompt ?? '',
            referenceContext: typeof node.metadata?.promptContext === 'string' ? node.metadata.promptContext : '',
          },
          productionStatus: !isReference ? 'ready' : node.productionStatus,
        },
      };
    });
    showNotice('success', 'Статус референса обновлён.');
  }, [setNodes, showNotice]);

  const handleCancelGeneration = useCallback((nodeId: string) => {
    activeRequests.current.get(nodeId)?.abort();
    activeRequests.current.get(`image:${nodeId}`)?.abort();
    activeRequests.current.get(`reroll-image:${nodeId}`)?.abort();
    activeRequests.current.get(`flux2-compose:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-location:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-characters:${nodeId}`)?.abort();
    activeRequests.current.get(`detail-asset:${nodeId}`)?.abort();
    activeRequests.current.get(`tts:${nodeId}`)?.abort();
    activeRequests.current.get(`tts-scene:${nodeId}`)?.abort();
    activeRequests.current.get(`scene-video:${nodeId}`)?.abort();
    activeRequests.current.get(`chapter-video:${nodeId}`)?.abort();
    if (speakingNodeIdRef.current === nodeId) {
      window.speechSynthesis.cancel();
      speechUtteranceRef.current = null;
      speakingNodeIdRef.current = null;
    }
    updateNode(nodeId, {
      isLoading: false,
      isLoadingImage: false,
      isLoadingAudio: false,
      isLoadingVideo: false,
      isSpeaking: false,
      loadingProvider: undefined,
      statusMessage: undefined,
    });
    showNotice('info', 'Загрузка для ноды сброшена.');
  }, [showNotice, updateNode]);

  return {
    nodes,
    setNodes,
    notice,
    clearNotice,
    handleInputChange,
    handleThemeInputChange,
    handleModelChange,
    handleImagePipelineChange,
    handleSceneCountChange,
    handleContinueAssociation,
    handleScriptVisualization,
    handleBuildScenarioFromBrief,
    handleAutoBuildChapter,
    handleEnsureStoryReferenceNodes,
    handleEnsureChapterTimeline,
    handleScenarioDetailClick,
    handleCreateSceneNodes,
    handleGenerateScenePrompt,
    handleGenerateSceneLocationAsset,
    handleGenerateSceneCharacterLayer,
    handleComposeSceneFlux2,
    handleGenerateDetailAsset,
    handleEditNarration,
    handleNarrationEditorialLoop,
    handlePrepareNarrationTts,
    handleSpeakNarration,
    handleStopSpeech,
    handleGenerateOmniVoiceNarration,
    handleGenerateSceneOmniVoiceNarration,
    handleBuildSceneVideoClip,
    handleBuildChapterVideo,
    handleCopyToClipboard,
    handleGeneratePollinationsImage,
    handleRegenerateImageNode,
    handleToggleReferenceImage,
    handleCancelGeneration,
  };
};
