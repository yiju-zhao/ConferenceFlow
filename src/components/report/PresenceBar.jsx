import { COLORS } from "../../shared";

export default function PresenceBar({ activeUsers, memberColorMap, currentUid }) {
  if (activeUsers.length <= 1) return null;
  const others = activeUsers.filter((u) => u.uid !== currentUid);
  if (others.length === 0) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex" }}>
        {others.slice(0, 5).map((u, i) => {
          const colorIdx = memberColorMap[u.uid] ?? 0;
          const color = COLORS[colorIdx]?.hex || "#5f5e5e";
          const initial = (u.displayName || "?").charAt(0).toUpperCase();
          return (
            <div key={u.uid} title={u.displayName}
              style={{
                width: 26, height: 26, borderRadius: "50%", background: color, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, fontFamily: "'Work Sans', sans-serif",
                marginLeft: i > 0 ? -6 : 0, border: "2px solid #222",
                zIndex: 5 - i, position: "relative",
              }}>
              {initial}
            </div>
          );
        })}
      </div>
      <span style={{ fontSize: 11, color: "var(--text-muted, #999)" }}>
        {others.length} online
      </span>
    </div>
  );
}
