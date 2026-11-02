#!/usr/bin/env python3
"""Speak many lines with Chatterbox-Multilingual (Resemble AI, MIT weights) and CHECK EVERY ONE BY EAR.

Owner's decision, 2026-11-01: Chatterbox is the voice for every film, the same default voice in both
languages. The first Member film was rejected: in one line the voice spoke nonsense (a Chatterbox
hallucination), and nobody in the pipeline could hear it. So this script has a machine ear:

  every sentence is transcribed again with faster-whisper (MIT, CPU) in the line's language and compared
  with the script text (lowercase, no punctuation; word error rate). A sentence with WER > 0.15, or
  audio far longer than its words need, is spoken again with a new seed - up to 5 tries, keeping the
  best. A line whose final WER is still above 0.15 FAILS the job, which names the line. The per-line
  table (line, WER, tries, seconds, what the machine heard) is written next to the clips and to the run
  summary. Nothing is shipped with a failed line.

    python3 video/chatterbox_say.py JOBS.json [TABLE.md]

JOBS.json: a list of {"text": "...", "lang": "en" | "es", "out": "path.wav", "id": "name"}.
The speech model loads once for the batch; the model for listening is the "small" Whisper.

API as read from the installed package (chatterbox-tts 0.1.7, mtl_tts.py):
ChatterboxMultilingualTTS.from_pretrained(device) and generate(text, language_id), sample rate model.sr.
Outputs carry Resemble's imperceptible PerTh watermark.
"""
import json, re, sys, time
import numpy as np
import torch, torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from faster_whisper import WhisperModel

BREATH_SECONDS = 0.25
# Words the listener should expect (it only biases the spelling of what it hears, it cannot invent speech).
VOCAB = {
    'en': 'MyPlatform, Incoterm, CIF, FOB, copper cathodes, Operator, Mailbox, Chile, Rotterdam.',
    'es': 'MyPlatform, Incoterm, CIF, FOB, cátodos de cobre, Operador, Buzón, Chile, Rotterdam.',
}
WER_LIMIT = 0.15
SENTENCE_FAIL = 0.35
TRIES = 8
# A sentence needs about 0.4 s a word; far above that is mumbling or a loop. The flat part is generous because
# Chatterbox pads one-word sentences ("Discreción.") with silence; babble would also show up as extra words in the WER.
MAX_SECONDS_PER_WORD = 0.9
MAX_SECONDS_FLAT = 4.0


def sentences(text):
    return [p for p in re.split(r'(?<=[.!?])\s+', text.strip()) if p]


# Pronunciation hints, English only and for the SPEAKER only (the script text and the comparison keep the real
# words): the model reads an acronym as a word ("zif") and a country name wrongly.
SAY_AS = [(r'\bCIF\b', 'C I F'), (r'\bFOB\b', 'F O B'), (r'\bLME\b', 'L M E'), (r'\bCFR\b', 'C F R'),
          (r'\bChile\b', 'Chilly')]
LANG_NAMES = {'en': 'en', 'es': 'es'}


def to_speak(text, lang):
    if lang == 'en':
        for pat, rep_ in SAY_AS:
            text = re.sub(pat, rep_, text)
    return text


_EN_U = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
_EN_T = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split()
_ES_U = ('cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis '
         'diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis '
         'veintisiete veintiocho veintinueve').split()
_ES_T = 'x x x treinta cuarenta cincuenta sesenta setenta ochenta noventa'.split()
_ES_H = 'x ciento doscientos trescientos cuatrocientos quinientos seiscientos setecientos ochocientos novecientos'.split()


def _words_en(n):
    if n < 20: return _EN_U[n]
    if n < 100: return _EN_T[n // 10] + ('' if n % 10 == 0 else ' ' + _EN_U[n % 10])
    if n < 1000: return _EN_U[n // 100] + ' hundred' + ('' if n % 100 == 0 else ' ' + _words_en(n % 100))
    return _words_en(n // 1000) + ' thousand' + ('' if n % 1000 == 0 else ' ' + _words_en(n % 1000))


def _words_es(n):
    if n < 30: return _ES_U[n]
    if n < 100: return _ES_T[n // 10] + ('' if n % 10 == 0 else ' y ' + _ES_U[n % 10])
    if n == 100: return 'cien'
    if n < 1000: return _ES_H[n // 100] + ('' if n % 100 == 0 else ' ' + _words_es(n % 100))
    head = 'mil' if n // 1000 == 1 else _words_es(n // 1000) + ' mil'
    return head + ('' if n % 1000 == 0 else ' ' + _words_es(n % 1000))


def spell_numbers(text, lang):
    # "600" and "six hundred" are the same speech: both sides are compared as words.
    f = _words_es if lang == 'es' else _words_en
    return re.sub(r'\d{1,6}', lambda m: ' ' + f(int(m.group())) + ' ', text)


def words(text, lang='en'):
    t = spell_numbers(text, lang).lower().replace('my platform', 'myplatform')
    t = re.sub(r'[^\w\s]', ' ', t)
    t = re.sub(r'cientas\b', 'cientos', t)  # quinientas (feminine, as in 'una partida') = quinientos
    toks = t.split()
    # "c i f" (spoken as letters) is the word "cif"; "chilly" is Chile.
    out, run = [], []
    for w_ in toks + ['']:
        if len(w_) == 1:
            run.append(w_)
            continue
        if run:
            out.append(''.join(run)) if len(run) > 1 else out.append(run[0])
            run = []
        if w_:
            out.append({'chilly': 'chile'}.get(w_, w_))
    return out


def wer(ref, hyp, lang='en'):
    r, h = words(ref, lang), words(hyp, lang)
    if not r:
        return 0.0 if not h else 1.0
    d = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        prev, d[0] = d[0], i
        for j, hw in enumerate(h, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (rw != hw))
            prev, d[j] = d[j], cur
    return d[len(h)] / len(r)


def listen(whisper, wav, sr, lang):
    mono = wav.reshape(-1).float().cpu()
    mono = ta.functional.resample(mono, sr, 16000).numpy().astype(np.float32)
    segs, _ = whisper.transcribe(mono, language=lang, beam_size=5, initial_prompt=VOCAB.get(lang))
    return ' '.join(s.text.strip() for s in segs)


def main() -> int:
    jobs = json.load(open(sys.argv[1], encoding='utf8'))
    table_path = sys.argv[2] if len(sys.argv) > 2 else None
    t0 = time.time()
    model = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
    whisper = WhisperModel('small', device='cpu', compute_type='int8')
    print(f'models loaded in {time.time()-t0:.0f}s, {len(jobs)} lines', flush=True)
    gap = torch.zeros(1, int(BREATH_SECONDS * model.sr))
    rows, failed = [], []
    for n, job in enumerate(jobs, 1):
        t0 = time.time()
        chunks, heard, tries_total, worst_sentence = [], [], 0, 0.0
        for s in sentences(job['text']):
            best = None
            for attempt in range(TRIES):
                tries_total += 1
                torch.manual_seed(1000 + 17 * attempt)
                # Later tries run cooler (less random) - hallucinated tails are what a high temperature produces.
                wav = model.generate(to_speak(s, job['lang']), language_id=job['lang'],
                                     temperature=max(0.3, 0.8 - 0.08 * attempt)).reshape(1, -1).cpu()
                seconds = wav.shape[-1] / model.sr
                text = listen(whisper, wav, model.sr, job['lang'])
                score = wer(s, text, job['lang'])
                too_long = seconds > MAX_SECONDS_FLAT + MAX_SECONDS_PER_WORD * len(words(s, job['lang']))
                if too_long:
                    score = max(score, 1.0)
                if best is None or score < best[0]:
                    best = (score, wav, text)
                if score <= WER_LIMIT:
                    break
            worst_sentence = max(worst_sentence, best[0])
            chunks.extend([best[1], gap])
            heard.append(best[2])
        out = torch.cat(chunks[:-1], dim=1)
        ta.save(job['out'], out, model.sr)
        line_wer = wer(job['text'], ' '.join(heard), job['lang'])
        # The owner's rule is on the LINE (WER above 0.15 fails); a single sentence far beyond the limit is a broken
        # sentence hidden in a long line, so that fails too.
        ok = line_wer <= WER_LIMIT and worst_sentence <= SENTENCE_FAIL
        row = dict(id=job.get('id', job['out']), lang=job['lang'], wer=round(line_wer, 3),
                   worst_sentence=round(worst_sentence, 3), tries=tries_total,
                   seconds=round(out.shape[-1] / model.sr, 1), ok=ok, heard=' '.join(heard))
        rows.append(row)
        if not ok:
            failed.append(row['id'])
        print(f'{n}/{len(jobs)} {row["id"]} {job["lang"]} wer={row["wer"]} tries={tries_total} '
              f'{row["seconds"]}s {"OK" if ok else "FAILED"} (took {time.time()-t0:.0f}s)', flush=True)
    if table_path:
        with open(table_path, 'w', encoding='utf8') as f:
            f.write('| line | lang | WER | worst sentence | tries | seconds | result |\n|---|---|---|---|---|---|---|\n')
            for r in rows:
                f.write(f'| {r["id"]} | {r["lang"]} | {r["wer"]} | {r["worst_sentence"]} | {r["tries"]} | {r["seconds"]} | {"ok" if r["ok"] else "FAILED"} |\n')
            bad = [r for r in rows if not r['ok']]
            if bad:
                f.write('\nWhat the machine ear heard on the failed lines:\n\n')
                for r in bad:
                    f.write(f'- {r["id"]}: {r["heard"]}\n')
        json.dump(rows, open(table_path.rsplit('.', 1)[0] + '.json', 'w'), ensure_ascii=False, indent=1)
    if failed:
        print('FAILED LINES (WER above %.2f after %d tries): %s' % (WER_LIMIT, TRIES, ', '.join(failed)), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
