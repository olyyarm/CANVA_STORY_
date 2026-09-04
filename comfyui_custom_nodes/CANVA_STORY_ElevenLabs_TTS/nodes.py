import json
import os
import random
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

from comfy_extras.nodes_audio import load as load_audio


ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech"
RETRYABLE_HTTP_STATUS = {429, 500, 502, 503, 504}


def _read_error_body(error):
    try:
        raw = error.read().decode("utf-8", errors="replace")
        parsed = json.loads(raw)
        detail = parsed.get("detail") if isinstance(parsed, dict) else None
        if isinstance(detail, dict):
            return str(detail.get("message") or detail.get("status") or raw)
        return str(detail or raw)
    except Exception:
        return str(error)


def _extension_for_output_format(output_format):
    if output_format.startswith("mp3_"):
        return ".mp3"
    if output_format.startswith("pcm_"):
        return ".wav"
    return ".audio"


class CanvaStoryElevenLabsTTS:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "dynamicPrompts": False}),
                "voice_id": ("STRING", {"default": ""}),
                "model_id": ([
                    "eleven_multilingual_v2",
                    "eleven_v3",
                    "eleven_flash_v2_5",
                ], {"default": "eleven_multilingual_v2"}),
                "speed": ("FLOAT", {"default": 0.9, "min": 0.7, "max": 1.2, "step": 0.01}),
                "stability": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "similarity_boost": ("FLOAT", {"default": 0.75, "min": 0.0, "max": 1.0, "step": 0.01}),
                "style": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "use_speaker_boost": ("BOOLEAN", {"default": True}),
                "apply_text_normalization": (["auto", "on", "off"], {"default": "auto"}),
                "language_code": ("STRING", {"default": "ru"}),
                "seed": ("INT", {"default": 1, "min": 0, "max": 4294967295}),
                "output_format": ([
                    "mp3_22050_32",
                    "mp3_44100_128",
                    "mp3_44100_192",
                    "pcm_44100",
                ], {"default": "mp3_44100_128"}),
            },
            "optional": {
                "previous_text": ("STRING", {"multiline": True, "default": ""}),
                "next_text": ("STRING", {"multiline": True, "default": ""}),
                "pronunciation_dictionary_id": ("STRING", {"default": ""}),
                "pronunciation_dictionary_version_id": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "generate"
    CATEGORY = "CANVA STORY/Audio"
    DESCRIPTION = "Direct ElevenLabs API TTS. Uses ELEVENLABS_API_KEY and never Comfy Partner Credits."

    def generate(
        self,
        text,
        voice_id,
        model_id,
        speed,
        stability,
        similarity_boost,
        style,
        use_speaker_boost,
        apply_text_normalization,
        language_code,
        seed,
        output_format,
        previous_text="",
        next_text="",
        pronunciation_dictionary_id="",
        pronunciation_dictionary_version_id="",
    ):
        api_key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError(
                "ELEVENLABS_API_KEY is not configured. Add it to "
                "start_canva_story_local_config.bat and restart the full local stack."
            )
        voice_id = voice_id.strip()
        if not voice_id:
            raise ValueError("ElevenLabs voice_id is empty.")
        text = text.strip()
        if not text:
            raise ValueError("The TTS text is empty.")
        character_limits = {
            "eleven_v3": 5000,
            "eleven_multilingual_v2": 10000,
            "eleven_flash_v2_5": 40000,
        }
        character_limit = character_limits.get(model_id, 5000)
        if len(text) > character_limit:
            raise ValueError(
                f"The scene contains {len(text)} characters, but {model_id} accepts at most "
                f"{character_limit} per request. Split the narration into scenes before the paid request."
            )

        payload = {
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "speed": float(speed),
                "stability": float(stability),
                "similarity_boost": float(similarity_boost),
                "style": float(style),
                "use_speaker_boost": bool(use_speaker_boost),
            },
            "seed": int(seed),
            "apply_text_normalization": apply_text_normalization,
        }
        if previous_text.strip():
            payload["previous_text"] = previous_text.strip()
        if next_text.strip():
            payload["next_text"] = next_text.strip()
        if model_id != "eleven_multilingual_v2" and language_code.strip():
            payload["language_code"] = language_code.strip().lower()
        if (
            model_id in {"eleven_v3", "eleven_flash_v2_5"}
            and pronunciation_dictionary_id.strip()
            and pronunciation_dictionary_version_id.strip()
        ):
            payload["pronunciation_dictionary_locators"] = [{
                "pronunciation_dictionary_id": pronunciation_dictionary_id.strip(),
                "version_id": pronunciation_dictionary_version_id.strip(),
            }]

        query = urllib.parse.urlencode({"output_format": output_format})
        url = f"{ELEVENLABS_API_URL}/{urllib.parse.quote(voice_id, safe='')}?{query}"
        request_body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        attempts = 3
        audio_bytes = None
        for attempt in range(attempts):
            request = urllib.request.Request(
                url,
                data=request_body,
                method="POST",
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg, audio/wav, application/octet-stream",
                    "User-Agent": "CANVA-STORY-ElevenLabs-TTS/1.0",
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=180) as response:
                    audio_bytes = response.read()
                break
            except urllib.error.HTTPError as error:
                message = _read_error_body(error)
                if error.code in RETRYABLE_HTTP_STATUS and attempt + 1 < attempts:
                    retry_after = error.headers.get("Retry-After") if error.headers else None
                    try:
                        delay = max(0.5, min(20.0, float(retry_after))) if retry_after else 2 ** attempt
                    except ValueError:
                        delay = 2 ** attempt
                    time.sleep(delay + random.uniform(0.0, 0.35))
                    continue
                raise RuntimeError(f"ElevenLabs API error {error.code}: {message}") from error
            except urllib.error.URLError as error:
                raise RuntimeError(
                    "ElevenLabs network response is uncertain. The request was not retried to avoid a duplicate charge: "
                    f"{error.reason}"
                ) from error

        if not audio_bytes:
            raise RuntimeError("ElevenLabs returned an empty audio response.")

        temp_path = ""
        try:
            with tempfile.NamedTemporaryFile(
                prefix="canva_story_elevenlabs_",
                suffix=_extension_for_output_format(output_format),
                delete=False,
            ) as temp_file:
                temp_path = temp_file.name
                if not output_format.startswith("pcm_"):
                    temp_file.write(audio_bytes)
            if output_format.startswith("pcm_"):
                sample_rate = int(output_format.split("_", 1)[1])
                with wave.open(temp_path, "wb") as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(sample_rate)
                    wav_file.writeframes(audio_bytes)
            waveform, sample_rate = load_audio(temp_path)
            audio = {"waveform": waveform.unsqueeze(0), "sample_rate": sample_rate}
            return (audio,)
        finally:
            if temp_path:
                try:
                    os.remove(temp_path)
                except OSError:
                    pass


NODE_CLASS_MAPPINGS = {
    "CanvaStoryElevenLabsTTS": CanvaStoryElevenLabsTTS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CanvaStoryElevenLabsTTS": "CANVA STORY ElevenLabs TTS (Direct API)",
}
