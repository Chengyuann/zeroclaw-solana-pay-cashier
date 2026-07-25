import React from "react";
import { Composition } from "remotion";
import { DemoVideo } from "./Video";
import timeline from "./data/timeline.json";
import type { Timeline } from "./types";

const data = timeline as Timeline;

export const Root: React.FC = () => {
  return (
    <Composition
      id="DemoVideo"
      component={DemoVideo}
      durationInFrames={data.duration_frames}
      fps={data.fps}
      width={data.width}
      height={data.height}
      defaultProps={{ timeline: data }}
    />
  );
};
