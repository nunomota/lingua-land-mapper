import "dotenv/config";

const BASE_URL = "http://localhost:3000";
const MAP_ID = `test-map-${Date.now()}`;
const PROPS_ID = `test-props-${Date.now()}`;

const MAP_PAYLOAD = {
  mapId: MAP_ID,
  query: "A forest clearing with a small pond and sandy shores",
  availableSprites: [
    { id: "grass", description: "Open green grass" },
    { id: "water", description: "Blue pond water" },
    { id: "sand",  description: "Sandy shore at water's edge" },
  ],
  dimensions: { width: 10, height: 10 },
};

const PROPS_QUERY = "Mossy patches and scattered pebbles across the clearing";
const AVAILABLE_DETAILS = [
  { id: "moss",   description: "A patch of soft green moss" },
  { id: "pebble", description: "A small grey pebble" },
];

const SPRITE_ICONS: Record<string, string> = {
  grass: "🟩",
  water: "🟦",
  sand:  "🟨",
};

const DETAIL_ICONS: Record<string, string> = {
  moss:   "🌿",
  pebble: "🪨",
};

function logEvent(event: string, detail: string) {
  console.log(`[event:${event}] ${detail}`);
}

function printMatrix(label: string, matrix: Record<string, Record<string, number>>) {
  const keys = Object.keys(matrix);
  const colWidth = Math.max(...keys.map((k) => k.length), 6) + 2;
  const pad = (s: string) => s.padEnd(colWidth);

  const header = pad("") + keys.map(pad).join("");
  console.log(`\n  ${label} (row → col):`);
  console.log("  " + header);
  console.log("  " + "─".repeat(header.length));

  for (const from of keys) {
    const row = keys
      .map((to) => {
        const w = matrix[from]?.[to] ?? 0;
        return pad(w.toFixed(3));
      })
      .join("");
    console.log(`  ${pad(from)}${row}`);
  }
  console.log();
}

function printMap(
  tileGrid: Record<string, string>,
  propGrid: Record<string, string | null> | null,
  width: number,
  height: number
) {
  const label = propGrid ? "Final map + props:" : "Final map:";
  console.log(`\n  ${label}\n`);
  for (let y = 0; y < height; y++) {
    let row = "  ";
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      const spriteId = tileGrid[key] ?? "?";
      const detailId = propGrid?.[key] ?? null;
      if (detailId) {
        row += DETAIL_ICONS[detailId] ?? `[${detailId}]`;
      } else {
        row += SPRITE_ICONS[spriteId] ?? `[${spriteId}]`;
      }
    }
    console.log(row);
  }
  console.log();
}

async function connectSse(url: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to open SSE stream: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return function listen(
    handlers: Record<string, (payload: unknown) => void>,
    onEnd: () => void,
    onError: (err: unknown) => void
  ) {
    async function pump() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const blocks = (buffer + decoder.decode(value, { stream: true })).split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            const lines = block.split("\n");
            let event = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) event = line.slice(7).trim();
              if (line.startsWith("data: ")) data = line.slice(6).trim();
            }
            if (!data) continue;

            const payload = JSON.parse(data) as unknown;
            handlers[event]?.(payload);
          }
        }
        onEnd();
      } catch (err) {
        onError(err);
      }
    }
    void pump();
  };
}

async function runMapPhase(): Promise<{
  tileGrid: Record<string, string>;
  tileMap: string[][];
}> {
  const { width, height } = MAP_PAYLOAD.dimensions;
  const tileGrid: Record<string, string> = {};

  console.log(`\n[map] mapId: ${MAP_ID}`);
  console.log(`[map] Connecting to SSE stream...`);

  const listen = await connectSse(`${BASE_URL}/map/stream?mapId=${MAP_ID}`);

  await new Promise<void>((resolve, reject) => {
    listen(
      {
        graph(payload) {
          const p = payload as { reasoning: string; matrix: Record<string, Record<string, number>> };
          logEvent("graph", `reasoning: "${p.reasoning}"`);
          printMatrix("Tile transition matrix", p.matrix);
        },
        cell(payload) {
          const p = payload as { x: number; y: number; spriteId: string };
          tileGrid[`${p.x},${p.y}`] = p.spriteId;
          logEvent("cell", `(${p.x}, ${p.y}) → ${p.spriteId}`);
        },
        restart(payload) {
          const p = payload as { attempt: number; maxRetries: number };
          logEvent("restart", `contradiction — attempt ${p.attempt}/${p.maxRetries}`);
        },
        done() {
          logEvent("done", "map generation complete");
          resolve();
        },
        error(payload) {
          const p = payload as { message: string };
          logEvent("error", p.message);
          reject(new Error(p.message));
        },
      },
      resolve,
      reject
    );

    console.log("[map] Stream open. Triggering POST /map...\n");
    fetch(`${BASE_URL}/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(MAP_PAYLOAD),
    }).then((res) => {
      if (!res.ok) {
        res.json().then((body) => {
          console.error("[map] POST failed:", body);
          process.exit(1);
        }).catch(reject);
      } else {
        console.log(`[map] 202 accepted — waiting for events...\n`);
      }
    }).catch(reject);
  });

  const tileMap: string[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => tileGrid[`${x},${y}`] ?? "grass")
  );

  printMap(tileGrid, null, width, height);

  return { tileGrid, tileMap };
}

async function runPropsPhase(
  tileMap: string[][],
  tileGrid: Record<string, string>
): Promise<void> {
  const width = tileMap[0]!.length;
  const height = tileMap.length;
  const propGrid: Record<string, string | null> = {};

  console.log(`\n[props] mapId: ${PROPS_ID}`);
  console.log(`[props] Connecting to SSE stream...`);

  const listen = await connectSse(`${BASE_URL}/props/stream?mapId=${PROPS_ID}`);

  await new Promise<void>((resolve, reject) => {
    listen(
      {
        propGraph(payload) {
          const p = payload as {
            reasoning: string;
            adjacencyMatrix: Record<string, Record<string, number>>;
            overlapRules: Record<string, string[]>;
          };
          logEvent("propGraph", `reasoning: "${p.reasoning}"`);
          printMatrix("Detail adjacency matrix", p.adjacencyMatrix);
          console.log("  Overlap rules:");
          for (const [id, tiles] of Object.entries(p.overlapRules)) {
            console.log(`    ${id} → [${tiles.join(", ")}]`);
          }
          console.log();
        },
        propCell(payload) {
          const p = payload as { x: number; y: number; detailId: string | null };
          propGrid[`${p.x},${p.y}`] = p.detailId;
          if (p.detailId) {
            logEvent("propCell", `(${p.x}, ${p.y}) → ${p.detailId}`);
          }
        },
        restart(payload) {
          const p = payload as { attempt: number; maxRetries: number };
          logEvent("restart", `contradiction — attempt ${p.attempt}/${p.maxRetries}`);
        },
        done() {
          logEvent("done", "prop generation complete");
          resolve();
        },
        error(payload) {
          const p = payload as { message: string };
          logEvent("error", p.message);
          reject(new Error(p.message));
        },
      },
      resolve,
      reject
    );

    const propsPayload = {
      mapId: PROPS_ID,
      query: PROPS_QUERY,
      availableDetails: AVAILABLE_DETAILS,
      tileMap,
      tileSprites: MAP_PAYLOAD.availableSprites,
    };

    console.log("[props] Stream open. Triggering POST /props...\n");
    fetch(`${BASE_URL}/props`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(propsPayload),
    }).then((res) => {
      if (!res.ok) {
        res.json().then((body) => {
          console.error("[props] POST failed:", body);
          process.exit(1);
        }).catch(reject);
      } else {
        console.log(`[props] 202 accepted — waiting for events...\n`);
      }
    }).catch(reject);
  });

  printMap(tileGrid, propGrid, width, height);
}

async function main() {
  const { tileGrid, tileMap } = await runMapPhase();
  await runPropsPhase(tileMap, tileGrid);
}

main().catch((err) => {
  console.error("[test-flow] Fatal:", err);
  process.exit(1);
});
