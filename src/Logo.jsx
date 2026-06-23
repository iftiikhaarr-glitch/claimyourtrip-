export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="100 26 240 210" xmlns="http://www.w3.org/2000/svg" aria-label="ClaimYourTrip">
      <defs>
        <linearGradient id="cyt-shield" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B2545" />
          <stop offset="1" stopColor="#103a5c" />
        </linearGradient>
        <linearGradient id="cyt-globe" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5EEAD4" />
          <stop offset="1" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <path d="M220 26 L322 60 Q322 170 220 226 Q118 170 118 60 Z" fill="url(#cyt-shield)" />
      <g transform="translate(220 118)">
        <circle r="42" fill="none" stroke="url(#cyt-globe)" strokeWidth="5" />
        <ellipse rx="42" ry="18" fill="none" stroke="url(#cyt-globe)" strokeWidth="3.5" opacity="0.85" />
        <ellipse rx="18" ry="42" fill="none" stroke="url(#cyt-globe)" strokeWidth="3.5" opacity="0.85" />
        <line x1="-42" y1="0" x2="42" y2="0" stroke="url(#cyt-globe)" strokeWidth="3.5" opacity="0.85" />
      </g>
      <path d="M162 182 Q222 202 262 172 Q298 146 306 104" fill="none" stroke="#14B8A6" strokeWidth="6.5" strokeLinecap="round" opacity="0.5" />
      <g transform="translate(262 74) scale(2.05)">
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
          fill="#5EEAD4" stroke="#14B8A6" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
      <circle cx="220" cy="180" r="20" fill="#14B8A6" />
      <path d="M211 180 l6 6 l12 -13.5" fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}