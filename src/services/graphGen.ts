import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { ModelMessage } from "ai";
import { graphOutputSchema } from "../schemas/graph.js";
import { normaliseMatrix } from "../utils/normalise.js";

const SYSTEM_PROMPT = `You are a game map design assistant. Given a list of tile sprites and a map
description, output a list of transition rules defining which tiles can appear
adjacent to which other tiles, and how likely each transition is.

The graph is directed: the weight of A→B does not need to equal B→A.
Self-transitions (a tile adjacent to itself) are allowed and often desirable.
Only use sprite IDs from the provided list — never invent new ones.

Use integer weights from 0 to 5:
  0 = this transition never occurs
  1 = possible but very unlikely
  2 = uncommon
  3 = moderately likely
  4 = likely
  5 = very likely / almost always`;

type Sprite = { id: string; description: string };

function buildUserPrompt(query: string, availableSprites: Sprite[]): string {
  return `Map description: ${query}\n\nAvailable sprites:\n${availableSprites
    .map((s) => `- ${s.id}: ${s.description}`)
    .join("\n")}\n\nReturn your reasoning and a complete list of transitions between all relevant sprite pairs.`;
}

function validateGraph(
  output: { reasoning: string; transitions: { from: string; to: string; weight: number }[] },
  availableSprites: Sprite[]
): string[] {
  const validIds = new Set(availableSprites.map((s) => s.id));
  const errors: string[] = [];

  const invalidIds = new Set<string>();
  for (const t of output.transitions) {
    if (!validIds.has(t.from)) invalidIds.add(t.from);
    if (!validIds.has(t.to)) invalidIds.add(t.to);
  }
  if (invalidIds.size > 0) {
    errors.push(
      `Invalid sprite IDs in transitions: [${[...invalidIds].join(", ")}]. Valid IDs are: [${[...validIds].join(", ")}].`
    );
  }

  const fromIds = new Set(output.transitions.map((t) => t.from));
  const missingSources = availableSprites
    .map((s) => s.id)
    .filter((id) => !fromIds.has(id));
  if (missingSources.length > 0) {
    errors.push(
      `The following sprites have no 'from' transitions defined: [${missingSources.join(", ")}].`
    );
  }

  const allZeroRows: string[] = [];
  for (const spriteId of fromIds) {
    const outgoing = output.transitions.filter((t) => t.from === spriteId);
    if (outgoing.every((t) => t.weight === 0)) {
      allZeroRows.push(spriteId);
    }
  }
  if (allZeroRows.length > 0) {
    errors.push(
      `The following sprites have all-zero outgoing weights (at least one weight must be > 0): [${allZeroRows.join(", ")}].`
    );
  }

  return errors;
}

export class GraphGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphGenError";
  }
}

export async function generateGraph(
  query: string,
  availableSprites: Sprite[]
): Promise<{ matrix: Map<string, Map<string, number>>; reasoning: string }> {
  const maxAttempts = 3;
  const messages: ModelMessage[] = [
    { role: "user", content: buildUserPrompt(query, availableSprites) },
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await generateText({
      model: openai("gpt-5.4-nano"),
      system: SYSTEM_PROMPT,
      messages,
      experimental_output: Output.object({ schema: graphOutputSchema }),
    }).catch((err: unknown) => {
      throw new GraphGenError(
        `LLM call failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    const object = result.experimental_output;
    const errors = validateGraph(object, availableSprites);

    if (errors.length === 0) {
      const rawMatrix = new Map<string, Map<string, number>>();
      for (const t of object.transitions) {
        if (!rawMatrix.has(t.from)) rawMatrix.set(t.from, new Map());
        rawMatrix.get(t.from)!.set(t.to, t.weight);
      }
      const matrix = normaliseMatrix(rawMatrix);
      return { matrix, reasoning: object.reasoning };
    }

    const errorSummary = `Your response contains the following errors:\n\n${errors.map((e) => `- ${e}`).join("\n")}\n\nPlease rewrite your full transitions list to fix all of the above.`;
    messages.push({ role: "assistant", content: result.text });
    messages.push({ role: "user", content: errorSummary });
  }

  throw new GraphGenError(
    `Graph generation failed after ${maxAttempts} attempts`
  );
}
