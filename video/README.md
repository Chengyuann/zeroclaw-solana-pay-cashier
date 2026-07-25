# Demo video

The formal showcase is 73.4 seconds, 1920x1080, with English narration and
captions. It uses a real signed Agave local-validator payment and labels that
evidence level explicitly.

The repository keeps the Remotion source, storyboard, subtitles, and
de-identified product evidence. The GitHub Release carries:

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
