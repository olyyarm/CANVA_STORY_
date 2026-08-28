import {
  GeneratedVideo,
  tryBuildChapterVideoWithFfmpeg,
  tryBuildStillImagesVideoClipWithFfmpeg,
} from './nativeVideoRenderer';

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const VIDEO_FPS = 24;
const VIDEO_BITS_PER_SECOND = 4_000_000;
const AUDIO_BITS_PER_SECOND = 128_000;
const MEDIA_CHUNK_MS = 1_000;
const MEDIA_READY_TIMEOUT_MS = 20_000;
const MEDIA_STALL_TIMEOUT_MS = 15_000;
const RECORDER_READY_TIMEOUT_MS = 15_000;
const RECORDER_STATE_CHECK_MS = 100;
const RECORDER_WARMUP_MS = 160;

export const SCENE_VIDEO_LAYOUT_VERSION = 3;

const abortError = () => new DOMException('Aborted', 'AbortError');

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError();
};

const ensureVisibleDocument = () => {
  if (document.hidden) {
    throw new Error('Верните вкладку CANVA STORY на экран и повторите сборку. В фоновой вкладке браузер останавливает кадры, из-за чего видео может стать чёрным.');
  }
};

const loadImageElement = (imageUrl: string, signal?: AbortSignal) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    throwIfAborted(signal);
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', handleAbort);
    };
    const handleAbort = () => {
      cleanup();
      image.src = '';
      reject(abortError());
    };
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('Не удалось загрузить картинку для 16:9 клипа.'));
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
    image.src = imageUrl;
  });

const pickSupportedVideoMimeType = () => {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
  ];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
};

const createMediaRecorder = (stream: MediaStream) => {
  const mimeType = pickSupportedVideoMimeType();
  return new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  });
};

const drawCenteredImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  drawWidth: number,
  drawHeight: number,
) => {
  context.drawImage(image, x - drawWidth / 2, y - drawHeight / 2, drawWidth, drawHeight);
};

const drawStillFrame = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  backgroundImage?: HTMLImageElement,
) => {
  const centerX = width / 2;
  const centerY = height / 2;

  context.fillStyle = '#101318';
  context.fillRect(0, 0, width, height);
  if (backgroundImage) {
    const backgroundScale = Math.max(
      width / backgroundImage.naturalWidth,
      height / backgroundImage.naturalHeight,
    );
    drawCenteredImage(
      context,
      backgroundImage,
      centerX,
      centerY,
      backgroundImage.naturalWidth * backgroundScale,
      backgroundImage.naturalHeight * backgroundScale,
    );
  } else {
    const coverScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const fallbackScale = coverScale * 1.5;
    context.save();
    context.filter = 'blur(28px)';
    drawCenteredImage(
      context,
      image,
      centerX,
      centerY,
      image.naturalWidth * fallbackScale,
      image.naturalHeight * fallbackScale,
    );
    context.restore();
    context.fillStyle = 'rgba(0, 0, 0, 0.2)';
    context.fillRect(0, 0, width, height);
  }

  const containScale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const foregroundScale = containScale * 0.87;
  const foregroundY = centerY;
  const foregroundWidth = image.naturalWidth * foregroundScale;
  const foregroundHeight = image.naturalHeight * foregroundScale;

  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.35)';
  context.shadowBlur = 30;
  context.shadowOffsetY = 16;
  drawCenteredImage(context, image, centerX, foregroundY, foregroundWidth, foregroundHeight);
  context.restore();
};

const stopRecorder = (recorder: MediaRecorder) => {
  if (recorder.state === 'inactive') return;
  try {
    recorder.requestData();
  } catch {
    // Some browsers reject requestData while the recorder is transitioning.
  }
  recorder.stop();
};

const startRecorder = async (recorder: MediaRecorder) => {
  const started = new Promise<void>((resolve, reject) => {
    let timeoutId = 0;
    let stateCheckId = 0;
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(stateCheckId);
      recorder.removeEventListener('start', handleStart);
      recorder.removeEventListener('error', handleError);
    };
    const resolveStarted = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const handleStart = () => resolveStarted();
    const handleError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Браузер не смог запустить кодировщик видео.'));
    };
    recorder.addEventListener('start', handleStart, { once: true });
    recorder.addEventListener('error', handleError, { once: true });
    stateCheckId = window.setInterval(() => {
      if (recorder.state === 'recording') resolveStarted();
    }, RECORDER_STATE_CHECK_MS);
    timeoutId = window.setTimeout(() => {
      if (recorder.state === 'recording') {
        resolveStarted();
        return;
      }
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Кодировщик видео не запустился за ${RECORDER_READY_TIMEOUT_MS / 1_000} секунд. Повторите сборку, оставив вкладку CANVA STORY активной.`));
    }, RECORDER_READY_TIMEOUT_MS);
    try {
      recorder.start(MEDIA_CHUNK_MS);
      if (recorder.state === 'recording') resolveStarted();
    } catch (error) {
      settled = true;
      cleanup();
      reject(new Error(`Браузер не смог запустить кодировщик видео: ${error instanceof Error ? error.message : String(error)}`));
    }
  });

  await started;
  await new Promise((resolve) => window.setTimeout(resolve, RECORDER_WARMUP_MS));
};

export const buildStillImagesVideoClip = async (
  imageUrls: string[],
  audioUrl: string,
  options?: AbortSignal | {
    signal?: AbortSignal;
    backgroundImageUrl?: string;
    requireFfmpeg?: boolean;
  },
): Promise<GeneratedVideo> => {
  const signal = options && 'aborted' in options ? options : options?.signal;
  const backgroundImageUrl = options && !('aborted' in options) ? options.backgroundImageUrl : undefined;
  const requireFfmpeg = options && !('aborted' in options) ? options.requireFfmpeg === true : false;
  const usableImageUrls = imageUrls.filter(Boolean);
  if (usableImageUrls.length === 0) {
    throw new Error('Нет картинки для сборки 16:9 клипа.');
  }
  throwIfAborted(signal);

  const nativeVideo = await tryBuildStillImagesVideoClipWithFfmpeg(
    usableImageUrls,
    audioUrl,
    { signal, backgroundImageUrl },
  );
  if (nativeVideo) return nativeVideo;
  if (requireFfmpeg) {
    throw new Error('Локальный FFmpeg renderer недоступен. Запустите CANVA STORY через start_canva_story_full_stack.bat.');
  }

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('FFmpeg-сервис недоступен, а браузер не поддерживает MediaRecorder.');
  }
  ensureVisibleDocument();

  const [images, backgroundImage, audioResponse] = await Promise.all([
    Promise.all(usableImageUrls.map((imageUrl) => loadImageElement(imageUrl, signal))),
    backgroundImageUrl ? loadImageElement(backgroundImageUrl, signal) : Promise.resolve(undefined),
    fetch(audioUrl, { signal }),
  ]);
  if (!audioResponse.ok) throw new Error(`Не удалось прочитать аудио для клипа: ${audioResponse.status}.`);

  const audioBuffer = await audioResponse.arrayBuffer();
  const audioContext = new AudioContext();
  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    await audioContext.close();
    throw new Error('Браузер не смог подготовить canvas для 16:9 клипа.');
  }

  let frameTimer = 0;
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let audioSource: AudioBufferSourceNode | undefined;
  let aborted = false;
  let interruptionError: Error | undefined;
  const handleAbort = () => {
    aborted = true;
    try {
      audioSource?.stop();
    } catch {
      // The source may already have ended.
    }
    if (recorder) stopRecorder(recorder);
  };
  const handleVisibilityChange = () => {
    if (!document.hidden) return;
    interruptionError = new Error('Сборка клипа остановлена: вкладка CANVA STORY ушла в фон. Оставьте её открытой до завершения записи.');
    try {
      audioSource?.stop();
    } catch {
      // The source may already have ended.
    }
    if (recorder) stopRecorder(recorder);
  };
  signal?.addEventListener('abort', handleAbort, { once: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);

  try {
    const decodedAudio = await audioContext.decodeAudioData(audioBuffer.slice(0));
    throwIfAborted(signal);
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = decodedAudio;
    const audioDestination = audioContext.createMediaStreamDestination();
    audioSource.connect(audioDestination);

    drawStillFrame(context, images[0], canvas.width, canvas.height, backgroundImage);
    const canvasStream = canvas.captureStream(VIDEO_FPS);
    stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);
    recorder = createMediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    let startedAt = 0;
    const paintFrame = () => {
      const elapsed = startedAt ? audioContext.currentTime - startedAt : 0;
      const progress = decodedAudio.duration > 0 ? elapsed / decodedAudio.duration : 0;
      const imageProgress = Math.min(0.999999, Math.max(0, progress));
      const segmentIndex = Math.min(images.length - 1, Math.floor(imageProgress * images.length));
      drawStillFrame(
        context,
        images[segmentIndex],
        canvas.width,
        canvas.height,
        backgroundImage,
      );
    };

    const finished = new Promise<Blob>((resolve, reject) => {
      if (!recorder) {
        reject(new Error('Браузер не смог запустить запись клипа.'));
        return;
      }
      recorder.onerror = () => reject(new Error('Браузер остановил запись клипа из-за ошибки.'));
      recorder.onstop = () => {
        if (interruptionError) {
          reject(interruptionError);
          return;
        }
        if (aborted || signal?.aborted) {
          reject(abortError());
          return;
        }
        if (chunks.length === 0) {
          reject(new Error('Кодировщик не вернул данные клипа. Повторите сборку, оставив вкладку открытой.'));
          return;
        }
        resolve(new Blob(chunks, { type: recorder?.mimeType || 'video/webm' }));
      };
      audioSource!.onended = () => stopRecorder(recorder!);
    });

    await audioContext.resume();
    await startRecorder(recorder);
    ensureVisibleDocument();
    startedAt = audioContext.currentTime;
    audioSource.start();
    paintFrame();
    frameTimer = window.setInterval(paintFrame, 1_000 / VIDEO_FPS);

    const blob = await finished;
    return {
      url: URL.createObjectURL(blob),
      format: 'webm',
      renderer: 'browser',
    };
  } finally {
    signal?.removeEventListener('abort', handleAbort);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.clearInterval(frameTimer);
    stream?.getTracks().forEach((track) => track.stop());
    if (recorder && recorder.state !== 'inactive') stopRecorder(recorder);
    await audioContext.close();
  }
};

const createVideoElement = (
  videoUrl: string,
  clipNumber: number,
  signal?: AbortSignal,
) => new Promise<HTMLVideoElement>((resolve, reject) => {
  throwIfAborted(signal);
  const video = document.createElement('video');
  let timeoutId = 0;
  const cleanup = () => {
    window.clearTimeout(timeoutId);
    video.onloadeddata = null;
    video.onerror = null;
    signal?.removeEventListener('abort', handleAbort);
  };
  const fail = (message: string) => {
    cleanup();
    video.removeAttribute('src');
    video.load();
    reject(new Error(message));
  };
  const handleAbort = () => {
    cleanup();
    video.removeAttribute('src');
    video.load();
    reject(abortError());
  };
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = false;
  video.onloadeddata = () => {
    cleanup();
    resolve(video);
  };
  video.onerror = () => fail(`Не удалось загрузить клип №${clipNumber} для сборки ролика.`);
  signal?.addEventListener('abort', handleAbort, { once: true });
  timeoutId = window.setTimeout(
    () => fail(`Клип №${clipNumber} не открылся за ${MEDIA_READY_TIMEOUT_MS / 1_000} секунд.`),
    MEDIA_READY_TIMEOUT_MS,
  );
  video.src = videoUrl;
  video.load();
});

const drawVideoCoverFrame = (
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
) => {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth <= 0 || video.videoHeight <= 0) {
    return false;
  }
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  context.fillStyle = '#101318';
  context.fillRect(0, 0, width, height);
  context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return true;
};

const playVideoToEnd = async (
  video: HTMLVideoElement,
  clipNumber: number,
  signal?: AbortSignal,
) => {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    let watchdogId = 0;
    let lastCurrentTime = video.currentTime;
    let lastProgressAt = Date.now();
    function cleanup() {
      window.clearInterval(watchdogId);
      video.onended = null;
      video.onerror = null;
      signal?.removeEventListener('abort', handleAbort);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    function handleAbort() {
      cleanup();
      video.pause();
      reject(abortError());
    }
    function handleVisibilityChange() {
      if (!document.hidden) return;
      cleanup();
      video.pause();
      reject(new Error('Сборка ролика остановлена: вкладка CANVA STORY ушла в фон. Оставьте её открытой до завершения склейки.'));
    }
    video.onended = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error(`Браузер остановил воспроизведение клипа №${clipNumber}.`));
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    watchdogId = window.setInterval(() => {
      if (video.ended) {
        cleanup();
        resolve();
        return;
      }
      if (video.currentTime > lastCurrentTime + 0.02) {
        lastCurrentTime = video.currentTime;
        lastProgressAt = Date.now();
      }
      if (Date.now() - lastProgressAt > MEDIA_STALL_TIMEOUT_MS) {
        cleanup();
        video.pause();
        reject(new Error(`Клип №${clipNumber} завис на ${video.currentTime.toFixed(1)} с. Пересоберите этот клип и повторите склейку.`));
      }
    }, 1_000);

    video.play().catch((error: unknown) => {
      cleanup();
      reject(new Error(`Не удалось запустить клип №${clipNumber}: ${error instanceof Error ? error.message : String(error)}`));
    });
  });
};

export const buildChapterVideoFromClips = async (
  clipUrls: string[],
  signal?: AbortSignal,
  options?: { requireFfmpeg?: boolean },
): Promise<GeneratedVideo> => {
  if (clipUrls.length === 0) {
    throw new Error('Нет готовых клипов для сборки общего ролика.');
  }
  throwIfAborted(signal);

  const nativeVideo = await tryBuildChapterVideoWithFfmpeg(clipUrls, signal);
  if (nativeVideo) return nativeVideo;
  if (options?.requireFfmpeg) {
    throw new Error('Локальный FFmpeg renderer недоступен. Запустите CANVA STORY через start_canva_story_full_stack.bat.');
  }

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('FFmpeg-сервис недоступен, а браузер не поддерживает MediaRecorder.');
  }
  ensureVisibleDocument();

  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не смог подготовить canvas для общего ролика.');
  context.fillStyle = '#101318';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();
  const canvasStream = canvas.captureStream(VIDEO_FPS);
  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDestination.stream.getAudioTracks(),
  ]);
  const recorder = createMediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let frameTimer = 0;
  let activeVideo: HTMLVideoElement | null = null;
  let aborted = false;
  let interruptionError: Error | undefined;
  const handleAbort = () => {
    aborted = true;
    activeVideo?.pause();
    stopRecorder(recorder);
  };
  const handleVisibilityChange = () => {
    if (!document.hidden) return;
    interruptionError = new Error('Сборка ролика остановлена: вкладка CANVA STORY ушла в фон. Оставьте её открытой до завершения склейки.');
    activeVideo?.pause();
    stopRecorder(recorder);
  };
  signal?.addEventListener('abort', handleAbort, { once: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const paintFrame = () => {
    if (activeVideo) drawVideoCoverFrame(context, activeVideo, canvas.width, canvas.height);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Браузер остановил запись общего ролика из-за ошибки.'));
    recorder.onstop = () => {
      if (interruptionError) {
        reject(interruptionError);
        return;
      }
      if (aborted || signal?.aborted) {
        reject(abortError());
        return;
      }
      if (chunks.length === 0) {
        reject(new Error('Кодировщик не вернул данные общего ролика. Оставьте вкладку открытой и повторите сборку.'));
        return;
      }
      resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
    };
  });

  try {
    let nextVideo = await createVideoElement(clipUrls[0], 1, signal);
    activeVideo = nextVideo;
    if (!drawVideoCoverFrame(context, nextVideo, canvas.width, canvas.height)) {
      throw new Error('Клип №1 не содержит декодируемого видеокадра.');
    }

    await audioContext.resume();
    await startRecorder(recorder);
    ensureVisibleDocument();
    frameTimer = window.setInterval(paintFrame, 1_000 / VIDEO_FPS);

    for (let index = 0; index < clipUrls.length; index += 1) {
      throwIfAborted(signal);
      ensureVisibleDocument();
      const video = nextVideo;
      const followingVideoPromise = index + 1 < clipUrls.length
        ? createVideoElement(clipUrls[index + 1], index + 2, signal).then(
          (loadedVideo) => ({ loadedVideo }),
          (loadError: unknown) => ({
            loadError: loadError instanceof Error ? loadError : new Error(String(loadError)),
          }),
        )
        : undefined;
      activeVideo = video;
      const source = audioContext.createMediaElementSource(video);
      source.connect(audioDestination);
      try {
        if (!drawVideoCoverFrame(context, video, canvas.width, canvas.height)) {
          throw new Error(`Клип №${index + 1} не содержит декодируемого видеокадра.`);
        }
        await playVideoToEnd(video, index + 1, signal);
      } finally {
        activeVideo = null;
        source.disconnect();
        video.pause();
        video.removeAttribute('src');
        video.load();
      }

      if (followingVideoPromise) {
        recorder.pause();
        const followingVideo = await followingVideoPromise;
        if ('loadError' in followingVideo) throw followingVideo.loadError;
        nextVideo = followingVideo.loadedVideo;
        activeVideo = nextVideo;
        if (!drawVideoCoverFrame(context, nextVideo, canvas.width, canvas.height)) {
          throw new Error(`Клип №${index + 2} не содержит декодируемого видеокадра.`);
        }
        recorder.resume();
      }
    }

    stopRecorder(recorder);
    const blob = await finished;
    return {
      url: URL.createObjectURL(blob),
      format: 'webm',
      renderer: 'browser',
    };
  } finally {
    signal?.removeEventListener('abort', handleAbort);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.clearInterval(frameTimer);
    stream.getTracks().forEach((track) => track.stop());
    if (recorder.state !== 'inactive') stopRecorder(recorder);
    activeVideo?.pause();
    await audioContext.close();
  }
};
