import { Router, Request, Response } from "express";
import * as registry from "../utils/registry.js";

const router = Router();

const SSE_EVENTS = ["propGraph", "propCell", "restart", "done", "error"] as const;

router.get("/stream", (req: Request, res: Response) => {
  const { mapId } = req.query;

  if (!mapId || typeof mapId !== "string") {
    res.status(400).json({ error: "mapId query parameter is required." });
    return;
  }

  const emitter = registry.register(mapId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  for (const event of SSE_EVENTS) {
    emitter.on(event, (payload: unknown) => {
      send(event, payload);
      if (event === "done" || event === "error") {
        res.end();
      }
    });
  }

  req.on("close", () => {
    registry.remove(mapId);
  });
});

export default router;
