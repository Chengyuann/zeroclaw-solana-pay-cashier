# Demo video

The current live walkthrough is built from a real 1920x1080 browser recording
of the Cloudflare deployment and a real macOS Terminal recording of
`npm run verify:public-proof`. Remotion adds only chapter labels, captions,
transitions, the locally generated VoxCPM2 English narration, and user-provided
background music mixed under the voice with sidechain ducking.

The earlier prepared Director Cut is 75.3 seconds, 1920x1080. It remains
available as an editorial overview, while the live walkthrough is the primary
review video.

The Director Cut adds chapter transitions, controlled camera motion, progressive
evidence reveals, proof-console focus, and an updated independent-verification
close. It does not add stock footage or unverified product claims.

The repository keeps the Remotion source, storyboard, subtitles, and
de-identified product evidence. The primary `outputs/video-delivery-live/`
package contains:

- final MP4;
- SRT captions;
- narration assets and source provenance;
- video and encoded-scene audio QA reports;
- contact sheet;
- SHA-256 manifest.

The earlier Director Cut remains in `outputs/video-delivery-v2/`.

Regenerate narration with the Codex `demo-video-maker` skill, then:

```bash
cd video/remotion
npm ci
npm run typecheck
npm run render:live
npm run render
```

`render:live` produces the primary 59.13-second review walkthrough at
`video/remotion/out/live-final.mp4`. `render` produces the earlier
75.33-second Director Cut.
