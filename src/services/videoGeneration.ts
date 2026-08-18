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
  backgroundImage?: HTMLImageElement,
) => {
  const easedProgress = Math.min(1, Math.max(0, progress));
  const centerX = width / 2;
  const centerY = height / 2;
  const backdrop = backgroundImage ?? image;
  const coverScale = Math.max(width / backdrop.naturalWidth, height / backdrop.naturalHeight);
  const backgroundScale = coverScale * 1.5;
  const backgroundDrift = (easedProgress - 0.5) * 28;

  context.fillStyle = '#101318';
  context.fillRect(0, 0, width, height);
  context.save();
  context.filter = 'blur(28px)';
  drawCenteredImage(
    context,
    backdrop,
    centerX + backgroundDrift,
    centerY - backgroundDrift * 0.35,
    backdrop.naturalWidth * backgroundScale,
    backdrop.naturalHeight * backgroundScale,
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

export const buildStillImagesVideoClip = async (
  imageUrls: string[],
  audioUrl: string,
  options?: AbortSignal | { signal?: AbortSignal; backgroundImageUrl?: string },
) => {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Браузер не поддерживает MediaRecorder, поэтому не может собрать клип.');
  }
  const signal = options && 'aborted' in options ? options : options?.signal;
  const backgroundImageUrl = options && !('aborted' in options) ? options.backgroundImageUrl : undefined;
  const usableImageUrls = imageUrls.filter(Boolean);
  if (usableImageUrls.length === 0) {
    throw new Error('Нет картинки для сборки 16:9 клипа.');
  }

  const [images, backgroundImage, audioResponse] = await Promise.all([
    Promise.all(usableImageUrls.map((imageUrl) => loadImageElement(imageUrl))),
    backgroundImageUrl ? loadImageElement(backgroundImageUrl) : Promise.resolve(undefined),
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
  drawAnimatedStillFrame(context, images[0], canvas.width, canvas.height, 0, backgroundImage);

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
    const imageProgress = Math.min(0.999999, Math.max(0, progress));
    const segmentIndex = Math.min(images.length - 1, Math.floor(imageProgress * images.length));
    const segmentProgress = (imageProgress * images.length) - segmentIndex;
    drawAnimatedStillFrame(context, images[segmentIndex], canvas.width, canvas.height, segmentProgress, backgroundImage);
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

export const buildChapterVideoFromClips = async (
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
