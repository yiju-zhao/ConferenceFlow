import { useTranslation } from "react-i18next";
import { DiffList, DiffText } from "./DiffViews";
import { stripHtml } from "../../lib/diffUtils";
import { formatDateTime } from "../../i18n/dateUtils";
import type { Report, ReportSnapshot } from "../../types";

const BLOCK_DIFF_FIELDS = ["onsiteInfoBlocks", "reflectionsBlocks", "rumorsBlocks"] as const;
type BlockDiffField = (typeof BLOCK_DIFF_FIELDS)[number];

interface SnapshotViewerProps {
  snapshot: ReportSnapshot;
  currentData: Report | null;
}

export default function SnapshotViewer({ snapshot, currentData }: SnapshotViewerProps) {
  const { t } = useTranslation();
  const { data } = snapshot;
  const ts = snapshot.createdAt?.toDate
    ? formatDateTime(snapshot.createdAt.toDate())
    : t("report.unknownTime");
  const FIELD_LABELS: Record<"onsiteInfo" | "reflections" | "rumors", string> = {
    onsiteInfo: t("report.onsiteInfo"),
    reflections: t("report.reflections"),
    rumors: t("report.rumors"),
  };
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px" }}>
      <p className="text-caption" style={{ margin: "0 0 20px", color: "var(--text-muted)" }}>
        {t("report.snapshotTime", { time: ts })}
      </p>
      {JSON.stringify(currentData?.summaryPoints || []) !==
        JSON.stringify(data?.summaryPoints || []) && (
        <section style={{ marginBottom: 24 }}>
          <h4
            className="text-body"
            style={{
              margin: "0 0 8px",
              fontWeight: 700,
              color: "var(--text-secondary)",
            }}
          >
            {t("report.corePoints")}
          </h4>
          <DiffList
            oldItems={data?.summaryPoints || []}
            newItems={currentData?.summaryPoints || []}
          />
        </section>
      )}
      {Object.keys({ ...data?.sessions, ...currentData?.sessions }).map((code) => {
        const snapshotSd = data?.sessions?.[code] || {};
        const currentSd = currentData?.sessions?.[code] || {};
        const hasTakeawaysDiff = stripHtml(snapshotSd.takeaways) !== stripHtml(currentSd.takeaways);
        const hasInsightsDiff = stripHtml(snapshotSd.insights) !== stripHtml(currentSd.insights);
        if (!hasTakeawaysDiff && !hasInsightsDiff) return null;
        return (
          <section
            key={code}
            style={{
              marginBottom: 24,
              paddingLeft: 12,
              borderLeft: "3px solid var(--border)",
            }}
          >
            <h4
              className="text-caption"
              style={{
                margin: "0 0 8px",
                fontWeight: 700,
                color: "var(--text-muted)",
                fontFamily: "monospace",
              }}
            >
              {code}
            </h4>
            {hasTakeawaysDiff && (
              <div style={{ marginBottom: 8 }}>
                <div className="text-label" style={{ color: "var(--text-dim)", marginBottom: 4 }}>
                  {t("report.keyTakeaways")}
                </div>
                <DiffText oldText={snapshotSd.takeaways} newText={currentSd.takeaways} />
              </div>
            )}
            {hasInsightsDiff && (
              <div>
                <div className="text-label" style={{ color: "var(--text-dim)", marginBottom: 4 }}>
                  {t("report.insightsLabel")}
                </div>
                <DiffText oldText={snapshotSd.insights} newText={currentSd.insights} />
              </div>
            )}
          </section>
        );
      })}
      {(["onsiteInfo", "reflections", "rumors"] as const).map((field) => {
        const snapshotVal = data?.[field];
        const currentVal = currentData?.[field];
        if (stripHtml(snapshotVal) === stripHtml(currentVal)) return null;
        return (
          <section key={field} style={{ marginBottom: 24 }}>
            <h4
              className="text-caption"
              style={{
                margin: "0 0 8px",
                fontWeight: 700,
                color: "var(--text-secondary)",
              }}
            >
              {FIELD_LABELS[field]}
            </h4>
            <DiffText oldText={snapshotVal} newText={currentVal} />
          </section>
        );
      })}

      {/* Block-based section diffs */}
      {BLOCK_DIFF_FIELDS.map((field: BlockDiffField) => {
        const label =
          field === "onsiteInfoBlocks"
            ? t("report.onsiteInfoBlocks")
            : field === "reflectionsBlocks"
              ? t("report.reflectionsBlocks")
              : t("report.rumors");
        const snapshotBlocks = data?.[field] || [];
        const currentBlocks = currentData?.[field] || [];

        // Build maps for comparison
        const snapshotMap = new Map(snapshotBlocks.map((b) => [b.id, b]));
        const currentMap = new Map(currentBlocks.map((b) => [b.id, b]));
        const allIds = [
          ...new Set([...snapshotBlocks.map((b) => b.id), ...currentBlocks.map((b) => b.id)]),
        ];

        // Check if any block actually has content differences
        const hasAnyDiff = allIds.some((id) => {
          const sB = snapshotMap.get(id);
          const cB = currentMap.get(id);
          if (!sB || !cB) return true;
          return stripHtml(sB?.content) !== stripHtml(cB?.content);
        });
        if (!hasAnyDiff) return null;

        return (
          <section key={field} style={{ marginBottom: 24 }}>
            <h4
              className="text-body"
              style={{
                margin: "0 0 12px",
                fontWeight: 700,
                color: "var(--text-secondary)",
              }}
            >
              {label}
            </h4>
            {allIds.map((id) => {
              const sB = snapshotMap.get(id);
              const cB = currentMap.get(id);
              const snapshotContent = stripHtml(sB?.content);
              const currentContent = stripHtml(cB?.content);

              if (sB && !cB) {
                // Existed in snapshot, removed in current
                return (
                  <div
                    key={id}
                    style={{
                      padding: "8px 12px",
                      marginBottom: 6,
                      background: "rgba(207,10,44,0.06)",
                      borderLeft: "3px solid #CF0A2C",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: "#CF0A2C",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {t("report.deleted")}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#888",
                        textDecoration: "line-through",
                      }}
                    >
                      {snapshotContent || t("common.empty")}
                    </div>
                  </div>
                );
              }
              if (!sB && cB) {
                // Not in snapshot, added in current
                return (
                  <div
                    key={id}
                    style={{
                      padding: "8px 12px",
                      marginBottom: 6,
                      background: "rgba(39,174,96,0.06)",
                      borderLeft: "3px solid #27AE60",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: "#27AE60",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {t("report.added")}
                    </div>
                    <div style={{ fontSize: 12, color: "#333" }}>
                      {currentContent || t("common.empty")}
                    </div>
                  </div>
                );
              }
              if (snapshotContent !== currentContent) {
                return (
                  <div
                    key={id}
                    style={{
                      padding: "8px 12px",
                      marginBottom: 6,
                      background: "rgba(41,128,185,0.06)",
                      borderLeft: "3px solid #2980B9",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: "#2980B9",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      {t("report.modified")}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#888",
                        textDecoration: "line-through",
                        marginBottom: 4,
                      }}
                    >
                      {snapshotContent || t("common.empty")}
                    </div>
                    <div style={{ fontSize: 12, color: "#333" }}>
                      {currentContent || t("common.empty")}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </section>
        );
      })}
    </div>
  );
}
