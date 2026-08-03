import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import type { Caption, Scene, Timeline } from "./types";

const ink = "#101719";
const mint = "#c7f34a";
const paper = "#f4f7f5";
const muted = "#bac5be";
const sans =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const mono =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";

const sourceWindows = [
  { src: "live-browser-demo.webm", start: 0, end: 11, label: "REAL BROWSER RECORDING" },
  { src: "live-browser-demo.webm", start: 11, end: 16.5, label: "REAL BROWSER RECORDING" },
  { src: "live-browser-demo.webm", start: 16.5, end: 32, label: "REAL BROWSER RECORDING" },
  { src: "live-terminal.mp4", start: 1.5, end: 11.5, label: "REAL TERMINAL RECORDING" },
  { src: "live-browser-demo.webm", start: 32.5, end: 37.7, label: "REAL BROWSER RECORDING" },
] as const;

const RecordingScene: React.FC<{
  scene: Scene;
  index: number;
}> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const window = sourceWindows[index] ?? sourceWindows[sourceWindows.length - 1];
  const sourceDuration = window.end - window.start;
  const playbackRate = Math.max(
    0.2,
    sourceDuration / Math.max(0.1, scene.duration_seconds),
  );
  const fade = interpolate(
    frame,
    [0, 8, Math.max(9, scene.duration_frames - 8), scene.duration_frames],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    },
  );
  const headingOpacity = interpolate(frame, [8, 18, 74, 88], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: ink, opacity: fade, overflow: "hidden" }}>
      <Video
        src={staticFile(window.src)}
        muted
        trimBefore={Math.round(window.start * fps)}
        playbackRate={playbackRate}
        objectFit="contain"
        style={{ width: "100%", height: "100%", background: ink }}
      />
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto",
          height: 8,
          background: mint,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 34,
          left: 38,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: headingOpacity,
          fontFamily: mono,
          fontSize: 16,
          color: paper,
        }}
      >
        <span
          style={{
            padding: "8px 10px",
            color: ink,
            background: mint,
            fontWeight: 800,
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          style={{
            padding: "8px 12px",
            background: "rgba(8,13,11,.88)",
            border: "1px solid rgba(199,243,74,.55)",
          }}
        >
          {scene.title.toUpperCase()}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 36,
          right: 38,
          padding: "8px 11px",
          color: muted,
          background: "rgba(8,13,11,.9)",
          border: "1px solid rgba(255,255,255,.18)",
          fontFamily: mono,
          fontSize: 14,
        }}
      >
        {window.label}
      </div>
      {index === 0 ? (
        <div
          style={{
            position: "absolute",
            left: 38,
            bottom: 132,
            padding: "10px 14px",
            color: paper,
            background: "rgba(8,13,11,.92)",
            borderLeft: `4px solid ${mint}`,
            fontFamily: mono,
            fontSize: 17,
          }}
        >
          proof-carrying-cashier.pages.dev
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const CaptionLayer: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const caption = captions.find(
    (item) => now >= item.start_seconds && now < item.end_seconds,
  );
  if (!caption) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 150,
        right: 150,
        bottom: 34,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          padding: "12px 20px",
          color: paper,
          background: "rgba(4,9,8,.9)",
          borderTop: `3px solid ${mint}`,
          fontFamily: sans,
          fontSize: 29,
          lineHeight: 1.24,
          textAlign: "center",
        }}
      >
        {caption.text}
      </div>
    </div>
  );
};

export const LiveDemoVideo: React.FC<{ timeline: Timeline }> = ({ timeline }) => (
  <AbsoluteFill style={{ background: ink }}>
    {timeline.audio_mix ? (
      <Audio src={staticFile(timeline.audio_mix.replace(/^public\//, ""))} />
    ) : null}
    <Sequence
      from={timeline.scenes[0].start_frame}
      durationInFrames={timeline.scenes[0].duration_frames}
    >
      <RecordingScene scene={timeline.scenes[0]} index={0} />
    </Sequence>
    <Sequence
      from={timeline.scenes[1].start_frame}
      durationInFrames={timeline.scenes[1].duration_frames}
    >
      <RecordingScene scene={timeline.scenes[1]} index={1} />
    </Sequence>
    <Sequence
      from={timeline.scenes[2].start_frame}
      durationInFrames={timeline.scenes[2].duration_frames}
    >
      <RecordingScene scene={timeline.scenes[2]} index={2} />
    </Sequence>
    <Sequence
      from={timeline.scenes[3].start_frame}
      durationInFrames={timeline.scenes[3].duration_frames}
    >
      <RecordingScene scene={timeline.scenes[3]} index={3} />
    </Sequence>
    <Sequence
      from={timeline.scenes[4].start_frame}
      durationInFrames={timeline.scenes[4].duration_frames}
    >
      <RecordingScene scene={timeline.scenes[4]} index={4} />
    </Sequence>
    <CaptionLayer
      captions={timeline.scenes.flatMap((scene) => scene.captions || [])}
    />
  </AbsoluteFill>
);
