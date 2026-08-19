import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

const LOGO_URL = "https://raw.githubusercontent.com/CharismakProject/charismak-website/main/public/branding/charismak-logo.png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "white", borderRadius: "50%", position: "relative" }}>
      <img src={LOGO_URL} width="410" height="410" style={{ objectFit: "contain" }} />
      <div style={{ position: "absolute", right: 42, bottom: 42, width: 112, height: 112, borderRadius: "50%", background: "#082945", color: "white", border: "16px solid white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 58, fontWeight: 900 }}>A</div>
    </div>,
    size,
  );
}
