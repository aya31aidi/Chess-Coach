'use client';

import { useEffect, useRef, useState } from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { Mood } from '@/lib/coach';
import { MOOD_LABEL, MoodTracker } from '@/lib/mood';
import * as Icon from './icons';

// The model is fetched once when the camera is first switched on. Video
// frames are processed in the browser and never sent anywhere.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const FRAME_MS = 125;

export type CamStatus = 'off' | 'starting' | 'on' | 'no-face' | 'denied' | 'error';

async function createLandmarker(): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe');
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options('GPU'));
  } catch {
    return FaceLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

export function useMoodCam(enabled: boolean) {
  const [mood, setMood] = useState<Mood>('neutral');
  const [status, setStatus] = useState<CamStatus>('off');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      setMood('neutral');
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    let landmarker: FaceLandmarker | null = null;
    let raf = 0;

    (async () => {
      setStatus('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          audio: false,
        });
      } catch {
        if (!stopped) setStatus('denied');
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) return;
      video.srcObject = stream;
      try {
        await video.play();
        landmarker = await createLandmarker();
      } catch (err) {
        console.error('Mood camera: could not start', err);
        if (!stopped) setStatus('error');
        return;
      }
      if (stopped) return;

      const tracker = new MoodTracker();
      let last = 0;
      const loop = (now: number) => {
        if (stopped || !landmarker) return;
        if (now - last >= FRAME_MS && video.readyState >= 2) {
          last = now;
          const shapes = landmarker.detectForVideo(video, now).faceBlendshapes?.[0]?.categories;
          if (shapes?.length) {
            setStatus('on');
            setMood(tracker.update(shapes, now));
          } else {
            setStatus('no-face');
          }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      landmarker?.close();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [enabled]);

  return { mood, status, videoRef };
}

const STATUS_TEXT: Record<CamStatus, string> = {
  off: 'Tilt detector: spots frustration after a mistake and shows in the review how mood affected your moves. Video stays on this device.',
  starting: 'Starting the camera…',
  on: '',
  'no-face': 'No face in view',
  denied: 'Camera permission was refused',
  error: 'The mood camera could not start in this browser',
};

export function MoodButton({ enabled, status, mood, videoRef, onToggle }: {
  enabled: boolean;
  status: CamStatus;
  mood: Mood;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onToggle: () => void;
}) {
  const live = enabled && (status === 'on' || status === 'no-face');
  const title = status === 'on' ? `Mood: ${MOOD_LABEL[mood]}. Click to turn the camera off.` : STATUS_TEXT[status];

  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      aria-pressed={enabled}
      className={`btn gap-2 pl-1.5 ${enabled ? 'border-gold/40' : 'text-faint'} ${status === 'denied' || status === 'error' ? 'text-bad' : ''}`}
    >
      <span className="relative grid size-7 place-items-center overflow-hidden rounded-full bg-bg">
        <video
          ref={videoRef}
          muted
          playsInline
          className={`absolute inset-0 size-full -scale-x-100 object-cover ${live ? 'opacity-100' : 'opacity-0'}`}
        />
        {!live && <Icon.Camera />}
      </span>
      <span className="text-xs">
        {!enabled ? 'Tilt' : status === 'on' ? MOOD_LABEL[mood] : status === 'no-face' ? 'No face' : status === 'starting' ? '…' : 'Off'}
      </span>
    </button>
  );
}
