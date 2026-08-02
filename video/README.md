# Demo video

The prepared Director Cut showcase is 75.3 seconds, 1920x1080, with local
VoxCPM2 English narration and captions. It uses a real signed Agave
local-validator payment and labels that evidence level explicitly.

The second cut adds chapter transitions, controlled camera motion, progressive
evidence reveals, proof-console focus, and an updated independent-verification
close. It does not add stock footage, music, or unverified product claims.

The repository keeps the Remotion source, storyboard, subtitles, and
de-identified product evidence. The `outputs/video-delivery-v2/` package
contains:

- final MP4;
- SRT captions;
- full source archive with narration assets;
- video and encoded-scene audio QA reports;
- contact sheet;
- SHA-256 manifest.

Regenerate narration with the Codex `demo-video-maker` skill, then:

```bash
cd video/remotion
npm ci
npm run typecheck
npm run render
```
