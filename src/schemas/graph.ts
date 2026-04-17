import { z } from "zod";

export const graphOutputSchema = z.object({
  reasoning: z
    .string()
    .describe(
      "High-level explanation of weight choices and why certain transitions are likely or impossible"
    ),
  transitions: z.array(
    z.object({
      from: z.string().describe("Sprite ID of the source tile"),
      to: z.string().describe("Sprite ID of the neighbour tile"),
      weight: z
        .number()
        .int()
        .min(0)
        .max(5)
        .describe(
          "Transition likelihood from 'from' to 'to'. 0 = never, 5 = very likely."
        ),
    })
  ),
});

export type GraphOutput = z.infer<typeof graphOutputSchema>;
