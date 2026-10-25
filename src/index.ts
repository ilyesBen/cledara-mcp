#!/usr/bin/env node
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CledaraClient } from "./client.ts";
import { createServer } from "./server.ts";

// Key lookup order: environment, $CLEDARA_ENV_FILE, the .env in this package's
// root (a git clone), then ~/.config/cledara-mcp/.env (npx installs).
// Never log the key: stdout is the MCP channel and stderr ends up in client logs.
const envFiles = [
  process.env.CLEDARA_ENV_FILE,
  fileURLToPath(new URL("../.env", import.meta.url)),
  join(homedir(), ".config", "cledara-mcp", ".env"),
].filter((f): f is string => Boolean(f));

for (const file of envFiles) {
  if (process.env.CLEDARA_API_KEY?.trim()) break;
  // loadEnvFile won't overwrite a variable that is already set, even to "".
  delete process.env.CLEDARA_API_KEY;
  if (existsSync(file)) process.loadEnvFile(file);
}

const apiKey = process.env.CLEDARA_API_KEY?.trim();
if (!apiKey) {
  console.error(`cledara-mcp: CLEDARA_API_KEY is empty. Set it in one of: ${envFiles.join(", ")}, or the environment.`);
  process.exit(1);
}

const client = new CledaraClient({ apiKey, baseUrl: process.env.CLEDARA_API_BASE_URL || undefined });
await createServer(client).connect(new StdioServerTransport());
