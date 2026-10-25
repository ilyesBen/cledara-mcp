// Spawns the real entrypoint over stdio against a local mock of the Cledara API.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { applications } from "./fixtures.ts";
import { FAKE_KEY } from "./helpers.ts";

const authHeaders: (string | undefined)[] = [];
const mock = createServer((req, res) => {
  authHeaders.push(req.headers.authorization);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(applications));
});

before(() => new Promise<void>((resolve) => mock.listen(0, "127.0.0.1", resolve)));
after(() => mock.close());

test("entrypoint serves tools over stdio using the key from the environment", async () => {
  const { port } = mock.address() as AddressInfo;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    // An explicit key means no .env file is ever read by this test.
    env: { PATH: process.env.PATH ?? "", CLEDARA_API_KEY: FAKE_KEY, CLEDARA_API_BASE_URL: `http://127.0.0.1:${port}` },
    stderr: "pipe",
  });
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(transport);
  try {
    const res = await client.callTool({ name: "list_applications", arguments: { status: ["active"] } });
    const body = JSON.parse((res.content as { text: string }[])[0]!.text);
    assert.equal(body.count, 2);
    assert.deepEqual(authHeaders, [`Bearer ${FAKE_KEY}`]);
  } finally {
    await client.close();
  }
});
