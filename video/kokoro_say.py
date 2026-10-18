#!/usr/bin/env python3
"""Speak one line with Kokoro, and write it as a WAV.

WHY A SECOND ENGINE AT ALL

Piper is a small VITS model and sounds like one. The owner listened to the
second film and said the voice was mechanical and static, which it is. Kokoro
is an 82-million-parameter model that still runs on a CPU - no GPU anywhere in
this pipeline - and is released under Apache-2.0, trained on permissive and
public-domain audio. Both facts were read off its model card on 2026-10-17,
not recalled: huggingface.co/hexgrad/Kokoro-82M.

Piper is kept, not replaced. It covers far more languages, it is tiny, and a
film can still be made with it by setting the engine in video/script.json.

USAGE
    python3 video/kokoro_say.py MODEL VOICES VOICE SPEED LANG OUT < text
"""

import sys
import soundfile as sf
from kokoro_onnx import Kokoro


def main() -> int:
    model, voices, voice, speed, lang, out = sys.argv[1:7]
    text = sys.stdin.read().strip()
    if not text:
        print('nothing to say', file=sys.stderr)
        return 1

    kokoro = Kokoro(model, voices)
    available = set(kokoro.get_voices())
    if voice not in available:
        print(f'no such Kokoro voice: {voice}\n'
              f'available: {", ".join(sorted(available))}', file=sys.stderr)
        return 1

    samples, rate = kokoro.create(text, voice=voice, speed=float(speed), lang=lang)
    sf.write(out, samples, rate)
    return 0


if __name__ == '__main__':
    sys.exit(main())
