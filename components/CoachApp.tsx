'use client';

import { useEffect, useState } from 'react';
import type { Mood } from '@/lib/coach';
import ChessCoach from './ChessCoach';
import { MoodButton, useMoodCam } from './MoodCam';

/** The coach plus the optional tilt camera, which is always off on load. */
export default function CoachApp() {
  const [camOn, setCamOn] = useState(false);
  const cam = useMoodCam(camOn);
  // A face briefly out of view should not reset what was measured so far.
  const running = camOn && (cam.status === 'on' || cam.status === 'no-face');

  // Development builds only: browser tests act out moods without a camera.
  const [fakeMood, setFakeMood] = useState<Mood | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    (window as unknown as { __fakeMood?: (m: Mood | null) => void }).__fakeMood = setFakeMood;
  }, []);

  return (
    <ChessCoach
      mood={fakeMood ?? (camOn && cam.status === 'on' ? cam.mood : 'neutral')}
      moodActive={running || fakeMood !== null}
      moodSlot={<MoodButton enabled={camOn} onToggle={() => setCamOn((v) => !v)} {...cam} />}
    />
  );
}
