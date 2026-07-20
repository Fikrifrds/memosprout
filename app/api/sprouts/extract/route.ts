import { NextResponse } from "next/server";

import { compileSproutGuidance } from "@/lib/compiler/compile-guidance";
import {
  ExperienceCompilationError,
  compileExperience,
  experienceEvidenceSchema,
} from "@/lib/compiler/experience-compiler";
import { createDeterministicId } from "@/lib/domain/ids";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: {
          code: "missing_credentials",
          message: "Live extraction requires an OPENAI_API_KEY environment variable.",
        },
      },
      { status: 500 },
    );
  }

  const parsedBody = experienceEvidenceSchema.safeParse(await request.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: parsedBody.error.message } },
      { status: 400 },
    );
  }
  const evidence = parsedBody.data;

  try {
    const { content, provenance } = await compileExperience({ evidence, apiKey });
    const sproutId = createDeterministicId(
      "sprout",
      `${evidence.scenario}:${evidence.humanCorrection}`,
    );
    const guidance = compileSproutGuidance(content, { sproutId });
    return NextResponse.json({ source: "live", sproutId, content, guidance, provenance });
  } catch (error) {
    if (error instanceof ExperienceCompilationError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 502 },
      );
    }
    throw error;
  }
}
