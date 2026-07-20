import { Database, requireFound, withAudit } from "../lib/db.js";
import type { ListOptions, Page, Project, RequestContext } from "../lib/types.js";
import { paginate } from "../lib/pagination.js";

/**
 * Reference repository. New repositories follow this shape: read through `scopedSelect`,
 * sort newest-first, paginate with `paginate`, and wrap every mutation in `withAudit`.
 */
export class ProjectRepository {
  constructor(private readonly db: Database) {}

  list(context: RequestContext, options: ListOptions = {}): Page<Project> {
    const rows = this.db
      .scopedSelect<Project>("projects", context)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return paginate(rows, options);
  }

  get(context: RequestContext, id: string): Project {
    const row = this.db
      .scopedSelect<Project>("projects", context)
      .find((project) => project.id === id);
    return requireFound(row, "project");
  }

  archive(context: RequestContext, id: string): Project {
    const project = this.get(context, id);
    return withAudit(
      this.db,
      context,
      { action: "archive", resource: "project", resourceId: id },
      () => {
        project.archivedAt = new Date().toISOString();
        return project;
      },
    );
  }
}
