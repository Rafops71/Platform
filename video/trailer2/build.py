#!/usr/bin/env python3
"""Builds the new English trailer from: the checked narration (voice.py), the real-app pictures (capture.js) and the
approved text (parts.json).

  python3 video/trailer2/build.py VOICE_DIR CAPTURE_DIR OUT_DIR

Every sentence of the approved text is found in the narration by its words (difflib over what the listener heard), so
each picture changes exactly when its sentence starts. The narration is cut into its seven parts and a calm pause is
laid between them; the voice is never sped up. Pictures: text cards for parts 1, 2, 5, 6 and 7, the real app for
part 3, one small diagram for part 4. Light look, whole-sentence captions (the sentence IS the picture's text), slow fades.
"""
import difflib, json, os, re, subprocess, sys
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
LEAD, TAIL, PART_GAP = 0.8, 2.6, 1.1      # seconds of quiet before, after, and between parts
PRE, POST = 0.30, 0.55                    # a part's audio starts this much before its first word and ends this much after its last
FADE = 0.8


def norm(w):
    return re.sub(r"[^\w]", '', w.lower().replace("'", ''))


def main():
    voice, cap, out = sys.argv[1:4]
    os.makedirs(out, exist_ok=True)
    spec = json.load(open(os.path.join(HERE, 'parts.json'), encoding='utf8'))
    parts = spec['parts']

    # 1. Where does every sentence sit in the narration?
    sent_times = {}                                   # (part, sentence) -> (start, end) in its request's file
    for n, idxs in enumerate(spec['requests']):
        heard = json.load(open(os.path.join(voice, f'voice-{n}.words.json')))
        hw = [norm(h['word']) for h in heard]
        refs = []                                     # (part, sentence, word)
        for p in idxs:
            for s, sentence in enumerate(parts[p]):
                refs += [(p, s, norm(w)) for w in sentence.split() if norm(w)]
        sm = difflib.SequenceMatcher(None, [r[2] for r in refs], hw, autojunk=False)
        match = {}
        for a, b, size in sm.get_matching_blocks():
            for k in range(size):
                match[a + k] = b + k
        for p in idxs:
            for s, _ in enumerate(parts[p]):
                ks = [k for k, r in enumerate(refs) if r[0] == p and r[1] == s]
                got = [match[k] for k in ks if k in match]
                if not got:
                    raise SystemExit(f'sentence {p}.{s} was not found in the narration')
                sent_times[(p, s)] = (heard[min(got)]['start'], heard[max(got)]['end'], n)
    # 2. Cut the narration into parts and lay the timeline.
    audio = {}
    for n in range(len(spec['requests'])):
        a, sr = sf.read(os.path.join(voice, f'voice-{n}.wav'), dtype='float32')
        audio[n] = (a if a.ndim == 1 else a.mean(axis=1), sr)
    sr = audio[0][1]
    chunks, timeline, t = [np.zeros(int(LEAD * sr), dtype='float32')], {}, LEAD
    for p, sentences in enumerate(parts):
        n = sent_times[(p, 0)][2]
        a, _ = audio[n]
        first = sent_times[(p, 0)][0]
        last = sent_times[(p, len(sentences) - 1)][1]
        nxt = min((sent_times[(q, 0)][0] for q in range(p + 1, len(parts)) if sent_times[(q, 0)][2] == n), default=None)
        prev_end = max((sent_times[(q, len(parts[q]) - 1)][1] for q in range(p) if sent_times[(q, 0)][2] == n), default=0.0)
        lo = max(first - PRE, (prev_end + first) / 2 if prev_end else 0.0)
        hi = min(last + POST, (last + nxt) / 2 if nxt else len(a) / sr)
        chunk = a[int(lo * sr):int(hi * sr)]
        for s in range(len(sentences)):
            st, en, _ = sent_times[(p, s)]
            timeline[(p, s)] = (t + (st - lo), t + (en - lo))
        chunks.append(chunk)
        t += len(chunk) / sr
        chunks.append(np.zeros(int((PART_GAP if p < len(parts) - 1 else TAIL) * sr), dtype='float32'))
        t += PART_GAP if p < len(parts) - 1 else TAIL
    total = t
    sf.write(os.path.join(out, 'narration.wav'), np.concatenate(chunks), sr)

    # 3. One picture per sentence; it appears when its sentence starts.
    pic = {  # (part, sentence) -> kind, extra
        (0, 0): ('text',), (0, 1): ('text',), (1, 0): ('text',), (1, 1): ('text',),
        (2, 0): ('app', 'listing-0.png'), (2, 1): ('app', 'listing-1.png'), (2, 2): ('app', 'browse-top.png'),
        (3, 0): ('diagram', 1), (3, 1): ('diagram', 2),
        (4, 0): ('text',), (4, 1): ('text',), (5, 0): ('text',), (5, 1): ('text',), (6, 0): ('text',),
    }
    items = []
    keys = [(p, s) for p, ss in enumerate(parts) for s in range(len(ss))]
    for i, key in enumerate(keys):
        kind = pic[key]
        it = dict(id=f'i{i:02d}', kind=kind[0], sentence=parts[key[0]][key[1]])
        if kind[0] == 'app':
            it['image'] = os.path.abspath(os.path.join(cap, kind[1]))
        if kind[0] == 'diagram':
            it['step'] = kind[1]
        items.append(it)
    json.dump(items, open(os.path.join(out, 'cards.json'), 'w'))
    subprocess.run(['node', os.path.join(HERE, 'cards.js'), os.path.join(out, 'cards.json'), os.path.join(out, 'cards')], check=True)

    # 4. Put it together: each picture from its sentence's start (a little early, fading in) to the next one's.
    starts = [0.0 if i == 0 else timeline[k][0] - 0.35 for i, k in enumerate(keys)]
    ends = starts[1:] + [total]
    cmd = ['ffmpeg', '-v', 'error', '-y']
    flt = []
    for i, it in enumerate(items):
        dur = ends[i] - starts[i] + (FADE if i < len(items) - 1 else 0)
        cmd += ['-loop', '1', '-framerate', '25', '-t', f'{dur:.3f}', '-i', os.path.join(out, 'cards', it['id'] + '.png')]
        fin = f'fade=t=in:st=0:d={FADE}' if i > 0 else f'fade=t=in:st=0:d=1.2'
        fout = f'fade=t=out:st={dur - FADE:.3f}:d={FADE}' if i < len(items) - 1 else f'fade=t=out:st={dur - 1.5:.3f}:d=1.5'
        flt.append(f'[{i}:v]format=yuv420p,{fin},{fout},setpts=PTS-STARTPTS+{starts[i]:.3f}/TB[v{i}]')
    # overlay the clips on a white canvas, in order, each at its own start time
    flt.append(f'color=c=white:s=1920x1080:r=25:d={total:.3f}[base]')
    prev = 'base'
    for i in range(len(items)):
        flt.append(f'[{prev}][v{i}]overlay=eof_action=pass:format=auto[o{i}]')
        prev = f'o{i}'
    cmd += ['-i', os.path.join(out, 'narration.wav'),
            '-filter_complex', ';'.join(flt), '-map', f'[{prev}]', '-map', f'{len(items)}:a',
            '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', '25',
            '-c:a', 'aac', '-b:a', '128k', '-t', f'{total:.3f}', '-movflags', '+faststart', os.path.join(out, 'trailer-en.mp4')]
    subprocess.run(cmd, check=True)
    print(f'trailer-en.mp4: {total:.1f} s')
    with open(os.path.join(out, 'timeline.md'), 'w') as f:
        f.write('| sentence | start s | end s |\n|---|---|---|\n')
        for k in keys:
            f.write(f'| {k[0] + 1}.{k[1] + 1} | {timeline[k][0]:.1f} | {timeline[k][1]:.1f} |\n')


if __name__ == '__main__':
    main()
