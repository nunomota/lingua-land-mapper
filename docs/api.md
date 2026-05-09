---
title: API Reference

<br>

---

<br>

All endpoints follow a **subscribe-then-POST** pattern: open the SSE stream first with a unique `mapId`, then trigger generation via POST. Events are delivered over the open stream as generation progresses.


<br>

---

<br>

## Map generation

### GET /map/stream

Opens a Server-Sent Events stream for a map generation job.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mapId` | string | ✓ | Unique ID shared with the POST request |

**Events**

| Event | When | Payload |
|-------|------|---------|
| `graph` | After LLM reasoning | `{ reasoning: string, matrix: Record<string, Record<string, number>> }` |
| `cell` | Each collapsed tile | `{ x: number, y: number, spriteId: string }` |
| `restart` | WFC contradiction, retrying | `{ attempt: number, maxRetries: number }` |
| `done` | Generation complete | — |
| `error` | Unrecoverable failure | `{ message: string }` |


<br>

---

<br>

### POST /map

Triggers asynchronous map generation. An active stream subscriber for the given `mapId` must exist before calling this endpoint.

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `mapId` | string | ✓ | — | Unique ID shared with the stream subscriber |
| `query` | string | ✓ | — | Natural language description of the map |
| `availableSprites` | `{ id: string, description: string }[]` | ✓ | — | Tile types the map can use |
| `dimensions` | `{ width: number, height: number }` | | `15×15` | Grid size in tiles |
| `smoothing` | `"low" \| "high"` | | none | Prune low-weight transitions for stricter layouts |

**Responses**

| Status | Body | Description |
|--------|------|-------------|
| `202 Accepted` | `{ mapId: string }` | Generation started |
| `400 Bad Request` | `{ error: ... }` | Validation failed or no active stream for `mapId` |

**Example**

```bash
# Terminal 1 — subscribe
curl -N "http://localhost:3000/map/stream?mapId=my-map"

# Terminal 2 — trigger
curl -X POST http://localhost:3000/map \
  -H "Content-Type: application/json" \
  -d '{
    "mapId": "my-map",
    "query": "A forest clearing with a small pond",
    "availableSprites": [
      { "id": "grass", "description": "Green grass" },
      { "id": "water", "description": "Blue water" },
      { "id": "tree",  "description": "Dense tree" },
      { "id": "sand",  "description": "Sandy shore" }
    ]
  }'
```


<br>

---

<br>

## Props generation

Props are details placed on top of an existing tile map — things like scattered objects, ground cover, or decorative elements.

### GET /props/stream

Opens a Server-Sent Events stream for a props generation job.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mapId` | string | ✓ | Unique ID shared with the POST request |

**Events**

| Event | When | Payload |
|-------|------|---------|
| `propGraph` | After LLM reasoning | `{ reasoning: string, adjacencyMatrix: Record<string, Record<string, number>>, overlapRules: Record<string, string[]> }` |
| `propCell` | Each placed detail | `{ x: number, y: number, detailId: string \| null }` |
| `restart` | WFC contradiction, retrying | `{ attempt: number, maxRetries: number }` |
| `done` | Generation complete | — |
| `error` | Unrecoverable failure | `{ message: string }` |


<br>

---

<br>

### POST /props

Triggers asynchronous props generation. An active stream subscriber for the given `mapId` must exist before calling this endpoint.

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mapId` | string | ✓ | Unique ID shared with the stream subscriber |
| `query` | string | ✓ | Natural language description of the props to place |
| `availableDetails` | `{ id: string, description: string }[]` | ✓ | Prop types that can be placed |
| `tileMap` | `string[][]` | ✓ | The existing tile map (2D array of sprite IDs) |
| `tileSprites` | `{ id: string, description: string }[]` | ✓ | Descriptions for the tile types in `tileMap` |
| `smoothing` | `"low" \| "high"` | | Prune low-weight adjacency for stricter prop placement |

**Responses**

| Status | Body | Description |
|--------|------|-------------|
| `202 Accepted` | `{ mapId: string }` | Generation started |
| `400 Bad Request` | `{ error: ... }` | Validation failed or no active stream for `mapId` |

**Example**

```bash
# Terminal 1 — subscribe
curl -N "http://localhost:3000/props/stream?mapId=my-props"

# Terminal 2 — trigger
curl -X POST http://localhost:3000/props \
  -H "Content-Type: application/json" \
  -d '{
    "mapId": "my-props",
    "query": "Scattered moss and pebbles on a forest floor",
    "availableDetails": [
      { "id": "moss",    "description": "Green moss patches" },
      { "id": "pebble",  "description": "Small grey pebbles" }
    ],
    "tileMap": [
      ["grass", "grass", "water"],
      ["grass", "sand",  "water"]
    ],
    "tileSprites": [
      { "id": "grass", "description": "Green grass" },
      { "id": "water", "description": "Blue water" },
      { "id": "sand",  "description": "Sandy shore" }
    ]
  }'
```
