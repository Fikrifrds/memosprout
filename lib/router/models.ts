import { z } from "zod";

export const modelTierSchema = z
  .object({
    id: z.string().min(1),
    tier: z.enum(["cheap", "frontier"]),
    relativeCost: z.number().positive(),
  })
  .strict();

export type ModelTier = z.infer<typeof modelTierSchema>;

export const modelCatalog: ModelTier[] = [
  { id: "gpt-5.4-mini", tier: "cheap", relativeCost: 1 },
  { id: "gpt-5.6-sol", tier: "frontier", relativeCost: 10 },
];

export function cheapestModel(catalog: ModelTier[] = modelCatalog): ModelTier {
  return catalog.reduce((cheapest, model) =>
    model.relativeCost <= cheapest.relativeCost ? model : cheapest,
  );
}

export function mostCapableModel(catalog: ModelTier[] = modelCatalog): ModelTier {
  return catalog.reduce((capable, model) =>
    model.relativeCost >= capable.relativeCost ? model : capable,
  );
}

export function findModel(
  id: string,
  catalog: ModelTier[] = modelCatalog,
): ModelTier | undefined {
  return catalog.find((model) => model.id === id);
}
