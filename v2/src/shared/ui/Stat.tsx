interface StatProps {
  readonly value: string;
  readonly label: string;
  readonly accent?: boolean;
}

/** A single telemetry figure — display-font value over a mono label. */
export function Stat({ value, label, accent = false }: StatProps) {
  return (
    <div className="stat">
      <span className={accent ? 'stat__value stat__value--accent' : 'stat__value'}>{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}
