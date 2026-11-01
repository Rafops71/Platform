#!/usr/bin/env python3
"""Chatterbox-Multilingual (Resemble AI, MIT weights): the same two test lines, on a CPU.

Installed from PyPI (chatterbox-tts 0.1.7, whose source was read): the signature is
from_pretrained(device) (no t3_model argument; the README is newer than the package) and
generate(text, language_id=...). The Spain-Spanish pack (ResembleAI/Chatterbox-
Multilingual-es-es) shows no loading code on its model card, so the general
model with language_id "es" is used and the summary says so.
Outputs carry Resemble's imperceptible PerTh watermark.
"""
import os, time, traceback
os.makedirs("clips", exist_ok=True)
lines = [
    ("en", "A private market for physical commodities. By invitation only."),
    ("es", "Un mercado privado de materias primas físicas. Solo por invitación."),
]
out = ["Chatterbox-Multilingual on CPU. Spanish uses language_id 'es' (the es-es pack has no documented loader)."]
try:
    import torch, torchaudio as ta
    out.append(f"torch {torch.__version__}, cuda available: {torch.cuda.is_available()}")
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    t0 = time.time()
    model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    out.append(f"model loaded in {time.time()-t0:.0f}s")
    for lang, text in lines:
        t0 = time.time()
        wav = model.generate(text, language_id=lang)
        took = time.time() - t0
        ta.save(f"clips/chatterbox-{lang}.wav", wav, model.sr)
        out.append(f"{lang}: {wav.shape[-1]/model.sr:.1f}s of speech in {took:.0f}s")
    out.append("RESULT: Chatterbox produced both clips on this runner.")
except Exception:
    out.append("RESULT: Chatterbox did NOT produce the clips on this runner.")
    out.append(traceback.format_exc()[-2500:])
open("clips/chatterbox-summary.txt", "w").write("\n".join(out) + "\n")
print("\n".join(out))
