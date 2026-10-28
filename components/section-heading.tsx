import type { ReactNode } from "react";

export function SectionHeading({ number, label, title, children, id }: { number: string; label: string; title: string; children?: ReactNode; id?: string }) {
  return <div className="section-heading"><div><p className="eyebrow"><span>{number}</span> / {label}</p><h2 id={id}>{title}</h2></div>{children ? <div className="section-heading-note">{children}</div> : null}</div>;
}
