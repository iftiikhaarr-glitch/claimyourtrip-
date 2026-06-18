export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg" aria-label="ClaimYourTrip">
      <defs>
        <linearGradient id="cyt-badge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B2545" />
          <stop offset="1" stopColor="#0E3A52" />
        </linearGradient>
        <linearGradient id="cyt-plane" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5EEAD4" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="84" height="84" rx="24" fill="url(#cyt-badge)" />
      <path d="M20 62 Q44 58 66 28" fill="none" stroke="#2DD4BF" strokeWidth="3.2" strokeLinecap="round" strokeDasharray="1 7" opacity="0.85" />
      <g transform="translate(30 20) rotate(8)">
        <path d="M3 26 L31 14 L29 3 L24 4 L22 12 L11 12 L8 6 L4 7 L6 15 L0 19 Z" fill="url(#cyt-plane)" />
      </g>
      <circle cx="20" cy="62" r="3.4" fill="#5EEAD4" />
    </svg>
  );
}
