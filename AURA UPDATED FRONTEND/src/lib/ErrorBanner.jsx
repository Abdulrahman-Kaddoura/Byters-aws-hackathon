import { AlertTriangle, X } from "lucide-react";

export default function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message || "Something went wrong.";
  const details = error && error.status === 409 && error.details
    ? ` (from "${error.details.from}" to "${error.details.to}")`
    : "";
  return (
    <div className="error-banner">
      <AlertTriangle size={16} />
      <span>{message}{details}</span>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss"><X size={14} /></button>
      )}
    </div>
  );
}
