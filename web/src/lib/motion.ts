// Shared, bouncy motion presets: quick springs that overshoot a little, like a cartoon.
import type { Transition, Variants } from "motion/react";

/** Snappy with a visible overshoot. Good for pop-ins, picks and badges. */
export const bouncy: Transition = { type: "spring", stiffness: 520, damping: 16, mass: 0.8 };

/** Softer, for larger things moving (rows re-ranking, sheets). */
export const springy: Transition = { type: "spring", stiffness: 260, damping: 20 };

/** Pops in from small, overshoots, settles. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.6, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: bouncy },
};

/** Container that staggers its children's pop-ins. */
export const stagger = (gap = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** A happy little wiggle (rotation keyframes). */
export const wiggle = { rotate: [0, -12, 10, -6, 4, 0], transition: { duration: 0.6 } };

/** Squash-and-stretch "boing" for a press or a landing. */
export const boing = { scaleX: [1, 1.18, 0.92, 1.04, 1], scaleY: [1, 0.82, 1.08, 0.97, 1], transition: { duration: 0.5 } };
