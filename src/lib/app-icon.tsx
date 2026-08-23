import { ImageResponse } from "next/og";

const STAR =
  "M16 4.5 18.85 13.26H28.06L21.61 18.67 24.46 27.44 16 21.99 7.54 27.44 10.39 18.67 3.94 13.26H13.15Z";

export function appIcon(size: number) {
  const star = Math.round(size * 0.7);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000",
      }}
    >
      <svg width={star} height={star} viewBox="0 0 32 32">
        <path fill="#fff" d={STAR} />
      </svg>
    </div>,
    { width: size, height: size },
  );
}
