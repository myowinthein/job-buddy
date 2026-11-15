"""Generate one cached narration segment with a local Kokoro ONNX model."""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("request", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
request = json.loads(args.request.read_text())

from kokoro_onnx import Kokoro
import soundfile
import numpy

engine = Kokoro(request["model"], request["voices"])
# Kokoro 0.5 sends integer speed to the pinned model's float input.
# Keep this compatibility conversion local to this engine instance.
original_run = engine.sess.run

def run_with_float_speed(outputs, inputs, *args, **kwargs):
    inputs["speed"] = numpy.asarray(inputs["speed"], dtype=numpy.float32)
    return original_run(outputs, inputs, *args, **kwargs)

engine.sess.run = run_with_float_speed
segments = []
timings = []
elapsed = 0.0
for sentence in re.split(r"(?<=[.!?])\s+", request["text"].strip()):
    audio, sample_rate = engine.create(
        sentence, voice=request["voice"], speed=float(request["speed"]), lang="en-us"
    )
    if len(audio) == 0:
        raise RuntimeError("Kokoro returned no speech audio")
    duration = len(audio) / sample_rate
    timings.append({"text": sentence, "start": elapsed, "end": elapsed + duration})
    pause = numpy.zeros(round(sample_rate * 0.12), dtype=numpy.float32)
    segments.extend([audio, pause])
    elapsed += duration + 0.12
soundfile.write(str(args.output), numpy.concatenate(segments), sample_rate, subtype="PCM_16")
args.output.with_suffix(".timing.json").write_text(json.dumps(timings))
