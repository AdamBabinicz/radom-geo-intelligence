import { NextResponse } from "next/server";
import { handleMcpJsonRpc, mcpTools } from "@/src/backend/mcp-server/tools";

export async function GET() {
  return NextResponse.json({
    server: "northstar-ops-mcp",
    protocol: "MCP JSON-RPC 2.0",
    tools: mcpTools,
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      jsonrpc?: string;
      id?: string | number | null;
      method?: string;
      params?: Record<string, unknown>;
    };
    const response = await handleMcpJsonRpc(payload);
    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid MCP request";
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message } },
      { status: 400 },
    );
  }
}
