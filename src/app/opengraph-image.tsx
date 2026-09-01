import { ImageResponse } from "next/og";

export const alt = "Siriranee Thai Massage in Howth, Dublin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #150224 0%, #240a3c 100%)",
          color: "white",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "2px solid rgba(234,174,61,.35)",
            borderRadius: 999,
            height: 520,
            position: "absolute",
            right: -120,
            top: -120,
            width: 520,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "72px 80px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: "#f2c56e",
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 5,
              marginBottom: 26,
              textTransform: "uppercase",
            }}
          >
            Howth · Dublin
          </div>
          <div style={{ fontFamily: "Georgia", fontSize: 82, lineHeight: 1.05 }}>
            Siriranee
          </div>
          <div
            style={{
              color: "#eaae3d",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 8,
              marginTop: 18,
              textTransform: "uppercase",
            }}
          >
            Thai Massage
          </div>
          <div style={{ color: "rgba(255,255,255,.75)", fontSize: 27, marginTop: 32 }}>
            Thai massage and thoughtful spa treatments
          </div>
        </div>
      </div>
    ),
    size,
  );
}
