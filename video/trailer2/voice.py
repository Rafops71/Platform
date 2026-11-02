#!/usr/bin/env python3
"""The new English trailer's voice: Gemini "Algieba", slowed to the owner's pick (atempo 0.93, about 130 wpm), and
LISTENED TO by faster-whisper. Two Gemini requests (the free tier allows 10 a day); a request whose transcript is off
by more than 0.15 WER is asked again, at most 3 times. Writes, per request: voice-N.wav (slowed), voice-N.words.json
(every heard word with its time), and one table for the run.

    python3 video/trailer2/voice.py OUTDIR        (GEMINI_API_KEY in the environment)
"""
import json, os, re, subprocess, sys
import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
WER_LIMIT = 0.15
TRIES = 3
TEMPO = 0.93


def words(text):
    t = re.sub(r"[^\w\s']", ' ', text.lower().replace('my platform', 'myplatform').replace("'", ''))
    return t.split()


def wer(ref, hyp):
    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        prev, d[0] = d[0], i
        for j, hw in enumerate(h, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (rw != hw))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    spec = json.load(open(os.path.join(HERE, 'parts.json'), encoding='utf8'))
    g = json.load(open(os.path.join(ROOT, 'video', 'script.json')))['voice']['gemini']
    style = ('Confident, warm, polished narrator for a premium private trading platform. Calm, measured delivery at about '
             '130 words per minute, with natural pauses between sentences and a clearly longer pause between paragraphs. Do not rush.')
    whisper = WhisperModel('small', device='cpu', compute_type='int8')
    rows = []
    for n, idxs in enumerate(spec['requests']):
        text = '\n\n'.join(' '.join(spec['parts'][i]) for i in idxs)
        best = None
        for attempt in range(1, TRIES + 1):
            raw = os.path.join(out, f'raw-{n}.wav')
            run(['python3', os.path.join(ROOT, 'video', 'gemini_say.py'), g['model'], g['voice'], style, raw], input=text.encode('utf8'))
            slow = os.path.join(out, f'voice-{n}.wav')
            run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', f'atempo={TEMPO}', slow])
            audio, sr = sf.read(slow, dtype='float32')
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
            mono = audio if sr == 16000 else np.interp(np.linspace(0, len(audio), int(len(audio) * 16000 / sr), endpoint=False), np.arange(len(audio)), audio).astype(np.float32)
            segs, _ = whisper.transcribe(mono, language='en', beam_size=5, word_timestamps=True,
                                         initial_prompt='Incoterm, Operator, MyPlatform, commodities.')
            heard = [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
            score = wer(text, ' '.join(w for w, _, _ in heard))
            print(f'request {n} attempt {attempt}: WER {score:.3f}', flush=True)
            if best is None or score < best[0]:
                best = (score, heard, attempt, len(audio) / sr)
                os.replace(slow, os.path.join(out, f'voice-{n}.best.wav'))
            if score <= WER_LIMIT:
                break
        os.replace(os.path.join(out, f'voice-{n}.best.wav'), os.path.join(out, f'voice-{n}.wav'))
        json.dump([dict(word=w, start=s, end=e) for w, s, e in best[1]], open(os.path.join(out, f'voice-{n}.words.json'), 'w'))
        nwords = len(words(text))
        speech = best[1][-1][2] - best[1][0][1]
        rows.append((n, best[0], best[2], best[3], nwords, speech))
    with open(os.path.join(out, 'voice-table.md'), 'w') as f:
        f.write('| request | WER | tries | file seconds | words | measured wpm (first to last word) |\n|---|---|---|---|---|---|\n')
        for n, sc, tr, dur, nw, sp in rows:
            f.write(f'| {n} | {sc:.3f} | {tr} | {dur:.1f} | {nw} | {nw / sp * 60:.0f} |\n')
        bad = [r for r in rows if r[1] > WER_LIMIT]
        f.write('\n' + ('FAILED: WER above %.2f after %d tries for request(s) %s\n' % (WER_LIMIT, TRIES, [r[0] for r in bad]) if bad else 'All requests pass the gate.\n'))
    print(open(os.path.join(out, 'voice-table.md')).read())
    sys.exit(1 if any(r[1] > WER_LIMIT for r in rows) else 0)


if __name__ == '__main__':
    main()
