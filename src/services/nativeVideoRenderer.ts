const DEFAULT_ENDPOINT = 'http://127.0.0.1:4317';
const HEALTH_TIMEOUT_MS = 1_500;
const POLL_INTERVAL_MS = 800;

export interface GeneratedVideo {
  url: string;
  format: 'mp4' | 'webm';
  renderer: 'ffmpeg' | 'browser';
}

interface RenderJob {
  id: string;
  status: 'uploading' | 'running' | 'done' | 'error';
  stage?: string;
  progress?: number;
  error?: string;
}

const rendererEndpoint = () => (
  import.meta.env.VITE_VIDEO_RENDERER_ENDPOINT?.trim() || DEFAULT_ENDPOINT
).replace(/\/+$/u, '');

const abortError = () => new DOMException('Aborted', 'AbortError');

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const responseError = async (response: Response) => {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const requestJson = async <Result>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<Result> => {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${rendererEndpoint()}${path}`, {
    ...init,
    signal,
    headers,
  });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<Result>;
};

export const isNativeVideoRendererAvailable = async () => {
  try {
    const response = await fetchWithTimeout(`${rendererEndpoint()}/health`, HEALTH_TIMEOUT_MS);
    if (!response.ok) return false;
    const payload = await response.json() as { ok?: boolean };
    return payload.ok === true;
  } catch {
    return false;
  }
};

const createJob = (signal?: AbortSignal) => requestJson<RenderJob>('/jobs', {
  method: 'POST',
  body: '{}',
}, signal);

const removeJob = async (jobId: string) => {
  try {
    await fetch(`${rendererEndpoint()}/jobs/${jobId}`, { method: 'DELETE' });
  } catch {
    // The local server also expires abandoned jobs automatically.
  }
};

const loadBlob = async (url: string, signal?: AbortSignal) => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Не удалось прочитать медиафайл для FFmpeg: ${response.status}.`);
  return response.blob();
};

const uploadAsset = async (jobId: string, name: string, blob: Blob, signal?: AbortSignal) => {
  const response = await fetch(`${rendererEndpoint()}/jobs/${jobId}/assets/${name}`, {
    method: 'PUT',
    signal,
    headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!response.ok) throw new Error(await responseError(response));
};

const waitForJob = async (jobId: string, signal?: AbortSignal) => {
  while (true) {
    if (signal?.aborted) throw abortError();
    const job = await requestJson<RenderJob>(`/jobs/${jobId}`, {}, signal);
    if (job.status === 'done') return;
    if (job.status === 'error') throw new Error(job.error || 'FFmpeg остановился из-за ошибки.');
    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(resolve, POLL_INTERVAL_MS);
      signal?.addEventListener('abort', () => {
        window.clearTimeout(timeoutId);
        reject(abortError());
      }, { once: true });
    });
  }
};

const downloadResult = async (jobId: string, signal?: AbortSignal): Promise<GeneratedVideo> => {
  const response = await fetch(`${rendererEndpoint()}/jobs/${jobId}/output`, { signal });
  if (!response.ok) throw new Error(await responseError(response));
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('FFmpeg вернул пустой ролик.');
  return {
    url: URL.createObjectURL(blob),
    format: 'mp4',
    renderer: 'ffmpeg',
  };
};

const renderJob = async (
  job: RenderJob,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => {
  await requestJson<RenderJob>(`/jobs/${job.id}/render`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, signal);
  await waitForJob(job.id, signal);
  return downloadResult(job.id, signal);
};

export const tryBuildStillImagesVideoClipWithFfmpeg = async (
  imageUrls: string[],
  audioUrl: string,
  options?: { signal?: AbortSignal; backgroundImageUrl?: string },
): Promise<GeneratedVideo | null> => {
  if (!await isNativeVideoRendererAvailable()) return null;
  const job = await createJob(options?.signal);
  try {
    const imageNames: string[] = [];
    for (let index = 0; index < imageUrls.length; index += 1) {
      const name = `image-${index}`;
      imageNames.push(name);
      await uploadAsset(job.id, name, await loadBlob(imageUrls[index], options?.signal), options?.signal);
    }
    await uploadAsset(job.id, 'audio', await loadBlob(audioUrl, options?.signal), options?.signal);
    let backgroundName: string | undefined;
    if (options?.backgroundImageUrl) {
      backgroundName = 'background';
      await uploadAsset(
        job.id,
        backgroundName,
        await loadBlob(options.backgroundImageUrl, options.signal),
        options.signal,
      );
    }
    return await renderJob(job, {
      mode: 'scene',
      imageNames,
      audioName: 'audio',
      ...(backgroundName ? { backgroundName } : {}),
    }, options?.signal);
  } finally {
    await removeJob(job.id);
  }
};

export const tryBuildChapterVideoWithFfmpeg = async (
  clipUrls: string[],
  signal?: AbortSignal,
): Promise<GeneratedVideo | null> => {
  if (!await isNativeVideoRendererAvailable()) return null;
  const job = await createJob(signal);
  try {
    const clipNames: string[] = [];
    for (let index = 0; index < clipUrls.length; index += 1) {
      const name = `clip-${index}`;
      clipNames.push(name);
      await uploadAsset(job.id, name, await loadBlob(clipUrls[index], signal), signal);
    }
    return await renderJob(job, { mode: 'concat', clipNames }, signal);
  } finally {
    await removeJob(job.id);
  }
};
