import { useTranslation } from "react-i18next";
import { diffArrays, getTextLines } from "../../lib/diffUtils";

export function DiffList({ oldItems, newItems }) {
  const { t } = useTranslation();
  const diff = diffArrays(
    (oldItems || []).map(String),
    (newItems || []).map(String),
  );
  if (diff.length === 0)
    return (
      <p className="text-body" style={{ color: "var(--text-muted)" }}>
        {t("report.noContent")}
      </p>
    );
  return (
    <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
      {diff.map((item, i) => (
        <li
          key={i}
          style={{
            fontSize: "var(--report-fs-caption)",
            padding: "2px 6px",
            borderRadius: 3,
            marginBottom: 3,
            background:
              item.type === "insert"
                ? "rgba(39,174,96,0.1)"
                : item.type === "delete"
                  ? "rgba(207,10,44,0.1)"
                  : "transparent",
            textDecoration: item.type === "delete" ? "line-through" : "none",
            color:
              item.type === "insert"
                ? "var(--success)"
                : item.type === "delete"
                  ? "var(--brand)"
                  : "inherit",
          }}
        >
          {item.type === "insert" ? "+ " : item.type === "delete" ? "− " : ""}
          {item.text}
        </li>
      ))}
    </ul>
  );
}

export function DiffText({ oldText, newText }) {
  const { t } = useTranslation();
  const diff = diffArrays(getTextLines(oldText), getTextLines(newText));
  if (diff.length === 0)
    return (
      <p className="text-body" style={{ color: "var(--text-muted)" }}>
        {t("report.noContent")}
      </p>
    );
  return (
    <div className="text-caption" style={{ lineHeight: 1.6 }}>
      {diff.map((item, i) => (
        <div
          key={i}
          style={{
            padding: "2px 8px",
            marginBottom: 2,
            borderRadius: 3,
            background:
              item.type === "insert"
                ? "rgba(39,174,96,0.1)"
                : item.type === "delete"
                  ? "rgba(207,10,44,0.1)"
                  : "transparent",
            textDecoration: item.type === "delete" ? "line-through" : "none",
            color:
              item.type === "insert"
                ? "var(--success)"
                : item.type === "delete"
                  ? "var(--brand)"
                  : "inherit",
          }}
        >
          {item.type !== "equal" && (item.type === "insert" ? "+ " : "− ")}
          {item.text}
        </div>
      ))}
    </div>
  );
}
