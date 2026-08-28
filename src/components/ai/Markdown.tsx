import { Fragment } from "react";

/**
 * Minimal markdown renderer for AI output.
 *
 * Deliberately not a markdown library and deliberately not `dangerouslySetInnerHTML`:
 * model output is rendered as React text nodes, so nothing in it can become
 * markup. It covers only what the prompts ask for — headings, bullets,
 * paragraphs and bold.
 */
export function Markdown({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.length === 0) return null;

        const heading = lines[0].match(/^(#{1,6})\s+(.*)$/);
        if (heading && lines.length === 1) {
          return (
            <h4 key={blockIndex} className="pt-1 text-sm font-semibold text-foreground">
              {inline(heading[2])}
            </h4>
          );
        }

        const isList = lines.every((l) => /^\s*([-*+]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={blockIndex} className="ml-1 space-y-1.5">
              {lines.map((line, i) => (
                <li key={i} className="flex gap-2 text-muted-foreground">
                  <span aria-hidden className="mt-[0.35rem] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>{inline(line.replace(/^\s*([-*+]|\d+\.)\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex} className="text-muted-foreground">
            {lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && " "}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Renders **bold** spans; everything else stays literal text. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-medium text-foreground">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}
