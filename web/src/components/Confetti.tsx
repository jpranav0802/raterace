// A cartoony confetti burst. Pieces fly up and out, tumble, and fall with gravity.
// Change `fire` to replay. Renders nothing for people who prefer reduced motion.
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

const COLORS = ["var(--brand)", "var(--good)", "#ffd23f", "#ffffff", "#5ec8ff"];

interface Piece {
  x: number;
  peak: number;
  fall: number;
  rotate: number;
  size: number;
  round: boolean;
  color: string;
  delay: number;
  duration: number;
}

function makePieces(count: number, spread: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.random() - 0.5) * Math.PI * 0.9; // mostly upward
    const power = 0.55 + Math.random() * 0.6;
    return {
      x: Math.sin(angle) * spread * power,
      peak: -Math.cos(angle) * spread * 0.75 * power,
      fall: spread * (0.5 + Math.random() * 0.6),
      rotate: (Math.random() - 0.5) * 900,
      size: 6 + Math.random() * 7,
      round: i % 3 === 0,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.08,
      duration: 1.1 + Math.random() * 0.7,
    };
  });
}

export function Confetti({ fire, count = 44, spread = 260 }: { fire: number | string; count?: number; spread?: number }) {
  const reduce = useReducedMotion();
  // New pieces for every burst.
  const pieces = useMemo(() => makePieces(count, spread), [fire, count, spread]); // eslint-disable-line react-hooks/exhaustive-deps
  if (reduce || !fire) return null;
  return (
    <div key={String(fire)} aria-hidden="true" className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center overflow-visible">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            borderRadius: p.round ? 999 : 2,
            background: p.color,
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1, scale: 0.4 }}
          animate={{
            x: [0, p.x * 0.7, p.x],
            y: [0, p.peak, p.peak + p.fall],
            rotate: p.rotate,
            opacity: [1, 1, 0],
            scale: [0.4, 1.1, 1],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: ["easeOut", "easeIn"], times: [0, 0.35, 1] }}
        />
      ))}
    </div>
  );
}
