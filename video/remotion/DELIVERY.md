# Proof-Carrying Cashier Video Delivery

## Primary live walkthrough

- Runtime: 59.13 seconds
- Format: 1920x1080, 30 fps, H.264 video, AAC stereo audio
- Product evidence: real Cloudflare Pages browser recording and real Terminal
  recording of `npm run verify:public-proof`
- Primary package: `outputs/video-delivery-live/`
- Narration: local VoxCPM2, English
- Background music: user-provided source, mixed under narration with sidechain
  ducking
- Captions: English SRT plus burned-in captions
- Evidence: signed Agave local-validator transaction, explicitly labeled localnet
- Visual edit: chapter labels, transitions, and evidence-focused framing
- Clean capture: browser chrome, tabs, and unrelated pages are excluded

## QA

- Full MP4 decode: passed
- Black-frame scan: passed
- Silence scan: passed
- Integrated loudness: -16.0 LUFS
- True peak: -2.0 dBFS
- Resolution/audio checks: passed
- Source narration ASR: 5/5 scenes passed
- Voice reference ASR: passed
- Encoded MP4 scene ASR: 5/5 scenes passed at a 0.85 threshold
- Contact-sheet visual review: passed

The standard whole-file narration checker records a known Whisper tiny
context limit: its one-pass transcript stops near 30 seconds. The included
segmented encoded-scene report verifies every narration scene from the final
AAC track.

## Director Cut

The earlier 75.33-second Director Cut remains available as an editorial
overview. It uses the same evidence boundary but is not the primary review
walkthrough.
