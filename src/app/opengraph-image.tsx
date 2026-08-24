import { ImageResponse } from "next/og";
import { siteName, siteTagline } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${siteName}. ${siteTagline}`;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 28,
        padding: 96,
        background: "#121212",
        color: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="104" height="104" viewBox="0 0 32 32">
          <path
            fill="#fff"
            d="M16 4.5 18.85 13.26H28.06L21.61 18.67 24.46 27.44 16 21.99 7.54 27.44 10.39 18.67 3.94 13.26H13.15Z"
          />
        </svg>
        <div
          style={{
            fontSize: 104,
            fontWeight: 600,
            letterSpacing: -4,
          }}
        >
          {siteName}
        </div>
      </div>
      <div style={{ fontSize: 40, color: "#a1a1a1" }}>{siteTagline}</div>
    </div>,
    { ...size },
  );
}
