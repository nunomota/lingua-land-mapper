# lingua-land-mapper

A REST API that procedurally generates 2D top-down game maps from a text description. You describe the world, provide a set of tile sprites, and the server streams back a fully collapsed map — cell by cell — in real time.

## How it works

**LLM-assisted graph generation** — Before any map is drawn, the API calls an LLM (gpt-5.4-nano) with your map description and sprite list. The model reasons about which tiles should appear next to which, and returns a weighted directed transition graph (e.g. `water → sand: likely`, `water → tree: never`). This graph is validated and row-normalised into a probability matrix.

**Wave Function Collapse (WFC)** — The matrix feeds a WFC algorithm that fills an N×M grid. At each step it picks the uncollapsed cell with the lowest Shannon entropy, samples a tile from its weighted possibility set, then propagates constraints to neighbours via BFS. On contradiction it restarts from scratch (up to 10 times). Progress — every collapsed cell, every restart, completion — streams to the client over SSE.

## Setup

```bash
# Install dependencies
npm install

# Add your OpenAI API key
echo "OPENAI_API_KEY=sk-..." > .env

# Start the dev server
npm run dev
```

## Usage

Open two terminals.

**Terminal 1 — subscribe to the stream:**
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

The stream in Terminal 1 will emit `graph` → `cell` (×N) → `done`.
