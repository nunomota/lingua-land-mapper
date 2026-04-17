export function normaliseMatrix(
  matrix: Map<string, Map<string, number>>
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  for (const [from, neighbours] of matrix) {
    const total = Array.from(neighbours.values()).reduce((a, b) => a + b, 0);
    const normalised = new Map<string, number>();
    for (const [to, weight] of neighbours) {
      normalised.set(to, total > 0 ? weight / total : 0);
    }
    result.set(from, normalised);
  }

  return result;
}
