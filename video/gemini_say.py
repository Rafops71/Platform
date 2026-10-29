#!/usr/bin/env python3
"""Speak one line with Gemini's text-to-speech and write it as a WAV file.

Used by video/make-narration.js when the engine is "gemini" (the owner's choice,
2026-10-29: the voice "Algieba" for every film). The key is read from the
GEMINI_API_KEY environment variable and nowhere else - it is never written to
the repository, never printed, and not in any file. In CI it is a repository
secret; on a machine it is exported for the one command.

  python3 video/gemini_say.py <model> <voice> <style> <out.wav>   (text on stdin)

The free tier is slow and sometimes hangs (one request took 35 minutes on
2026-10-28), so each try has a time limit and a failed try is repeated.
"""
import base64, json, os, sys, time, urllib.error, urllib.request

model, voice, style, out = sys.argv[1:5]
text = sys.stdin.read().strip()
key = os.environ.get("GEMINI_API_KEY", "")
if not key:
    sys.exit("GEMINI_API_KEY is not set, so there is no voice to speak with.")

body = {
    "model": model,
    "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
              "annotations": [{"type": "speech_metadata", "style": style}]}]}],
    "response_format": {"type": "audio"},
    "generation_config": {"speech_config": [{"voice": voice}]},
}


def find_audio(o):
    if isinstance(o, dict):
        if o.get("data") and "audio" in str(o.get("mime_type", "audio")):
            return o
        for v in o.values():
            x = find_audio(v)
            if x:
                return x
    if isinstance(o, list):
        for v in o:
            x = find_audio(v)
            if x:
                return x
    return None


last = "no attempt made"
for attempt in range(1, 5):
    try:
        req = urllib.request.Request(
            "https://generativelanguage.googleapis.com/v1beta/interactions",
            json.dumps(body).encode(),
            {"x-goog-api-key": key, "Content-Type": "application/json"})
        reply = json.load(urllib.request.urlopen(req, timeout=120))
        audio = find_audio(reply)
        if audio:
            open(out, "wb").write(base64.b64decode(audio["data"]))
            sys.exit(0)
        last = "the reply held no audio: " + json.dumps(reply)[:300]
    except urllib.error.HTTPError as err:
        detail = err.read()[:400].decode(errors="ignore")
        last = f"HTTP {err.code}: {detail}"
        if err.code == 429 and "per day" in detail:
            # A DAILY limit does not clear by waiting four times: say so at once.
            sys.exit(f"Gemini's daily limit is used up ({detail[:300]})".replace(key, "<key>"))
        if err.code == 429:  # a per-minute limit: wait it out
            time.sleep(65)
    except Exception as err:  # a timeout or a 5xx: wait and try again
        last = f"{type(err).__name__}: {str(err)[:200]}"
    print(f"  attempt {attempt} failed ({last.replace(key, '<key>')})", file=sys.stderr)
    time.sleep(5 * attempt)
sys.exit(f"Gemini gave no voice after 4 tries: {last}".replace(key, "<key>"))
