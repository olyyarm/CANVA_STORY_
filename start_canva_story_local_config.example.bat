@echo off
rem Copy this file to start_canva_story_local_config.bat and edit it for one PC.
rem The local file is ignored by git, so paths and secrets will not be committed.

set "COMFY_ROOT=E:\COMFY\ComfyUI-StableDif-t27-p312-cu128-v2.1v4"
set "JS_PACKAGE_MANAGER=npm"
set "JS_DEV_COMMAND=npm run dev --"
rem Direct ElevenLabs API key. Keep the real value only in the ignored local config.
set "ELEVENLABS_API_KEY="
rem Direct OpenAI API key for GPT-5.6 Luna and GPT Image 2. Never put the real key in this example file.
set "OPENAI_API_KEY="
