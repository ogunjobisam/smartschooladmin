/**
 * Insist that a write actually changed something.
 *
 * A write that row-level security filters out is not an error to PostgREST. It
 * is an UPDATE that matched no rows, and it comes back as
 * `{ data: [], error: null }` — indistinguishable, to code that only checks
 * `error`, from a write that succeeded.
 *
 * That is how a school could be renamed on screen, show a green "School
 * profile updated" toast, and change nothing in the database. Every save in
 * settings had the same shape, so every one of them could lie.
 *
 * The query must carry `.select()` so the changed rows come back to be
 * counted; without it PostgREST returns no rows on success either, and this
 * would reject writes that worked.
 */

export interface WriteOutcome<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

/** Thrown when the database accepted the request but changed no rows. */
export class WriteBlockedError extends Error {
  constructor(action: string) {
    super(
      `Could not ${action}. Your role may not have permission to change it, ` +
      `or it may no longer exist.`
    );
    this.name = "WriteBlockedError";
  }
}

/**
 * @param action  what the user was trying to do, as a verb phrase that reads
 *                after "Could not …" — e.g. "save the school profile".
 */
export async function assertWrote<T>(
  query: PromiseLike<WriteOutcome<T>>,
  action: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) throw new WriteBlockedError(action);
  return data;
}
