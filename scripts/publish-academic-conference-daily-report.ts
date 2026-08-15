import { db } from "../api/lib/firebase-admin.js";
import { ACADEMIC_CONFERENCE_DAILY_REPORT_V1 } from "../src/lib/ai-report/templates/academicConferenceDailyReport";
import { publishImmutableTemplate } from "../server/report-templates/publishImmutableTemplate";

const ref = db
  .collection("reportTemplates")
  .doc(ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateId)
  .collection("versions")
  .doc(String(ACADEMIC_CONFERENCE_DAILY_REPORT_V1.version));

const result = await publishImmutableTemplate(ACADEMIC_CONFERENCE_DAILY_REPORT_V1, {
  async read() {
    const snapshot = await ref.get();
    return snapshot.exists ? snapshot.data() : null;
  },
  async create(template) {
    await ref.create(template);
  },
});

console.info(`${ACADEMIC_CONFERENCE_DAILY_REPORT_V1.templateId}@1: ${result}`);
