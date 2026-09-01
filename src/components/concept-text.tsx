import type { ReactNode } from "react";

// Renders the Creative agent's concept.
//
// The model is asked for a fixed set of headings (**The idea**, **Headline**,
// and so on), which arrive as markdown. Rendering that as plain text leaks the
// asterisks onto the page. This is not a general markdown renderer and should
// not become one — it handles the small, known shape of a concept: heading
// lines, paragraphs, and bold runs inside them.

const HEADING_LINE = /^\s*\*\*(.+?)\*\*\s*:?\s*$/;
const BOLD_RUN = /\*\*(.+?)\*\*/g;

/** Renders `**bold**` runs inside a line of body text. */
function withBold(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  BOLD_RUN.lastIndex = 0;
  while ((match = BOLD_RUN.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <strong key={`${keyPrefix}-b${match.index}`} className="font-medium text-white">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function ConceptText({ text }: { text: string }) {
  // Blank lines separate blocks; a heading is its own block even without one.
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: { heading?: string; body: string[] }[] = [];

  for (const line of lines) {
    const heading = HEADING_LINE.exec(line);
    if (heading) {
      blocks.push({ heading: heading[1].trim(), body: [] });
      continue;
    }
    if (!line.trim()) {
      // Preserve the paragraph break inside a block rather than gluing
      // sentences together.
      if (blocks.length && blocks[blocks.length - 1].body.length) {
        blocks[blocks.length - 1].body.push("");
      }
      continue;
    }
    if (!blocks.length) blocks.push({ body: [] });
    blocks[blocks.length - 1].body.push(line.trim());
  }

  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        // Re-join wrapped lines into paragraphs, splitting on the blank lines.
        const paragraphs = block.body
          .join("\n")
          .split(/\n\s*\n/)
          .map((p) => p.replace(/\n/g, " ").trim())
          .filter(Boolean);

        return (
          <div key={i}>
            {block.heading && (
              <h4 className="mb-1.5 text-xs uppercase tracking-[0.14em] text-neutral-500">
                {block.heading}
              </h4>
            )}
            {paragraphs.map((p, j) => (
              <p key={j} className="mb-2 text-sm leading-relaxed text-neutral-300 last:mb-0">
                {withBold(p, `${i}-${j}`)}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
