import type { ReactNode, SVGProps } from "react";

function I({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const DownloadIcon = (p: P) => (
  <I {...p}>
    <path d="M12 4v10m0 0 4-4m-4 4-4-4" />
    <path d="M5 19h14" />
  </I>
);

export const MarkdownIcon = (p: P) => (
  <I {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M6.5 15.5v-7l2.5 3 2.5-3v7M15.5 8.5v5m0 0 2.2-2.2M15.5 13.5l-2.2-2.2" />
  </I>
);

export const LogoIcon = (p: P) => (
  <I {...p}>
    <path d="M12 2 4 5.5v5c0 5 3.4 8.8 8 11.5 4.6-2.7 8-6.5 8-11.5v-5L12 2Z" />
    <circle cx="12" cy="10" r="2.2" />
    <path d="M12 12.2V16M9.2 8.6 7 7m7.8 1.6L17 7" />
  </I>
);
export const WebhookIcon = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="6" r="2.6" />
    <circle cx="6" cy="18" r="2.6" />
    <circle cx="18" cy="18" r="2.6" />
    <path d="M10.8 8.3 7 15.6M13.2 8.3l3.8 7.3M8.6 18h6.8" />
  </I>
);
export const BranchIcon = (p: P) => (
  <I {...p}>
    <circle cx="6" cy="5" r="2.2" />
    <circle cx="6" cy="19" r="2.2" />
    <circle cx="18" cy="8" r="2.2" />
    <path d="M6 7.2v9.6M18 10.2c0 3-2.5 4.3-5.5 4.5H9" />
  </I>
);
export const PlayIcon = (p: P) => (
  <I {...p}>
    <path d="M7 4.5v15l12-7.5L7 4.5Z" />
  </I>
);
export const PauseIcon = (p: P) => (
  <I {...p}>
    <path d="M8 5v14M16 5v14" />
  </I>
);
export const ReplayIcon = (p: P) => (
  <I {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
  </I>
);
export const DiffIcon = (p: P) => (
  <I {...p}>
    <circle cx="7" cy="6" r="2.2" />
    <circle cx="17" cy="18" r="2.2" />
    <path d="M7 8.2V13a3 3 0 0 0 3 3h4.8M17 15.8V11a3 3 0 0 0-3-3H9.5" />
    <path d="m11 4.5-2 2 2 2" />
  </I>
);
export const TerminalIcon = (p: P) => (
  <I {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m7 9 3 3-3 3M12.5 15H17" />
  </I>
);
export const LayersIcon = (p: P) => (
  <I {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </I>
);
export const CheckIcon = (p: P) => (
  <I {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </I>
);
export const XIcon = (p: P) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </I>
);
export const CopyIcon = (p: P) => (
  <I {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </I>
);
export const CpuIcon = (p: P) => (
  <I {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="10" y="10" width="4" height="4" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </I>
);
export const ShieldIcon = (p: P) => (
  <I {...p}>
    <path d="M12 2 4 5.5v5c0 5 3.4 8.8 8 11.5 4.6-2.7 8-6.5 8-11.5v-5L12 2Z" />
  </I>
);
export const SparkIcon = (p: P) => (
  <I {...p}>
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M4.9 19.1l3.5-3.5M15.6 8.4l3.5-3.5" />
  </I>
);
export const FileCodeIcon = (p: P) => (
  <I {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
    <path d="M14 2v6h6M10 13l-2 2 2 2M14 13l2 2-2 2" />
  </I>
);
export const AlertIcon = (p: P) => (
  <I {...p}>
    <path d="M12 3 2.5 19.5h19L12 3Z" />
    <path d="M12 10v4M12 17.2v.1" />
  </I>
);
export const FlaskIcon = (p: P) => (
  <I {...p}>
    <path d="M10 2v6.5L4.3 18a2.4 2.4 0 0 0 2.1 3.5h11.2A2.4 2.4 0 0 0 19.7 18L14 8.5V2" />
    <path d="M8.5 2h7M7.5 14.5h9" />
  </I>
);
export const SendIcon = (p: P) => (
  <I {...p}>
    <path d="m21.5 2.5-10 10M21.5 2.5 15 21.5l-3.5-9-9-3.5 19-6.5Z" />
  </I>
);
export const ZapIcon = (p: P) => (
  <I {...p}>
    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
  </I>
);
export const BookIcon = (p: P) => (
  <I {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" />
    <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
  </I>
);
export const CodeIcon = (p: P) => (
  <I {...p}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16" />
  </I>
);
export const ActivityIcon = (p: P) => (
  <I {...p}>
    <path d="M2.5 12h4l3-8 5 16 3-8h4" />
  </I>
);
export const ChevronIcon = (p: P) => (
  <I {...p}>
    <path d="m9 5 7 7-7 7" />
  </I>
);
export const ClockIcon = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </I>
);
export const MergeIcon = (p: P) => (
  <I {...p}>
    <circle cx="6" cy="5" r="2.2" />
    <circle cx="6" cy="19" r="2.2" />
    <circle cx="18" cy="9" r="2.2" />
    <path d="M6 7.2v9.6M18 11.2c0 3.5-3 4.8-6.5 4.8H8.5" />
  </I>
);
export const GearIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const RobotIcon = (p: P) => (
  <I {...p}>
    <rect x="5" y="8" width="14" height="11" rx="2" />
    <path d="M12 8V4.5M12 4.5h.01M9 13h.01M15 13h.01M9.5 16.5h5M2.5 12v4M21.5 12v4" />
  </I>
);
