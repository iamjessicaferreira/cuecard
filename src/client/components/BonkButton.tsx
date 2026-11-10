import { BONK_LABEL } from "@shared/config";

export function BonkButton({ disabled, onClick, label }: { disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className="bonk-button" disabled={disabled} onClick={onClick}>
      {label ?? BONK_LABEL}
    </button>
  );
}
