import { forwardRef } from "react";
import type { SampleMeter } from "@/lib/samples";

const SEGMENTS: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

// x, y, width, height for each bar within a 40x70 digit cell
const BARS: Record<string, [number, number, number, number]> = {
  a: [6, 2, 28, 6],
  f: [2, 6, 6, 28],
  b: [32, 6, 6, 28],
  g: [6, 32, 28, 6],
  e: [2, 36, 6, 28],
  c: [32, 36, 6, 28],
  d: [6, 62, 28, 6],
};

const CELL_WIDTH = 40;
const DOT_WIDTH = 16;
const HEIGHT = 70;
const ON_COLOR = "#22d3ee";

function Digit({ char, x }: { char: string; x: number }) {
  if (char === ".") {
    return <rect x={x + 4} y={HEIGHT - 8} width={6} height={6} fill={ON_COLOR} />;
  }
  const active = new Set(SEGMENTS[char] ?? []);
  return (
    <g>
      {Object.entries(BARS)
        .filter(([name]) => active.has(name))
        .map(([name, [bx, by, bw, bh]]) => (
        <rect
          key={name}
          x={x + bx}
          y={by}
          width={bw}
          height={bh}
          rx={2}
          fill={ON_COLOR}
        />
      ))}
    </g>
  );
}

export const SevenSegmentDisplay = forwardRef<SVGSVGElement, { meter: SampleMeter }>(
  function SevenSegmentDisplay({ meter }, ref) {
  const chars = meter.digits.split("");
  const positions = chars.reduce<{ char: string; x: number }[]>((acc, char) => {
    const prev = acc[acc.length - 1];
    const x = prev ? prev.x + (prev.char === "." ? DOT_WIDTH : CELL_WIDTH) : 4;
    return [...acc, { char, x }];
  }, []);
  const last = positions[positions.length - 1];
  const width = (last ? last.x + (last.char === "." ? DOT_WIDTH : CELL_WIDTH) : 4) + 4;
  const filterId = `quality-${meter.id}`;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${HEIGHT + 8}`}
      className="w-full max-w-xs rounded-lg bg-black"
      role="img"
      aria-label={`Mock 7-segment display showing ${meter.digits}, ${meter.quality} quality`}
    >
      <defs>
        {meter.quality === "blurry" && (
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        )}
      </defs>
      <rect x={0} y={0} width={width} height={HEIGHT + 8} fill="black" />
      <g filter={meter.quality === "blurry" ? `url(#${filterId})` : undefined}>
        {positions.map(({ char, x }, i) => (
          <Digit key={i} char={char} x={x} />
        ))}
      </g>
      {meter.quality === "glare" && (
        <ellipse
          cx={width * 0.8}
          cy={HEIGHT * 0.3}
          rx={width * 0.22}
          ry={HEIGHT * 0.35}
          fill="white"
          opacity={0.35}
        />
      )}
    </svg>
  );
  }
);
