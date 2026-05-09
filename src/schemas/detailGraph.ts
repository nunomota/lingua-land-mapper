import { z } from "zod";

export const detailGraphOutputSchema = z.object({
  reasoning: z
    .string()
    .describe(
      "Explanation of adjacency weight choices and which tiles each detail can appear on"
    ),
  adjacency: z.array(
    z.object({
      from: z
        .string()
        .describe("Detail ID of the source — may be __empty__"),
      to: z
        .string()
        .describe("Detail ID of the neighbour — may be __empty__"),
      weight: z
        .number()
        .int()
        .min(0)
        .max(5)
        .describe("Adjacency likelihood 0–5. 0 = never, 5 = very likely."),
    })
  ),
  overlapRules: z.array(
    z.object({
      detailId: z
        .string()
        .describe(
          "Detail ID — never __empty__ (it is always allowed on all tiles)"
        ),
      allowedTileIds: z
        .array(z.string())
        .min(1)
        .describe("Tile IDs this detail may be placed on top of"),
    })
  ),
});

export type DetailGraphOutput = z.infer<typeof detailGraphOutputSchema>;
