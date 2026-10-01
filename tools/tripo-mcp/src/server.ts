import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env {
  TRIPO_API_KEY: string;
  BRIDGE_TOKEN?: string;
}

const TRIPO_BASE = "https://openapi.tripo3d.ai/v3";

type Json = Record<string, unknown>;

function asText(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

function asError(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error)
      }
    ]
  };
}

async function tripoRequest(
  env: Env,
  path: string,
  init: RequestInit = {}
): Promise<Json> {
  if (!env.TRIPO_API_KEY) {
    throw new Error("TRIPO_API_KEY is not configured on the Worker.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${env.TRIPO_API_KEY}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${TRIPO_BASE}${path}`, {
    ...init,
    headers
  });

  const raw = await response.text();
  let payload: Json;

  try {
    payload = raw ? (JSON.parse(raw) as Json) : {};
  } catch {
    throw new Error(
      `Tripo returned non-JSON data (HTTP ${response.status}): ${raw.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Tripo HTTP ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  if (typeof payload.code === "number" && payload.code !== 0) {
    throw new Error(
      `Tripo error ${payload.code}: ${String(payload.message ?? "Unknown error")}${
        payload.suggestion ? ` — ${String(payload.suggestion)}` : ""
      }`
    );
  }

  return payload;
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "Car Aboden — Tripo 3D Bridge",
    version: "1.0.0"
  });

  server.registerTool(
    "tripo_balance",
    {
      description:
        "Read the current Tripo API credit balance before starting paid 3D generation or processing.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async () => {
      try {
        return asText(
          await tripoRequest(env, "/account/balance", { method: "GET" })
        );
      } catch (error) {
        return asError(error);
      }
    }
  );

  server.registerTool(
    "tripo_usage",
    {
      description:
        "Read recent Tripo API credit usage and task charges.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async () => {
      try {
        return asText(
          await tripoRequest(env, "/account/usage", { method: "GET" })
        );
      } catch (error) {
        return asError(error);
      }
    }
  );

  server.registerTool(
    "tripo_image_to_3d",
    {
      description:
        "Create a Tripo Image-to-3D task from a public image URL. Recommended for Car Aboden vehicle references. Returns a task_id; use tripo_get_task to monitor it.",
      inputSchema: {
        image_url: z.string().url(),
        model: z
          .enum(["v3.1-20260211", "v3.0-20250812", "v2.5-20250123"])
          .default("v3.1-20260211"),
        face_limit: z.number().int().min(500).max(2000000).default(20000),
        texture: z.boolean().default(true),
        pbr: z.boolean().default(true),
        texture_quality: z
          .enum(["standard", "detailed"])
          .default("detailed")
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false
      }
    },
    async ({
      image_url,
      model,
      face_limit,
      texture,
      pbr,
      texture_quality
    }) => {
      try {
        const body = {
          input: image_url,
          model,
          face_limit,
          texture,
          pbr,
          texture_quality,
          enable_image_autofix: true
        };

        return asText(
          await tripoRequest(env, "/generation/image-to-model", {
            method: "POST",
            body: JSON.stringify(body)
          })
        );
      } catch (error) {
        return asError(error);
      }
    }
  );

  server.registerTool(
    "tripo_get_task",
    {
      description:
        "Query a Tripo asynchronous task. Returns status, progress, model URL, preview URL and credits consumed when available.",
      inputSchema: {
        task_id: z.string().min(1)
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    async ({ task_id }) => {
      try {
        return asText(
          await tripoRequest(
            env,
            `/tasks/${encodeURIComponent(task_id)}`,
            { method: "GET" }
          )
        );
      } catch (error) {
        return asError(error);
      }
    }
  );

  server.registerTool(
    "tripo_segment_vehicle",
    {
      description:
        "Semantically segment a generated vehicle model into separate connected parts. Uses Tripo Mesh Segmentation v2 with detailed granularity; useful for separating wheels from the vehicle body. Returns a new task_id.",
      inputSchema: {
        input: z
          .string()
          .min(1)
          .describe("Tripo task_id, file_token, or public model URL"),
        granularity: z
          .enum(["simple", "balanced", "detailed"])
          .default("detailed"),
        split_by_connectivity: z.boolean().default(true)
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false
      }
    },
    async ({ input, granularity, split_by_connectivity }) => {
      try {
        const body = {
          model: "v2.0-20260430",
          input,
          segmentation_granularity: granularity,
          split_by_connectivity
        };

        return asText(
          await tripoRequest(env, "/mesh/segment", {
            method: "POST",
            body: JSON.stringify(body)
          })
        );
      } catch (error) {
        return asError(error);
      }
    }
  );

  server.registerTool(
    "tripo_make_game_ready",
    {
      description:
        "Run Tripo smart retopology on a generated or segmented model and output a lighter GLB suitable for mobile/web games. For Car Aboden, 8000-15000 faces is a sensible starting range.",
      inputSchema: {
        input: z
          .string()
          .min(1)
          .describe("Tripo task_id, file_token, or public model URL"),
        face_limit: z.number().int().min(500).max(20000).default(12000),
        quad: z.boolean().default(false),
        bake: z.boolean().default(true),
        part_names: z.array(z.string()).optional()
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false
      }
    },
    async ({ input, face_limit, quad, bake, part_names }) => {
      try {
        const body: Record<string, unknown> = {
          input,
          model: "v2.0",
          face_limit,
          quad,
          bake
        };

        if (part_names?.length) {
          body.part_names = part_names;
        }

        return asText(
          await tripoRequest(env, "/mesh/decimate", {
            method: "POST",
            body: JSON.stringify(body)
          })
        );
      } catch (error) {
        return asError(error);
      }
    }
  );

  return server;
}

function isAuthorized(request: Request, env: Env) {
  if (!env.BRIDGE_TOKEN) return true;
  return request.headers.get("Authorization") === `Bearer ${env.BRIDGE_TOKEN}`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "Car Aboden — Tripo 3D Bridge",
        tripo_api_configured: Boolean(env.TRIPO_API_KEY),
        bridge_auth_enabled: Boolean(env.BRIDGE_TOKEN)
      });
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not found", { status: 404 });
    }

    if (!isAuthorized(request, env)) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": "Bearer" }
      });
    }

    if (!env.TRIPO_API_KEY) {
      return new Response("TRIPO_API_KEY is not configured", { status: 503 });
    }

    return createMcpHandler(() => createServer(env))(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
