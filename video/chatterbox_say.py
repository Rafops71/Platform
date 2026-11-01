#!/usr/bin/env python3
"""Speak many lines with Chatterbox-Multilingual (Resemble AI, MIT weights).

Owner's decision, 2026-11-01: Chatterbox is the voice for every film, the same
default voice in both languages. The model is loaded ONCE for a whole batch (a
load takes about 25 s on a CPU), so the caller writes a JSON list and runs this
once:

    python3 video/chatterbox_say.py JOBS.json

JOBS.json is a list of {"text": "...", "lang": "en" | "es", "out": "path.wav"}.
A line is spoken sentence by sentence (a long run in one call is where these
models drift) and the sentences are joined with a short breath.

API as read from the installed package (chatterbox-tts 0.1.7, mtl_tts.py):
ChatterboxMultilingualTTS.from_pretrained(device) and
generate(text, language_id, ...), sample rate model.sr. Outputs carry
Resemble's imperceptible PerTh watermark.
"""
import json, re, sys, time
import torch, torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

BREATH_SECONDS = 0.25


def sentences(text):
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p for p in parts if p]


def main() -> int:
    jobs = json.load(open(sys.argv[1], encoding='utf8'))
    t0 = time.time()
    model = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
    print(f'model loaded in {time.time()-t0:.0f}s, {len(jobs)} lines', flush=True)
    gap = torch.zeros(1, int(BREATH_SECONDS * model.sr))
    for n, job in enumerate(jobs, 1):
        t0 = time.time()
        chunks = []
        for s in sentences(job['text']):
            wav = model.generate(s, language_id=job['lang'])
            chunks.extend([wav.reshape(1, -1).cpu(), gap])
        out = torch.cat(chunks[:-1], dim=1)
        ta.save(job['out'], out, model.sr)
        print(f'{n}/{len(jobs)} {job["lang"]} {out.shape[-1]/model.sr:.1f}s of speech in {time.time()-t0:.0f}s: {job["text"][:50]}', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
