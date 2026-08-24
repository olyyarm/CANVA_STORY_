# CANVA STORY: запуск на новом компьютере

Эта памятка нужна для второго компьютера, например рабочего ноутбука. Репозиторий содержит приложение, но не содержит тяжелые модели, ComfyUI, LM Studio, ключи и локальные отрендеренные ассеты.

## 1. Что должно быть установлено

- Git.
- Node.js 20 или новее.
- LM Studio, если нужен локальный текстовый режим.
- ComfyUI, если нужна генерация изображений, композ, OmniVoice или Gemini/Nano Banana через ComfyUI.
- FFmpeg и FFprobe для фоновой сборки клипов и роликов. Батник автоматически использует их из сборки ComfyUI, если они там есть.
- Модели и custom nodes ComfyUI, которые используются в текущем проекте.

Минимально для нашего рабочего пайплайна обычно нужны:

- Z-Image Turbo для персонажей и локаций;
- Nano Banana / Gemini ComfyUI-ноды для композа;
- ERNIE Image Turbo для системных вставок, если они используются;
- OmniVoice-ноды для озвучки;
- Comfy.org API key для API-нод вроде Nano Banana/Gemini.

## 2. Скачать проект

```bash
git clone https://github.com/olyyarm/CANVA_STORY_.git
cd CANVA_STORY_
npm ci
```

Если на домашнем компьютере есть незапушенные изменения, их сначала нужно закоммитить и запушить. Иначе рабочий компьютер скачает старую версию.

## 3. Настроить общий батник

Откройте файл:

```text
start_canva_story_full_stack.bat
```

В верхнем блоке проверьте пути:

```bat
set "LM_STUDIO_EXE=D:\SD\LM Studio\LM Studio.exe"
set "COMFY_ROOT=D:\ComfyUI-Omnivorous-T2.6-P312-Cu126"
```

На новом компьютере замените их на реальные пути. Например:

```bat
set "LM_STUDIO_EXE=C:\Users\Olya\AppData\Local\Programs\LM Studio\LM Studio.exe"
set "COMFY_ROOT=D:\ComfyUI-Omnivorous-T2.6-P312-Cu126"
```

Путь `COMFY_ROOT` должен указывать на папку, внутри которой есть:

```text
python_embeded\python.exe
ComfyUI\main.py
```

После этого можно запускать:

```text
start_canva_story_full_stack.bat
```

Батник поднимет:

- LM Studio server на `http://localhost:1234`;
- ComfyUI на `http://localhost:8188` с CORS;
- локальный FFmpeg renderer на `http://localhost:4317`;
- CANVA STORY на `http://localhost:5173/CANVA_STORY_/`.

## 4. Настройки внутри CANVA STORY

В верхней панели приложения:

- текстовый режим: `LM Studio` или `Gemini · ComfyUI`;
- LM Studio endpoint: `http://localhost:1234`;
- ComfyUI endpoint: `http://localhost:8188`;
- Comfy.org API key: вставить локально в поле, если нужны Nano Banana/Gemini/другие Comfy API-ноды.

Ключи хранятся только в localStorage конкретного браузера. Их не надо коммитить в git.

## 5. Перенос проекта между компьютерами

Код переносится через git.

Рабочий canvas лучше переносить через экспорт/импорт JSON из приложения. Если в проекте уже есть сгенерированные картинки, аудио и клипы, нужно также учитывать, где они физически сохранены:

- часть данных живет в браузерном хранилище конкретного компьютера;
- часть готовых файлов лежит в output/input папках ComfyUI;
- модели лежат отдельно в папках ComfyUI или общей папке моделей.

Поэтому для надежного продолжения работы:

1. Запушить код в GitHub.
2. Экспортировать JSON проекта из CANVA STORY.
3. При необходимости перенести нужные файлы из ComfyUI `output`.
4. На новом компьютере импортировать JSON проекта.

## 6. Частые проблемы

Если CANVA STORY пишет, что не может подключиться к ComfyUI:

- проверьте, что открыт `http://localhost:8188/system_stats`;
- проверьте, что ComfyUI запущен с `--enable-cors-header *`;
- если порт 8188 занят старым ComfyUI без CORS, закройте его и запустите батник снова.

Если LM Studio не отвечает:

- откройте LM Studio один раз вручную;
- убедитесь, что модель скачана;
- запустите `start_canva_story_full_stack.bat` снова;
- проверьте endpoint `http://localhost:1234`.

Если кнопка «Собрать главу целиком» сообщает, что FFmpeg renderer не запустился:

- проверьте отдельное окно `CANVA STORY FFmpeg renderer`;
- откройте `http://localhost:4317/health` — ответ должен содержать `"ok": true`;
- если FFmpeg лежит не внутри ComfyUI, задайте `FFMPEG_PATH` и `FFPROBE_PATH` в `start_canva_story_local_config.bat`.

Если Gemini через ComfyUI падает с `missing required positional argument: model`, см.:

```text
docs\troubleshooting\comfy-gemini-dynamiccombo.md
```

и проверьте workflow командой:

```bash
npm run check:comfy-gemini
```
