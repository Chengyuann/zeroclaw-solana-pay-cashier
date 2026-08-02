# Proof-Carrying Cashier Demo Video

- Runtime: 75.3 seconds
- Format: 1920x1080, 30 fps, H.264 video, AAC stereo audio
- Narration: local VoxCPM2, English, no background music
- Captions: English SRT plus burned-in captions
- Evidence: signed Agave local-validator transaction, explicitly labeled localnet
- Visual edit: chapter cards, evidence wipes, subtle camera movement, progressive
  data reveals, and proof-console focus

## QA

- Full MP4 decode: passed
- Black-frame scan: passed
- Silence scan: passed
- Integrated loudness: -16.0 LUFS
- True peak: -2.0 dBFS
- Resolution/audio checks: passed
- Source narration ASR: 7/7 scenes passed
- Encoded MP4 scene ASR: 7/7 scenes passed at a 0.85 threshold
- Contact-sheet visual review: passed

The standard whole-file narration checker records a known Whisper tiny context
limit: its one-pass transcript stops near 30 seconds. The included segmented
encoded-scene report verifies every narration scene from the final AAC track.

No music or third-party stock media is used.
