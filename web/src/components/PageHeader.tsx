import type { ReactNode } from "react";

export function PageHeader({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-[1.75rem]">{title}</h1>
      {lead && <p className="mt-2 max-w-[38ch] text-muted-foreground">{lead}</p>}
    </header>
  );
}
