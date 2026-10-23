/* Line icons, 24px grid, drawn with currentColor. */

const Svg = ({ children, className = 'size-[18px]' }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const Knight = () => (
  <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
    <path d="M7 21h11v-2.2c0-2.7-.9-4.4-2.3-6 1.1-.5 1.8-1.6 1.8-2.9 0-1-.4-1.8-1.1-2.4L18 5.2 16.3 3.5l-2.4 2.3A7.6 7.6 0 0 0 6 10.5L5 12.4l1.6 1.2 1.6-1c.6.5 1.4.7 2.2.6-1.4 1.3-3.4 3.3-3.4 5.6V21Z" />
  </svg>
);

export const Sound = () => (
  <Svg>
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </Svg>
);

export const Mute = () => (
  <Svg>
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="m16 9 5 6M21 9l-5 6" />
  </Svg>
);

export const Eye = () => (
  <Svg>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const Sparkle = () => (
  <Svg>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </Svg>
);

export const Camera = () => (
  <Svg>
    <path d="M15 10.5 21 7v10l-6-3.5" />
    <rect x="3" y="6" width="12" height="12" rx="2" />
  </Svg>
);

export const Upload = () => (
  <Svg className="size-4">
    <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Svg>
);

export const Plus = () => (
  <Svg className="size-4">
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Close = () => (
  <Svg className="size-4">
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const First = () => (
  <Svg>
    <path d="M18 6 12 12l6 6M7 6v12" />
  </Svg>
);

export const Prev = () => (
  <Svg>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);

export const Next = () => (
  <Svg>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const Last = () => (
  <Svg>
    <path d="m6 6 6 6-6 6M17 6v12" />
  </Svg>
);

export const Flip = () => (
  <Svg>
    <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
  </Svg>
);

export const Undo = () => (
  <Svg>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Svg>
);

export const Copy = () => (
  <Svg>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Svg>
);

export const Bulb = () => (
  <Svg className="size-4">
    <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z" />
  </Svg>
);

export const Compass = () => (
  <Svg className="size-4">
    <circle cx="12" cy="12" r="10" />
    <path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3 6.3-2.1Z" />
  </Svg>
);
