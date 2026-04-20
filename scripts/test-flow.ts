import "dotenv/config";

const BASE_URL = "http://localhost:3000";
const MAP_ID = `test-${Date.now()}`;

const PAYLOAD = {
  mapId: MAP_ID,
  query: "A forest clearing with a small pond and sandy shores",
  availableSprites: [
    { id: "grass", description: "Open green grass" },
    { id: "water", description: "Blue pond water" },
    { id: "dirt",  description: "Bare dirt ground" },
    { id: "sand",  description: "Sandy shore at water's edge" },
  ],
  dimensions: { width: 10, height: 10 },
};

const SPRITE_ICONS: Record<string, string> = {
  grass: "🟩",
  water: "🟦",
  dirt:  "🟫",
  sand:  "🟨",
};

function logEvent(event: string, detail: string) {
  console.log(`[event:${event}] ${detail}`);
}

function printMatrix(matrix: Record<string, Record<string, number>>) {
  const sprites = Object.keys(matrix);
  const colWidth = Math.max(...sprites.map((s) => s.length), 6) + 2;
  const pad = (s: string) => s.padEnd(colWidth);

  const header = pad("") + sprites.map(pad).join("");
  console.log("\n  Transition matrix (row → col):");
  console.log("  " + header);
  console.log("  " + "─".repeat(header.length));

  for (const from of sprites) {
    const row = sprites
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
  grid: Record<string, string>,
  width: number,
  height: number
) {
  console.log("\n  Final map:\n");
  for (let y = 0; y < height; y++) {
    let row = "  ";
    for (let x = 0; x < width; x++) {
      const spriteId = grid[`${x},${y}`] ?? "?";
      row += SPRITE_ICONS[spriteId] ?? `[${spriteId}]`;
    }
    console.log(row);
  }
  console.log();
}

async function main() {
  const { width, height } = PAYLOAD.dimensions;
  const grid: Record<string, string> = {};

  console.log(`\n[test-flow] mapId: ${MAP_ID}`);
  console.log(`[test-flow] Connecting to SSE stream...`);

  const streamRes = await fetch(`${BASE_URL}/map/stream?mapId=${MAP_ID}`);
  if (!streamRes.ok || !streamRes.body) {
    console.error("[test-flow] Failed to open SSE stream:", streamRes.status);
    process.exit(1);
  }

  const done = new Promise<void>((resolve, reject) => {
    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    function parseSseChunk(chunk: string) {
      const blocks = (buffer + chunk).split("\n\n");
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

        const payload = JSON.parse(data);

        if (event === "graph") {
          logEvent("graph", `reasoning: "${payload.reasoning}"`);
          printMatrix(payload.matrix);
        } else if (event === "cell") {
          grid[`${payload.x},${payload.y}`] = payload.spriteId;
          logEvent("cell", `(${payload.x}, ${payload.y}) → ${payload.spriteId}`);
        } else if (event === "restart") {
          logEvent("restart", `contradiction — attempt ${payload.attempt}/${payload.maxRetries}`);
        } else if (event === "done") {
          logEvent("done", "map generation complete");
          printMap(grid, width, height);
          resolve();
        } else if (event === "error") {
          logEvent("error", payload.message);
          reject(new Error(payload.message));
        }
      }
    }

    async function pump() {
      try {
        while (true) {
          const { done: ended, value } = await reader.read();
          if (ended) break;
          parseSseChunk(decoder.decode(value, { stream: true }));
        }
      } catch (err) {
        reject(err);
      }
    }

    void pump();
  });

  console.log("[test-flow] Stream open. Triggering POST /map...\n");

  const postRes = await fetch(`${BASE_URL}/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(PAYLOAD),
  });

  if (!postRes.ok) {
    const body = await postRes.json();
    console.error("[test-flow] POST failed:", body);
    process.exit(1);
  }

  console.log(`[test-flow] 202 accepted — waiting for events...\n`);
  await done;
}

main().catch((err) => {
  console.error("[test-flow] Fatal:", err);
  process.exit(1);
});
