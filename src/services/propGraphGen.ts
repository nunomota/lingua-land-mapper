import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { ModelMessage } from "ai";
import { propGraphOutputSchema } from "../schemas/propGraph.js";
import { normaliseMatrix } from "../utils/normalise.js";

export const EMPTY = "__empty__";

const SYSTEM_PROMPT = `You are a game map detail design assistant. Given a list of detail sprites and a
description of what props/details are wanted, output two things:

1. ADJACENCY RULES (detail-to-detail): which details can appear next to which
   other details, and how likely each pairing is. Include __empty__ (which
   represents a cell with no detail placed) as a participant in adjacency rules.
   Set transitions to and from __empty__ based on how dense you expect the
   details to be — e.g. if the query asks for dense moss, set high moss→moss
   and low moss→__empty__ weights.

2. OVERLAP RULES (detail-on-tile): which underlying map tiles each real detail
   can be placed on top of. Do NOT include __empty__ in overlap rules — it is
   always allowed on every tile.

The adjacency graph is directed: A→B weight need not equal B→A weight.
Self-adjacency (a detail next to itself) is allowed and often desirable.
Only use detail IDs from the provided list (including __empty__) — never
invent new ones. Only use tile IDs from the provided tile legend in overlap
rules — never invent new ones.

Use integer weights from 0 to 5:
  0 = this transition never occurs
  1 = possible but very unlikely
  2 = uncommon
  3 = moderately likely
  4 = likely
  5 = very likely / almost always

Every detail (including __empty__) MUST appear at least once as a 'from' in
adjacency rules with at least one non-zero weight. Every real detail (not
__empty__) MUST have at least one allowed tile in its overlap rule entry.`;

type Detail = { id: string; description: string };
type TileSprite = { id: string; description: string };

function buildUserPrompt(
  query: string,
  availableDetails: Detail[],
  tileSprites: TileSprite[]
): string {
  return [
    `Detail/prop description: ${query}`,
    ``,
    `Available details (including the special __empty__ detail):`,
    ...availableDetails.map((d) => `- ${d.id}: ${d.description}`),
    ``,
    `Available tile types (from the existing map):`,
    ...tileSprites.map((s) => `- ${s.id}: ${s.description}`),
    ``,
    `Return your reasoning, a complete adjacency list between all relevant detail`,
    `pairs (including __empty__), and overlap rules for every real detail.`,
  ].join("\n");
}

function validateAdjacency(
  adjacency: { from: string; to: string; weight: number }[],
  availableDetailIds: Set<string>
): string[] {
  const errors: string[] = [];

  const invalidIds = new Set<string>();
  for (const t of adjacency) {
    if (!availableDetailIds.has(t.from)) invalidIds.add(t.from);
    if (!availableDetailIds.has(t.to)) invalidIds.add(t.to);
  }
  if (invalidIds.size > 0) {
    errors.push(
      `Invalid detail IDs in adjacency: [${[...invalidIds].join(", ")}]. Valid IDs are: [${[...availableDetailIds].join(", ")}].`
    );
  }

  const fromIds = new Set(adjacency.map((t) => t.from));
  const missingSources = [...availableDetailIds].filter(
    (id) => !fromIds.has(id)
  );
  if (missingSources.length > 0) {
    errors.push(
      `The following details have no 'from' adjacency defined: [${missingSources.join(", ")}].`
    );
  }

  const allZeroRows: string[] = [];
  for (const id of fromIds) {
    const outgoing = adjacency.filter((t) => t.from === id);
    if (outgoing.every((t) => t.weight === 0)) {
      allZeroRows.push(id);
    }
  }
  if (allZeroRows.length > 0) {
    errors.push(
      `The following details have all-zero outgoing adjacency weights (at least one must be > 0): [${allZeroRows.join(", ")}].`
    );
  }

  return errors;
}

function validateOverlapRules(
  overlapRules: { detailId: string; allowedTileIds: string[] }[],
  realDetailIds: Set<string>,
  availableTileIds: Set<string>
): string[] {
  const errors: string[] = [];

  const emptyInRules = overlapRules.filter((r) => r.detailId === EMPTY);
  if (emptyInRules.length > 0) {
    errors.push(
      `__empty__ must not appear in overlapRules — it is always allowed on all tiles.`
    );
  }

  const unknownDetails = overlapRules
    .map((r) => r.detailId)
    .filter((id) => id !== EMPTY && !realDetailIds.has(id));
  if (unknownDetails.length > 0) {
    errors.push(
      `Unknown detail IDs in overlapRules: [${unknownDetails.join(", ")}]. Valid real detail IDs are: [${[...realDetailIds].join(", ")}].`
    );
  }

  const unknownTiles: string[] = [];
  for (const rule of overlapRules) {
    for (const tileId of rule.allowedTileIds) {
      if (!availableTileIds.has(tileId)) unknownTiles.push(tileId);
    }
  }
  if (unknownTiles.length > 0) {
    errors.push(
      `Unknown tile IDs in overlapRules: [${[...new Set(unknownTiles)].join(", ")}]. Valid tile IDs are: [${[...availableTileIds].join(", ")}].`
    );
  }

  const coveredDetails = new Set(overlapRules.map((r) => r.detailId));
  const missingDetails = [...realDetailIds].filter(
    (id) => !coveredDetails.has(id)
  );
  if (missingDetails.length > 0) {
    errors.push(
      `The following real details have no overlapRules entry: [${missingDetails.join(", ")}].`
    );
  }

  return errors;
}

export class PropGraphGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PropGraphGenError";
  }
}

export type PropGraph = {
  reasoning: string;
  adjacencyMatrix: Map<string, Map<string, number>>;
  overlapRules: Map<string, Set<string>>;
};

export async function generatePropGraph(
  query: string,
  availableDetails: Detail[],
  tileSprites: TileSprite[],
  smoothing?: "low" | "high"
): Promise<PropGraph> {
  const detailsWithEmpty: Detail[] = [
    { id: EMPTY, description: "an empty cell — no detail is placed here" },
    ...availableDetails,
  ];

  const availableDetailIds = new Set(detailsWithEmpty.map((d) => d.id));
  const realDetailIds = new Set(availableDetails.map((d) => d.id));
  const availableTileIds = new Set(tileSprites.map((s) => s.id));

  const maxAttempts = 3;
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: buildUserPrompt(query, detailsWithEmpty, tileSprites),
    },
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: SYSTEM_PROMPT,
      messages,
      experimental_output: Output.object({ schema: propGraphOutputSchema }),
    }).catch((err: unknown) => {
      throw new PropGraphGenError(
        `LLM call failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    const object = result.experimental_output;

    const adjacencyErrors = validateAdjacency(object.adjacency, availableDetailIds);
    const overlapErrors = validateOverlapRules(
      object.overlapRules,
      realDetailIds,
      availableTileIds
    );
    const errors = [...adjacencyErrors, ...overlapErrors];

    if (errors.length === 0) {
      const rawMatrix = new Map<string, Map<string, number>>();
      for (const t of object.adjacency) {
        if (!rawMatrix.has(t.from)) rawMatrix.set(t.from, new Map());
        rawMatrix.get(t.from)!.set(t.to, t.weight);
      }

      if (smoothing) {
        const allWeights = object.adjacency
          .map((t) => t.weight)
          .sort((a, b) => a - b);
        const p = smoothing === "high" ? 0.5 : 0.25;
        const threshold = allWeights[Math.floor(allWeights.length * p)] ?? 0;
        for (const neighbours of rawMatrix.values()) {
          for (const [to, weight] of neighbours) {
            if (weight <= threshold) neighbours.set(to, 0);
          }
        }
      }

      const adjacencyMatrix = normaliseMatrix(rawMatrix);

      const overlapRules = new Map<string, Set<string>>();
      for (const rule of object.overlapRules) {
        overlapRules.set(rule.detailId, new Set(rule.allowedTileIds));
      }

      return { reasoning: object.reasoning, adjacencyMatrix, overlapRules };
    }

    const errorSummary = `Your response contains the following errors:\n\n${errors.map((e) => `- ${e}`).join("\n")}\n\nPlease rewrite your full response to fix all of the above.`;
    messages.push({ role: "assistant", content: result.text });
    messages.push({ role: "user", content: errorSummary });
  }

  throw new PropGraphGenError(
    `Prop graph generation failed after ${maxAttempts} attempts`
  );
}
