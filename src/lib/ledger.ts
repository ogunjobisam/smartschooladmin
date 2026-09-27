/**
 * The wash a ledger row wears for its status.
 *
 * The reference design tints the whole row rather than only the figure, which
 * is what lets someone scan a page of invoices and see where the money is
 * without reading a single number. Only the two states worth spotting from
 * across the room get one — tinting every row would tint none of them.
 *
 * Never the only channel: the row still carries its status badge, so the tint
 * is a second way to read what is already written there.
 *
 * Lives here rather than beside `StatusBadge` so that file exports only its
 * component, which is what keeps fast refresh working.
 */
export function rowTint(status: string | null | undefined): string {
  if (status === "paid") return "row-paid";
  if (status === "overdue") return "row-owing";
  return "";
}
