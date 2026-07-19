import { z } from "zod";

export const validatedSproutSchema = z
  .object({
    sproutId: z.string().regex(/^sprout_[a-f0-9]{16}$/),
    scenario: z.string().min(1),
    guidance: z.string().min(1),
    scopePaths: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type ValidatedSprout = z.infer<typeof validatedSproutSchema>;

export class SproutRegistry {
  private readonly sprouts = new Map<string, ValidatedSprout>();

  add(sprout: ValidatedSprout): void {
    this.sprouts.set(sprout.sproutId, validatedSproutSchema.parse(sprout));
  }

  get(sproutId: string): ValidatedSprout | undefined {
    return this.sprouts.get(sproutId);
  }

  list(): ValidatedSprout[] {
    return [...this.sprouts.values()];
  }

  get size(): number {
    return this.sprouts.size;
  }
}
