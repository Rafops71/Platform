"""Voice test, part 1: Kokoro-82M (hexgrad/Kokoro-82M, Apache-2.0) on a CPU runner.

Makes the two agreed trailer opening lines (English and Spanish) in the voices
the owner chose to hear: English af_heart and am_michael; Spanish ef_dora,
em_alex and em_santa (VOICES.md of the model lists those three Spanish voices;
language code 'e'). Prints how long each clip took, so the summary can say
whether it runs at a usable speed on a free runner.
"""
import os, time
import soundfile as sf
from kokoro import KPipeline

EN = "A private market for physical commodities. By invitation only."
ES = "Un mercado privado de materias primas físicas. Solo por invitación."
OUT = os.environ.get("OUT", "clips")
os.makedirs(OUT, exist_ok=True)

jobs = [("a", "af_heart", EN), ("a", "am_michael", EN),
        ("e", "ef_dora", ES), ("e", "em_alex", ES), ("e", "em_santa", ES)]
rows = []
for code, voice, text in jobs:
    t0 = time.time()
    pipe = KPipeline(lang_code=code)
    chunks = [audio for _, _, audio in pipe(text, voice=voice)]
    import numpy as np
    wav = np.concatenate([np.asarray(c) for c in chunks])
    path = os.path.join(OUT, f"kokoro-{voice}.wav")
    sf.write(path, wav, 24000)
    took, secs = time.time() - t0, len(wav) / 24000
    rows.append((voice, round(took, 1), round(secs, 1)))
    print(f"{voice}: {secs:.1f}s of speech in {took:.1f}s", flush=True)

with open(os.path.join(OUT, "kokoro-summary.txt"), "w") as f:
    f.write("voice | seconds to make | seconds of speech\n")
    for r in rows:
        f.write(f"{r[0]} | {r[1]} | {r[2]}\n")
