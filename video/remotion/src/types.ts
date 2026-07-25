export type Caption = {
  text: string;
  start_seconds: number;
  end_seconds: number;
};

export type Scene = {
  id: string;
  title: string;
  start_seconds: number;
  end_seconds: number;
  start_frame: number;
  duration_frames: number;
  duration_seconds: number;
  voiceover: string;
  audio?: string;
  audio_duration_seconds?: number;
  captions?: Caption[];
  visual?: {
    kind?: string;
    intent?: string;
    asset_refs?: string[];
  };
};

export type Timeline = {
  version: number;
  fps: number;
  width: number;
  height: number;
  duration_seconds: number;
  duration_frames: number;
  audio_mix?: string;
  background_music?: {
    track_id?: string;
    path: string;
    volume?: number;
    loop?: boolean;
    fade_in_frames?: number;
    fade_out_frames?: number;
    license_manifest?: string;
  } | null;
  scenes: Scene[];
};
