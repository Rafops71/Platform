#!/usr/bin/env python3
"""A film's voice, every line LISTENED TO. Two engines, same output as the Chatterbox shards (the recorder cannot tell):

  gemini  Gemini "Algieba" at its natural pace (about 140 wpm, NO tempo change). The lines of a film are sent in as FEW
          requests as possible (--requests, default 2: the free tier allows 10 a day), paragraph-separated; faster-whisper
          gives every heard word its time; each script line is found in the audio by its words (difflib), cut out with a
          little room either side, and checked on its own: WER above 0.15 fails the line. A request with a failing line
          is asked again (at most --tries, default 2 - quota), keeping the best.
  kokoro  Kokoro-82M (Spanish). Several voices are tried on a sample of the film's own lines, the one the listener
          understands best is kept, its speed is set so the film comes out near --wpm words a minute, every line is
          spoken, listened to, and re-spoken a little differently up to 3 times if it fails.

    python3 video/film_voice.py --film member --lang en --engine gemini --out DIR [--requests 2] [--tries 2]
    python3 video/film_voice.py --film member --lang es --engine kokoro --out DIR --voices ef_dora,em_alex,em_santa
                                --wpm 140 --kokoro-dir .

Writes DIR/<film>-<lang>-<scene>.wav (16-bit mono), DIR/wer-table-0.md (one row per line) and, for kokoro, the voice
comparison. Exit 1 when any line is above the WER limit. GEMINI_API_KEY comes from the environment (gemini only).
"""
import argparse, difflib, importlib.util, json, os, re, subprocess, sys, types
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
WER_LIMIT = 0.15
VOCAB = {
    'en': 'MyPlatform, Incoterm, CIF, FOB, Operator, Mailbox, commodity, copper cathodes.',
    'es': 'MyPlatform, Incoterm, CIF, FOB, Operador, Buzón, materia prima, cátodos de cobre.',
}


def text_tools():
    """words() and wer() exactly as the Chatterbox gate has them (numbers spelled, accents kept). That file imports a
    speech model at the top, so its imports are stubbed here: only the text functions are used."""
    for name in ('torch', 'torchaudio', 'chatterbox', 'chatterbox.mtl_tts'):
        sys.modules.setdefault(name, types.ModuleType(name))
    sys.modules['chatterbox.mtl_tts'].ChatterboxMultilingualTTS = object
    spec = importlib.util.spec_from_file_location('chatterbox_say', os.path.join(HERE, 'chatterbox_say.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.words, mod.wer


words, wer = text_tools()


def mono16k(audio, sr):
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr == 16000:
        return audio.astype(np.float32)
    return np.interp(np.linspace(0, len(audio), int(len(audio) * 16000 / sr), endpoint=False), np.arange(len(audio)), audio).astype(np.float32)


def listen(whisper, audio, sr, lang):
    segs, _ = whisper.transcribe(mono16k(audio, sr), language=lang, beam_size=5, word_timestamps=True, initial_prompt=VOCAB[lang])
    return [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]


def norm(w, lang):
    w = words(w, lang)
    return ''.join(w)


def lines_of(film, lang):
    script = json.load(open(os.path.join(HERE, 'script.json'), encoding='utf8'))
    out = []
    for sc in script['films'][film]['scenes']:
        if not sc['say'].get(lang):
            raise SystemExit(f'{film}/{sc["id"]} has no {lang} line')
        out.append(dict(id=f'{film}-{lang}-{sc["id"]}', text=sc['say'][lang]))
    return out


def groups(lines, n):
    total = sum(len(l['text'].split()) for l in lines)
    out, cur, acc = [], [], 0
    for l in lines:
        cur.append(l)
        acc += len(l['text'].split())
        if acc >= total / n * (len(out) + 1) and len(out) < n - 1:
            out.append(cur)
            cur = []
    out.append(cur)
    return [g for g in out if g]


def write16(path, audio, sr):
    sf.write(path, audio, sr, subtype='PCM_16')


def gemini_request(group, lang, style, work, n, whisper):
    g = json.load(open(os.path.join(HERE, 'script.json')))['voice']['gemini']
    text = '\n\n'.join(l['text'] for l in group)
    raw = os.path.join(work, f'raw-{n}.wav')
    subprocess.run(['python3', os.path.join(HERE, 'gemini_say.py'), g['model'], g['voice'], style, raw], input=text.encode('utf8'), check=True)
    audio, sr = sf.read(raw, dtype='float32')
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    heard = listen(whisper, audio, sr, lang)
    refs = [(i, norm(w, lang)) for i, l in enumerate(group) for w in l['text'].split() if norm(w, lang)]
    hw = [norm(h[0], lang) for h in heard]
    sm = difflib.SequenceMatcher(None, [r[1] for r in refs], hw, autojunk=False)
    match = {}
    for a, b, size in sm.get_matching_blocks():
        for k in range(size):
            match[a + k] = b + k
    span = {}
    for i in range(len(group)):
        got = [match[k] for k, r in enumerate(refs) if r[0] == i and k in match]
        if got:
            span[i] = (heard[min(got)][1], heard[max(got)][2])
    rows = []
    for i, l in enumerate(group):
        if i not in span:
            rows.append(dict(id=l['id'], wer=1.0, said='(not found in the audio)', audio=None, sr=sr, secs=0.0, text=l['text']))
            continue
        first, last = span[i]
        prev_end = span[i - 1][1] if i - 1 in span else None
        nxt = span[i + 1][0] if i + 1 in span else None
        lo = max(first - 0.15, (prev_end + first) / 2 if prev_end is not None else 0.0)
        hi = min(last + 0.30, (last + nxt) / 2 if nxt is not None else len(audio) / sr)
        chunk = audio[int(lo * sr):int(hi * sr)]
        said = ' '.join(h[0] for h in heard if lo <= h[1] < hi)
        rows.append(dict(id=l['id'], wer=wer(l['text'], said, lang), said=said, audio=chunk, sr=sr, secs=len(chunk) / sr, text=l['text']))
    speech = (heard[-1][2] - heard[0][1]) if heard else 1.0
    wpm = len(words(text, lang)) / speech * 60
    return rows, wpm


def run_gemini(a, whisper):
    lines = lines_of(a.film, a.lang)
    style = ('Confident, warm, polished narrator for a premium private trading platform. Clear, natural, brisk walkthrough pace '
             'of about 140 words per minute, with short natural pauses between sentences and a slightly longer pause between '
             'paragraphs. Do not drag.')
    if a.lang == 'es':
        style += ' Speak in neutral international Spanish.'
    table, wpms = [], []
    for n, group in enumerate(groups(lines, a.requests)):
        best = None
        for attempt in range(1, a.tries + 1):
            rows, wpm = gemini_request(group, a.lang, style, a.out, n, whisper)
            bad = sum(r['wer'] > WER_LIMIT for r in rows)
            mean = sum(r['wer'] for r in rows) / len(rows)
            print(f'request {n} attempt {attempt}: {bad} line(s) over {WER_LIMIT}, mean WER {mean:.3f}, {wpm:.0f} wpm', flush=True)
            if best is None or (bad, mean) < best[0]:
                best = ((bad, mean), rows, wpm, attempt)
            if bad == 0:
                break
        wpms.append((n, best[2], best[3]))
        for r in best[1]:
            r['request'], r['tries'] = n, best[3]
            table.append(r)
    return table, f'Gemini Algieba, natural pace, requests (index, measured wpm first-to-last word, tries): {wpms}'


def run_kokoro(a, whisper):
    from kokoro_onnx import Kokoro
    kd = a.kokoro_dir
    k = Kokoro(os.path.join(kd, 'kokoro-v1.0.onnx'), os.path.join(kd, 'voices-v1.0.bin'))
    lines = lines_of(a.film, a.lang)
    code = 'es' if a.lang == 'es' else 'en-us'

    def speak(text, voice, speed):
        s, sr = k.create(text, voice=voice, speed=speed, lang=code)
        return np.asarray(s, dtype='float32'), sr

    def score(text, audio, sr):
        said = ' '.join(h[0] for h in listen(whisper, audio, sr, a.lang))
        return wer(text, said, a.lang), said

    sample = lines[:: max(1, len(lines) // 8)][:8]
    cmp_rows = []
    for voice in a.voices.split(','):
        ws, secs, nw = [], 0.0, 0
        for l in sample:
            au, sr = speak(l['text'], voice, 1.0)
            ws.append(score(l['text'], au, sr)[0])
            secs += len(au) / sr
            nw += len(words(l['text'], a.lang))
        cmp_rows.append((voice, sum(ws) / len(ws), nw / secs * 60))
        print(f'voice {voice}: mean WER {cmp_rows[-1][1]:.3f} on {len(sample)} lines, {cmp_rows[-1][2]:.0f} wpm at speed 1.0', flush=True)
    voice, _, wpm1 = min(cmp_rows, key=lambda r: r[1])
    # the film's own pauses are added later; the line itself is spoken at the speed that gives about --wpm
    speed = max(0.8, min(1.5, a.wpm / wpm1))
    print(f'chosen: {voice}, speed {speed:.2f}', flush=True)
    table = []
    for l in lines:
        best = None
        for t in range(1, 4):
            au, sr = speak(l['text'], voice, speed * (1.0 - 0.03 * (t - 1)))
            w, said = score(l['text'], au, sr)
            if best is None or w < best[0]:
                best = (w, said, au, sr, t)
            if w <= WER_LIMIT:
                break
        table.append(dict(id=l['id'], wer=best[0], said=best[1], audio=best[2], sr=best[3], secs=len(best[2]) / best[3], text=l['text'], tries=best[4], request=0))
    head = ('Kokoro Spanish voices on a sample of the film\'s own lines: ' + '; '.join(f'{v} WER {w:.3f} ({p:.0f} wpm at 1.0)' for v, w, p in cmp_rows)
            + f'. Chosen {voice} at speed {speed:.2f}.')
    return table, head


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--film', required=True)
    p.add_argument('--lang', required=True)
    p.add_argument('--engine', required=True, choices=['gemini', 'kokoro'])
    p.add_argument('--out', required=True)
    p.add_argument('--requests', type=int, default=2)
    p.add_argument('--tries', type=int, default=2)
    p.add_argument('--voices', default='ef_dora,em_alex,em_santa')
    p.add_argument('--wpm', type=float, default=140)
    p.add_argument('--kokoro-dir', default='.')
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    from faster_whisper import WhisperModel
    whisper = WhisperModel('small', device='cpu', compute_type='int8')
    table, head = (run_gemini if a.engine == 'gemini' else run_kokoro)(a, whisper)
    bad = []
    with open(os.path.join(a.out, 'wer-table-0.md'), 'w') as f:
        f.write(f'{head}\n\n| line | WER | tries | seconds | words | wpm | heard |\n|---|---|---|---|---|---|---|\n')
        for r in table:
            nw = len(words(r['text'], a.lang))
            if r['audio'] is not None:
                write16(os.path.join(a.out, r['id'] + '.wav'), r['audio'], r['sr'])
            if r['wer'] > WER_LIMIT:
                bad.append(r['id'])
            f.write(f"| {r['id']} | {r['wer']:.3f} | {r['tries']} | {r['secs']:.1f} | {nw} | {nw / max(r['secs'], 0.1) * 60:.0f} | {r['said'][:90].replace('|', '/')} |\n")
        tot_w = sum(len(words(r['text'], a.lang)) for r in table)
        tot_s = sum(r['secs'] for r in table)
        f.write(f'\nAll lines: {tot_w} words, {tot_s:.0f} s of speech, {tot_w / tot_s * 60:.0f} wpm over the cut lines.\n')
        f.write('FAILED lines: ' + ', '.join(bad) + '\n' if bad else 'Every line passes the gate (WER <= 0.15).\n')
    print(open(os.path.join(a.out, 'wer-table-0.md')).read())
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
