# CANVA STORY ElevenLabs TTS

Custom ComfyUI node that calls the official ElevenLabs API directly and returns a ComfyUI `AUDIO` value.
It does not use Comfy Partner Credits and never stores the API key in a workflow.

The node reads `ELEVENLABS_API_KEY` from the ComfyUI process environment. The CANVA STORY full-stack launcher copies this folder into the selected local ComfyUI installation before ComfyUI starts.
