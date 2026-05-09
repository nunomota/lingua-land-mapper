import { z } from "zod";

export const detailRequestSchema = z.object({
  mapId: z.string(),
  query: z.string(),
  availableDetails: z
    .array(z.object({ id: z.string(), description: z.string() }))
    .min(1),
  tileMap: z.array(z.array(z.string()).min(1)).min(1),
  tileSprites: z
    .array(z.object({ id: z.string(), description: z.string() }))
    .min(1),
  smoothing: z.enum(["low", "high"]).optional(),
});

export type DetailRequest = z.infer<typeof detailRequestSchema>;
