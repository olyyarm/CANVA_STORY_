import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';

const HOST = process.env.CANVA_VIDEO_RENDER_HOST || '127.0.0.1';
const PORT = Number(process.env.CANVA_VIDEO_RENDER_PORT || 4317);
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const JOB_TTL_MS = 60 * 60 * 1000;
const MAX_JSON_BYTES = 1024 * 1024;
const jobsRoot = join(tmpdir(), 'canva-story-video-renderer');
const jobs = new Map();

const setCors = (response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
};

const sendJson = (response, statusCode, payload) => {
  setCors(response);
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};

const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new Error('JSON request is too large.');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const runProcess = (command, args, options = {}) => new Promise((resolvePromise, rejectPromise) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (options.job) options.job.process = child;
  const stdout = [];
  const stderr = [];
  const append = (target, chunk) => {
    target.push(chunk);
    if (target.length > 80) target.shift();
  };
  child.stdout.on('data', (chunk) => append(stdout, chunk));
  child.stderr.on('data', (chunk) => append(stderr, chunk));
  child.on('error', (error) => rejectPromise(error));
  child.on('close', (code) => {
    if (options.job) options.job.process = undefined;
    const output = Buffer.concat(stdout).toString('utf8').trim();
    const errorOutput = Buffer.concat(stderr).toString('utf8').trim();
    if (code === 0 || options.allowNonZero) {
      resolvePromise({ stdout: output, stderr: errorOutput, code });
      return;
    }
    const details = errorOutput.split(/\r?\n/u).slice(-12).join('\n');
    rejectPromise(new Error(`${command} exited with code ${code}${details ? `:\n${details}` : ''}`));
  });
});

let binaryCheckPromise;
const checkBinaries = async () => {
  if (!binaryCheckPromise) {
    binaryCheckPromise = runProcess(FFMPEG_PATH, ['-version']).then((ffmpeg) => ({
      ok: true,
      ffmpeg: ffmpeg.stdout.split(/\r?\n/u)[0] || FFMPEG_PATH,
    })).catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  return binaryCheckPromise;
};

const contentTypeExtension = (contentType = '') => {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  const extensions = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'audio/flac': '.flac',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'audio/webm': '.webm',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
  };
  return extensions[normalized] || '.bin';
};

const getJob = (jobId) => jobs.get(jobId);

const createJob = async () => {
  const id = randomUUID();
  const directory = join(jobsRoot, id);
  await mkdir(directory, { recursive: true });
  const job = {
    id,
    directory,
    assets: new Map(),
    status: 'uploading',
    stage: 'Ожидаем файлы',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
};

const removeJob = async (job) => {
  if (!job) return;
  if (job.process && !job.process.killed) job.process.kill();
  jobs.delete(job.id);
  await rm(job.directory, { recursive: true, force: true });
};

const quoteConcatPath = (path) => path.replace(/\\/gu, '/').replace(/'/gu, "'\\''");

const writeConcatList = async (job, paths, filename) => {
  const listPath = join(job.directory, filename);
  const lines = paths.map((path) => `file '${quoteConcatPath(resolve(path))}'`).join('\n');
  await writeFile(listPath, `${lines}\n`, 'utf8');
  return listPath;
};

const probeDuration = async (path, job) => {
  const result = await runProcess(FFMPEG_PATH, [
    '-hide_banner', '-nostdin', '-i',
    path,
  ], { cwd: job.directory, job, allowNonZero: true });
  const match = result.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/u);
  const duration = match
    ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    : Number.NaN;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('FFmpeg не смог определить длительность озвучки.');
  }
  return duration;
};

const renderStillSegment = async ({ job, imagePath, backgroundPath, outputPath, duration }) => {
  const width = 1280;
  const height = 720;
  const fps = 24;
  const frameCount = Math.max(2, Math.round(duration * fps));
  const lastFrame = frameCount - 1;
  const foregroundStartScale = 0.9;
  const foregroundEndScale = 0.84;
  const foregroundScaleDelta = foregroundStartScale - foregroundEndScale;
  const animatedForegroundScale =
    `scale=w='trunc(iw*min(${width}/iw\\,${height}/ih)*`+
    `(${foregroundStartScale}-${foregroundScaleDelta}*n/${lastFrame})/2)*2':`+
    'h=-2:eval=frame,setsar=1[fg]';
  const compositeFilter =
    `[bg][fg]overlay=x='(W-w)/2':y='(H-h)/2':eval=frame:shortest=1,`+
    'format=yuv420p[v]';
  const args = [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-loop', '1', '-framerate', String(fps), '-i', imagePath,
  ];
  let filter;
  if (backgroundPath) {
    args.push('-loop', '1', '-framerate', String(fps), '-i', backgroundPath);
    filter = [
      `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,`+
        `crop=${width}:${height},setsar=1[bg]`,
      `[0:v]${animatedForegroundScale}`,
      compositeFilter,
    ].join(';');
  } else {
    filter = [
      '[0:v]split=2[bgsrc][fgsrc]',
      `[bgsrc]scale=${width}:${height}:force_original_aspect_ratio=increase,`+
        `crop=${width}:${height},gblur=sigma=24,setsar=1[bg]`,
      `[fgsrc]${animatedForegroundScale}`,
      compositeFilter,
    ].join(';');
  }
  args.push(
    '-filter_complex', filter,
    '-map', '[v]',
    '-t', duration.toFixed(3),
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-y', outputPath,
  );
  await runProcess(FFMPEG_PATH, args, { cwd: job.directory, job });
};

const renderScene = async (job, payload) => {
  const imageNames = Array.isArray(payload.imageNames) ? payload.imageNames : [];
  if (imageNames.length === 0) throw new Error('В задании сцены нет изображений.');
  const imagePaths = imageNames.map((name) => job.assets.get(name)).filter(Boolean);
  const audioPath = job.assets.get(payload.audioName || 'audio');
  const backgroundPath = payload.backgroundName ? job.assets.get(payload.backgroundName) : undefined;
  if (imagePaths.length !== imageNames.length) throw new Error('Не все изображения сцены загружены.');
  if (!audioPath) throw new Error('Озвучка сцены не загружена.');

  job.stage = 'Определяем длительность озвучки';
  job.progress = 0.05;
  const audioDuration = await probeDuration(audioPath, job);
  const segmentDuration = Math.max(0.1, audioDuration / imagePaths.length);
  const segmentPaths = [];
  for (let index = 0; index < imagePaths.length; index += 1) {
    job.stage = `FFmpeg: кадр ${index + 1}/${imagePaths.length}`;
    job.progress = 0.1 + (index / imagePaths.length) * 0.7;
    const segmentPath = join(job.directory, `segment-${String(index).padStart(3, '0')}.mp4`);
    await renderStillSegment({
      job,
      imagePath: imagePaths[index],
      backgroundPath,
      outputPath: segmentPath,
      duration: segmentDuration,
    });
    segmentPaths.push(segmentPath);
  }

  job.stage = 'FFmpeg: добавляем озвучку';
  job.progress = 0.85;
  const listPath = await writeConcatList(job, segmentPaths, 'segments.txt');
  const outputPath = join(job.directory, 'output.mp4');
  await runProcess(FFMPEG_PATH, [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-i', audioPath,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '160k',
    '-shortest', '-movflags', '+faststart',
    '-y', outputPath,
  ], { cwd: job.directory, job });
  return outputPath;
};

const renderConcat = async (job, payload) => {
  const clipNames = Array.isArray(payload.clipNames) ? payload.clipNames : [];
  if (clipNames.length === 0) throw new Error('В задании нет клипов для склейки.');
  const clipPaths = clipNames.map((name) => job.assets.get(name)).filter(Boolean);
  if (clipPaths.length !== clipNames.length) throw new Error('Не все клипы загружены.');
  const listPath = await writeConcatList(job, clipPaths, 'clips.txt');
  const outputPath = join(job.directory, 'output.mp4');
  const allMp4 = clipPaths.every((path) => extname(path).toLowerCase() === '.mp4');

  job.stage = `FFmpeg: склеиваем ${clipPaths.length} клипов`;
  job.progress = 0.35;
  const codecArgs = allMp4
    ? ['-c', 'copy']
    : [
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k',
    ];
  await runProcess(FFMPEG_PATH, [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    ...codecArgs,
    '-movflags', '+faststart',
    '-y', outputPath,
  ], { cwd: job.directory, job });
  return outputPath;
};

const startRender = (job, payload) => {
  job.status = 'running';
  job.stage = 'Запускаем FFmpeg';
  job.progress = 0.01;
  job.updatedAt = Date.now();
  Promise.resolve()
    .then(() => payload.mode === 'scene' ? renderScene(job, payload) : renderConcat(job, payload))
    .then((outputPath) => {
      job.outputPath = outputPath;
      job.status = 'done';
      job.stage = 'Готово';
      job.progress = 1;
      job.updatedAt = Date.now();
    })
    .catch((error) => {
      job.status = 'error';
      job.stage = 'Ошибка FFmpeg';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = Date.now();
    });
};

const jobPayload = (job) => ({
  id: job.id,
  status: job.status,
  stage: job.stage,
  progress: job.progress,
  error: job.error,
});

await mkdir(jobsRoot, { recursive: true });

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      setCors(response);
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
    if (request.method === 'GET' && url.pathname === '/health') {
      const health = await checkBinaries();
      sendJson(response, health.ok ? 200 : 503, health);
      return;
    }
    if (request.method === 'POST' && url.pathname === '/jobs') {
      const health = await checkBinaries();
      if (!health.ok) {
        sendJson(response, 503, health);
        return;
      }
      const job = await createJob();
      sendJson(response, 201, jobPayload(job));
      return;
    }

    const assetMatch = url.pathname.match(/^\/jobs\/([0-9a-f-]+)\/assets\/([a-z0-9-]+)$/u);
    if (request.method === 'PUT' && assetMatch) {
      const [, jobId, assetName] = assetMatch;
      const job = getJob(jobId);
      if (!job || job.status === 'running') {
        sendJson(response, job ? 409 : 404, { error: job ? 'Задание уже запущено.' : 'Задание не найдено.' });
        return;
      }
      const extension = contentTypeExtension(request.headers['content-type']);
      const path = join(job.directory, `${assetName}${extension}`);
      await pipeline(request, createWriteStream(path));
      job.assets.set(assetName, path);
      job.updatedAt = Date.now();
      sendJson(response, 201, { ok: true, name: assetName });
      return;
    }

    const renderMatch = url.pathname.match(/^\/jobs\/([0-9a-f-]+)\/render$/u);
    if (request.method === 'POST' && renderMatch) {
      const job = getJob(renderMatch[1]);
      if (!job) {
        sendJson(response, 404, { error: 'Задание не найдено.' });
        return;
      }
      if (job.status === 'running') {
        sendJson(response, 409, { error: 'Задание уже выполняется.' });
        return;
      }
      const payload = await readJson(request);
      if (payload.mode !== 'scene' && payload.mode !== 'concat') {
        sendJson(response, 400, { error: 'Неизвестный режим рендера.' });
        return;
      }
      startRender(job, payload);
      sendJson(response, 202, jobPayload(job));
      return;
    }

    const outputMatch = url.pathname.match(/^\/jobs\/([0-9a-f-]+)\/output$/u);
    if (request.method === 'GET' && outputMatch) {
      const job = getJob(outputMatch[1]);
      if (!job?.outputPath || job.status !== 'done') {
        sendJson(response, job ? 409 : 404, { error: job ? 'Ролик ещё не готов.' : 'Задание не найдено.' });
        return;
      }
      const info = await stat(job.outputPath);
      setCors(response);
      response.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': String(info.size),
        'Cache-Control': 'no-store',
      });
      createReadStream(job.outputPath).pipe(response);
      return;
    }

    const jobMatch = url.pathname.match(/^\/jobs\/([0-9a-f-]+)$/u);
    if (request.method === 'GET' && jobMatch) {
      const job = getJob(jobMatch[1]);
      sendJson(response, job ? 200 : 404, job ? jobPayload(job) : { error: 'Задание не найдено.' });
      return;
    }
    if (request.method === 'DELETE' && jobMatch) {
      const job = getJob(jobMatch[1]);
      await removeJob(job);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { error: 'Маршрут не найден.' });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const job of jobs.values()) {
    if (job.updatedAt < cutoff) void removeJob(job);
  }
}, 10 * 60 * 1000);
cleanupTimer.unref();

server.listen(PORT, HOST, async () => {
  const health = await checkBinaries();
  console.log(`CANVA STORY video renderer: http://${HOST}:${PORT}`);
  if (health.ok) {
    console.log(health.ffmpeg);
  } else {
    console.error(`FFmpeg is not ready: ${health.error}`);
  }
});

const shutdown = async () => {
  server.close();
  await Promise.all([...jobs.values()].map((job) => removeJob(job)));
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
