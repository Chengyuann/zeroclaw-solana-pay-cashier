import React from "react";
import { Composition } from "remotion";
import { DemoVideo } from "./Video";
import { LiveDemoVideo } from "./LiveVideo";
import timeline from "./data/timeline.json";
import liveTimeline from "./data/live-timeline.json";
import type { Timeline } from "./types";

const data = timeline as Timeline;
const liveData = liveTimeline as Timeline;

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="DemoVideo"
        component={DemoVideo}
        durationInFrames={data.duration_frames}
        fps={data.fps}
        width={data.width}
        height={data.height}
        defaultProps={{ timeline: data }}
      />
      <Composition
        id="LiveDemoVideo"
        component={LiveDemoVideo}
        durationInFrames={liveData.duration_frames}
        fps={liveData.fps}
        width={liveData.width}
        height={liveData.height}
        defaultProps={{ timeline: liveData }}
      />
    </>
  );
};
