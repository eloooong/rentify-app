import { Fragment } from "react";
import type { Block } from "../_content/types";

const TOKEN = /(\*\*[^*]+\*\*|\[\[TBD(?::[^\]]*)?\]\])/g;

/** A visible marker for a policy that the team has not decided yet. */
function Tbd({ detail }: { detail?: string }) {
  return (
    <span className="rounded bg-surface-tint px-1 text-brand-strong">
      <span className="font-semibold">To be decided</span>
      {detail ? `: ${detail}` : null}
    </span>
  );
}

/** Renders **bold** and [[TBD]] / [[TBD: detail]] inside a line of text. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return (
            <strong key={index} className="font-semibold text-fg">
              {part.slice(2, -2)}
            </strong>
          );
        const tbd = part.match(/^\[\[TBD(?::\s*([^\]]*))?\]\]$/);
        if (tbd)
          return <Tbd key={index} detail={tbd[1]?.trim() || undefined} />;
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => {
        if (block.type === "p")
          return (
            <p key={index}>
              <RichText text={block.text} />
            </p>
          );
        if (block.type === "note")
          return (
            <p
              key={index}
              className="rounded-md border-l-4 border-brand bg-surface-muted p-3 text-sm"
            >
              <RichText text={block.text} />
            </p>
          );
        const List = block.type === "ol" ? "ol" : "ul";
        return (
          <List
            key={index}
            className={`flex flex-col gap-1.5 pl-5 ${
              block.type === "ol" ? "list-decimal" : "list-disc"
            }`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <RichText text={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
