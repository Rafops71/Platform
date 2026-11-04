#!/usr/bin/env python3
"""Walkthrough films voice: Gemini (Algieba), the owner-approved block texts word for word, about 140 wpm.
Blocks are spoken in requests of two (free tier: 10 requests a day; budget BUDGET, a request whose transcript is
off by more than WER 0.15 is asked again while the budget lasts). Every request is LISTENED TO by faster-whisper,
its word times split it into one clip per block, tempo is set with ffmpeg atempo, blocks are laid end to end with a
short pause (GAP seconds). Writes in OUTDIR:  voice-track.wav/.mp3, timings.json (blocks and every heard word with
absolute time), voice-table.md.
    python3 films_voice.py OUTDIR member-en|member-es|operator-en        (GEMINI_API_KEY in the environment)
"""
import difflib, json, os, re, subprocess, sys
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BUDGET = 3   # per film; three films, worst case 9 requests, the free tier allows 10 a day
WER_LIMIT = 0.15
TARGET_WPM = 140
GAP = 0.8          # silence between blocks (the owner wants brisk: short pauses only)
LEAD = 0.6         # silence before the first word
SR = 24000
REQ = [[0, 1], [2, 3]]


def norm(text):
    t = re.sub(r"[^\w\s']", ' ', text.lower().replace('my platform', 'myplatform').replace("'", ''))
    t = ''.join(c for c in __import__('unicodedata').normalize('NFD', t) if __import__('unicodedata').category(c) != 'Mn')
    return t.split()


def wer(r, h):
    d = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        prev, d[0] = d[0], i
        for j, hw in enumerate(h, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (rw != hw))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def blocks_of(film):
    txt = open(os.path.join(HERE, 'scripts', film + '-script.md'), encoding='utf8').read()
    out = [m.group(2).strip() for m in re.finditer(r'^(\d)\s+(.+)$', txt, re.M)]
    assert len(out) == 4, f'{film}: expected 4 blocks, found {len(out)}'
    return out


def line_bounds(ref, hn, heard):
    sm = difflib.SequenceMatcher(None, [w for w, _ in ref], hn, autojunk=False)
    where = {}
    for bl in sm.get_matching_blocks():
        for k in range(bl.size):
            where[bl.a + k] = bl.b + k
    by = {}
    for ri, (w, li) in enumerate(ref):
        if ri in where:
            by.setdefault(li, []).append(where[ri])
    return [(li, heard[min(v)][1], heard[max(v)][2], min(v), max(v)) for li, v in sorted(by.items())]


def main():
    out, film = sys.argv[1], sys.argv[2]
    lang = film.split('-')[1]
    os.makedirs(out, exist_ok=True)
    g = json.load(open(os.path.join(ROOT, 'video', 'script.json')))['voice']['gemini']
    style = g['style'][lang]
    BL = blocks_of(film)
    whisper = WhisperModel('small', device='cpu', compute_type='int8')
    used, rows, clips = 0, [], {}
    for n, idxs in enumerate(REQ):
        text = '\n\n'.join(BL[i] for i in idxs)
        ref = [(w, li) for li in idxs for w in norm(BL[li])]
        best, tries = None, 0
        while used < BUDGET and tries < 3:
            tries += 1; used += 1
            raw = os.path.join(out, f'raw-{n}.wav')
            run(['python3', os.path.join(ROOT, 'video', 'gemini_say.py'), g['model'], g['voice'], style, raw], input=text.encode('utf8'))
            audio, sr = sf.read(raw, dtype='float32')
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            mono = audio if sr == 16000 else np.interp(np.linspace(0, len(audio), int(len(audio) * 16000 / sr), endpoint=False), np.arange(len(audio)), audio).astype(np.float32)
            segs, _ = whisper.transcribe(mono, language=lang, beam_size=5, word_timestamps=True, initial_prompt='MyPlatform, Incoterm, Operator, Operador.')
            heard = [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
            hn = [(norm(w) or [''])[0] for w, _, _ in heard]
            score = wer([w for w, _ in ref], hn)
            print(f'request {n} try {tries} (request {used} of {BUDGET}): WER {score:.3f}', flush=True)
            if best is None or score < best[0]:
                best = (score, heard, hn, audio, sr, tries, raw)
            if score <= WER_LIMIT:
                break
        score, heard, hn, audio, sr, tr, raw = best
        raw_wpm = len(ref) / (heard[-1][2] - heard[0][1]) * 60
        tempo = min(1.3, max(0.7, TARGET_WPM / raw_wpm))
        rows.append((n, score, tr, raw_wpm, tempo))
        rawp = os.path.join(out, f'best-{n}.wav'); sf.write(rawp, audio, sr)
        adj = os.path.join(out, f'adj-{n}.wav')
        run(['ffmpeg', '-v', 'error', '-y', '-i', rawp, '-ar', str(SR), '-ac', '1', '-af', f'atempo={tempo:.4f}', adj])
        a2, _ = sf.read(adj, dtype='float32')
        h2 = [(w, s / tempo, e / tempo) for w, s, e in heard]
        bounds = line_bounds(ref, hn, h2)
        for k, (li, s0, e0, hs, he) in enumerate(bounds):
            prev_end = bounds[k - 1][2] if k else 0.0
            nxt = bounds[k + 1][1] if k + 1 < len(bounds) else len(a2) / SR
            c0 = max(0.0, (prev_end + s0) / 2 if k else max(0.0, s0 - 0.15))
            c1 = min(len(a2) / SR, (e0 + nxt) / 2 if k + 1 < len(bounds) else e0 + 0.35)
            clip = a2[int(c0 * SR):int(c1 * SR)].copy()
            fd = int(0.02 * SR); clip[:fd] *= np.linspace(0, 1, fd); clip[-fd:] *= np.linspace(1, 0, fd)
            clips[li] = (clip, s0 - c0, e0 - s0, [(h2[j][0], h2[j][1] - s0, h2[j][2] - s0) for j in range(hs, he + 1)])
    missing = [i for i in range(4) if i not in clips]
    if missing:
        print('missing blocks', missing); sys.exit(1)
    track = np.zeros(int(sum(len(clips[i][0]) / SR for i in range(4)) * SR + (LEAD + 4 * GAP + 2) * SR), dtype=np.float32)
    t, timings = LEAD, []
    for i in range(4):
        clip, lead_in, span, words = clips[i]
        i0 = int(round((t - lead_in) * SR))
        track[i0:i0 + len(clip)] += clip
        timings.append(dict(block=i + 1, text=BL[i], start_s=round(t, 3), end_s=round(t + span, 3),
                            words=[dict(w=w, start=round(t + s, 3), end=round(t + e, 3)) for w, s, e in words]))
        t += span + GAP
    total = timings[-1]['end_s'] + 1.0
    track = track[:int(total * SR)]
    track = track / (float(np.max(np.abs(track))) or 1.0) * 0.9
    sf.write(os.path.join(out, 'voice-track.wav'), track, SR, subtype='PCM_16')
    run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(out, 'voice-track.wav'), '-b:a', '192k', os.path.join(out, 'voice-track.mp3')])
    json.dump(dict(film=film, total_s=round(total, 3), gap_s=GAP, blocks=timings), open(os.path.join(out, 'timings.json'), 'w'), indent=1, ensure_ascii=False)
    with open(os.path.join(out, 'voice-table.md'), 'w') as f:
        f.write(f'{film}: Gemini requests used {used} of {BUDGET} (free tier 10 a day); voice {g["voice"]}\n\n| request | WER | tries | raw wpm | tempo |\n|---|---|---|---|---|\n')
        for n, sc, tr, rw, tp in rows:
            f.write(f'| {n} | {sc:.3f} | {tr} | {rw:.0f} | {tp:.3f} |\n')
        f.write('\n| block | start s | end s | words |\n|---|---|---|---|\n')
        for b in timings:
            f.write(f"| {b['block']} | {b['start_s']:.2f} | {b['end_s']:.2f} | {len(b['words'])} |\n")
        f.write(f'\ntotal {total:.1f} s\n')
        bad = [r for r in rows if r[1] > WER_LIMIT]
        f.write('FAILED: WER above %.2f for request(s) %s\n' % (WER_LIMIT, [r[0] for r in bad]) if bad else 'All requests pass the gate.\n')
    print(open(os.path.join(out, 'voice-table.md')).read())
    sys.exit(1 if any(r[1] > WER_LIMIT for r in rows) else 0)


main()
