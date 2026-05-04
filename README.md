# Lingua Land Mapper

<div align="center">
  <img src="assets/splashart.png" alt="Lingua Land Mapper — sample generated maps" width="480" />
  <br /><br />
  <p><em>Describe a world in words — get back a procedurally generated tile map, streamed in real time.</em></p>
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-blue" />
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green" />
</div>

---

## Table of Contents

- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [How to use](#how-to-use)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## How it works

Asking an LLM to place every tile on a grid doesn't work well. Models aren't great spatial reasoners — they'll produce inconsistent layouts and forget adjacency rules as soon as a map gets large.

The trick is to split the problem in two:

1. **LLMs are good at relationships.** Give a model a description and a list of tile types, and it can reason about which tiles should sit next to which — "water should always be edged by sand, never by dense forest." That gets captured as a weighted **transition graph**: a matrix of probabilities over tile-to-tile transitions.

2. **WFC is good at layouts.** [Wave Function Collapse](https://github.com/mxgmn/WaveFunctionCollapse) takes that transition graph and fills the grid. It picks the most constrained cell first, samples a tile, and propagates constraints to its neighbours. If it hits a contradiction, it restarts — up to ten times.

The result is a map that follows the LLM's intent without asking it to do the hard spatial reasoning.

```
Natural language description + tile sprites
              │
              ▼
      ┌───────────────┐
      │      LLM      │  reasons about tile relationships
      └───────┬───────┘
              │ weighted transition graph
              ▼
      ┌───────────────┐
      │      WFC      │  entropy-guided collapse + BFS propagation
      └───────┬───────┘
              │ cell events  (streamed via SSE)
              ▼
          Tile map
```

---

## Getting started

```bash
# Install dependencies
npm install

# Add your OpenAI API key
echo "OPENAI_API_KEY=sk-..." > .env

# Start the server
npm run dev
```

### Try the test script

There's a ready-made client in the repo that generates a 10×10 forest-clearing map (grass, water, sand) and logs progress to your terminal:

```bash
npm run test:flow
```

The LLM's transition matrix is printed once reasoning finishes. Each cell collapse is logged as it streams in, and the final map is rendered as emoji when generation is done (🟩 grass · 🟦 water · 🟨 sand).

---

## How to use

Open two terminals.

**Terminal 1 — subscribe to the event stream:**
```bash
curl -N "http://localhost:3000/map/stream?mapId=my-map"
```

**Terminal 2 — trigger generation:**
```bash
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

The stream emits the following events:

| Event | When | Payload |
|-------|------|---------|
| `graph` | After LLM reasoning | Transition matrix + reasoning text |
| `cell` | Each collapsed tile | `{ x, y, spriteId }` |
| `restart` | WFC contradiction, retrying | `{ attempt, maxRetries }` |
| `done` | Generation complete | — |
| `error` | Unrecoverable failure | `{ message }` |

### Request fields

`POST /map` accepts a JSON body:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `mapId` | string | ✓ | — | Unique ID shared with the stream subscriber |
| `query` | string | ✓ | — | Natural language description of the map |
| `availableSprites` | `{ id, description }[]` | ✓ | — | Tile types the map can use |
| `dimensions` | `{ width, height }` | | `15×15` | Grid size in tiles |
| `smoothing` | `"low"` \| `"high"` | | none | Prune low-weight transitions (stricter layouts) |

---

## Roadmap

- **Map editing** — tweak and refine an existing generated map tile by tile
- **Entity generation** — populate maps with objects, NPCs, and other entities

---

## Contributing

The best way to contribute right now is to open an issue — whether it's a bug you ran into, a feature you'd like to see, or just an idea worth discussing. Issue templates are available when you create one.

- [Report a bug](../../issues/new?template=bug_report.md)
- [Request a feature](../../issues/new?template=feature_request.md)
