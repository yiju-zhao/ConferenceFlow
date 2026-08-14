import { useEffect } from "react";
import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "../firebase";
import {
  defaultTemplateBindingPatch,
  reportTemplateBindingState,
} from "../lib/ai-report/defaultTemplateBinding";
import { assertTemplateVersion } from "../lib/ai-report/templateContract";
import { INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING } from "../lib/ai-report/templates/industryConferenceDailyReport";
import type { Report } from "../types";

type UseDefaultReportTemplateBindingOptions = {
  confId: string;
  reportId: string;
  report: Report | null;
  enabled: boolean;
};

function isCanonicalV1(template: {
  templateId: string;
  version: number;
  templateHash: string;
}): boolean {
  return (
    template.templateId === INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING.templateId &&
    template.version === INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING.templateVersion &&
    template.templateHash === INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING.templateHash
  );
}

export function useDefaultReportTemplateBinding({
  confId,
  reportId,
  report,
  enabled,
}: UseDefaultReportTemplateBindingOptions): void {
  const templateId = report?.templateId;
  const templateVersion = report?.templateVersion;
  const templateHash = report?.templateHash;

  useEffect(() => {
    let cancelled = false;

    if (!enabled || report === null || reportTemplateBindingState(report) !== "unbound") {
      return () => {
        cancelled = true;
      };
    }

    const templateRef = doc(
      db,
      "reportTemplates",
      INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING.templateId,
      "versions",
      String(INDUSTRY_CONFERENCE_DAILY_REPORT_V1_BINDING.templateVersion),
    );
    const reportRef = doc(db, "conferences", confId, "dailyReports", reportId);

    void getDoc(templateRef)
      .then(async (templateSnapshot) => {
        if (cancelled || !templateSnapshot.exists()) return;

        let template;
        try {
          template = assertTemplateVersion(templateSnapshot.data());
        } catch {
          return;
        }
        if (!isCanonicalV1(template) || cancelled) return;

        await runTransaction(db, async (transaction) => {
          if (cancelled) return;

          const latestReportSnapshot = await transaction.get(reportRef);
          if (cancelled || !latestReportSnapshot.exists()) return;

          const patch = defaultTemplateBindingPatch(
            latestReportSnapshot.data() as Partial<Report>,
            template,
          );
          if (patch) transaction.set(reportRef, patch, { merge: true });
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [confId, enabled, report?.id, reportId, templateHash, templateId, templateVersion]);
}
