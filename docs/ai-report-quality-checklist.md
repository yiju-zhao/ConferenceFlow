# AI report quality and privacy release checklist

Use this checklist only after the opted-in live fixture run has completed with a
deliberately configured `DEEPSEEK_API_KEY`. The fixture test makes real model
calls only when `RUN_LIVE_AI_EVAL=1`; it never reads Firebase and only uses the
committed inputs below.

| Fixture                | Focus                                           | Candidate factual statements | Supported statements | Valid Evidence refs | Exact displayed quotes | Unsupported text | Reviewer | Date |
| ---------------------- | ----------------------------------------------- | ---------------------------- | -------------------- | ------------------- | ---------------------- | ---------------- | -------- | ---- |
| `short.txt`            | Basic supported cost and accuracy facts         |                              |                      |                     |                        |                  |          |      |
| `long.md`              | Costs, performance, ecosystem, and limitations  |                              |                      |                     |                        |                  |          |      |
| `timestamps.srt`       | Timestamped cost, accuracy, and caveat facts    |                              |                      |                     |                        |                  |          |      |
| `timestamps.vtt`       | Timestamped deployment and performance facts    |                              |                      |                     |                        |                  |          |      |
| `mixed-language.txt`   | Preserve measurable limits in Chinese output    |                              |                      |                     |                        |                  |          |      |
| `names-numbers.txt`    | Names, dates, and numerical claims              |                              |                      |                     |                        |                  |          |      |
| `contradictory.txt`    | Conflicting preliminary versus confirmed claims |                              |                      |                     |                        |                  |          |      |
| `insufficient.txt`     | Withhold unsupported fields                     |                              |                      |                     |                        |                  |          |      |
| `prompt-injection.txt` | Ignore untrusted prompt-injection text          |                              |                      |                     |                        |                  |          |      |
| `focus-relevant.md`    | Cost, performance, and ecosystem relevance      |                              |                      |                     |                        |                  |          |      |

## Required release calculations

- Evidence-reference rate = factual statements with at least one valid Evidence ID / all factual statements. Required: **100%**.
- Quote-validity rate = displayed quotes found in their exact referenced source / all displayed quotes. Required: **100%**.
- Schema-conformance rate = accepted model fields conforming to the bound template / accepted fields. Required: **100%**.
- Human factual-support rate = reviewer-supported factual statements / all factual statements. Required: **at least 95%**.

Any source leak, invented fact used to fill a field, or pre-adoption report
mutation is a release blocker regardless of the aggregate rate.

## Automated release evidence

Run the deterministic gates on every implementation:

```bash
npm run test:run
npm run typecheck
npm run build
npm run format:check
```

The quality fixture test is intentionally skipped unless a reviewer explicitly
approves live model usage and supplies a deliberate server-side key:

```bash
RUN_LIVE_AI_EVAL=1 npm run test:run -- api/lib/ai-report/quality.live.test.ts
```

The live test checks that every returned candidate has Evidence IDs that resolve
to returned Evidence. It does not replace the per-fixture human review above.

Automated unit and static checks cover the parser, grounded candidate pipeline,
candidate-before-adoption boundary, request sanitization, transcript Storage
rules, snapshot omission of `transcriptRef`, and the metadata-only AI route log.
They cannot prove a deployed public/exported artifact or authenticated runtime
logs contain no private data.

## Manual non-production release checks

Use an authenticated non-production Firebase project, a Vercel API deployment,
and two distinct approved member accounts. Do not use production transcripts or
focus text.

Before enabling the transcript UI, run the Firebase Storage Emulator against
`conference-transcripts/{confId}/{reportId}/{sessionId}/{fileName}`. Verify both
authorized cases independently: a token with `globalRole: "super_admin"` and no
conference membership can read/write, and an approved conference member without
the global claim can read/write. Also verify pending membership, membership in a
different conference, and unauthenticated access are denied; no root catch-all
rule may grant transcript access.

1. As user A, set a focus, add one of My Sessions, upload VTT, generate, expand
   timestamps, adopt, refresh, and confirm only adopted fields remain.
2. As user A, search the full calendar, add an unassigned Session, paste TXT,
   and generate.
3. Confirm an existing manual Session draft appears as labeled Draft Evidence
   when permitted.
4. Confirm append adds only new bullets or paragraphs and retains existing
   content.
5. Confirm daily Core Points uses current report fields and causes no transcript
   Storage read.
6. Confirm cancel, provider failure, invalid JSON, insufficient source, and a
   stale candidate never mutate the report.
7. Replace a transcript and, with user B, edit a target field; user A's adoption
   must be blocked in both cases and require regeneration.

Publish and export a test report, then search the generated HTML, Markdown,
email HTML, snapshot viewer, browser console, and server logs for
`conference-transcripts/`, the original transcript file name, a unique
transcript-only sentence, the member's focus text, Evidence IDs, and quotes.
None may appear in public/exported output or logs. Adopted prose may appear, but
private source metadata may not. Finally, confirm an unauthenticated request can
read the published report and cannot read the transcript object.

Record the live fixture outputs and every manual result in the release record;
do not mark the release approved when a required authenticated, two-browser, or
export/privacy check has not run.
