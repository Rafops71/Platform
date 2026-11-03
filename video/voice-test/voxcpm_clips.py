"""Voice test, part 2: VoxCPM2 (openbmb/VoxCPM2, Apache-2.0, "free for commercial
use") on a CPU runner. The model card requires CUDA >= 12.0 and does not say
whether it runs on a CPU, so this script reports what happens instead of
assuming: every step is timed, and a failure is written to the summary with its
error rather than hidden. The card's minimal call does not show how the
language is chosen, so the text is passed as it is.
"""
import os, shutil, subprocess, time, traceback

OUT = os.environ.get("OUT", "clips")
os.makedirs(OUT, exist_ok=True)
EN = "A private market for physical commodities. By invitation only."
ES = "Un mercado privado de materias primas físicas. Solo por invitación."
log = []


def note(msg):
    print(msg, flush=True)
    log.append(msg)


note(subprocess.run(["df", "-h", "/"], capture_output=True, text=True).stdout.strip())
note(subprocess.run(["free", "-m"], capture_output=True, text=True).stdout.strip())
try:
    import soundfile as sf
    import torch
    from voxcpm import VoxCPM

    note(f"torch {torch.__version__}, cuda available: {torch.cuda.is_available()}")
    t0 = time.time()
    model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
    note(f"model loaded in {time.time() - t0:.0f}s")
    for name, text in (("en", EN), ("es", ES)):
        t0 = time.time()
        wav = model.generate(text=text, cfg_value=2.0, inference_timesteps=10)
        took = time.time() - t0
        path = os.path.join(OUT, f"voxcpm2-{name}.wav")
        sf.write(path, wav, model.tts_model.sample_rate)
        secs = len(wav) / model.tts_model.sample_rate
        note(f"{name}: {secs:.1f}s of speech in {took:.0f}s (real-time factor {took / max(secs, 0.1):.2f})")
    note("RESULT: VoxCPM2 produced both clips on this runner.")
except Exception:
    note("RESULT: VoxCPM2 did NOT produce the clips on this runner.")
    note(traceback.format_exc()[-1800:])
note(subprocess.run(["df", "-h", "/"], capture_output=True, text=True).stdout.strip())
with open(os.path.join(OUT, "voxcpm-summary.txt"), "w") as f:
    f.write("\n".join(log))
