import { type IconShape, riskLightIcon, type Risk, type Status, STATUS_ICONS } from "@semaforo/shared";

interface IconProps {
  shape: IconShape;
  size?: number;
  className?: string;
  /** Senza etichetta l'icona è decorativa (il testo accanto porta il significato). */
  label?: string;
}

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export function Icon({ shape, size = 20, className, label }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true, focusable: false })}
    >
      {shape.parts.map(([tag, attrs], i) => {
        const props = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [camel(k), v]));
        const Tag = tag as "path" | "circle" | "rect";
        return <Tag key={i} {...props} />;
      })}
    </svg>
  );
}

export const StatusIcon = ({ status, size, className }: { status: Status; size?: number; className?: string }) => (
  <Icon shape={STATUS_ICONS[status]} {...(size ? { size } : {})} {...(className ? { className } : {})} />
);

export const RiskLight = ({ risk, size, className }: { risk: Risk; size?: number; className?: string }) => (
  <Icon shape={riskLightIcon(risk)} {...(size ? { size } : {})} {...(className ? { className } : {})} />
);

/** Logo: semaforo stilizzato a tratto con le tre luci. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="7" y="2" width="10" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="6.5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="17.5" r="2.4" fill="currentColor" />
    </svg>
  );
}
