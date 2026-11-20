import { createServer, type AddressInfo, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { McpRpcError, RemoteMcpClient, bypassesProxy, isResponse, plainHttpProxyFetch } from "./mcp-http.ts";
import { startFakeHttpMcp, type FakeHttpMcp } from "./testing/fake-http-mcp-server.ts";

let fake: FakeHttpMcp | undefined;
let client: RemoteMcpClient | undefined;
afterEach(async () => {
  await client?.close(); client = undefined;
  await fake?.close(); fake = undefined;
});

describe("a server's own requests to the client", () => {
  it.each(["http", "sse"] as const)("are refused at once over %s, so the call they interrupt still finishes", async (transport) => {
    fake = await startFakeHttpMcp({ transport, tools: [{ name: "ask_first", inputSchema: { type: "object" } }], askOnCall: "elicitation/create" });
    client = new RemoteMcpClient({ type: transport, url: fake.url, headers: {} });
    await client.initialize("fixture", AbortSignal.timeout(5_000));
    // without an answer the server holds the result until this deadline
    const result = await client.request("tools/call", { name: "ask_first", arguments: {} }, AbortSignal.timeout(5_000));
    expect(result).toEqual({ content: [{ type: "text", text: "remote execution recorded" }] });
    expect(fake.replies).toEqual([{ jsonrpc: "2.0", id: "server-ask-1", error: { code: -32601, message: "Method not supported by this client" } }]);
  });

  it.each(["http", "sse"] as const)("include a ping, which gets its empty answer over %s", async (transport) => {
    fake = await startFakeHttpMcp({ transport, tools: [{ name: "ask_first", inputSchema: { type: "object" } }], askOnCall: "ping" });
    client = new RemoteMcpClient({ type: transport, url: fake.url, headers: {} });
    await client.initialize("fixture", AbortSignal.timeout(5_000));
    await client.request("tools/call", { name: "ask_first", arguments: {} }, AbortSignal.timeout(5_000));
    expect(fake.replies).toEqual([{ jsonrpc: "2.0", id: "server-ask-1", result: {} }]);
  });
});

describe("a server's JSON-RPC error", () => {
  it.each(["http", "sse"] as const)("keeps its code and words over %s, apart from transport failures", async (transport) => {
    fake = await startFakeHttpMcp({ transport, tools: [{ name: "report" }], callError: () => ({ code: -32602, message: "Missing required parameter 'campaignId'" }) });
    client = new RemoteMcpClient({ type: transport, url: fake.url, headers: {} });
    await client.initialize("fixture", AbortSignal.timeout(5_000));
    const failure = await client.request("tools/call", { name: "report", arguments: {} }, AbortSignal.timeout(5_000)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(McpRpcError);
    expect(failure).toMatchObject({ kind: "protocol", code: -32602, detail: "Missing required parameter 'campaignId'" });
  });
});

describe("which plain http requests go through HTTP_PROXY", () => {
  it("skips loopback and NO_PROXY hosts the way curl does", () => {
    const at = (url: string, list = "") => bypassesProxy(new URL(url), list);
    for (const url of ["http://localhost:3000/mcp", "http://127.0.0.1/mcp", "http://127.8.0.1/mcp", "http://[::1]:8080/mcp", "http://app.localhost/mcp"]) expect(at(url)).toBe(true);
    expect(at("http://mcp.corp.internal/mcp")).toBe(false);
    expect(at("http://mcp.corp.internal/mcp", "corp.internal")).toBe(true);
    expect(at("http://mcp.corp.internal/mcp", ".corp.internal")).toBe(true);
    expect(at("http://mcp.corp.internal/mcp", "*.corp.internal")).toBe(true);
    expect(at("http://mcp.corp.internal/mcp", "*")).toBe(true);
    expect(at("http://mcp.corp.internal/mcp", "other.internal, ,corp.internal:8080")).toBe(false);
    expect(at("http://mcp.corp.internal:8080/mcp", "corp.internal:8080")).toBe(true);
    expect(at("http://notcorp.internal/mcp", "corp.internal")).toBe(false);
    expect(at("http://[fd00::1]/mcp", "[fd00::1]")).toBe(true);
  });

  it("is only set up when an HTTP proxy is", () => {
    expect(plainHttpProxyFetch({})).toBeUndefined();
    expect(plainHttpProxyFetch({ HTTPS_PROXY: "http://proxy.example.test:3128" })).toBeUndefined();
    expect(plainHttpProxyFetch({ HTTP_PROXY: "proxy.example.test:3128" })).toBeTypeOf("function");
  });

  it("leaves https and exempt requests to fetch", async () => {
    const seen: string[] = [];
    const fallback = (async (input: string | URL | Request) => { seen.push(String(input)); return new Response("{}"); }) as typeof fetch;
    const viaProxy = plainHttpProxyFetch({ HTTP_PROXY: "http://127.0.0.1:9", NO_PROXY: "corp.internal" }, fallback)!;
    await viaProxy("https://mcp.example.test/mcp");
    await viaProxy("http://mcp.corp.internal/mcp");
    await viaProxy("http://127.0.0.1:4000/mcp");
    expect(seen).toEqual(["https://mcp.example.test/mcp", "http://mcp.corp.internal/mcp", "http://127.0.0.1:4000/mcp"]);
  });
});

describe("isResponse", () => {
  it("recognizes JSON-RPC response shapes", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: {} })).toBe(true);
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: null })).toBe(true);
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: 0 })).toBe(true);
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: false })).toBe(true);
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: "" })).toBe(true);
    expect(isResponse({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } })).toBe(true);
  });

  it("rejects requests, notifications, and non-response shapes", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1, method: "ping" })).toBe(false);
    expect(isResponse({ jsonrpc: "2.0", id: 1, method: "ping", params: {} })).toBe(false);
    expect(isResponse({ jsonrpc: "2.0", id: 1, method: "elicitation/create", params: {} })).toBe(false);
    expect(isResponse({ jsonrpc: "2.0", method: "notifications/initialized" })).toBe(false);
    expect(isResponse({ jsonrpc: "2.0", id: 1 })).toBe(false);
    expect(isResponse(null)).toBe(false);
    expect(isResponse(undefined)).toBe(false);
    expect(isResponse("not a record")).toBe(false);
    expect(isResponse(123)).toBe(false);
  });
});

describe("reverse requests with matching id", () => {
  let customServer: Server | undefined;
  afterEach(async () => {
    if (customServer) {
      customServer.closeAllConnections();
      await new Promise<void>((resolve) => customServer!.close(() => resolve()));
      customServer = undefined;
    }
  });

  it("does not prematurely resolve pending client call over sse when server sends reverse request with same id", async () => {
    let sseRes: ServerResponse | undefined;
    customServer = createServer((req, res) => {
      if (req.method === "GET" && req.url === "/sse") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        res.write("event: endpoint\ndata: /messages\n\n");
        sseRes = res;
        return;
      }
      if (req.method === "POST" && req.url === "/messages") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          const frame = JSON.parse(body) as { id: unknown; method?: string };
          if (frame.method === "initialize") {
            res.writeHead(202).end();
            sseRes?.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "test", version: "1" } } })}\n\n`);
            return;
          }
          if (frame.method === "notifications/initialized") {
            res.writeHead(202).end();
            return;
          }
          if (frame.method === "tools/call") {
            res.writeHead(202).end();
            sseRes?.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: frame.id, method: "ping" })}\n\n`);
            setTimeout(() => {
              sseRes?.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { content: [{ type: "text", text: "completed successfully" }] } })}\n\n`);
            }, 50);
            return;
          }
          res.writeHead(202).end();
        });
      }
    });
    await new Promise<void>((resolve) => customServer!.listen(0, "127.0.0.1", () => resolve()));
    const port = (customServer.address() as AddressInfo).port;
    client = new RemoteMcpClient({ type: "sse", url: `http://127.0.0.1:${port}/sse`, headers: {} });
    await client.initialize("fixture", AbortSignal.timeout(5_000));
    const result = await client.request("tools/call", { name: "test_tool" }, AbortSignal.timeout(5_000));
    expect(result).toEqual({ content: [{ type: "text", text: "completed successfully" }] });
  });

  it("does not prematurely resolve pending client call over http event stream when server sends reverse request with same id", async () => {
    customServer = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      req.on("end", () => {
        const frame = JSON.parse(body) as { id: unknown; method?: string };
        if (frame.method === "initialize") {
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "test", version: "1" } } }));
          return;
        }
        if (frame.method === "notifications/initialized") {
          res.writeHead(202).end();
          return;
        }
        if (frame.method === "tools/call") {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: frame.id, method: "ping" })}\n\n`);
          setTimeout(() => {
            res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { content: [{ type: "text", text: "streamable answer" }] } })}\n\n`);
          }, 50);
          return;
        }
        res.writeHead(202).end();
      });
    });
    await new Promise<void>((resolve) => customServer!.listen(0, "127.0.0.1", () => resolve()));
    const port = (customServer.address() as AddressInfo).port;
    client = new RemoteMcpClient({ type: "http", url: `http://127.0.0.1:${port}/mcp`, headers: {} });
    await client.initialize("fixture", AbortSignal.timeout(5_000));
    const result = await client.request("tools/call", { name: "test_tool" }, AbortSignal.timeout(5_000));
    expect(result).toEqual({ content: [{ type: "text", text: "streamable answer" }] });
  });
});

describe("remote MCP SSE stream lifetime detachment", () => {
  it("keeps SSE stream alive when opening request signal completes and aborts", async () => {
    fake = await startFakeHttpMcp({ transport: "sse", tools: [{ name: "ask_first", inputSchema: { type: "object" } }] });
    client = new RemoteMcpClient({ type: "sse", url: fake.url, headers: {} });
    const initAbort = new AbortController();
    await client.initialize("fixture", initAbort.signal);
    initAbort.abort();
    const result = await client.request("tools/call", { name: "ask_first", arguments: {} }, AbortSignal.timeout(5_000));
    expect(result).toEqual({ content: [{ type: "text", text: "remote execution recorded" }] });
  });

  it("aborts the SSE stream if opening signal aborts before endpoint is resolved", async () => {
    let slowServer: Server | undefined;
    try {
      slowServer = createServer((_req, _res) => {});
      await new Promise<void>((resolve) => slowServer!.listen(0, "127.0.0.1", () => resolve()));
      const port = (slowServer.address() as AddressInfo).port;
      const slowClient = new RemoteMcpClient({ type: "sse", url: `http://127.0.0.1:${port}/sse`, headers: {} });
      const initAbort = new AbortController();
      const initPromise = slowClient.initialize("fixture", initAbort.signal);
      initAbort.abort();
      await expect(initPromise).rejects.toThrow();
      await slowClient.close();
    } finally {
      if (slowServer) {
        slowServer.closeAllConnections();
        await new Promise<void>((resolve) => slowServer!.close(() => resolve()));
      }
    }
  });

  it("allows retrying SSE connection after an initial abort before endpoint resolution", async () => {
    let sseRequests = 0;
    let sseRes: ServerResponse | undefined;
    let customServer: Server | undefined;
    try {
      customServer = createServer((req, res) => {
        if (req.method === "GET" && req.url === "/sse") {
          sseRequests += 1;
          if (sseRequests === 1) {
            res.writeHead(200, { "content-type": "text/event-stream" });
            return;
          }
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("event: endpoint\ndata: /messages\n\n");
          sseRes = res;
          return;
        }
        if (req.method === "POST" && req.url === "/messages") {
          let body = "";
          req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          req.on("end", () => {
            const frame = JSON.parse(body) as { id: unknown; method?: string };
            res.writeHead(202).end();
            if (frame.method === "initialize") {
              sseRes?.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "test", version: "1" } } })}\n\n`);
            }
          });
        }
      });
      await new Promise<void>((resolve) => customServer!.listen(0, "127.0.0.1", () => resolve()));
      const port = (customServer.address() as AddressInfo).port;
      const retryClient = new RemoteMcpClient({ type: "sse", url: `http://127.0.0.1:${port}/sse`, headers: {} });
      const firstAbort = new AbortController();
      setTimeout(() => firstAbort.abort(), 20);
      await expect(retryClient.initialize("fixture", firstAbort.signal)).rejects.toThrow();

      const secondResult = await retryClient.initialize("fixture", AbortSignal.timeout(5_000));
      expect(secondResult).toBeDefined();
      await retryClient.close();
    } finally {
      if (customServer) {
        customServer.closeAllConnections();
        await new Promise<void>((resolve) => customServer!.close(() => resolve()));
      }
    }
  });
});
