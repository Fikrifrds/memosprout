import { ImageResponse } from "next/og";

/**
 * The card shown when the site is shared on social platforms or chat apps.
 *
 * Generated at build time rather than committed as a binary, so the wording
 * stays in one place and cannot drift from the page it represents. Colors and
 * the sprout mark mirror app/icon.svg.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "MemoSprout — Correct once. Improve every interaction.";

// Required by `output: export`: the image is produced during the build.
export const dynamic = "force-static";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "#134E4A",
          fontFamily: "sans-serif",
        }}
      >
        {/* The sprout, at the scale the icon was designed to survive. */}
        <svg width="128" height="128" viewBox="0 0 64 64" style={{ marginBottom: 36 }}>
          <path
            d="M28 48V33c0-9 7-15 18-16 1 12-7 18-18 18"
            fill="none"
            stroke="#5EEAD4"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="28" cy="48" r="3.2" fill="#FBBF24" />
        </svg>

        <div style={{ display: "flex", fontSize: 40, color: "#5EEAD4", letterSpacing: -0.5 }}>
          memosprout
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: -2,
            marginTop: 12,
            lineHeight: 1.15,
          }}
        >
          Correct once. Improve every interaction.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "#99F6E4",
            marginTop: 26,
            lineHeight: 1.4,
          }}
        >
          Capture corrections to AI outputs, gate them, and deliver them to every future answer.
        </div>
      </div>
    ),
    size,
  );
}
