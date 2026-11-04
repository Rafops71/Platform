#!/usr/bin/env python3
"""Independent check of a finished films voice track: faster-whisper listens to voice-track.wav, the heard words are aligned
to the approved block texts (difflib), and per block we report WER and wpm = approved words / (last heard - first heard).
Does not use the word times the pace script wrote.   python3 films_check.py TRACK_DIR FILM      (TRACK_DIR has voice-track.wav, timings.json)"""
import difflib, json, os, re, sys, unicodedata
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel


def norm(text):
    t = re.sub(r"[^\w\s']", ' ', text.lower().replace('my platform', 'myplatform').replace("'", ''))
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')
    return t.split()


def main():
    d, film = sys.argv[1], sys.argv[2]
    lang = film.split('-')[1]
    T = json.load(open(os.path.join(d, 'timings.json')))
    wav, sr = sf.read(os.path.join(d, 'voice-track.wav'), dtype='float32')
    mono = np.interp(np.linspace(0, len(wav), int(len(wav) * 16000 / sr), endpoint=False), np.arange(len(wav)), wav).astype(np.float32)
    model = WhisperModel('small', device='cpu', compute_type='int8')
    segs, _ = model.transcribe(mono, language=lang, beam_size=5, word_timestamps=True, initial_prompt='MyPlatform, Incoterm, Operator, Operador.')
    heard = [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
    hn = [(norm(w) or [''])[0] for w, _, _ in heard]
    ref = [(w, bi) for bi, b in enumerate(T['blocks']) for w in norm(b['text'])]
    sm = difflib.SequenceMatcher(None, [w for w, _ in ref], hn, autojunk=False)
    where = {}
    for bl in sm.get_matching_blocks():
        for k in range(bl.size):
            where[bl.a + k] = bl.b + k
    rows, ok = [], True
    for bi, b in enumerate(T['blocks']):
        idx = [i for i, (_, x) in enumerate(ref) if x == bi]
        hit = [where[i] for i in idx if i in where]
        n = len(idx)
        if len(hit) < 0.8 * n:
            rows.append(f"| {b['block']} | {n} | only {len(hit)} matched | - | - |"); ok = False; continue
        s0, e0 = heard[min(hit)][1], heard[max(hit)][2]
        wpm = n / (e0 - s0) * 60
        werr = 1 - len(hit) / n
        good = 136 <= wpm <= 144 and werr <= 0.15
        ok &= good
        rows.append(f"| {b['block']} | {n} | {wpm:.1f} | {werr:.3f} | {'ok' if good else 'OUTSIDE'} |")
    out = f"{film}: whisper listened to the paced track\n\n| block | words | wpm (heard) | word miss rate | verdict |\n|---|---|---|---|---|\n" + '\n'.join(rows) + '\n\n' + ('All blocks 136-144 wpm and miss rate <= 0.15.' if ok else 'Some block is outside the limits.') + '\n'
    open(os.path.join(d, 'check-table.md'), 'w').write(out)
    print(out)
    sys.exit(0 if ok else 1)


main()
