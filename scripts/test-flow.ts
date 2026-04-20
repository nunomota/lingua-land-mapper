import "dotenv/config";

const BASE_URL = "http://localhost:3000";
const MAP_ID = `test-${Date.now()}`;

const PAYLOAD = {
  mapId: MAP_ID,
  query: "A forest clearing with a small pond and sandy shores",
  availableSprites: [
    { id: "grass", description: "Open green grass" },
    { id: "water", description: "Blue pond water" },
    { id: "tree", description: "Dense forest tree" },
    { id: "sand", description: "Sandy shore at water's edge" },
  ],
  dimensions: { width: 10, height: 10 },
};

async function main() {
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
          console.log(`\n[graph] LLM reasoning: "${payload.reasoning}"`);
          console.log(`[graph] Matrix built for sprites: [${Object.keys(payload.matrix).join(", ")}]`);
        } else if (event === "cell") {
          process.stdout.write(`[cell] (${payload.x},${payload.y}) → ${payload.spriteId}\n`);
        } else if (event === "restart") {
          console.log(`\n[restart] Contradiction — attempt ${payload.attempt}/${payload.maxRetries}`);
        } else if (event === "done") {
          console.log("\n[done] Map generation complete.");
          resolve();
        } else if (event === "error") {
          console.error(`\n[error] ${payload.message}`);
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
