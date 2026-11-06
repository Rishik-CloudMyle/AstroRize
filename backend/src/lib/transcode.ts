import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setPriority } from "node:os";
import ffmpegStatic from "ffmpeg-static";

// FFmpeg, run as a separate child process (never inside the API's own thread): message videos are
// compressed to H.264/AAC MP4 at most 720p and 30 fps, with a poster frame. Used only by the media
// worker (lib/media-jobs.ts).

/** The FFmpeg program: FFMPEG_PATH when set (e.g. a system install), else the bundled ffmpeg-static one. */
export function ffmpegPath(): string | null {
  // ffmpeg-static is CommonJS: its module value is the path string itself.
  const bundled = ffmpegStatic as unknown as string | null;
  const p = process.env.FFMPEG_PATH?.trim() || bundled;
  return p && existsSync(p) ? p : null;
}

export interface TranscodeSettings {
  /** H.264 quality (lower = better and bigger); 28 suits phone videos in a chat. */
  crf: number;
  /** x264 speed/size trade-off. */
  preset: string;
  /** Long side / short side limits (720p: 1280 × 720, either orientation). */
  maxLong: number;
  maxShort: number;
  maxFps: number;
  audioKbps: number;
  /** FFmpeg is killed after this long. */
  timeoutMs: number;
  /** CPU threads FFmpeg may use (0 = FFmpeg decides). */
  threads: number;
}

export const DEFAULT_TRANSCODE: TranscodeSettings = {
  crf: 28,
  preset: "veryfast",
  maxLong: 1280,
  maxShort: 720,
  maxFps: 30,
  audioKbps: 96,
  timeoutMs: 5 * 60_000,
  threads: 0,
};

/** Why FFmpeg failed. `permanent` = the file itself is unusable, so trying again won't help. */
export class TranscodeError extends Error {
  readonly permanent: boolean;
  constructor(message: string, permanent: boolean) {
    super(message);
    this.permanent = permanent;
  }
}

/** FFmpeg's words for "this input can't be decoded". */
const BAD_INPUT = /Invalid data found|moov atom not found|does not contain any stream|Output file #0 does not contain|could not find codec parameters|EBML header parsing failed|no streams|Error opening input|End of file/i;

/** Runs FFmpeg with `args`; resolves when it exits cleanly, rejects with the end of its log otherwise. */
export function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  const bin = ffmpegPath();
  if (!bin) return Promise.reject(new TranscodeError("FFmpeg isn't installed on this server.", false));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-hide_banner", "-nostdin", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    running.add(child);
    // Lower priority: requests served next to it (inline mode, or a shared machine) come first.
    try {
      if (child.pid) setPriority(child.pid, 10);
    } catch {
      // Not allowed here: runs at normal priority.
    }
    let log = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d: string) => {
      log = (log + d).slice(-4000);
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const finish = (err: Error | null) => {
      clearTimeout(timer);
      running.delete(child);
      if (err) reject(err);
      else resolve();
    };
    child.on("error", (e) => finish(new TranscodeError(`FFmpeg couldn't start: ${e.message}`, false)));
    child.on("close", (code, signal) => {
      if (timedOut) return finish(new TranscodeError(`FFmpeg took longer than ${Math.round(timeoutMs / 1000)} s and was stopped.`, false));
      if (code === 0) return finish(null);
      const tail = log.trim().split("\n").slice(-3).join(" | ") || `exit ${code ?? signal}`;
      finish(new TranscodeError(tail.slice(0, 500), BAD_INPUT.test(log)));
    });
  });
}

/** FFmpeg processes started by this process, so shutdown can stop them. */
const running = new Set<ReturnType<typeof spawn>>();

/** Kills every FFmpeg this process started (on shutdown: their jobs are picked up again later). */
export function killAllFfmpeg() {
  for (const c of running) c.kill("SIGKILL");
}

/**
 * Compresses `input` into an MP4 at `output` (H.264 + AAC, at most 720p keeping the aspect ratio,
 * at most 30 fps, metadata dropped, "faststart" so it plays while downloading), then grabs a JPEG
 * poster frame from the result into `poster`.
 */
export async function transcodeVideo(input: string, output: string, poster: string, s: TranscodeSettings = DEFAULT_TRANSCODE): Promise<void> {
  // Landscape: fit inside maxLong × maxShort; portrait: maxShort × maxLong. Never upscaled; even sizes (H.264).
  const scale =
    `scale=w='if(gte(iw,ih),min(${s.maxLong},iw),min(${s.maxShort},iw))'` +
    `:h='if(gte(iw,ih),min(${s.maxShort},ih),min(${s.maxLong},ih))'` +
    `:force_original_aspect_ratio=decrease:force_divisible_by=2`;
  await runFfmpeg(
    [
      "-y",
      "-i", input,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-map_metadata", "-1",
      "-vf", scale,
      "-fpsmax", String(s.maxFps),
      "-c:v", "libx264",
      "-preset", s.preset,
      "-crf", String(s.crf),
      "-pix_fmt", "yuv420p",
      "-profile:v", "high",
      "-c:a", "aac",
      "-b:a", `${s.audioKbps}k`,
      "-ac", "2",
      "-movflags", "+faststart",
      "-max_muxing_queue_size", "1024",
      ...(s.threads > 0 ? ["-threads", String(s.threads)] : []),
      "-f", "mp4",
      output,
    ],
    s.timeoutMs,
  );
  // The poster: a frame half a second in (or the first one for very short clips), at most 720 px wide.
  const grab = (at: string) =>
    runFfmpeg(["-y", ...(at ? ["-ss", at] : []), "-i", output, "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", "-q:v", "5", "-f", "image2", poster], 60_000);
  try {
    await grab("0.5");
    if (!existsSync(poster)) await grab("");
  } catch {
    await grab("");
  }
  if (!existsSync(poster)) throw new TranscodeError("FFmpeg didn't produce a poster frame.", false);
}
