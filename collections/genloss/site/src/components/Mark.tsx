import { useEffect, useState } from "react";

const c = (k: number, n: number) => (k === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * n + 1) * k * Math.PI) / 16);
const PATTERNS = [[1, 2], [3, 1], [2, 2], [1, 3], [4, 1], [2, 4], [3, 3]] as const;

export default function Mark({ size = 18 }: { size?: number }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setK((x) => (x + 1) % PATTERNS.length), 3200);
    return () => clearInterval(id);
  }, []);
  const [u, v] = PATTERNS[k];
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden="true" shapeRendering="crispEdges">
      {Array.from({ length: 64 }, (_, i) => {
        const x = i % 8, y = i >> 3;
        const val = (c(u, y) * c(v, x) + 1) / 2;
        return <rect key={i} x={x} y={y} width="1" height="1" fill="#f5f5f7" style={{ opacity: 0.08 + val * 0.92, transition: "opacity 1.6s ease" }} />;
      })}
    </svg>
  );
}
