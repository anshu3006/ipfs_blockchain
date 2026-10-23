// Notice component: inline success / error / info message
export default function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`notice notice-${notice.type || "info"}`} role={notice.type === "error" ? "alert" : "status"}>
      <span>{notice.text}</span>
      {onClose && (
        <button className="notice-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
