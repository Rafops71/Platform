#!/usr/bin/env python3
"""Qwen3-TTS 0.6B (CustomVoice), the same two test lines, on a CPU.

From the model card (huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice, licence
apache-2.0): pip install -U qwen-tts; from qwen_tts import Qwen3TTSModel;
Qwen3TTSModel.from_pretrained(id, device_map="cuda:0", dtype=torch.bfloat16,
attn_implementation="flash_attention_2"); model.generate_custom_voice(text=,
language=, speaker=, instruct=) returns (wavs, sr). The card's examples use CUDA;
here device_map="cpu", float32 and no flash attention (it needs a GPU). Spanish is
listed as supported; its nine speakers are Chinese/English/Japanese/Korean natives,
so the English speaker "Ryan" reads both lines.
"""
import os, time, traceback
os.makedirs("clips", exist_ok=True)
lines = [
    ("en", "English", "A private market for physical commodities. By invitation only."),
    ("es", "Spanish", "Un mercado privado de materias primas físicas. Solo por invitación."),
]
out = ["Qwen3-TTS-12Hz-0.6B-CustomVoice on CPU (float32), speaker Ryan, instruct empty."]
try:
    import torch, soundfile as sf
    out.append(f"torch {torch.__version__}, cuda available: {torch.cuda.is_available()}")
    from qwen_tts import Qwen3TTSModel
    t0 = time.time()
    model = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", device_map="cpu", dtype=torch.float32)
    out.append(f"model loaded in {time.time()-t0:.0f}s")
    for code, language, text in lines:
        t0 = time.time()
        wavs, sr = model.generate_custom_voice(text=text, language=language, speaker="Ryan", instruct="")
        took = time.time() - t0
        sf.write(f"clips/qwen3-{code}.wav", wavs[0], sr)
        out.append(f"{code}: {len(wavs[0])/sr:.1f}s of speech in {took:.0f}s")
    out.append("RESULT: Qwen3-TTS produced both clips on this runner.")
except Exception:
    out.append("RESULT: Qwen3-TTS did NOT produce the clips on this runner.")
    out.append(traceback.format_exc()[-2500:])
open("clips/qwen-summary.txt", "w").write("\n".join(out) + "\n")
print("\n".join(out))
