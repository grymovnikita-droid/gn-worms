interface P { className?: string }

export function Emblem({ className = "w-8 h-8" }: P) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none">
      <path d="M24 3 L42 12 V26 C42 37 34 44 24 46 C14 44 6 37 6 26 V12 Z" fill="#1c2438" stroke="#d9a441" strokeWidth="2.4" />
      <path d="M24 10 L36 16 V26 C36 33.5 31 38.5 24 40.5 C17 38.5 12 33.5 12 26 V16 Z" fill="#2a3450" stroke="#8a6a2c" strokeWidth="1.4" />
      <path d="M17 30 L24 14 L31 30 L27.6 30 L24 21.4 L20.4 30 Z" fill="#f5d67b" />
      <circle cx="24" cy="33.4" r="2.1" fill="#e05038" stroke="#f5d67b" strokeWidth="1.2" />
    </svg>
  );
}

export function CoinIcon({ className = "w-5 h-5" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="9.4" fill="#8a6a2c" />
      <circle cx="12" cy="11.4" r="9" fill="url(#cg)" stroke="#6b4d18" strokeWidth="1" />
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5d67b" /><stop offset="1" stopColor="#d9a441" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="11.4" r="5.6" fill="none" stroke="#8a6a2c" strokeWidth="1.4" />
      <path d="M12 7.6 L13.4 10.6 L16 10.6 L13.9 12.4 L14.7 15.2 L12 13.5 L9.3 15.2 L10.1 12.4 L8 10.6 L10.6 10.6 Z" fill="#8a6a2c" />
    </svg>
  );
}

export function WindIcon({ className = "w-5 h-5" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M3 8 h9 a2.6 2.6 0 1 0 -2.6 -2.6" /><path d="M3 12.5 h14 a2.9 2.9 0 1 1 -2.9 2.9" /><path d="M3 17 h6.5 a2.3 2.3 0 1 1 -2.3 2.3" />
    </svg>
  );
}

export function PauseIcon({ className = "w-5 h-5" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="6" y="4.5" width="4.2" height="15" rx="1" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1" />
    </svg>
  );
}

export function SoundIcon({ className = "w-5 h-5", muted = false }: P & { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5 V14.5 H7.5 L12.5 19 V5 L7.5 9.5 Z" fill="currentColor" stroke="none" />
      {muted ? <path d="M16 9 L22 15 M22 9 L16 15" /> : <><path d="M16 9.2 a4 4 0 0 1 0 5.6" /><path d="M18.6 6.8 a7.6 7.6 0 0 1 0 10.4" /></>}
    </svg>
  );
}

export function SkullIcon({ className = "w-5 h-5" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2.5 C7 2.5 3.5 6.2 3.5 11 c0 3 1.6 5 3.5 6.2 V20 a1.5 1.5 0 0 0 1.5 1.5 h7 A1.5 1.5 0 0 0 17 20 v-2.8 c1.9-1.2 3.5-3.2 3.5-6.2 C20.5 6.2 17 2.5 12 2.5 Z" />
      <circle cx="8.8" cy="11" r="2.1" fill="#0b111c" /><circle cx="15.2" cy="11" r="2.1" fill="#0b111c" />
      <path d="M10.4 17.4 h1 v1.6 h-1 Z M12.6 17.4 h1 v1.6 h-1 Z" fill="#0b111c" />
    </svg>
  );
}

export function SwordIcon({ className = "w-5 h-5" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 3.5 L20.5 3.5 L20.5 9.5 L9 21 L6 21 L3 18 L3 15 Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M14.5 3.5 L20.5 9.5" /><path d="M6.5 14.5 L9.5 17.5" /><path d="M3.5 20.5 L6 18" />
    </svg>
  );
}

export function ItemIcon({ id, className = "w-6 h-6" }: P & { id: string }) {
  switch (id) {
    case "blink":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 17 L13 8 L17 12 L21 4" /><path d="M13 8 L9 4" /><path d="M4 17 L8 21" /><path d="M17 12 L20 15" />
          <circle cx="4" cy="17" r="1.6" fill="currentColor" />
        </svg>
      );
    case "boots":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M7 3 H13 V10 C13 12 15 12.6 17 13.4 C19 14.2 20 15.4 20 17 V19 H7 Z" fill="currentColor" fillOpacity="0.18" />
          <path d="M7 19 H20" /><path d="M3 8 L6.6 10 M3 12.5 L6.6 13.4" strokeLinecap="round" />
        </svg>
      );
    case "ring":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="14" r="6.4" /><path d="M12 3.4 L14.6 6 L12 8.6 L9.4 6 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "aghs":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 21 V8.6" /><circle cx="12" cy="5.4" r="2.6" fill="currentColor" fillOpacity="0.3" />
          <path d="M7.4 9.4 L12 5.2 L16.6 9.4" /><path d="M5 12.6 C7 11 9.4 10.4 12 10.4 C14.6 10.4 17 11 19 12.6" />
        </svg>
      );
    case "mek":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <rect x="4" y="6.5" width="16" height="12" rx="2" fill="currentColor" fillOpacity="0.16" />
          <path d="M12 9.5 V15.5 M9 12.5 H15" strokeLinecap="round" strokeWidth="2.2" />
          <path d="M9 6.5 V4.6 H15 V6.5" />
        </svg>
      );
    default:
      return null;
  }
}

export function WeaponIcon({ id, className = "w-6 h-6" }: P & { id: string }) {
  const common = { className, fill: "none" as const, stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "cannon":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="9.5" cy="13.5" r="5.6" fill="currentColor" fillOpacity="0.22" />
          <path d="M13.6 9.6 L20.5 2.8 M20.5 2.8 L18 2.4 M20.5 2.8 L20.9 5.3" />
        </svg>
      );
    case "bat":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M5 21 C4.2 20.2 4.2 19 5 18.2 L14.6 5.4 C15.6 4 17.6 3.8 18.9 5 C20.2 6.2 20.2 8.3 19 9.5 L8 20.6 C7.2 21.4 5.8 21.8 5 21 Z" fill="currentColor" fillOpacity="0.2" />
          <path d="M7.4 15.4 L9.4 17.4" />
        </svg>
      );
    case "shotgun":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M3 15.5 L15 12.5 L21 6.5 M15 12.5 L17.4 14.9 L21 14.4 M3 15.5 L4.6 19" />
          <circle cx="20" cy="6" r="1" fill="currentColor" />
        </svg>
      );
    case "dynamite":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <rect x="5.5" y="9" width="6" height="11.5" rx="2.4" transform="rotate(-16 8.5 14.7)" fill="currentColor" fillOpacity="0.22" />
          <rect x="11.5" y="8" width="6" height="11.5" rx="2.4" transform="rotate(8 14.5 13.7)" fill="currentColor" fillOpacity="0.22" />
          <path d="M12.4 8.4 C13 6 15 5.4 16.4 4.4" /><path d="M18.4 3 L17.2 5.2 L19.6 5 Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "napalm":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 3 C13.4 6 17 7.6 17 12 a5 5 0 0 1 -10 0 C7 8.8 8.6 7.4 9.4 5.4 C10 6.6 10.8 7 11.4 7.6 C11 6 11.6 4.4 12 3 Z" fill="currentColor" fillOpacity="0.24" />
          <path d="M12 20.6 a3 3 0 0 1 -3 -3 C9 15.6 10.6 15 12 13.4 C13.4 15 15 15.6 15 17.6 a3 3 0 0 1 -3 3 Z" fill="currentColor" fillOpacity="0.5" />
        </svg>
      );
    case "cluster":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="7" r="3.4" fill="currentColor" fillOpacity="0.22" />
          <circle cx="6.4" cy="16" r="2.7" fill="currentColor" fillOpacity="0.22" />
          <circle cx="17.6" cy="16" r="2.7" fill="currentColor" fillOpacity="0.22" />
          <path d="M10.4 9.8 L7.6 13.8 M13.6 9.8 L16.4 13.8 M9.1 16.4 L14.9 16.4" strokeDasharray="2.4 2" />
        </svg>
      );
    case "hook":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M3 3 C7 5 9 6 12 8" strokeDasharray="2.6 2.2" />
          <path d="M12 8 C17 10.5 19 13 18.6 16 C18.2 18.6 15.4 20 13 19 C11 18.2 10.4 16 11.6 14.4" fill="currentColor" fillOpacity="0.28" />
          <path d="M11.6 14.4 L10.2 12.6 M11.6 14.4 L13.9 13.6" />
        </svg>
      );
    case "snipe":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="6.4" cy="17.6" r="2.6" fill="currentColor" fillOpacity="0.3" />
          <path d="M8.6 15.4 L19.4 4.6 M19.4 4.6 L15.8 4.2 M19.4 4.6 L19.8 8.2" />
          <path d="M12 12 L14.4 14.4" />
        </svg>
      );
    case "frost":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2.6 V21.4 M4 7 L20 17 M20 7 L4 17" />
          <path d="M12 5.4 L10 3.8 M12 5.4 L14 3.8 M12 18.6 L10 20.2 M12 18.6 L14 20.2" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "nova":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="8.4" strokeDasharray="4 3" />
          <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.3" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "laguna":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M3.5 20.5 L20.5 3.5" strokeWidth="2.6" />
          <path d="M7 20.8 L20.8 7 M3.2 17 L17 3.2" strokeOpacity="0.55" />
          <circle cx="20.5" cy="3.5" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "blade":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2.8 C15.8 6.4 17 9.4 15.4 13 L12 16.4 L8.6 13 C7 9.4 8.2 6.4 12 2.8 Z" fill="currentColor" fillOpacity="0.24" />
          <path d="M12 16.4 V21.2 M9.4 18.8 H14.6" />
        </svg>
      );
    case "axe":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M13.4 3.4 C17 4.4 19.6 7 20.6 10.6 C18 10.2 15.8 10.4 13.8 11.4 L13.4 3.4 Z" fill="currentColor" fillOpacity="0.26" />
          <path d="M13.6 11.2 L5 19.8 M13.4 3.4 L11 5.8" />
        </svg>
      );
    case "cleaver":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M4.6 5.4 H17.2 C19 5.4 20 6.6 19.8 8.4 C19.4 11.6 16.8 13.8 13 14 L4.6 14 Z" fill="currentColor" fillOpacity="0.24" />
          <circle cx="7.2" cy="7.8" r="1" fill="currentColor" stroke="none" />
          <path d="M8 14 V19.6 C8 20.6 8.8 21.2 9.8 21.2 C10.8 21.2 11.6 20.6 11.6 19.6 V14" />
        </svg>
      );
    case "volley":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M5 19 L17 7 M5 19 L8.4 18.2 M5 19 L5.8 15.6" />
          <path d="M9 20 L20 9 M9 20 L12 19.4" strokeOpacity="0.6" />
          <path d="M4 14 L13 5" strokeOpacity="0.35" />
        </svg>
      );
    default:
      return null;
  }
}
