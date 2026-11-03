#!/usr/bin/env python3
"""Spanish trailer voice: Kokoro-82M (Apache-2.0), CPU. The three Spanish voices (ef_dora, em_alex, em_santa) each speak all 8
approved lines; every line is LISTENED TO by faster-whisper (language es) and scored (word error rate, accents ignored);
the voice with the lowest mean error is used. Pace is set to about 140 wpm with ffmpeg atempo (one tempo for the whole
voice, from its median raw pace). Each line is placed in its act (first word at act start + an offset). Nothing is
reworded: a line that does not fit its act is REPORTED in the table.
  python3 voice_es.py OUTDIR
Writes: voice-track.wav / .mp3 (90 s), timings.json, voice-table.md, line-N.wav (the chosen voice, tempo applied).
"""
import json, os, re, subprocess, sys, unicodedata
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel
from kokoro import KPipeline

S = [0, 7.6, 25.6, 37.0, 48.4, 60.4, 74.4, 85.1]  # act 8 moved 1.1 s later for the longer Spanish act-7 line (supervisor, option a)
OFF = [1.0, 1.0, 0.9, 0.9, 1.0, 0.8, 0.7, 0.9]
END = 90.0
TARGET_WPM = 140
WER_LIMIT = 0.15
SR = 24000
VOICES = ['ef_dora', 'em_alex', 'em_santa']
LINES = [
    "MyPlatform es un mercado privado para comerciar materias primas físicas. Solo por invitación.",
    "En el comercio de materias primas, a menudo es difícil identificar a la contraparte. Revelar su posición demasiado pronto puede debilitar su poder de negociación.",
    "Los miembros publican oportunidades de compra y venta con los datos clave: materia prima, cantidad, origen e Incoterms.",
    "Cada miembro indica su función y declara la documentación disponible. Los demás miembros ven la oportunidad, no la identidad del miembro.",
    "Toda la comunicación pasa por el Operador de MyPlatform, que transmite cada mensaje entre ambas partes.",
    "La presentación solo tiene lugar cuando ambas partes acuerdan los términos y condiciones esenciales y desean seguir adelante.",
    "MyPlatform, como intermediario comercial, presenta a las partes; los miembros realizan sus transacciones según su propio criterio y su propia diligencia debida.",
    "Donde la oportunidad se encuentra con la discreción.",
]


def norm(text):
    t = unicodedata.normalize('NFD', text.lower().replace('my platform', 'myplatform'))
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r"[^\w\s]", ' ', t).split()


def wer(ref, hyp):
    d = list(range(len(hyp) + 1))
    for i, rw in enumerate(ref, 1):
        prev, d[0] = d[0], i
        for j, hw in enumerate(hyp, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (rw != hw))
            prev, d[j] = d[j], cur
    return d[len(hyp)] / max(1, len(ref))


def listen(model, audio):
    mono = np.interp(np.linspace(0, len(audio), int(len(audio) * 16000 / SR), endpoint=False), np.arange(len(audio)), audio).astype(np.float32)
    segs, _ = model.transcribe(mono, language='es', beam_size=5, word_timestamps=True, initial_prompt='Incoterms, Operador, MyPlatform, materias primas.')
    return [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    whisper = WhisperModel('small', device='cpu', compute_type='int8')
    pipe = KPipeline(lang_code='e')
    results = {}
    for v in VOICES:
        rows = []
        for i, text in enumerate(LINES):
            chunks = [np.asarray(a) for _, _, a in pipe(text, voice=v)]
            wav = np.concatenate(chunks).astype(np.float32)
            heard = listen(whisper, wav)
            hn = [norm(w)[0] if norm(w) else '' for w, _, _ in heard]
            score = wer(norm(text), hn)
            speech = heard[-1][2] - heard[0][1] if heard else len(wav) / SR
            rows.append(dict(wav=wav, heard=heard, wer=score, wpm=len(norm(text)) / speech * 60))
            print(f'{v} line {i + 1}: WER {score:.3f}, {rows[-1]["wpm"]:.0f} wpm raw', flush=True)
        results[v] = rows
    mean = {v: float(np.mean([r['wer'] for r in rows])) for v, rows in results.items()}
    best = min(mean, key=mean.get)
    rows = results[best]
    tempo = min(1.3, max(0.7, TARGET_WPM / float(np.median([r['wpm'] for r in rows]))))
    print(f'chosen voice {best} (mean WER {mean[best]:.3f}); tempo {tempo:.3f}', flush=True)
    track = np.zeros(int(END * SR) + SR, dtype=np.float32)
    timings, fit_rows = [], []
    for i, r in enumerate(rows):
        raw = os.path.join(out, f'raw-{i + 1}.wav'); sf.write(raw, r['wav'], SR)
        adj = os.path.join(out, f'line-{i + 1}.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', f'atempo={tempo:.4f}', adj], check=True)
        a2, _ = sf.read(adj, dtype='float32')
        heard = [(w, s / tempo, e / tempo) for w, s, e in r['heard']]
        s0, e0 = heard[0][1], heard[-1][2]
        place = S[i] + OFF[i]
        t0 = place - s0
        i0 = int(round(t0 * SR))
        clip = a2.copy(); f = int(0.02 * SR); clip[:f] *= np.linspace(0, 1, f); clip[-f:] *= np.linspace(1, 0, f)
        track[max(0, i0):i0 + len(clip)] += clip[max(0, -i0):][:max(0, len(track) - max(0, i0))]
        words = [dict(w=w, start=round(place + s - s0, 3), end=round(place + e - s0, 3)) for w, s, e in heard]
        end_s = place + (e0 - s0)
        window_end = (S[i + 1] if i + 1 < len(S) else END) + 0.3
        timings.append(dict(act=i + 1, text=LINES[i], start_s=round(place, 3), end_s=round(end_s, 3), words=words))
        fit_rows.append((i + 1, place, end_s, window_end, 'ok' if end_s <= window_end else 'TOO LONG for its act (by %.1f s)' % (end_s - window_end)))
    peak = float(np.max(np.abs(track)) or 1.0)
    track = (track / peak * 0.9)[:int(END * SR)]
    sf.write(os.path.join(out, 'voice-track.wav'), track, SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(out, 'voice-track.wav'), '-b:a', '192k', os.path.join(out, 'voice-track.mp3')], check=True)
    json.dump(dict(voice=best, tempo=round(tempo, 4), acts_start_s=S, lines=timings), open(os.path.join(out, 'timings.json'), 'w'), indent=1, ensure_ascii=False)
    with open(os.path.join(out, 'voice-table.md'), 'w') as f:
        f.write('| voice | mean WER | worst line WER | median raw wpm |\n|---|---|---|---|\n')
        for v, rr in results.items():
            f.write(f'| {v}{" (chosen)" if v == best else ""} | {mean[v]:.3f} | {max(x["wer"] for x in rr):.3f} | {np.median([x["wpm"] for x in rr]):.0f} |\n')
        f.write(f'\nTempo applied to {best}: {tempo:.3f} (target {TARGET_WPM} wpm)\n\n| act | WER | first word (s) | last word (s) | act window ends (s) | fit |\n|---|---|---|---|---|---|\n')
        for (a, p, e, we, fit), r in zip(fit_rows, rows):
            f.write(f'| {a} | {r["wer"]:.3f} | {p:.2f} | {e:.2f} | {we:.2f} | {fit} |\n')
        bad = [i + 1 for i, r in enumerate(rows) if r['wer'] > WER_LIMIT]
        f.write('\n' + (f'LINES ABOVE THE WER GATE ({WER_LIMIT}): {bad}\n' if bad else 'All lines pass the gate.\n'))
    print(open(os.path.join(out, 'voice-table.md')).read())
    sys.exit(0)


if __name__ == '__main__':
    main()
