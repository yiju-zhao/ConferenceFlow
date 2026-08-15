import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import type { Member, ReportBlock } from "../../types";
import ReportBlockSection from "./ReportBlockSection";

const members: Member[] = [
  {
    id: "u1",
    name: "Current User",
    role: "member",
    status: "approved",
    attendanceMode: "onsite",
  },
  {
    id: "u2",
    name: "Other User",
    role: "member",
    status: "approved",
    attendanceMode: "online",
  },
];

const heading: ReportBlock = {
  id: "heading-1",
  type: "heading",
  content: "Category heading",
  ownerId: "u1",
};
const body: ReportBlock = {
  id: "body-1",
  type: "body",
  content: "<p>Body intelligence</p>",
  ownerId: "u1",
  contributorIds: ["u1"],
  sourceSessions: [{ id: null, manual: "Field notes" }],
};

function props(
  overrides: Partial<React.ComponentProps<typeof ReportBlockSection>> = {},
): React.ComponentProps<typeof ReportBlockSection> {
  return {
    sectionId: "section-onsite-info",
    title: "现场情报",
    field: "onsiteInfoBlocks",
    blocks: [heading, body],
    members,
    currentUid: "u1",
    isAdmin: false,
    readOnly: false,
    memberColorMap: { u1: 0, u2: 1 },
    conferenceSessions: [],
    openInlineMenu: null,
    onOpenInlineMenu: vi.fn(),
    onInsert: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    renderAiControls: (block, blockReadOnly) => (
      <span data-testid={`ai-${block.id}`} data-readonly={String(blockReadOnly)}>
        AI {block.id}
      </span>
    ),
    ...overrides,
  };
}

describe("ReportBlockSection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  it("renders heading and body content with their existing presentation", () => {
    render(<ReportBlockSection {...props()} />);

    expect(screen.getByRole("heading", { name: "现场情报", level: 2 })).toHaveAttribute(
      "id",
      "section-onsite-info",
    );
    expect(screen.getByText("Category heading")).toHaveClass("onsite-category-title");
    expect(document.getElementById("block-heading-1")).toHaveClass("onsite-category-header");
    expect(document.getElementById("block-heading-1")).toHaveStyle({ marginTop: "8px" });
    expect(document.querySelector(".onsite-category-remove")).toHaveClass(
      "report-editor-touch-target",
    );
    expect(screen.getByText("Body intelligence").closest(".intel-card")).toBeInTheDocument();
  });

  it("places one independently calculated AI control beside each Block", () => {
    const renderAiControls = vi.fn((block: ReportBlock, blockReadOnly: boolean) => (
      <span data-testid={`ai-${block.id}`} data-readonly={String(blockReadOnly)} />
    ));
    render(<ReportBlockSection {...props({ renderAiControls })} />);

    expect(renderAiControls).toHaveBeenCalledTimes(2);
    expect(renderAiControls).toHaveBeenNthCalledWith(1, heading, false);
    expect(renderAiControls).toHaveBeenNthCalledWith(2, body, false);
    expect(screen.getByTestId("ai-heading-1").closest(".onsite-category-header")).toBeVisible();
    expect(screen.getByTestId("ai-heading-1").parentElement).toHaveClass(
      "report-block-heading-ai--shrinkable",
    );
    expect(screen.getByTestId("ai-body-1").closest(".intel-card")).toBeVisible();
  });

  it("preserves exact start and after-Block insertion identities", async () => {
    const user = userEvent.setup();
    const onOpenInlineMenu = vi.fn();
    const onInsert = vi.fn();
    const sectionProps = props({ onOpenInlineMenu, onInsert });
    const { rerender } = render(<ReportBlockSection {...sectionProps} />);
    const insertButtons = screen.getAllByRole("button", { name: i18n.t("report.addBlock") });

    expect(document.querySelector(".inline-add-zone--section")).toBeInTheDocument();
    expect(document.querySelectorAll(".inline-add-zone--insertion").length).toBeGreaterThan(0);

    await user.click(insertButtons[0]);
    expect(onOpenInlineMenu).toHaveBeenCalledWith("onsiteInfoBlocks::null");
    rerender(<ReportBlockSection {...sectionProps} openInlineMenu="onsiteInfoBlocks::null" />);
    await user.click(screen.getByRole("button", { name: "小标题" }));
    expect(onInsert).toHaveBeenCalledWith("onsiteInfoBlocks", "heading", null);

    await user.click(screen.getAllByRole("button", { name: i18n.t("report.addBlock") })[1]);
    rerender(<ReportBlockSection {...sectionProps} openInlineMenu="onsiteInfoBlocks::heading-1" />);
    await user.click(screen.getByRole("button", { name: "正文" }));
    expect(onInsert).toHaveBeenCalledWith("onsiteInfoBlocks", "body", "heading-1");
  });

  it("keeps the section heading action available when the section has no Blocks", async () => {
    const user = userEvent.setup();
    const onOpenInlineMenu = vi.fn();
    render(
      <ReportBlockSection
        {...props({
          blocks: [],
          onOpenInlineMenu,
        })}
      />,
    );

    const heading = screen.getByRole("heading", { name: "现场情报", level: 2 });
    const addButton = screen.getByRole("button", { name: i18n.t("report.addBlock") });
    expect(heading.closest(".report-section-heading-row")).toContainElement(addButton);
    await user.click(addButton);
    expect(onOpenInlineMenu).toHaveBeenCalledWith("onsiteInfoBlocks::null");
  });

  it("routes heading and body edits and removals to the exact field and Block", () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(<ReportBlockSection {...props({ onUpdate, onRemove })} />);
    const headingRow = document.getElementById("block-heading-1")!;
    const headingTitle = within(headingRow).getByText("Category heading");
    headingTitle.textContent = "  Updated heading  ";
    fireEvent.blur(headingTitle);
    expect(onUpdate).toHaveBeenCalledWith("onsiteInfoBlocks", "heading-1", {
      content: "Updated heading",
    });
    fireEvent.click(headingRow.querySelector(".onsite-category-remove")!);
    expect(onRemove).toHaveBeenCalledWith("onsiteInfoBlocks", "heading-1");

    const card = screen.getByText("Body intelligence").closest(".intel-card")!;
    const editor = card.querySelector<HTMLElement>(".report-editable")!;
    editor.innerHTML = "<p>Updated body</p>";
    fireEvent.input(editor);
    expect(onUpdate).toHaveBeenCalledWith("onsiteInfoBlocks", "body-1", {
      content: "<p>Updated body</p>",
    });
    fireEvent.click(card.querySelector(".onsite-block-body-remove")!);
    expect(onRemove).toHaveBeenCalledWith("onsiteInfoBlocks", "body-1");
  });

  it("normalizes heading paste to plain text", () => {
    const execCommand = vi.fn();
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    render(<ReportBlockSection {...props({ blocks: [heading] })} />);
    const title = screen.getByText("Category heading");

    fireEvent.paste(title, {
      clipboardData: { getData: (kind: string) => (kind === "text/plain" ? "Plain paste" : "") },
    });

    expect(execCommand).toHaveBeenCalledWith("insertText", false, "Plain paste");
  });

  it.each([
    ["ownerless", undefined],
    ["current user", "u1"],
  ])("keeps %s Blocks editable", (_label, ownerId) => {
    const blocks = [
      { ...heading, ownerId },
      { ...body, ownerId, contributorIds: [], sourceSessions: [] },
    ];
    render(<ReportBlockSection {...props({ blocks })} />);

    expect(screen.getByText("Category heading")).toHaveAttribute("contenteditable", "true");
    expect(screen.getByText("Body intelligence").closest(".report-editable")).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });

  it("prevents a normal member from editing or deleting another user's Blocks", () => {
    const renderAiControls = vi.fn(() => <span data-testid="private-ai" />);
    const onUpdate = vi.fn();
    render(
      <ReportBlockSection
        {...props({
          blocks: [
            { ...heading, ownerId: "u2" },
            { ...body, ownerId: "u2", contributorIds: [], sourceSessions: [] },
          ],
          renderAiControls,
          onUpdate,
        })}
      />,
    );

    expect(screen.getByText("Category heading")).not.toHaveAttribute("contenteditable");
    expect(screen.getByText("Body intelligence").closest(".report-editable")).not.toHaveAttribute(
      "contenteditable",
    );
    expect(screen.queryByRole("button", { name: "×" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("private-ai")).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(renderAiControls).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "heading-1" }),
      true,
    );
    expect(renderAiControls).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "body-1" }),
      true,
    );
  });

  it("renders another user's body metadata statically without metadata or AI controls", () => {
    const renderAiControls = vi.fn(() => <span data-testid="private-ai" />);
    render(
      <ReportBlockSection
        {...props({
          blocks: [
            {
              ...body,
              ownerId: "u2",
              contributorIds: ["u2"],
              sourceSessions: [{ id: null, manual: "Private field notes" }],
            },
          ],
          renderAiControls,
        })}
      />,
    );
    const card = screen.getByText("Body intelligence").closest(".intel-card") as HTMLElement;

    expect(within(card).getByText("Private field notes")).toBeVisible();
    expect(within(card).getAllByText("Other User")).toHaveLength(1);
    expect(within(card).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(card).queryByRole("combobox")).not.toBeInTheDocument();
    expect(card.querySelector(".intel-card-add-source")).not.toBeInTheDocument();
    expect(card.querySelector(".intel-card-source-remove")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(within(card).queryByTestId("private-ai")).not.toBeInTheDocument();
    expect(renderAiControls).toHaveBeenCalledTimes(1);
    expect(renderAiControls).toHaveBeenCalledWith(expect.objectContaining({ id: "body-1" }), true);
  });

  it("renders body metadata statically without mutation or AI controls in view mode", () => {
    const renderAiControls = vi.fn(() => <span data-testid="view-ai" />);
    render(
      <ReportBlockSection
        {...props({
          blocks: [body],
          readOnly: true,
          renderAiControls,
        })}
      />,
    );
    const card = screen.getByText("Body intelligence").closest(".intel-card") as HTMLElement;

    expect(within(card).getByText("Field notes")).toBeVisible();
    expect(within(card).getAllByText("Current User")).toHaveLength(1);
    expect(within(card).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(card).queryByRole("combobox")).not.toBeInTheDocument();
    expect(card.querySelector(".intel-card-add-source")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    expect(within(card).queryByTestId("view-ai")).not.toBeInTheDocument();
    expect(renderAiControls).toHaveBeenCalledTimes(1);
    expect(renderAiControls).toHaveBeenCalledWith(body, true);
  });

  it("preserves last-editor metadata for a read-only body without contributors", () => {
    const now = Date.now();
    render(
      <ReportBlockSection
        {...props({
          blocks: [
            {
              ...body,
              ownerId: "u2",
              contributorIds: [],
              sourceSessions: [],
              lastEditedBy: "u1",
              lastEditedAt: now,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Current User · 0m ago")).toBeVisible();
  });

  it.each([
    ["current owner", false],
    ["admin", true],
  ])("keeps source and contributor controls for the %s", (_label, isAdmin) => {
    render(
      <ReportBlockSection
        {...props({
          blocks: [{ ...body, ...(isAdmin ? { ownerId: "u2" } : {}) }],
          isAdmin,
        })}
      />,
    );
    const card = screen.getByText("Body intelligence").closest(".intel-card") as HTMLElement;

    expect(within(card).getByRole("textbox")).toBeInTheDocument();
    expect(within(card).getByRole("combobox")).toBeInTheDocument();
    expect(card.querySelector(".intel-card-add-source")).toBeInTheDocument();
    expect(within(card).getByTestId("ai-body-1")).toBeInTheDocument();
  });

  it("lets an admin edit and delete another user's Blocks", () => {
    render(
      <ReportBlockSection
        {...props({
          blocks: [
            { ...heading, ownerId: "u2" },
            { ...body, ownerId: "u2", contributorIds: [], sourceSessions: [] },
          ],
          isAdmin: true,
        })}
      />,
    );

    expect(screen.getByText("Category heading")).toHaveAttribute("contenteditable", "true");
    expect(screen.getByText("Body intelligence").closest(".report-editable")).toHaveAttribute(
      "contenteditable",
      "true",
    );
    expect(screen.getAllByRole("button", { name: "×" })).toHaveLength(2);
  });

  it("preserves content but hides editing, insertion, deletion, and AI in view mode", () => {
    const renderAiControls = vi.fn(() => <span data-testid="view-ai" />);
    render(
      <ReportBlockSection
        {...props({
          blocks: [heading, { ...body, contributorIds: [], sourceSessions: [] }],
          readOnly: true,
          renderAiControls,
        })}
      />,
    );

    const sectionHeading = screen.getByRole("heading", { name: "现场情报", level: 2 });
    expect(sectionHeading).toBeVisible();
    expect(sectionHeading.closest(".report-section-heading-row")).toBeNull();
    expect(screen.getByText("Category heading")).toBeVisible();
    expect(screen.getByText("Body intelligence")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: i18n.t("report.addBlock") }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "×" })).not.toBeInTheDocument();
    expect(screen.getByText("Category heading")).not.toHaveAttribute("contenteditable");
    expect(screen.queryByTestId("view-ai")).not.toBeInTheDocument();
    expect(renderAiControls).toHaveBeenCalledTimes(2);
    expect(renderAiControls).toHaveBeenCalledWith(expect.any(Object), true);
  });

  it("renders the IntelCard AI slot once without changing source or contributor metadata", () => {
    render(<ReportBlockSection {...props({ blocks: [body] })} />);
    const card = screen.getByText("Body intelligence").closest(".intel-card")!;

    expect(within(card as HTMLElement).getByTestId("ai-body-1")).toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByTestId("ai-body-1")).toHaveLength(1);
    expect(within(card as HTMLElement).getByPlaceholderText("Field notes")).toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByText("Current User").length).toBeGreaterThan(0);
  });
});

describe("DailyReport Block integration", () => {
  const source = readFileSync("src/components/report/DailyReport.tsx", "utf8");

  it("wires exactly one shared renderer to every canonical Block field", () => {
    expect(source.match(/<ReportBlockSection/g)).toHaveLength(4);
    for (const field of ["onsiteInfoBlocks", "reflectionsBlocks", "rumorsBlocks", "trendBlocks"]) {
      expect(source.match(new RegExp(`field="${field}"`, "g"))).toHaveLength(1);
      expect(source).toContain(`targetFieldId="${field}"`);
    }
  });

  it("removes daily rumors editing while retaining legacy report storage", () => {
    expect(source).not.toContain("const rumorsField =");
    expect(source).not.toContain('saveAiDailyField("rumors"');
    expect(source).not.toContain('saveField("rumors"');
    expect(source).toContain('rumors: ""');
    expect(source).toContain("rumors: rd.rumors ||");
  });

  it("coordinates AI using each loop Block, member focus, and latest exact identity", () => {
    expect(source.match(/block=\{block\}/g)).toHaveLength(4);
    expect(
      (source.match(/focus=\{membership\?\.aiFocus \?\? ""\}/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);
    for (const field of ["onsiteInfoBlocks", "reflectionsBlocks", "rumorsBlocks", "trendBlocks"]) {
      expect(source).toContain(`reportDataRef.current?.${field}?.find(`);
      expect(source).toContain(`persistBlockPatch("${field}", block.id, {`);
    }
  });

  it("builds the one-Block write from a transaction-fresh sibling array", () => {
    expect(source).toContain("const snapshot = await transaction.get(reportRef)");
    expect(source).toContain("const blocks = Array.isArray(latest[field]) ? latest[field] : []");
    expect(source).toContain("const next = mutate(blocks)");
    expect(source).toContain("replaceReportBlock(blocks, blockId, patch, expectedContent)");
    expect(source).toContain("transaction.set(reportRef, { [field]: next }, { merge: true })");
    expect(source).not.toContain("replaceReportBlock(reportDataRef");
  });

  it("routes every manual Block mutation through the transaction-fresh mutation callback", () => {
    expect(source).toContain("const persistBlockMutation = useCallback(");
    expect(source).toContain("const next = mutate(blocks)");
    expect(source).toContain("insertReportBlock(blocks, newBlock, afterId)");
    expect(source).toContain("removeReportBlock(blocks, id)");
    expect(source).not.toMatch(/saveField\(\s*field,\s*\(reportDataRef\.current\?\.\[field\]/);
    expect(source).not.toContain("const blocks = reportDataRef.current?.[field]");
  });

  it("debounces exact Block patches with stable property-specific keys", () => {
    expect(source).toContain('Object.keys(fields).sort().join(",")');
    expect(source).toContain("`block.${field}.${id}.${patchKey}`");
    expect(source).toContain("persistBlockPatch(field, id, {");
    expect(source).not.toContain("saveField(\n        field,");
  });

  it("flushes candidate saves before a content-preconditioned transaction", () => {
    expect(source.match(/onSaveContent=\{async \(content\) => \{/g)).toHaveLength(4);
    expect(source.match(/await flushPending\(\);/g)).toHaveLength(8);
    expect(source.match(/block\.content,\s*\);/g)).toHaveLength(4);
    expect(source.match(/transcriptRef: next/g)).toHaveLength(4);
  });

  it("flushes transcript edits and limits candidate adoption to content metadata", () => {
    expect((source.match(/await flushPending\(\);/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(source.match(/transcriptRef: next/g)).toHaveLength(4);
    expect((source.match(/lastEditedBy: user\.uid/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((source.match(/lastEditedAt: Date\.now\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
