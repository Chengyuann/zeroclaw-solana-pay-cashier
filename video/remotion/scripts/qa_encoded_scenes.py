#!/usr/bin/env python3
"""Verify each narration scene after AAC encoding in the final MP4."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
from difflib import SequenceMatcher
from pathlib import Path

import librosa
import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor


def normalize(value: str) -> str:
    return "".join(re.findall(r"[\w]+", value.lower()))


def similarity(expected: str, actual: str) -> float:
    return SequenceMatcher(None, normalize(expected), normalize(actual)).ratio()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", default="out/final.mp4")
    parser.add_argument("--timeline", default="src/data/timeline.json")
    parser.add_argument("--output", default="qa/final/encoded-scene-report.json")
    parser.add_argument("--threshold", type=float, default=0.85)
    args = parser.parse_args()

    root = Path.cwd()
    video = root / args.video
    timeline = json.loads((root / args.timeline).read_text(encoding="utf-8"))
    processor = WhisperProcessor.from_pretrained(
        "openai/whisper-tiny.en", local_files_only=True
    )
    model = WhisperForConditionalGeneration.from_pretrained(
        "openai/whisper-tiny.en", local_files_only=True
    )
    model.eval()

    reports: list[dict[str, object]] = []
    failures: list[str] = []
    with tempfile.TemporaryDirectory(prefix="encoded-scenes-") as temp:
        temp_dir = Path(temp)
        for scene in timeline["scenes"]:
            scene_id = str(scene["id"])
            output = temp_dir / f"{scene_id}.wav"
            subprocess.run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-y",
                    "-ss",
                    str(scene["start_seconds"]),
                    "-t",
                    str(scene["audio_duration_seconds"]),
                    "-i",
                    str(video),
                    "-vn",
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    "-c:a",
                    "pcm_s16le",
                    str(output),
                ],
                check=True,
            )
            audio, _ = librosa.load(output, sr=16000, mono=True)
            inputs = processor(audio, sampling_rate=16000, return_tensors="pt")
            with torch.no_grad():
                generated = model.generate(inputs.input_features)
            transcript = processor.batch_decode(
                generated, skip_special_tokens=True
            )[0].strip()
            score = similarity(str(scene["voiceover"]), transcript)
            if score < args.threshold:
                failures.append(f"{scene_id}: {score:.3f}")
            reports.append(
                {
                    "scene_id": scene_id,
                    "expected_text": scene["voiceover"],
                    "asr_transcript": transcript,
                    "asr_similarity": round(score, 3),
                }
            )

    report = {
        "version": 1,
        "status": "passed" if not failures else "failed",
        "threshold": args.threshold,
        "video": args.video,
        "scene_reports": reports,
        "failures": failures,
        "note": (
            "Segmented QA avoids Whisper tiny's approximately 30-second "
            "single-pass context limit while testing the encoded MP4 audio."
        ),
    }
    output_path = root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "output": str(output_path)}))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
