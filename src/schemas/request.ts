import { z } from "zod";

export const mapRequestSchema = z.object({
  mapId: z.string(),
  query: z.string(),
  availableSprites: z
    .array(z.object({ id: z.string(), description: z.string() }))
    .min(1),
  dimensions: z
    .object({ width: z.number(), height: z.number() })
    .optional(),
});

export type MapRequest = z.infer<typeof mapRequestSchema>;
