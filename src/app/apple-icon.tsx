import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon; same mark as app/icon.svg, full-bleed (iOS rounds corners). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1B6B53" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <path d="M21 47V17l22 30V17" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13 28h38M13 37h38" stroke="#F2C14E" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
