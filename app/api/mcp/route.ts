import { NextResponse } from "next/server";
import { handleMcpJsonRpc, mcpTools } from "@/src/backend/mcp-server/tools";

export const maxDuration = 30;

interface McpRequestPayload {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export async function GET() {
  return NextResponse.json({
    server: "northstar-ops-mcp",
    protocol: "MCP JSON-RPC 2.0",
    tools: mcpTools,
  });
}

export async function POST(request: Request) {
  let payload: McpRequestPayload;

  try {
    const raw = await request.text();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid JSON-RPC request object" },
        },
        { status: 400 },
      );
    }
    payload = parsed as McpRequestPayload;
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON payload" },
      },
      { status: 400 },
    );
  }

  try {
    const response = await handleMcpJsonRpc(payload);
    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "MCP execution failed";
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: payload.id ?? null,
        error: { code: -32603, message },
      },
      { status: 500 },
    );
  }
}
