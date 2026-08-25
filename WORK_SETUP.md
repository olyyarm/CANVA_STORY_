# CANVA STORY: запуск на новом компьютере

Эта памятка нужна для второго компьютера, например рабочего ноутбука. Репозиторий содержит приложение, но не содержит тяжелые модели, ComfyUI, LM Studio, ключи и локальные отрендеренные ассеты.

## 1. Что должно быть установлено

- Git.
- Node.js 20 или новее.
- LM Studio, если нужен локальный текстовый режим.
- ComfyUI, если нужна генерация изображений, композ, OmniVoice или Gemini/Nano Banana через ComfyUI.
- FFmpeg для фоновой сборки клипов и роликов. Батник автоматически использует его из сборки ComfyUI, если он там есть; отдельный FFprobe не нужен.
- Модели и custom nodes ComfyUI, которые используются в текущем проекте.

Минимально для нашего рабочего пайплайна обычно нужны:

- Z-Image Turbo для персонажей и локаций;
- Nano Banana / Gemini ComfyUI-ноды для композа;
- ERNIE Image Turbo для системных вставок, если они используются;
- `ComfyUI-OmniVoice-TTS` и одна или обе модели OmniVoice для озвучки;
- Comfy.org API key для API-нод вроде Nano Banana/Gemini.

### OmniVoice для озвучки

Нужная нода — [`Saganaki22/ComfyUI-OmniVoice-TTS`](https://github.com/Saganaki22/ComfyUI-OmniVoice-TTS). Устанавливайте её через ComfyUI Manager по запросу `OmniVoice` или запускайте именно официальный `install.py`. Не выполняйте обычный `pip install omnivoice` без `--no-deps`: это может заменить CUDA-сборку PyTorch.

CANVA STORY поддерживает обе официальные модели: быструю `OmniVoice-bf16` (около 2 ГБ) и полную `OmniVoice` FP32 (около 4 ГБ). Они хранятся в `ComfyUI/models/omnivoice/`. Официальная нода умеет автоматически скачать выбранную модель при первом использовании; первый запуск полной модели поэтому может занять заметно больше времени. Для Voice Design Whisper не требуется.

В верхней секции «Озвучка» выбираются модель, качество 32/48/64 шага, постоянный seed и режим голоса. В Voice Design используйте только официальные теги OmniVoice: встроенная рулетка уже собирает безопасные мужские комбинации без тега акцента. Стартовый вариант — `male, middle-aged, very low pitch`. Отдельного тега хрипотцы в OmniVoice 0.2.1 нет. Для точной хрипотцы включите `Voice Clone`, выберите чистый фрагмент речи длительностью примерно 3–15 секунд и впишите его дословную расшифровку. Тогда Whisper также не потребуется. Референс сохраняется в AssetStore проекта и переносится на другой компьютер внутри `.canva-story.zip`.

Стартовый батник автоматически добавляет в `PATH` FFmpeg из `was-node-suite-comfyui`, если он уже установлен в этой сборке ComfyUI.

## 2. Скачать проект

```bash
git clone https://github.com/olyyarm/CANVA_STORY_.git
cd CANVA_STORY_
npm ci
```

Если на домашнем компьютере есть незапушенные изменения, их сначала нужно закоммитить и запушить. Иначе рабочий компьютер скачает старую версию.

## 3. Настроить локальный конфиг запуска

Откройте файл:

```text
start_canva_story_full_stack.bat
```

В верхнем блоке проверьте пути:

```bat
set "LM_STUDIO_EXE=D:\SD\LM Studio\LM Studio.exe"
set "COMFY_ROOT=D:\ComfyUI-Omnivorous-T2.6-P312-Cu126"
```

Удобнее не менять общий батник, а один раз создать локальный конфиг:

```bat
copy start_canva_story_local_config.example.bat start_canva_story_local_config.bat
```

Этот файл игнорируется git. В нём можно безопасно хранить пути конкретного компьютера:

```bat
set "COMFY_ROOT=E:\COMFY\ComfyUI-StableDif-t27-p312-cu128-v2.1v4"
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
- секция «Озвучка»: для обычной работы оставить BF16/32 шага; для финального дубля выбрать полную FP32 и 48–64 шага. «Другой дубль» меняет seed, а не описание голоса;
- в нодах «Герои», «Локации» и «Системные вставки»: `Рендер → Comfy API · GPT Image 2 Low`, если нужен недорогой облачный рендер через единый Comfy.org-ключ; этот режим не скачивает результат с отдельного CDN провайдера;
- в ноде «Таймлайн»: по умолчанию оставить `Ассеты → Comfy API · GPT Image 2 Low`; локальный pipeline используется только после явного выбора. Если сцен ещё нет, нажать «Подготовить главу» для разбивки, материала и автосборки сцен; после этого команда станет называться «Добрать недостающее» и применит тот же выбор к персонажам, общим локациям и недостающим фонам сцен;
- только в «Системных вставках»: `Рендер → Nano Banana 2 Lite API`, если нужен более умный облачный рендер через уже подключённую Comfy Partner-ноду. ComfyUI должен быть запущен, но локальная модель изображения не загружается.

Ключи хранятся только в localStorage конкретного браузера. Их не надо коммитить в git.

## 5. Перенос проекта между компьютерами

Код переносится через git.

Рабочий canvas вместе с изображениями, озвучкой, клипами и референсом Voice Clone переносится кнопкой «Сохранить проект». Она создаёт `.canva-story.zip`; на другом компьютере откройте его кнопкой «Открыть проект». «Экспорт JSON» переносит только структуру и не содержит тяжёлых медиа.

Модели ComfyUI в пакет проекта не входят: их устанавливают отдельно на каждом компьютере.

Для надёжного продолжения работы:

1. Запушить код в GitHub.
2. Скачать переносимый `.canva-story.zip` из приложения.
3. На новом компьютере открыть этот пакет в CANVA STORY.
4. Проверить, что нужные модели и custom nodes установлены в местной сборке ComfyUI.

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
- если FFmpeg лежит не внутри ComfyUI, задайте `FFMPEG_PATH` в `start_canva_story_local_config.bat`.

Если Gemini через ComfyUI падает с `missing required positional argument: model`, см.:

```text
docs\troubleshooting\comfy-gemini-dynamiccombo.md
```

и проверьте workflow командой:

```bash
npm run check:comfy-gemini
```
