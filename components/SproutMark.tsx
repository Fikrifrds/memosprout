"use client";

/**
 * The MemoSprout mark: an amber dot (the captured correction) and a single
 * stroke growing from it into a leaf.
 *
 * With `animate`, the seed lands first and the stroke draws itself upward —
 * the product's idea in three seconds. Respects prefers-reduced-motion,
 * where it renders fully grown and still.
 */
export function SproutMark({
  className = "h-6 w-6",
  animate = false,
}: {
  className?: string;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={`${className} ${animate ? "sprout-animate" : ""}`}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="16" fill="#134E4A" />
      <path
        className="sprout-stroke"
        d="M28 48V33c0-9 7-15 18-16 1 12-7 18-18 18"
        fill="none"
        stroke="#5EEAD4"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        // Set here rather than in CSS: the optimizer drops the dash
        // properties when it cannot see them referenced, which silently
        // breaks the draw-on. The keyframes supply dashoffset.
        style={animate ? { strokeDasharray: 76 } : undefined}
      />
      <circle
        className="sprout-seed"
        cx="28"
        cy="48"
        r="3.2"
        fill="#FBBF24"
        style={animate ? { transformOrigin: "28px 48px" } : undefined}
      />
    </svg>
  );
}
