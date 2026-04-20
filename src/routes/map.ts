import { Router, Request, Response } from "express";
import { mapRequestSchema } from "../schemas/request.js";
import * as registry from "../utils/registry.js";
import { generateGraph, GraphGenError } from "../services/graphGen.js";
import { runWFC } from "../services/wfc.js";

const router = Router();

async function generateMap(
  mapId: string,
  params: {
    query: string;
    availableSprites: { id: string; description: string }[];
    dimensions: { width: number; height: number };
    smoothing?: "low" | "high";
  }
): Promise<void> {
  const emitter = registry.get(mapId);
  if (!emitter) return;

  try {
    const { matrix, reasoning } = await generateGraph(
      params.query,
      params.availableSprites,
      params.smoothing
    );

    const matrixRecord: Record<string, Record<string, number>> = {};
    for (const [from, neighbours] of matrix) {
      matrixRecord[from] = Object.fromEntries(neighbours);
    }

    emitter.emit("graph", { reasoning, matrix: matrixRecord });

    await runWFC({
      matrix,
      dimensions: params.dimensions,
      emitter,
      mapId,
    });
  } catch (err) {
    const message =
      err instanceof GraphGenError
        ? err.message
        : `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
    const em = registry.get(mapId);
    if (em) {
      em.emit("error", { message });
      registry.remove(mapId);
    }
  }
}

router.post("/", (req: Request, res: Response) => {
  const parsed = mapRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { mapId, query, availableSprites, dimensions, smoothing } = parsed.data;

  if (!registry.get(mapId)) {
    res.status(400).json({
      error: "No active stream for mapId. Subscribe to /map/stream first.",
    });
    return;
  }

  res.status(202).json({ mapId });

  void generateMap(mapId, {
    query,
    availableSprites,
    dimensions: {
      width: dimensions?.width ?? 15,
      height: dimensions?.height ?? 15,
    },
    smoothing,
  });
});

export default router;
