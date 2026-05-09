<div align="center">
  <h1>Lingua Land Mapper (LLM)</h1>
  <img src="assets/splashart.png" alt="Lingua Land Mapper — sample generated maps" height="200" />
  <br /><br />
  <p><em>Describe a world in words — get back a procedurally generated tile map, streamed in real time.</em></p>
  <img alt="version" src="https://img.shields.io/badge/version-0.1.0-blue" />
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green" />
  <a href="https://nunomota.github.io/lingua-land-mapper/"><img alt="docs" src="https://img.shields.io/badge/docs-GitHub%20Pages-blue" /></a>
  <br /><br />
  <a href="#how-it-works">How it works</a> •
  <a href="#getting-started">Getting started</a> •
  <a href="#roadmap">Roadmap</a> •
  <a href="#contributing">Contributing</a>
</div>

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

For the full endpoint reference, see the [API documentation](https://nunomota.github.io/lingua-land-mapper/api).

---

## Roadmap

- **Prop generation** — objects, houses, trees, and other placeable elements
- **Entity generation** — NPCs and monsters
- **FX** — weather, clouds, and environmental effects

---

## Contributing

The best way to contribute right now is to open an issue — whether it's a bug you ran into, a feature you'd like to see, or just an idea worth discussing. Issue templates are available when you create one.

- [Report a bug](../../issues/new?template=bug_report.md)
- [Request a feature](../../issues/new?template=feature_request.md)
