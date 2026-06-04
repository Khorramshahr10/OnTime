// Islamic geometric pattern primitives — all original SVG

// 8-pointed star (khatam / Rub el Hizb) — built from two overlapping squares
export function KhatamStar({ size = 24, stroke = 'var(--color-primary)', fill = 'none', strokeWidth = 1, opacity = 1 }: {
  size?: number; stroke?: string; fill?: string; strokeWidth?: number; opacity?: number;
}) {
  const cx = 50, cy = 50, r = 42;
  const pts1: string[] = [];
  const pts2: string[] = [];
  for (let i = 0; i < 4; i++) {
    const a1 = (i / 4) * Math.PI * 2;
    const a2 = a1 + Math.PI / 4;
    pts1.push(`${cx + Math.cos(a1) * r},${cy + Math.sin(a1) * r}`);
    pts2.push(`${cx + Math.cos(a2) * r},${cy + Math.sin(a2) * r}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ opacity, display: 'block' }}>
      <polygon points={pts1.join(' ')} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="miter"/>
      <polygon points={pts2.join(' ')} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="miter"/>
    </svg>
  );
}

// Full-bleed girih-inspired pattern background (subtle, tileable)
export function GirihBackground({ color = 'var(--color-primary)', opacity = 0.045, id = 'girih-bg' }: {
  color?: string; opacity?: number; id?: string;
}) {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity, pointerEvents: 'none' }}>
      <defs>
        <pattern id={id} x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
          {/* 8-star */}
          <g transform="translate(30 30)">
            {[0, 1, 2, 3].map(i => {
              const a1 = (i / 4) * Math.PI * 2;
              const a2 = a1 + Math.PI / 4;
              const r = 14;
              const p1 = [Math.cos(a1) * r, Math.sin(a1) * r];
              const p2 = [Math.cos(a1 + Math.PI / 2) * r, Math.sin(a1 + Math.PI / 2) * r];
              const q1 = [Math.cos(a2) * r, Math.sin(a2) * r];
              const q2 = [Math.cos(a2 + Math.PI / 2) * r, Math.sin(a2 + Math.PI / 2) * r];
              return (
                <g key={i}>
                  <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={color} strokeWidth="0.7"/>
                  <line x1={q1[0]} y1={q1[1]} x2={q2[0]} y2={q2[1]} stroke={color} strokeWidth="0.7"/>
                </g>
              );
            })}
          </g>
          {/* corner dots */}
          <circle cx="0" cy="0" r="1" fill={color}/>
          <circle cx="60" cy="0" r="1" fill={color}/>
          <circle cx="0" cy="60" r="1" fill={color}/>
          <circle cx="60" cy="60" r="1" fill={color}/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`}/>
    </svg>
  );
}

// Crescent + star glyph
export function CrescentStar({ size = 14, color = 'var(--color-primary)' }: {
  size?: number; color?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: 'block' }}>
      <path d="M14 4a7 7 0 100 12 5.5 5.5 0 010-12z" fill={color}/>
      <polygon points="16,8 17,10.5 19.5,10.5 17.5,12 18.3,14.5 16,13 13.7,14.5 14.5,12 12.5,10.5 15,10.5" fill={color}/>
    </svg>
  );
}

// Corner ornament — small stylized bracket
export function CornerOrnament({ size = 16, color = 'var(--color-primary)', opacity = 0.7, rotate = 0 }: {
  size?: number; color?: string; opacity?: number; rotate?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ opacity, transform: `rotate(${rotate}deg)`, display: 'block' }}>
      <path d="M1 1 L1 8 M1 1 L8 1" stroke={color} strokeWidth="1" fill="none"/>
      <circle cx="4" cy="4" r="1" fill={color}/>
    </svg>
  );
}
