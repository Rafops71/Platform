#!/usr/bin/env python3
"""Cut list for the new English trailer (Remotion/OpenMontage Explainer with the bespoke scenes of
MyPlatformScenes.tsx, restyled in the app's own light colours).

  python3 video/trailer2/build.py VOICE_DIR OUT_DIR

Reads the checked narration (voice.py) and the approved text (parts.json); finds each sentence in the narration by its
words (difflib over what the listener heard); cuts the narration into its seven parts with a calm pause between them
(the voice is never sped up); writes OUT_DIR/narration.wav and OUT_DIR/trailer-en.json. Scene per part:
  1 globe  2 port  3 the real app (pictures from capture.js)  4 the Operator diagram  5 three cards  6, 7 tagline.
On screen there is only the approved text: whole-sentence captions, and a few single words taken from it.
"""
import difflib, json, os, re, sys
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
LEAD, TAIL, PART_GAP = 0.9, 6.5, 1.2
USED = [0, 1, 2, 3, 4, 6]  # part 6 (the success-fee sentence) is not spoken; it is a text card at the end (owner, v8)
CARD = 'Free to join. We are paid a success fee only when an introduction leads to a concluded deal.'
PRE, POST = 0.30, 0.55


def norm(w):
    return re.sub(r"[^\w]", '', w.lower().replace("'", ''))


def main():
    voice, out = sys.argv[1:3]
    cap = sys.argv[3] if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    spec = json.load(open(os.path.join(HERE, 'parts.json'), encoding='utf8'))
    parts = spec['parts']
    sent, heard_by = {}, {}
    for n, idxs in enumerate(spec['requests']):
        heard = json.load(open(os.path.join(voice, f'voice-{n}.words.json')))
        heard_by[n] = heard
        hw = [norm(h['word']) for h in heard]
        refs = [(p, s, norm(w)) for p in idxs for s, sentence in enumerate(parts[p]) for w in sentence.split() if norm(w)]
        sm = difflib.SequenceMatcher(None, [r[2] for r in refs], hw, autojunk=False)
        match = {}
        for a, b, size in sm.get_matching_blocks():
            for k in range(size):
                match[a + k] = b + k
        for p in idxs:
            for s in range(len(parts[p])):
                got = [match[k] for k, r in enumerate(refs) if r[0] == p and r[1] == s and k in match]
                if not got:
                    raise SystemExit(f'sentence {p + 1}.{s + 1} was not found in the narration')
                sent[(p, s)] = (heard[min(got)]['start'], heard[max(got)]['end'], n)
    audio = {}
    for n in range(len(spec['requests'])):
        a, sr = sf.read(os.path.join(voice, f'voice-{n}.wav'), dtype='float32')
        audio[n] = (a if a.ndim == 1 else a.mean(axis=1), sr)
    sr = audio[0][1]
    chunks, tl, part_span, t = [np.zeros(int(LEAD * sr), dtype='float32')], {}, {}, LEAD
    for p in USED:
        sentences = parts[p]
        n = sent[(p, 0)][2]
        a = audio[n][0]
        first, last = sent[(p, 0)][0], sent[(p, len(sentences) - 1)][1]
        nxt = min((sent[(q, 0)][0] for q in range(p + 1, len(parts)) if sent[(q, 0)][2] == n), default=None)
        prev_end = max((sent[(q, len(parts[q]) - 1)][1] for q in range(p) if sent[(q, 0)][2] == n), default=0.0)
        lo = max(first - PRE, (prev_end + first) / 2 if prev_end else 0.0)
        hi = min(last + POST, (last + nxt) / 2 if nxt else len(a) / sr)
        chunk = a[int(lo * sr):int(hi * sr)]
        for s in range(len(sentences)):
            tl[(p, s)] = (t + sent[(p, s)][0] - lo, t + sent[(p, s)][1] - lo)
        part_span[p] = (t, t + len(chunk) / sr)
        chunks.append(chunk)
        gap = PART_GAP if p != USED[-1] else TAIL
        chunks.append(np.zeros(int(gap * sr), dtype='float32'))
        t += len(chunk) / sr + gap
    total = t
    sf.write(os.path.join(out, 'narration.wav'), np.concatenate(chunks), sr)

    # single spoken words of part 5 (members, documents, transactions) for the three cards
    def word_time(p, word):
        n = sent[(p, 0)][2]
        for h in heard_by[n]:
            if norm(h['word']) == word and sent[(p, 0)][0] - 0.2 <= h['start'] <= sent[(p, len(parts[p]) - 1)][1]:
                return h['start']
        return None
    # scene boundaries: the middle of the quiet between parts
    bounds = [0.0] + [(part_span[USED[i]][1] + part_span[USED[i + 1]][0]) / 2 for i in range(len(USED) - 1)] + [total]
    bi = {p: i for i, p in enumerate(USED)}

    def sentence_labels(p, skip_first=False):
        lab = {}
        k = 1
        for s in range(len(parts[p])):
            if skip_first and s == 0:
                continue
            lab[f's{k}'] = parts[p][s]
            lab[f't{k}'] = f'{max(0.0, tl[(p, s)][0] - bounds[bi[p]] - 0.35):.2f}'
            k += 1
        return lab

    if cap:
        # The two listing pictures are cut a little above the app's "No documents indicated" line (that line is about
        # uploaded files and would read as the opposite of the poster's own statement).
        from PIL import Image
        for name in ('listing-0.png', 'listing-1.png'):
            im = Image.open(os.path.join(cap, name))
            im.crop((0, 0, im.width, im.height - 32)).save(os.path.join(out, name))
        Image.open(os.path.join(cap, 'browse-top.png')).save(os.path.join(out, 'browse-top.png'))

    scenes = []
    scenes.append(dict(kind='globe', labels=dict(title=' ', caption='', **sentence_labels(0))))
    scenes.append(dict(kind='port', labels=dict(producer='', buyer='', caption='', **sentence_labels(1))))
    lab = dict(sentence_labels(2))
    imgs = ['listing-0.png', 'listing-1.png', 'browse-top.png']
    for i, im in enumerate(imgs, 1):
        lab[f'img{i}'] = im
        lab[f'a{i}'] = lab[f't{i}']
    scenes.append(dict(kind='appshots', labels=lab))
    scenes.append(dict(kind='broker', labels=dict(memberA='Member', memberB='Member', operator='Operator', caption='', agreed='', **sentence_labels(3))))
    ts = [word_time(4, w) for w in ('members', 'documents', 'transactions')]
    base = [tl[(4, 0)][0] - bounds[bi[4]] if v is None else v + (tl[(4, 0)][0] - sent[(4, 0)][0]) - bounds[bi[4]] for v in ts]
    scenes.append(dict(kind='benefits', labels=dict(b1='Members', b1line='', b2='Documents', b2line='', b3='Transactions', b3line='', **sentence_labels(4)),
                       at=[max(0.4, x) for x in base]))
    scenes.append(dict(kind='endcard', labels=dict(title='Where opportunity meets discretion.', card=CARD, cardAt=f'{max(0.0, tl[(6, 0)][0] - bounds[bi[6]] - 0.35):.2f}')))

    cuts = []
    for i, sc in enumerate(scenes):
        c = dict(id=f's{i + 1}', source='', type='mp_scene', mpKind=sc['kind'], mpLabels=sc['labels'],
                 in_seconds=round(bounds[i], 3), out_seconds=round(bounds[i + 1], 3))
        if 'at' in sc:
            c['mpAt'] = [round(x, 2) for x in sc['at']]
        cuts.append(c)
    # the Explainer expects at least the three arrival times; the cards scene uses them
    doc = dict(theme='flat-motion-graphics', cuts=cuts, overlays=[], captions=[],
               audio=dict(narration=dict(src='mp/narration-en-new.wav', volume=1)))
    json.dump(doc, open(os.path.join(out, 'trailer-en.json'), 'w'), ensure_ascii=False, indent=1)
    with open(os.path.join(out, 'timeline.md'), 'w') as f:
        f.write('| sentence | start s | end s |\n|---|---|---|\n')
        for (p, s), (a, b) in sorted(tl.items()):
            f.write(f'| {p + 1}.{s + 1} | {a:.1f} | {b:.1f} |\n')
    print(f'end card shown from {bounds[-2] + float(scenes[-1]["labels"]["cardAt"]):.1f} s to {total:.1f} s = {total - bounds[-2] - float(scenes[-1]["labels"]["cardAt"]):.1f} s')
    print(f'{total:.1f} s, {len(cuts)} scenes')


if __name__ == '__main__':
    main()
