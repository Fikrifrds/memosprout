import { ApiError } from "./errors.js";
import type { ListOptions, Page } from "./types.js";

export const defaultPageSize = 20;
export const maxPageSize = 100;

/**
 * Cursor pagination used by every list endpoint. The cursor is the id of the last item on
 * the previous page. `nextCursor` is null on the final page.
 */
export function paginate<T extends { id: string }>(rows: T[], options: ListOptions = {}): Page<T> {
  const limit = options.limit ?? defaultPageSize;
  if (limit < 1 || limit > maxPageSize) {
    throw ApiError.validation("limit", `limit must be between 1 and ${maxPageSize}`);
  }

  const startIndex =
    options.cursor == null ? 0 : rows.findIndex((row) => row.id === options.cursor) + 1;
  if (options.cursor != null && startIndex === 0) {
    throw ApiError.validation("cursor", "unknown cursor");
  }

  const items = rows.slice(startIndex, startIndex + limit);
  const lastItem = items.at(-1);
  const hasMore = startIndex + limit < rows.length;
  return { items, nextCursor: hasMore && lastItem ? lastItem.id : null };
}
