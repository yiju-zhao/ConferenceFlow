import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { assertTemplateVersion } from "../lib/ai-report/templateContract";
import type { Report, ReportTemplateVersion } from "../types";

type BoundTemplateState = {
  template: ReportTemplateVersion | null;
  loading: boolean;
  error: string | null;
};

export function useBoundReportTemplate(report: Report | null): BoundTemplateState {
  const [state, setState] = useState<BoundTemplateState>({
    template: null,
    loading: false,
    error: null,
  });

  const templateId = report?.templateId;
  const templateVersion = report?.templateVersion;
  const templateHash = report?.templateHash;

  useEffect(() => {
    let cancelled = false;

    if (
      report === null ||
      templateId === undefined ||
      templateVersion === undefined ||
      templateHash === undefined
    ) {
      setState({ template: null, loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    setState({ template: null, loading: true, error: null });

    const templateRef = doc(db, "reportTemplates", templateId, "versions", String(templateVersion));

    void getDoc(templateRef)
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot.exists()) {
          setState({ template: null, loading: false, error: "template not found" });
          return;
        }

        let template: ReportTemplateVersion;
        try {
          template = assertTemplateVersion(snapshot.data());
        } catch {
          setState({ template: null, loading: false, error: "invalid template version" });
          return;
        }

        if (template.templateId !== templateId || template.version !== templateVersion) {
          setState({ template: null, loading: false, error: "template identity mismatch" });
          return;
        }
        if (template.templateHash !== templateHash) {
          setState({ template: null, loading: false, error: "template hash mismatch" });
          return;
        }

        setState({ template, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ template: null, loading: false, error: "template load failed" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [report?.id, templateHash, templateId, templateVersion]);

  return state;
}
