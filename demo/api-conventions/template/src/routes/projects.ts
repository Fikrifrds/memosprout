import { ok } from "../lib/response.js";
import type { OkResponse } from "../lib/response.js";
import { optionalPositiveInteger } from "../lib/validation.js";
import type { Page, Project, RequestContext } from "../lib/types.js";
import type { ProjectRepository } from "../repositories/project-repository.js";

/**
 * Reference route. List endpoints validate paging input, delegate to the repository, and
 * return `ok(items, { nextCursor })` — the cursor travels in `meta`, never inside `data`.
 */
export function listProjects(
  repository: ProjectRepository,
  context: RequestContext,
  query: Record<string, unknown> = {},
): OkResponse<Project[]> {
  const limit = optionalPositiveInteger(query, "limit");
  const cursor = typeof query.cursor === "string" ? query.cursor : null;
  const page: Page<Project> = repository.list(context, { limit, cursor });
  return ok(page.items, { nextCursor: page.nextCursor });
}

export function getProject(
  repository: ProjectRepository,
  context: RequestContext,
  id: string,
): OkResponse<Project> {
  return ok(repository.get(context, id));
}
