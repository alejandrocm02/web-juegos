import type { GameId } from '@arcade/shared';

/**
 * Miniatura de cada juego para la pantalla de su máquina en la portada.
 *
 * Antes todas las máquinas mostraban las mismas dos esferas y solo cambiaba el
 * color, así que no se distinguía un juego de otro sin leer el nombre. Aquí
 * cada juego tiene su propia escena: SVG en línea, sin imágenes ni peticiones,
 * y coloreado con `--game-accent` para heredar el tono de su tarjeta.
 *
 * Es decorativo: el nombre y la descripción van en HTML junto a la escena.
 */

const A = 'var(--game-accent)';
const DIM = 'color-mix(in srgb, var(--game-accent) 28%, transparent)';
const FAINT = 'color-mix(in srgb, var(--game-accent) 12%, transparent)';
const INK = '#070b14';

const SCENES: Record<GameId, React.ReactNode> = {
  pool: (
    <>
      <rect x="22" y="18" width="116" height="56" rx="8" fill="#5b3a1c" />
      <rect x="28" y="24" width="104" height="44" rx="3" fill="#0f6b4a" />
      {[28, 80, 132].flatMap((x) =>
        [24, 68].map((y) => <circle key={x + '-' + y} cx={x} cy={y} r="3.4" fill={INK} />),
      )}
      <line
        x1="34"
        y1="58"
        x2="58"
        y2="48"
        stroke="#e8d3a8"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle className="scene-move" cx="62" cy="46" r="4" fill="#f8fafc" />
      <circle cx="98" cy="46" r="4" fill="#facc15" />
      <circle cx="105" cy="42" r="4" fill="#ef4444" />
      <circle cx="105" cy="50" r="4" fill="#3b82f6" />
      <circle cx="112" cy="46" r="4" fill="#111827" />
    </>
  ),
  quiz: (
    <>
      <rect x="30" y="12" width="100" height="26" rx="7" fill={FAINT} stroke={DIM} />
      <text x="80" y="31" textAnchor="middle" fontSize="17" fontWeight="900" fill={A}>
        ?
      </text>
      {[
        [30, 44, '#38bdf8'],
        [84, 44, '#f472b6'],
        [30, 62, '#fbbf24'],
        [84, 62, '#a78bfa'],
      ].map(([x, y, color]) => (
        <g key={x + '-' + y}>
          <rect
            x={x}
            y={y}
            width="46"
            height="13"
            rx="4"
            fill={color + '22'}
            stroke={color + '88'}
          />
          <rect
            x={Number(x) + 4}
            y={Number(y) + 4}
            width="5"
            height="5"
            rx="1.5"
            fill={color as string}
          />
          <rect
            x={Number(x) + 13}
            y={Number(y) + 5}
            width="24"
            height="3"
            rx="1.5"
            fill="#ffffff33"
          />
        </g>
      ))}
      <rect
        className="scene-pulse"
        x="84"
        y="44"
        width="46"
        height="13"
        rx="4"
        fill="none"
        stroke="#f472b6"
        strokeWidth="1.5"
      />
    </>
  ),
  darts: (
    <>
      <circle cx="80" cy="45" r="36" fill={INK} stroke="#1f2937" strokeWidth="3" />
      {Array.from({ length: 10 }, (_, i) => (
        <path
          key={i}
          d="M80 45 L80 13 A32 32 0 0 1 89.9 14.6 Z"
          fill="#e7dcc0"
          transform={`rotate(${i * 36} 80 45)`}
        />
      ))}
      <circle cx="80" cy="45" r="32" fill="none" stroke="#dc2626" strokeWidth="2.4" />
      <circle cx="80" cy="45" r="19" fill="none" stroke="#16a34a" strokeWidth="2.4" />
      <circle cx="80" cy="45" r="6" fill="#16a34a" />
      <circle cx="80" cy="45" r="2.6" fill="#dc2626" />
      <g className="scene-pulse">
        <line x1="83" y1="42" x2="106" y2="20" stroke={A} strokeWidth="2" strokeLinecap="round" />
        <path d="M106 20 l8 -2 l-2 8 z" fill={A} />
      </g>
    </>
  ),
  golf: (
    <>
      <path d="M18 70 Q18 28 60 30 L112 22 Q146 22 142 52 Q140 76 100 72 Z" fill="#14532d" />
      <path d="M26 66 Q26 36 60 38 L110 30 Q136 30 134 52 Q132 68 100 65 Z" fill="#1c8a4d" />
      <ellipse cx="116" cy="48" rx="6" ry="3" fill={INK} />
      <line x1="116" y1="48" x2="116" y2="20" stroke="#e5e7eb" strokeWidth="1.6" />
      <path d="M116 20 l15 5 l-15 6 z" fill="#f43f5e" />
      <path
        d="M46 56 Q80 38 110 47"
        fill="none"
        stroke="#ffffff66"
        strokeWidth="1.2"
        strokeDasharray="3 4"
      />
      <circle className="scene-move" cx="46" cy="56" r="3.6" fill="#f8fafc" />
    </>
  ),
  bowling: (
    <>
      <path d="M58 82 L72 10 L88 10 L102 82 Z" fill="#c99552" />
      <path
        d="M58 82 L72 10 M102 82 L88 10 M80 82 L80 10"
        stroke="#7a4a22"
        strokeWidth="0.8"
        opacity="0.6"
      />
      {[
        [80, 30],
        [75, 24],
        [85, 24],
        [70, 18],
        [80, 18],
        [90, 18],
      ].map(([x, y]) => (
        <g key={x + '-' + y}>
          <ellipse cx={x} cy={y} rx="3" ry="5" fill="#f8fafc" />
          <rect x={Number(x) - 3} y={Number(y) - 2} width="6" height="1.4" fill="#ef4444" />
        </g>
      ))}
      <g className="scene-move">
        <circle cx="80" cy="66" r="9" fill={A} />
        <circle cx="77" cy="63" r="1.3" fill={INK} />
        <circle cx="82" cy="62" r="1.3" fill={INK} />
        <circle cx="80" cy="67" r="1.3" fill={INK} />
      </g>
    </>
  ),
  karts: (
    <>
      <ellipse cx="80" cy="45" rx="58" ry="30" fill="none" stroke="#1f2937" strokeWidth="17" />
      <ellipse
        cx="80"
        cy="45"
        rx="58"
        ry="30"
        fill="none"
        stroke="#ffffff55"
        strokeWidth="1"
        strokeDasharray="5 6"
      />
      <rect x="77" y="66" width="6" height="18" fill="#f8fafc" opacity="0.75" />
      <g className="scene-move">
        <rect x="98" y="65" width="15" height="9" rx="3" fill={A} transform="rotate(-14 105 70)" />
        <rect
          x="102"
          y="67"
          width="6"
          height="5"
          rx="1.5"
          fill={INK}
          transform="rotate(-14 105 70)"
        />
      </g>
      <rect
        x="44"
        y="66"
        width="13"
        height="8"
        rx="3"
        fill="#f472b6"
        transform="rotate(16 50 70)"
      />
      <rect
        x="30"
        y="26"
        width="13"
        height="8"
        rx="3"
        fill="#facc15"
        transform="rotate(-38 36 30)"
      />
    </>
  ),
  arena: (
    <>
      <circle cx="80" cy="45" r="38" fill="#ef444418" stroke="#ef444466" />
      <circle
        className="scene-pulse"
        cx="80"
        cy="45"
        r="28"
        fill={INK}
        stroke="#7dd3fc"
        strokeWidth="1.6"
      />
      <circle cx="68" cy="38" r="5" fill="#38bdf8" />
      <path d="M73 38 l10 4" stroke="#f8fafc" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="94" cy="50" r="5" fill="#f472b6" />
      <circle cx="78" cy="58" r="5" fill="#facc15" />
      <circle cx="90" cy="32" r="3.2" fill="#34d399" />
      <path d="M90 30.4 v3.2 M88.4 32 h3.2" stroke={INK} strokeWidth="1" />
    </>
  ),
  blackjack: (
    <>
      <path d="M14 78 Q80 20 146 78 Z" fill="#0f5a3e" stroke="#d4a94a" strokeWidth="1.4" />
      <g transform="rotate(-10 66 46)">
        <rect x="52" y="26" width="28" height="40" rx="4" fill="#f8fafc" />
        <text x="57" y="40" fontSize="11" fontWeight="900" fill="#111827">
          A
        </text>
        <text x="66" y="59" textAnchor="middle" fontSize="15" fill="#111827">
          ♠
        </text>
      </g>
      <g transform="rotate(9 96 46)">
        <rect x="82" y="26" width="28" height="40" rx="4" fill="#f8fafc" />
        <text x="87" y="40" fontSize="11" fontWeight="900" fill="#dc2626">
          K
        </text>
        <text x="96" y="59" textAnchor="middle" fontSize="15" fill="#dc2626">
          ♥
        </text>
      </g>
      <circle
        className="scene-pulse"
        cx="124"
        cy="68"
        r="7"
        fill={A}
        stroke={INK}
        strokeWidth="2"
        strokeDasharray="3 2.5"
      />
    </>
  ),
  songless: (
    <>
      {[10, 22, 34, 20, 40, 28, 14, 32, 24, 12].map((h, i) => (
        <rect
          key={i}
          className={i % 2 ? 'scene-bar' : 'scene-bar scene-bar-b'}
          x={34 + i * 9.6}
          y={45 - h / 2}
          width="5"
          height={h}
          rx="2.5"
          fill={A}
          opacity={0.55 + (h / 40) * 0.45}
        />
      ))}
      <text x="18" y="34" fontSize="18" fill={DIM}>
        ♪
      </text>
      <text x="132" y="70" fontSize="18" fill={DIM}>
        ♫
      </text>
    </>
  ),
  'air-hockey': (
    <>
      <rect x="20" y="16" width="120" height="58" rx="10" fill={INK} stroke={A} strokeWidth="1.6" />
      <line x1="80" y1="16" x2="80" y2="74" stroke={DIM} />
      <circle cx="80" cy="45" r="11" fill="none" stroke={DIM} />
      <rect x="18" y="34" width="4" height="22" rx="2" fill="#ef4444" />
      <rect x="138" y="34" width="4" height="22" rx="2" fill="#3b82f6" />
      <circle cx="42" cy="50" r="7" fill="#ef4444" />
      <circle cx="42" cy="50" r="3" fill="#fecaca" />
      <circle cx="116" cy="38" r="7" fill="#3b82f6" />
      <circle cx="116" cy="38" r="3" fill="#bfdbfe" />
      <circle className="scene-move" cx="74" cy="42" r="4" fill="#f8fafc" />
    </>
  ),
  'table-tennis': (
    <>
      <path d="M30 72 L48 26 L112 26 L130 72 Z" fill="#1d4ed8" stroke="#f8fafc" strokeWidth="1.6" />
      <line x1="80" y1="26" x2="80" y2="72" stroke="#f8fafc" strokeWidth="0.8" opacity="0.6" />
      <rect
        x="36"
        y="44"
        width="88"
        height="7"
        fill="#ffffff22"
        stroke="#f8fafc"
        strokeWidth="0.8"
      />
      <g transform="rotate(-24 38 30)">
        <circle cx="38" cy="26" r="9" fill="#ef4444" />
        <rect x="36" y="34" width="4" height="10" rx="1.5" fill="#c99552" />
      </g>
      <g transform="rotate(24 122 30)">
        <circle cx="122" cy="26" r="9" fill={A} />
        <rect x="120" y="34" width="4" height="10" rx="1.5" fill="#c99552" />
      </g>
      <circle className="scene-move" cx="74" cy="20" r="3" fill="#fb923c" />
    </>
  ),
  'head-soccer': (
    <>
      <rect x="10" y="70" width="140" height="10" rx="2" fill="#14532d" />
      <path d="M16 70 V40 H30" fill="none" stroke="#ef4444" strokeWidth="2.4" />
      <path d="M144 70 V40 H130" fill="none" stroke="#3b82f6" strokeWidth="2.4" />
      <circle cx="54" cy="58" r="11" fill="#38bdf8" />
      <circle cx="58" cy="55" r="2" fill={INK} />
      <circle cx="108" cy="58" r="11" fill="#f472b6" />
      <circle cx="104" cy="55" r="2" fill={INK} />
      <g className="scene-move">
        <circle cx="80" cy="30" r="7" fill="#f8fafc" />
        <path d="M80 26 l3.4 2.6 l-1.3 4 h-4.2 l-1.3 -4 z" fill={INK} />
      </g>
    </>
  ),
  'head-basketball': (
    <>
      <rect x="10" y="70" width="140" height="10" rx="2" fill="#7c2d12" />
      <rect x="126" y="18" width="4" height="52" fill="#475569" />
      <rect
        x="110"
        y="16"
        width="18"
        height="16"
        rx="2"
        fill="#ffffff22"
        stroke="#f8fafc"
        strokeWidth="1.2"
      />
      <ellipse cx="108" cy="34" rx="10" ry="2.6" fill="none" stroke="#f97316" strokeWidth="2" />
      <path d="M99 35 l3 12 h12 l3 -12" fill="none" stroke="#ffffff66" strokeWidth="0.9" />
      <circle cx="52" cy="58" r="11" fill="#38bdf8" />
      <circle cx="56" cy="55" r="2" fill={INK} />
      <path
        d="M62 44 Q84 6 104 26"
        fill="none"
        stroke="#ffffff55"
        strokeWidth="1.1"
        strokeDasharray="3 4"
      />
      <g className="scene-move">
        <circle cx="76" cy="24" r="7" fill="#f97316" />
        <path d="M69 24 h14 M76 17 v14" stroke={INK} strokeWidth="0.9" />
      </g>
    </>
  ),
  tanks: (
    <>
      <path d="M0 90 V66 Q22 56 42 64 T84 60 T124 50 T160 62 V90 Z" fill="#3f1d1d" />
      <path
        d="M0 66 Q22 56 42 64 T84 60 T124 50 T160 62"
        fill="none"
        stroke={A}
        strokeWidth="1.4"
      />
      <rect x="22" y="53" width="18" height="8" rx="3" fill="#38bdf8" />
      <line
        x1="33"
        y1="54"
        x2="46"
        y2="42"
        stroke="#38bdf8"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="116" y="42" width="18" height="8" rx="3" fill="#facc15" />
      <line
        x1="122"
        y1="43"
        x2="110"
        y2="32"
        stroke="#facc15"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M46 42 Q78 -4 108 30"
        fill="none"
        stroke="#ffffff66"
        strokeWidth="1.2"
        strokeDasharray="3 4"
      />
      <circle className="scene-pulse" cx="80" cy="16" r="3.4" fill="#f8fafc" />
    </>
  ),
};

export function GameScene({ game }: { game: GameId }) {
  return (
    <svg
      className="game-scene"
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {SCENES[game]}
    </svg>
  );
}
