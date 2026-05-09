import { Router, Request, Response } from "express";
import { detailRequestSchema } from "../schemas/detailRequest.js";
import * as registry from "../utils/registry.js";
import { generateDetailGraph, DetailGraphGenError } from "../services/detailGraphGen.js";
import { runDetailWFC } from "../services/detailWfc.js";

const router = Router();

async function generateDetails(
  mapId: string,
  params: {
    query: string;
    availableDetails: { id: string; description: string }[];
    tileMap: string[][];
    tileSprites: { id: string; description: string }[];
    smoothing?: "low" | "high";
  }
): Promise<void> {
  const emitter = registry.get(mapId);
  if (!emitter) return;

  try {
    const { reasoning, adjacencyMatrix, overlapRules } = await generateDetailGraph(
      params.query,
      params.availableDetails,
      params.tileSprites,
      params.smoothing
    );

    const matrixRecord: Record<string, Record<string, number>> = {};
    for (const [from, neighbours] of adjacencyMatrix) {
      matrixRecord[from] = Object.fromEntries(neighbours);
    }

    const overlapRecord: Record<string, string[]> = {};
    for (const [detailId, tileIds] of overlapRules) {
      overlapRecord[detailId] = [...tileIds];
    }

    emitter.emit("detailGraph", { reasoning, adjacencyMatrix: matrixRecord, overlapRules: overlapRecord });

    await runDetailWFC({
      tileMap: params.tileMap,
      adjacencyMatrix,
      overlapRules,
      emitter,
      mapId,
    });
  } catch (err) {
    const message =
      err instanceof DetailGraphGenError
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
  const parsed = detailRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { mapId, query, availableDetails, tileMap, tileSprites, smoothing } = parsed.data;

  if (!registry.get(mapId)) {
    res.status(400).json({
      error: "No active stream for mapId. Subscribe to /details/stream first.",
    });
    return;
  }

  res.status(202).json({ mapId });

  void generateDetails(mapId, { query, availableDetails, tileMap, tileSprites, smoothing });
});

export default router;
