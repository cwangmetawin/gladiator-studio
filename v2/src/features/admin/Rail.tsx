import type { ReactNode } from 'react';

/** A card in the right-hand admin rail (title + body/actions). */
export function RailCard({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="card rail-card">
      <div className="rail-card__title">{title}</div>
      {children}
    </div>
  );
}
