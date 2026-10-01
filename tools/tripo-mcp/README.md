# Car Aboden — Tripo MCP Bridge

A small Cloudflare Worker that exposes selected Tripo 3D API v3 operations as MCP tools.

## What it exposes

- `tripo_balance` — read API credits.
- `tripo_usage` — read recent usage.
- `tripo_image_to_3d` — create Image-to-3D task from a public image URL.
- `tripo_get_task` — check async task status/results.
- `tripo_segment_vehicle` — Tripo Mesh Segmentation v2, optimized for separating vehicle parts such as wheels.
- `tripo_make_game_ready` — smart retopology to a lighter GLB for mobile/web games.

## Security

Never commit a Tripo API key. Store it only as a Cloudflare Worker secret.

The MCP endpoint can also require a bridge bearer token. Set `BRIDGE_TOKEN` to prevent an unauthenticated caller from spending your Tripo credits.

## Local setup

```bash
cd tools/tripo-mcp
npm install
cp .dev.vars.example .dev.vars
# edit .dev.vars locally only
npm run dev
```

MCP endpoint:

```
http://localhost:8787/mcp
```

Health check:

```
http://localhost:8787/health
```

## Cloudflare deployment

```bash
cd tools/tripo-mcp
npm install
npx wrangler login
npx wrangler secret put TRIPO_API_KEY
npx wrangler secret put BRIDGE_TOKEN
npm run deploy
```

The final endpoint will look like:

```
https://tripo-car-aboden-mcp.<your-workers-subdomain>.workers.dev/mcp
```

If `BRIDGE_TOKEN` is enabled, the MCP client must send:

```
Authorization: Bearer <BRIDGE_TOKEN>
```

## Vehicle workflow for Car Aboden

1. Host the clean vehicle reference image at a public HTTPS URL.
2. Call `tripo_balance`.
3. Call `tripo_image_to_3d` with:
   - model: `v3.1-20260211`
   - face_limit: `20000`
   - texture: `true`
   - pbr: `true`
4. Poll `tripo_get_task` until `status=success`.
5. Call `tripo_segment_vehicle` on the generation task with:
   - granularity: `detailed`
   - split_by_connectivity: `true`
6. Poll the segmentation task until success.
7. Call `tripo_make_game_ready` on the segmented task:
   - target: about `12000` faces initially
   - quad: `false`
   - bake: `true`
8. Download the resulting GLB and inspect part names/pivots before adding it to the playable vehicle system.

### Important vehicle limitation

Tripo segmentation can separate connected components and semantically label parts, but it does **not guarantee** that the four wheel pivots will land exactly at each wheel center. Before the model is used as a drivable Car Aboden vehicle, verify:

- body mesh is independent;
- four wheels are independent meshes;
- each wheel pivot is centered on its axle;
- wheel local axes match the game's wheel rotation axis;
- scale and forward direction match the existing Car Aboden vehicle convention.

If pivots are wrong, fix them during the repository's Blender/GLB post-process step rather than regenerating the entire model.
