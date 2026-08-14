import { db } from "../api/lib/firebase-admin.js";
import { INDUSTRY_CONFERENCE_DAILY_REPORT_V1 } from "../src/lib/ai-report/templates/industryConferenceDailyReport";
import { publishImmutableTemplate } from "../server/report-templates/publishImmutableTemplate";

const ref = db
  .collection("reportTemplates")
  .doc(INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateId)
  .collection("versions")
  .doc(String(INDUSTRY_CONFERENCE_DAILY_REPORT_V1.version));

const result = await publishImmutableTemplate(INDUSTRY_CONFERENCE_DAILY_REPORT_V1, {
  async read() {
    const snapshot = await ref.get();
    return snapshot.exists ? snapshot.data() : null;
  },
  async create(template) {
    await ref.create(template);
  },
});

console.info(`${INDUSTRY_CONFERENCE_DAILY_REPORT_V1.templateId}@1: ${result}`);
