---
title: How it works
---

*Describe a world in words — get back a procedurally generated tile map, streamed in real time.*

---

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
# Copy and fill in the example env file
cp .env.example .env
```

### Local

```bash
npm install
npm run dev
```

### Docker

```bash
docker build -t lingua-land-mapper .
docker run -p 3000:3000 --env-file .env --name lingua-land-mapper lingua-land-mapper
```

### Try the test script

There's a ready-made client in the repo that generates a 10×10 forest-clearing map (grass, water, sand) and logs progress to your terminal:

```bash
npm run test:flow
```

The LLM's transition matrix is printed once reasoning finishes. Each cell collapse is logged as it streams in, and the final map is rendered as emoji when generation is done (🟩 grass · 🟦 water · 🟨 sand).

---

## Next steps

See the [API reference](api) for the full endpoint documentation.
