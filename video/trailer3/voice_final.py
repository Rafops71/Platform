#!/usr/bin/env python3
"""Final trailer voice: Gemini "Algieba", English, the approved act texts word for word, about 140 wpm.
At most 8 Gemini requests in all (the free tier allows 10 a day): 3 requests (acts 1-3, 4-6, 7-8), a request whose
transcript is off by more than WER 0.15 is asked again while the budget of 8 lasts. Every request is LISTENED TO by
faster-whisper; its word times split it into one clip per act. Pace is set afterwards with ffmpeg atempo to 140 wpm.
Each clip is placed in its act (first word at act start + an offset). Writes in OUTDIR:
  voice-track.wav / voice-track.mp3   (90 s, voice only, same time base as the video)
  timings.json                        (per line: act, text, start_s, end_s, and every heard word with absolute time)
  voice-table.md                      (per request: WER, tries, measured wpm; per line: start, end, fit)
    python3 voice_final.py OUTDIR      (GEMINI_API_KEY in the environment)
"""
import difflib, json, os, re, subprocess, sys
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BUDGET = 8
WER_LIMIT = 0.15
TARGET_WPM = 140
S = [0, 7.6, 25.6, 37.0, 48.4, 60.4, 74.4, 84.0]      # act starts in the video (seconds)
OFF = [1.0, 1.0, 0.9, 0.9, 1.0, 0.8, 0.7, 0.9]        # first word of the line at act start + this
END = 90.0
LINES = [
    "MyPlatform is a private marketplace to trade physical commodities. By invitation only.",
    "In commodity trading, counterparties are often difficult to identify. Disclosing your position too early can weaken your commercial leverage.",
    "Members post buying and selling opportunities with the key details: commodity, quantity, origin and Incoterms.",
    "Each member states their role and declares the documentation available. Other members see the opportunity, not the member's identity.",
    "All communication passes through MyPlatform's Operator, who relays every message between the two sides.",
    "Introduction follows only once both sides agree on the essential terms and conditions and wish to proceed.",
    "MyPlatform, the commercial intermediary, introduces; members transact on the strength of their own judgement and due diligence.",
    "Where opportunity meets discretion.",
]
REQUESTS = [[0, 1, 2], [3, 4, 5], [6, 7]]


def norm(text):
    t = re.sub(r"[^\w\s']", ' ', text.lower().replace('my platform', 'myplatform').replace("'", ''))
    return t.split()


def wer(ref, hyp):
    r, h = ref, hyp
    d = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        prev, d[0] = d[0], i
        for j, hw in enumerate(h, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (rw != hw))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def line_bounds(ref, hn, heard2):
    """For each act line in a request: (line index, first word time, last word time, first heard index, last heard index)."""
    sm = difflib.SequenceMatcher(None, [w for w, _ in ref], hn, autojunk=False)
    where = {}
    for bl in sm.get_matching_blocks():
        for k in range(bl.size):
            where[bl.a + k] = bl.b + k
    by_line = {}
    for ri, (w, li) in enumerate(ref):
        if ri in where:
            by_line.setdefault(li, []).append(where[ri])
    out = []
    for li in sorted(by_line):
        hs, he = min(by_line[li]), max(by_line[li])
        out.append((li, heard2[hs][1], heard2[he][2], hs, he))
    return out


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    g = json.load(open(os.path.join(ROOT, 'video', 'script.json')))['voice']['gemini']
    style = ('Confident, warm, polished narrator for a premium private trading platform. Calm, clear delivery at about 140 words per '
             'minute, with natural pauses between sentences and a clearly longer pause between paragraphs. Do not rush, do not drag.')
    whisper = WhisperModel('small', device='cpu', compute_type='int8')
    used = 0
    rows, line_rows = [], []
    sr_out = 24000
    track = np.zeros(int(END * sr_out) + sr_out, dtype=np.float32)
    timings = []
    for n, idxs in enumerate(REQUESTS):
        text = '\n\n'.join(LINES[i] for i in idxs)
        ref = [(w, li) for li in idxs for w in norm(LINES[li])]
        best = None
        tries = 0
        while used < BUDGET and tries < 3:
            tries += 1; used += 1
            raw = os.path.join(out, f'raw-{n}.wav')
            if os.environ.get('REUSE_RAW') == '1' and os.path.exists(raw) and tries == 1:
                used -= 1; print(f'request {n}: reusing {raw} (no Gemini request)', flush=True)
            else:
                run(['python3', os.path.join(ROOT, 'video', 'gemini_say.py'), g['model'], g['voice'], style, raw], input=text.encode('utf8'))
            audio, sr = sf.read(raw, dtype='float32')
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            mono = audio if sr == 16000 else np.interp(np.linspace(0, len(audio), int(len(audio) * 16000 / sr), endpoint=False), np.arange(len(audio)), audio).astype(np.float32)
            segs, _ = whisper.transcribe(mono, language='en', beam_size=5, word_timestamps=True, initial_prompt='Incoterms, Operator, MyPlatform, commodities.')
            heard = [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
            hn = [norm(w)[0] if norm(w) else '' for w, _, _ in heard]
            score = wer([w for w, _ in ref], hn)
            print(f'request {n} try {tries} (request {used} of {BUDGET}): WER {score:.3f}', flush=True)
            if best is None or score < best[0]:
                best = (score, heard, hn, audio, sr, tries)
            if score <= WER_LIMIT:
                break
        score, heard, hn, audio, sr, tr = best
        speech = heard[-1][2] - heard[0][1]
        raw_wpm = len(ref) / speech * 60
        tempo = min(1.15, max(0.75, TARGET_WPM / raw_wpm))
        rows.append((n, score, tr, raw_wpm, tempo))
        # slowed (or quickened) copy of the whole request; every heard time moves by 1/tempo
        rawp = os.path.join(out, f'best-{n}.wav'); sf.write(rawp, audio, sr)
        adj = os.path.join(out, f'adj-{n}.wav')
        run(['ffmpeg', '-v', 'error', '-y', '-i', rawp, '-ar', str(sr_out), '-ac', '1', '-af', f'atempo={tempo:.4f}', adj])
        a2, _ = sf.read(adj, dtype='float32')
        heard2 = [(w, s / tempo, e / tempo) for w, s, e in heard]
        bounds = line_bounds(ref, hn, heard2)
        for k, (li, s0, e0, hs, he) in enumerate(bounds):
            prev_end = bounds[k - 1][2] if k else 0.0
            next_start = bounds[k + 1][1] if k + 1 < len(bounds) else len(a2) / sr_out
            c0 = max(0.0, max(s0 - 0.15, (prev_end + s0) / 2 if k else 0.0))
            c1 = min(len(a2) / sr_out, min(e0 + 0.35, (e0 + next_start) / 2 if k + 1 < len(bounds) else 1e9))
            clip = a2[int(c0 * sr_out):int(c1 * sr_out)].copy()
            fade = int(0.02 * sr_out)
            clip[:fade] *= np.linspace(0, 1, fade); clip[-fade:] *= np.linspace(1, 0, fade)
            place = S[li] + OFF[li]                     # absolute time of the first word
            t0 = place - (s0 - c0)                      # absolute time of the clip start
            i0 = int(round(t0 * sr_out))
            track[i0:i0 + len(clip)] += clip[:max(0, len(track) - i0)]
            words = [dict(w=heard2[j][0], start=round(place + heard2[j][1] - s0, 3), end=round(place + heard2[j][2] - s0, 3)) for j in range(hs, he + 1)]
            fit_end = place + (e0 - s0)
            window_end = (S[li + 1] if li + 1 < len(S) else END) + 0.3
            timings.append(dict(act=li + 1, text=LINES[li], start_s=round(place, 3), end_s=round(fit_end, 3), words=words))
            line_rows.append((li + 1, place, fit_end, window_end, 'ok' if fit_end <= window_end else 'TOO LONG for its act'))
    peak = float(np.max(np.abs(track)) or 1.0)
    track = (track / peak * 0.9)[:int(END * sr_out)]
    sf.write(os.path.join(out, 'voice-track.wav'), track, sr_out, subtype='PCM_16')
    run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(out, 'voice-track.wav'), '-b:a', '192k', os.path.join(out, 'voice-track.mp3')])
    timings.sort(key=lambda x: x['act'])
    json.dump(dict(fps_note='seconds from 0.0 of the video', acts_start_s=S, lines=timings), open(os.path.join(out, 'timings.json'), 'w'), indent=1)
    with open(os.path.join(out, 'voice-table.md'), 'w') as f:
        f.write(f'Gemini requests used: {used} of {BUDGET} (free tier: 10 a day)\n\n| request | WER | tries | raw wpm | tempo applied |\n|---|---|---|---|---|\n')
        for n, sc, tr, rw, tp in rows:
            f.write(f'| {n} | {sc:.3f} | {tr} | {rw:.0f} | {tp:.3f} |\n')
        f.write('\n| act | first word at (s) | last word at (s) | act window ends (s) | fit |\n|---|---|---|---|---|\n')
        for a, s0, e0, we, fit in sorted(line_rows):
            f.write(f'| {a} | {s0:.2f} | {e0:.2f} | {we:.2f} | {fit} |\n')
        bad = [r for r in rows if r[1] > WER_LIMIT]
        f.write('\n' + ('FAILED: WER above %.2f for request(s) %s\n' % (WER_LIMIT, [r[0] for r in bad]) if bad else 'All requests pass the gate.\n'))
    print(open(os.path.join(out, 'voice-table.md')).read())
    sys.exit(1 if any(r[1] > WER_LIMIT for r in rows) or len(timings) != len(LINES) else 0)


if __name__ == '__main__':
    main()
