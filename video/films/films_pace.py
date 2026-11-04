#!/usr/bin/env python3
"""Per-block pace for the walkthrough films: every block is brought to 140 wpm (the owner is sensitive to pace; asked for
136-144 inside each block). No Gemini request: it takes the finished voice (films-voice artifact: voice-track.wav + timings.json),
cuts each block out at the middle of the silences between blocks, applies one more ffmpeg atempo (140 / the block's measured
wpm), and lays the blocks again with the same lead and gaps. Word times move with the audio.
    python3 films_pace.py IN_DIR OUT_DIR           (IN_DIR holds voice-track.wav and timings.json of one film)
Writes voice-track.wav/.mp3, timings.json and pace-table.md (block, wpm before, wpm after, factor).
"""
import json, os, subprocess, sys
import numpy as np
import soundfile as sf

TARGET = 140.0
SR = 24000


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    T = json.load(open(os.path.join(src, 'timings.json')))
    wav, sr = sf.read(os.path.join(src, 'voice-track.wav'), dtype='float32')
    assert sr == SR, sr
    gap, B = T['gap_s'], T['blocks']
    lead = B[0]['start_s']
    rows, clips = [], []
    for i, b in enumerate(B):
        n = len(b['text'].split())
        span = b['end_s'] - b['start_s']
        before = n / span * 60
        f = TARGET / before                         # atempo factor: >1 speeds up
        prev_end = B[i - 1]['end_s'] if i else 0.0
        nxt = B[i + 1]['start_s'] if i + 1 < len(B) else len(wav) / SR
        c0 = (prev_end + b['start_s']) / 2 if i else max(0.0, b['start_s'] - 0.3)
        c1 = (b['end_s'] + nxt) / 2 if i + 1 < len(B) else b['end_s'] + 0.5
        seg = wav[int(c0 * SR):int(c1 * SR)]
        tmp_in, tmp_out = os.path.join(out, f'_in{i}.wav'), os.path.join(out, f'_out{i}.wav')
        sf.write(tmp_in, seg, SR)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp_in, '-af', f'atempo={f:.5f}', tmp_out], check=True)
        seg2, _ = sf.read(tmp_out, dtype='float32')
        os.remove(tmp_in); os.remove(tmp_out)
        clips.append((seg2, (b['start_s'] - c0) / f, f, c0, b))
        rows.append([b['block'], n, before, f])
    t = lead
    out_blocks, parts = [], []
    for seg2, lead_in, f, c0, b in clips:
        parts.append((t - lead_in, seg2))
        new_span = (b['end_s'] - b['start_s']) / f
        words = [dict(w=w['w'], start=round(t + (w['start'] - b['start_s']) / f, 3), end=round(t + (w['end'] - b['start_s']) / f, 3)) for w in b['words']]
        out_blocks.append(dict(block=b['block'], text=b['text'], start_s=round(t, 3), end_s=round(t + new_span, 3), words=words))
        t += new_span + gap
    total = out_blocks[-1]['end_s'] + 1.0
    track = np.zeros(int(total * SR) + SR, dtype=np.float32)
    for st, seg2 in parts:
        i0 = int(round(st * SR))
        a, z = max(0, i0), min(len(track), i0 + len(seg2))
        track[a:z] += seg2[a - i0:z - i0]
    track = track[:int(total * SR)]
    track = track / (float(np.max(np.abs(track))) or 1.0) * 0.9
    sf.write(os.path.join(out, 'voice-track.wav'), track, SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(out, 'voice-track.wav'), '-b:a', '192k', os.path.join(out, 'voice-track.mp3')], check=True)
    json.dump(dict(film=T['film'], total_s=round(total, 3), gap_s=gap, blocks=out_blocks), open(os.path.join(out, 'timings.json'), 'w'), indent=1, ensure_ascii=False)
    lines = [f"{T['film']}: per-block pace to {TARGET:.0f} wpm (words of the approved text / first-to-last heard word)\n",
             '| block | words | wpm before | atempo factor | wpm after |', '|---|---|---|---|---|']
    ok = True
    for (blk, n, before, f), b in zip(rows, out_blocks):
        after = n / (b['end_s'] - b['start_s']) * 60
        ok &= 136 <= after <= 144
        lines.append(f'| {blk} | {n} | {before:.0f} | {f:.3f} | {after:.1f} |')
    lines.append(f'\ntotal {total:.1f} s\n' + ('All blocks within 136-144 wpm.' if ok else 'FAILED: a block is outside 136-144 wpm.'))
    open(os.path.join(out, 'pace-table.md'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    sys.exit(0 if ok else 1)


main()
