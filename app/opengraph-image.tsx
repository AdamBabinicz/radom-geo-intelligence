import { ImageResponse } from "next/og";

export const alt = "Northstar Ops | GeoIntelligence & Service Operations Hub";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        background:
          "linear-gradient(135deg, #0c1517 0%, #11272a 55%, #0f766e 100%)",
        color: "#f8fafc",
        padding: "56px 68px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "58px",
              height: "58px",
              borderRadius: "14px",
              backgroundColor: "#0f766e",
              border: "1px solid rgba(94, 234, 212, 0.45)",
              fontSize: "28px",
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            N
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              Northstar Ops
            </span>
            <span
              style={{
                fontSize: "17px",
                color: "#99f6e4",
              }}
            >
              GeoIntelligence & Service Operations Hub
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "10px 22px",
            borderRadius: "9999px",
            backgroundColor: "rgba(15, 118, 110, 0.4)",
            border: "1px solid rgba(94, 234, 212, 0.4)",
            fontSize: "20px",
            fontWeight: 600,
            color: "#ccfbf1",
          }}
        >
          nsops.vercel.app
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          maxWidth: "1020px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: "52px",
            fontWeight: 700,
            lineHeight: 1.12,
            color: "#ffffff",
          }}
        >
          Local Market Intelligence & Atlassian Rovo / MCP
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "25px",
            lineHeight: 1.4,
            color: "#cbd5e1",
          }}
        >
          Live website pricing extraction, 10–100 km radius quoting,
          cross-provider Multi-Model AI Council, and Jira & Confluence
          execution.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            flex: 1,
            padding: "20px 24px",
            borderRadius: "16px",
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
          }}
        >
          <span
            style={{
              fontSize: "15px",
              color: "#5eead4",
              fontWeight: 600,
            }}
          >
            GEO-INTELLIGENCE
          </span>
          <span
            style={{
              fontSize: "22px",
              color: "#ffffff",
              fontWeight: 600,
            }}
          >
            10–100 km Radius + Live SPA Pricing
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            flex: 1,
            padding: "20px 24px",
            borderRadius: "16px",
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
          }}
        >
          <span
            style={{
              fontSize: "15px",
              color: "#5eead4",
              fontWeight: 600,
            }}
          >
            AI COUNCIL
          </span>
          <span
            style={{
              fontSize: "22px",
              color: "#ffffff",
              fontWeight: 600,
            }}
          >
            Gemini Strategist ↔ Groq Critic
          </span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            flex: 1,
            padding: "20px 24px",
            borderRadius: "16px",
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
          }}
        >
          <span
            style={{
              fontSize: "15px",
              color: "#5eead4",
              fontWeight: 600,
            }}
          >
            ATLASSIAN FORGE
          </span>
          <span
            style={{
              fontSize: "22px",
              color: "#ffffff",
              fontWeight: 600,
            }}
          >
            Rovo Agent, MCP & Jira / Confluence
          </span>
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  );
}
