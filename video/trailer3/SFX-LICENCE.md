# Sound effects (sample 1)

The three effects (whoosh, click, low tone) are GENERATED on the runner by `ffmpeg` from synthetic noise and sine waves
(see the "Sound effects" step of the `trailer_sample_1` job in `.github/workflows/voice-test.yml`). No third-party sound is used,
so there is no third-party licence. They belong to the project; nothing in them is copied from any recording.

Why not fetched CC0 files: on 2026-11-03 freesound.org (pages and cdn.freesound.org previews) and Pixabay returned HTTP 403 from the
build container, and Openverse timed out, so no CC0 file could be fetched and its licence page read. If the owner prefers recorded
CC0 effects, the candidates recorded in the storyboard table (freesound 60007, 60000 whoosh; 333575 click, all listed as CC0 by an earlier
lookup, NOT re-checked) can be swapped in once a source works. The Nastelbom music is NOT part of this artifact (licence).
