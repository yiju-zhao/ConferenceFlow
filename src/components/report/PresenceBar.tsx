import { useTranslation } from "react-i18next";
import { COLORS } from "../../constants";
import type { ActiveUser } from "../../types";

interface PresenceBarProps {
  activeUsers: ActiveUser[];
  memberColorMap: Record<string, number>;
  currentUid?: string;
}

export default function PresenceBar({ activeUsers, memberColorMap, currentUid }: PresenceBarProps) {
  const { t } = useTranslation();
  if (activeUsers.length <= 1) return null;
  const others = activeUsers.filter((u) => u.uid !== currentUid);
  if (others.length === 0) return null;

  return (
    <div className="presence-bar">
      <div className="presence-avatars">
        {others.slice(0, 5).map((u, i) => {
          const colorIdx = memberColorMap[u.uid] ?? 0;
          const color = COLORS[colorIdx]?.hex || "#5f5e5e";
          const initial = (u.displayName || "?").charAt(0).toUpperCase();
          return (
            <div
              key={u.uid}
              className="presence-avatar"
              title={u.displayName}
              style={{
                background: color,
                marginLeft: i > 0 ? -6 : 0,
                zIndex: 5 - i,
              }}
            >
              {initial}
            </div>
          );
        })}
      </div>
      <span className="presence-count">
        {others.length} {t("report.onlineCount")}
      </span>
    </div>
  );
}
