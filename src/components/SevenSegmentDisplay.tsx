import { forwardRef } from "react";
import type { SampleMeter } from "@/lib/samples";
import { BARS, CELL_WIDTH, CELL_HEIGHT, DOT_WIDTH, SEGMENTS, VIEWPORT_HEIGHT } from "@/lib/sevenSegmentGeometry";

const ON_COLOR = "#22d3ee";

function Digit({ char, x }: { char: string; x: number }) {
  if (char === ".") {
    return <rect x={x + 4} y={CELL_HEIGHT - 8} width={6} height={6} fill={ON_COLOR} />;
  }
  const active = new Set(SEGMENTS[char] ?? []);
  return (
    <g>
      {Object.entries(BARS)
        .filter(([name]) => active.has(name))
        .map(([name, [bx, by, bw, bh]]) => (
          <rect key={name} x={x + bx} y={by} width={bw} height={bh} rx={2} fill={ON_COLOR} />
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
        viewBox={`0 0 ${width} ${VIEWPORT_HEIGHT}`}
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
        <rect x={0} y={0} width={width} height={VIEWPORT_HEIGHT} fill="black" />
        <g filter={meter.quality === "blurry" ? `url(#${filterId})` : undefined}>
          {positions.map(({ char, x }, i) => (
            <Digit key={i} char={char} x={x} />
          ))}
        </g>
        {meter.quality === "glare" && (
          <ellipse
            cx={width * 0.8}
            cy={CELL_HEIGHT * 0.3}
            rx={width * 0.22}
            ry={CELL_HEIGHT * 0.35}
            fill="white"
            opacity={0.35}
          />
        )}
      </svg>
    );
  }
);
