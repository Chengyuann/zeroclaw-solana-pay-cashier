import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import type { Caption, Scene, Timeline } from "./types";

const C = {
  bg: "#101719",
  ink: "#14201d",
  paper: "#f4f7f5",
  green: "#1c6b55",
  mint: "#80d6b5",
  yellow: "#e6b84c",
  red: "#c65346",
  muted: "#9baca6",
  line: "#38504a",
  white: "#f8fbfa",
};

const mono =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";
const sans =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

const short = (value: string, left = 12, right = 8) =>
  `${value.slice(0, left)}…${value.slice(-right)}`;

const evidence = {
  invoiceId: "75b290f8-0a39-4326-8e15-9ee824605189",
  paymentId: "pay_75b290f80a3943268e159ee824605189",
  recipient: "BpegjqEbijzZMxFaseiCd6iv1DM3LuL3273NJVyzFmy1",
  payer: "GxQ8gy4okU1CQ7MCk6nybsNkyrAkVHmKjFNHcgLT4zUo",
  reference: "7GuRT2HeB5NxgCF2AV6MVpgX3ctN1vb8FQYDNGBm2M1L",
  signature:
    "2gGT8JBBGPqJinQfKfheQyQmPiWxJFWrawSkz5s7yHqmAiuznCKgfdR3HyrinR8yq5qumJEauwJzZ7mbKqUWKyRs",
  offerHash: "597fa4ca95a154d7e0f120591aca9eee9483a7d84e6ce408c25fb74f35d59820",
  proofHash: "240e488f0d927b32a16aaa169bb8f43d2f1e80c6210412e395bada2a6b196a01",
  slot: "443",
};

const enterStyle = (frame: number): React.CSSProperties => ({
  opacity: interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  }),
  translate: `0 ${interpolate(frame, [0, 18], [34, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px`,
});

const sceneCameraStyle = (
  frame: number,
  durationInFrames: number,
  drift: "left" | "right" | "up" | "none" = "none",
): React.CSSProperties => {
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const offsetX = drift === "left" ? 12 - progress * 24 : drift === "right" ? -12 + progress * 24 : 0;
  const offsetY = drift === "up" ? 12 - progress * 24 : 0;
  return {
    scale: 1.018 + progress * 0.012,
    translate: `${offsetX}px ${offsetY}px`,
  };
};

const focusStyle = (
  frame: number,
  start: number,
  end: number,
  offset = 20,
): React.CSSProperties => ({
  opacity: interpolate(frame, [start, start + 12, end - 12, end], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  }),
  translate: `${interpolate(frame, [start, start + 16], [offset, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })}px 0`,
});

const TransitionCard: React.FC<{ scene: Scene; index: number }> = ({ scene, index }) => {
  const frame = useCurrentFrame();
  const label = String(index + 1).padStart(2, "0");
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: C.bg,
          opacity: interpolate(frame, [0, 6, 18, 25], [0, 0.96, 0.96, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 260,
          left: interpolate(frame, [0, 25], [-300, 1940], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          }),
          background: C.yellow,
          transform: "skewX(-9deg)",
          opacity: 0.94,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 94,
          right: 94,
          top: "50%",
          display: "grid",
          gridTemplateColumns: "120px 1fr",
          gap: 34,
          alignItems: "center",
          translate: `0 ${interpolate(frame, [3, 14], [34, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px`,
          opacity: interpolate(frame, [3, 12, 19, 25], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 64, fontWeight: 800, color: C.yellow }}>
          {label}
        </div>
        <div>
          <div style={{ fontFamily: sans, fontSize: 42, fontWeight: 780 }}>{scene.title}</div>
          <div style={{ marginTop: 8, fontFamily: mono, fontSize: 20, color: C.muted }}>
            {scene.visual?.intent}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Shell: React.FC<{
  scene: Scene;
  frame: number;
  drift?: "left" | "right" | "up" | "none";
  children: React.ReactNode;
}> = ({ scene, frame, drift = "none", children }) => (
  <AbsoluteFill
    style={{
      background: C.bg,
      color: C.white,
      fontFamily: sans,
      padding: "54px 76px 154px",
      boxSizing: "border-box",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: -26,
        backgroundImage:
          "linear-gradient(rgba(128,214,181,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(128,214,181,.035) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        ...sceneCameraStyle(frame, scene.duration_frames, drift),
      }}
    />
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 10,
        background: C.yellow,
      }}
    />
    <div style={{ position: "relative", zIndex: 1, height: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 34,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 750, color: C.mint }}>
          PROOF-CARRYING CASHIER
        </div>
        <div style={{ fontSize: 18, color: C.muted, fontFamily: mono }}>
          {scene.title.toUpperCase()}
        </div>
      </div>
      <div style={{ flex: 1, ...enterStyle(frame) }}>{children}</div>
    </div>
  </AbsoluteFill>
);

const BigTitle: React.FC<{ children: React.ReactNode; accent?: string }> = ({
  children,
  accent = C.white,
}) => (
  <div
    style={{
      fontSize: 84,
      lineHeight: 1.02,
      fontWeight: 790,
      color: accent,
      letterSpacing: 0,
    }}
  >
    {children}
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; tone?: "ok" | "warn" | "bad" }> = ({
  children,
  tone = "ok",
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      minHeight: 40,
      padding: "0 14px",
      borderRadius: 4,
      background: tone === "ok" ? C.green : tone === "warn" ? "#71591d" : "#6f302a",
      color: C.white,
      fontFamily: mono,
      fontSize: 21,
      fontWeight: 720,
    }}
  >
    {children}
  </div>
);

const ProblemScene: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => (
  <Shell scene={scene} frame={frame} drift="right">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 0.9fr", gap: 74, height: "100%" }}>
      <div style={{ alignSelf: "center" }}>
        <BigTitle>
          Payment links
          <br />
          are not proof.
        </BigTitle>
        <div style={{ marginTop: 32, fontSize: 34, lineHeight: 1.35, color: C.muted }}>
          A merchant needs immutable terms, settlement evidence, and an exception queue.
        </div>
      </div>
      <div
        style={{
          alignSelf: "center",
          display: "grid",
          gap: 12,
          borderLeft: `2px solid ${C.line}`,
          paddingLeft: 44,
        }}
      >
        {[
          ["QR created", "request"],
          ["Payment claimed", "untrusted"],
          ["Recipient + amount + memo", "validated"],
          ["Signed proof bundle", "portable"],
        ].map(([label, value], index) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              minHeight: 68,
              padding: "0 22px",
              background: index < 2 ? "#1b2527" : "#17352d",
              border: `1px solid ${index < 2 ? C.line : C.green}`,
              ...focusStyle(frame, 10 + index * 10, scene.duration_frames - 18, 28),
            }}
          >
            <span style={{ fontSize: 25 }}>{label}</span>
            <span style={{ color: index < 2 ? C.muted : C.mint, fontFamily: mono, fontSize: 19 }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  </Shell>
);

const AgentScene: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => (
  <Shell scene={scene} frame={frame} drift="left">
    <div style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 70, alignItems: "center" }}>
      <div>
        <BigTitle accent={C.mint}>One approved call.</BigTitle>
        <div style={{ fontSize: 34, marginTop: 24, color: C.muted }}>
          Zero wallet custody.
        </div>
      </div>
      <div
        style={{
          background: "#091012",
          border: `1px solid ${C.line}`,
          padding: 28,
          boxShadow: "0 26px 70px rgba(0,0,0,.34)",
          scale: interpolate(frame, [8, 28], [0.965, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ color: C.muted, fontFamily: mono, fontSize: 18, marginBottom: 22 }}>
          ZeroClaw · supervised shell tool
        </div>
        <div style={{ fontFamily: mono, fontSize: 24, lineHeight: 1.55 }}>
          <span style={{ color: C.mint }}>$</span> node dist/cli.js create
          <br />
          &nbsp;&nbsp;--recipient {short(evidence.recipient, 9, 7)}
          <br />
          &nbsp;&nbsp;--amount 0.001 --cluster localnet
          <br />
          &nbsp;&nbsp;--order-id final-proof-demo
        </div>
        <div style={{ marginTop: 26, display: "flex", gap: 12 }}>
          <Pill>APPROVED BY OPERATOR</Pill>
          <Pill tone="warn">NO SIGNING KEY</Pill>
        </div>
      </div>
    </div>
  </Shell>
);

const OfferScene: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => (
  <Shell scene={scene} frame={frame} drift="right">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 520px", gap: 68, alignItems: "center" }}>
      <div>
        <BigTitle>A signed offer before funds move.</BigTitle>
        <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "190px 1fr", gap: "15px 24px" }}>
          {[
            ["Payment ID", short(evidence.paymentId, 19, 8)],
            ["Recipient", short(evidence.recipient, 14, 10)],
            ["Reference", short(evidence.reference, 14, 10)],
            ["Amount", "0.001 SOL"],
            ["Offer hash", short(evidence.offerHash, 16, 12)],
            ["Attestation", "Ed25519 · non-funds key"],
          ].map(([key, value], index) => (
            <React.Fragment key={key}>
              <div style={{ color: C.muted, fontSize: 23, ...focusStyle(frame, 8 + index * 8, scene.duration_frames - 18, -18) }}>{key}</div>
              <div style={{ fontFamily: mono, fontSize: 23, color: key === "Offer hash" ? C.mint : C.white, ...focusStyle(frame, 10 + index * 8, scene.duration_frames - 18, 18) }}>
                {value}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div
        style={{
          background: C.paper,
          padding: 22,
          border: `4px solid ${C.green}`,
          scale: interpolate(frame, [0, scene.duration_frames - 1], [0.94, 1.035], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <Img src={staticFile("assets/payment-qr.png")} style={{ width: "100%", display: "block" }} />
      </div>
    </div>
  </Shell>
);

const TransactionScene: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => (
  <Shell scene={scene} frame={frame} drift="left">
    <div style={{ display: "grid", gridTemplateColumns: "0.85fr 1.15fr", gap: 68, alignItems: "center" }}>
      <div>
        <BigTitle accent={C.yellow}>Real Solana execution.</BigTitle>
        <div style={{ marginTop: 25, fontSize: 30, lineHeight: 1.4, color: C.muted }}>
          Fresh Agave validator. Ephemeral payer. Real Ed25519 signature.
        </div>
      </div>
      <div style={{ background: "#091012", border: `1px solid ${C.line}`, padding: 30 }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "18px 20px", fontSize: 24 }}>
          {[
            ["Payer", short(evidence.payer, 14, 10)],
            ["Recipient", short(evidence.recipient, 14, 10)],
            ["Signature", short(evidence.signature, 20, 16)],
            ["Slot", evidence.slot],
            ["Fee", "5,000 lamports"],
          ].map(([key, value], index) => (
            <React.Fragment key={key}>
              <div style={{ color: C.muted, ...focusStyle(frame, 8 + index * 11, scene.duration_frames - 24, -18) }}>{key}</div>
              <div style={{ fontFamily: mono, color: key === "Signature" ? C.mint : C.white, ...focusStyle(frame, 10 + index * 11, scene.duration_frames - 24, 18) }}>{value}</div>
            </React.Fragment>
          ))}
          <div style={{ color: C.muted, ...focusStyle(frame, 64, scene.duration_frames - 18, -18) }}>Result</div>
          <div style={focusStyle(frame, 68, scene.duration_frames - 18, 18)}><Pill>CONFIRMED · ERR NULL</Pill></div>
        </div>
      </div>
    </div>
  </Shell>
);

const ProofScene: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => (
  <Shell scene={scene} frame={frame} drift="up">
    <div
      style={{
        height: "100%",
        display: "grid",
        gridTemplateColumns: "0.65fr 1.35fr",
        gap: 48,
        alignItems: "center",
      }}
    >
      <div>
        <BigTitle accent={C.mint}>Proof that travels.</BigTitle>
        <div style={{ fontFamily: mono, marginTop: 28, fontSize: 21, lineHeight: 1.6 }}>
          offer&nbsp;&nbsp; {short(evidence.offerHash, 14, 10)}
          <br />
          receipt {short(evidence.proofHash, 14, 10)}
        </div>
        <div style={{ marginTop: 24 }}>
          <Pill>OFFLINE VERIFY · VALID</Pill>
        </div>
      </div>
      <div
        style={{
          background: C.paper,
          border: `1px solid ${C.line}`,
          padding: 12,
          boxShadow: "0 28px 80px rgba(0,0,0,.4)",
          overflow: "hidden",
        }}
      >
        <Img
          src={staticFile("assets/proof-console.jpg")}
          style={{
            width: "100%",
            display: "block",
            scale: interpolate(frame, [0, scene.duration_frames - 1], [1.01, 1.1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: `${interpolate(frame, [0, scene.duration_frames - 1], [0, -24], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px ${interpolate(frame, [0, scene.duration_frames - 1], [0, -12], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px`,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 36,
            top: 44,
            width: 250,
            height: 164,
            border: `4px solid ${C.yellow}`,
            boxShadow: "0 0 0 999px rgba(6,12,13,.44)",
            opacity: interpolate(frame, [62, 78], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      </div>
    </div>
  </Shell>
);

const SafetyScene: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => (
  <Shell scene={scene} frame={frame} drift="right">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
      <div>
        <BigTitle>Exceptions do not disappear.</BigTitle>
        <div style={{ marginTop: 30, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["late", "duplicate", "underpaid", "overpaid", "invalid", "RPC dispute"].map((value, index) => (
            <div key={value} style={focusStyle(frame, 8 + index * 10, scene.duration_frames - 20, 18)}>
              <Pill tone="bad">{value.toUpperCase()}</Pill>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderLeft: `2px solid ${C.line}`, paddingLeft: 54 }}>
        {[
          ["Customer message", "untrusted data"],
          ["Refund request", "no payment URL"],
          ["Owner code", "required"],
          ["Final signature", "human wallet"],
        ].map(([key, value], index) => (
          <div key={key} style={{ padding: "18px 0", borderBottom: `1px solid ${C.line}`, ...focusStyle(frame, 26 + index * 16, scene.duration_frames - 16, 26) }}>
            <div style={{ fontSize: 24 }}>{key}</div>
            <div style={{ marginTop: 4, color: value === "human wallet" ? C.mint : C.muted, fontFamily: mono, fontSize: 20 }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  </Shell>
);

const CloseScene: React.FC<{ scene: Scene; frame: number }> = ({ scene, frame }) => (
  <Shell scene={scene} frame={frame} drift="up">
    <div style={{ height: "100%", display: "grid", placeItems: "center", textAlign: "center" }}>
      <div>
        <BigTitle accent={C.mint}>Proof-Carrying Cashier</BigTitle>
        <div style={{ marginTop: 36, display: "flex", justifyContent: "center", gap: 18 }}>
          <Pill>26 TS + 6 RUST TESTS</Pill>
          <Pill>SKILL AUDIT PASS</Pill>
          <Pill>2 SOPs VALID</Pill>
          <Pill tone="warn">T1 CUSTODY</Pill>
        </div>
        <div style={{ marginTop: 42, fontFamily: mono, fontSize: 24, color: C.muted }}>
          npm run verify:public-proof
        </div>
      </div>
    </div>
  </Shell>
);

const CaptionLayer: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const now = frame / fps;
  const caption = captions.find((item) => now >= item.start_seconds && now < item.end_seconds);
  if (!caption) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 180,
        right: 180,
        bottom: 42,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 1420,
          padding: "13px 22px",
          background: "rgba(4,9,10,.88)",
          borderTop: `3px solid ${C.yellow}`,
          color: C.white,
          fontFamily: sans,
          fontSize: 31,
          lineHeight: 1.22,
          textAlign: "center",
        }}
      >
        {caption.text}
      </div>
    </div>
  );
};

const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const kind = scene.visual?.kind;
  if (kind === "problem") return <ProblemScene scene={scene} frame={frame} />;
  if (kind === "agent") return <AgentScene scene={scene} frame={frame} />;
  if (kind === "offer") return <OfferScene scene={scene} frame={frame} />;
  if (kind === "transaction") return <TransactionScene scene={scene} frame={frame} />;
  if (kind === "proof") return <ProofScene scene={scene} frame={frame} />;
  if (kind === "safety") return <SafetyScene scene={scene} frame={frame} />;
  return <CloseScene scene={scene} frame={frame} />;
};

export const DemoVideo: React.FC<{ timeline: Timeline }> = ({ timeline }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    {timeline.audio_mix ? (
      <Audio src={staticFile(timeline.audio_mix.replace(/^public\//, ""))} />
    ) : null}
    {timeline.scenes.map((scene) => (
      <Sequence key={scene.id} from={scene.start_frame} durationInFrames={scene.duration_frames}>
        <SceneView scene={scene} />
      </Sequence>
    ))}
    <CaptionLayer captions={timeline.scenes.flatMap((scene) => scene.captions || [])} />
    {timeline.scenes.map((scene, index) =>
      index > 0 ? (
        <Sequence
          key={`transition-${scene.id}`}
          from={Math.max(0, scene.start_frame - 13)}
          durationInFrames={26}
        >
          <TransitionCard scene={scene} index={index} />
        </Sequence>
      ) : null,
    )}
  </AbsoluteFill>
);
