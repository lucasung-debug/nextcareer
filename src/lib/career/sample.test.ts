import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { buildSampleSession, SAMPLE_TURNS } from "./sample.js";
import { buildCareerDocument, renderPreview } from "./careerDocument.js";
import { buildDocxBuffer, docxFileName } from "./docxBuilder.js";
import { validateEvidence } from "./grounding.js";
import { canExport } from "./session.js";
import { ALL_FIELDS, type FieldKey, type SessionState } from "./types.js";

const OUT = process.env["OUT_DOCX"];

function allItems(state: SessionState) {
  return state.assignments.flatMap((a) => a.experiences.flatMap((e) => e.items));
}

describe("가상 사례", () => {
  it("모든 근거가 실제 대화에 글자 그대로 존재한다", async () => {
    const state = await buildSampleSession();
    const items = allItems(state);
    expect(items.length).toBeGreaterThan(15);

    for (const item of items) {
      const kept = validateEvidence(item.evidence, state.messages);
      // 하나라도 걸러지면 예시가 지어낸 인용을 쓰고 있다는 뜻이다.
      expect(
        kept.length,
        `근거가 대화에 없음: [${item.field}] ${item.text}`,
      ).toBe(item.evidence.length);
    }
  });

  it("보직 2개, 업무 3개를 담는다", async () => {
    const state = await buildSampleSession();
    expect(state.assignments).toHaveLength(2);

    const roles = state.assignments.map((a) => a.role);
    expect(roles).toEqual(["보급관", "인사담당관"]);

    const experiences = state.assignments.flatMap((a) => a.experiences);
    expect(experiences).toHaveLength(3);
    expect(experiences.map((e) => e.title)).toEqual([
      "보급품 수불 관리",
      "신병 개인 물품 불출",
      "인사명령 처리",
    ]);
  });

  it("부대명 일반화가 실제로 달라 보이도록 되어 있다", async () => {
    const state = await buildSampleSession();
    for (const a of state.assignments) {
      // 기본값은 일반 표기고, 실명과 달라야 선택 기능이 보인다
      expect(a.unitDisplay).toBe("generalized");
      expect(a.unitGeneralized).not.toBe(a.unitLabel);
      expect(a.unitGeneralized).toContain("○○");
    }
    expect(buildCareerDocument(state).history[0]?.unit).toBe("○○군수대대");
  });

  it("8개 항목 유형을 모두 보여준다", async () => {
    const state = await buildSampleSession();
    const used = new Set<FieldKey>(allItems(state).map((i) => i.field));
    for (const f of ALL_FIELDS) {
      expect(used.has(f), `예시에 빠진 항목 유형: ${f}`).toBe(true);
    }
  });

  it("확인 / 미확인 / 초안 상태를 모두 보여준다", async () => {
    const state = await buildSampleSession();
    const statuses = new Set(allItems(state).map((i) => i.status));
    expect(statuses.has("confirmed")).toBe(true);
    expect(statuses.has("unknown")).toBe(true);
    expect(statuses.has("draft")).toBe(true);
  });

  it("건너뛴 항목은 사실로 저장되지 않는다", async () => {
    const state = await buildSampleSession();
    const skipped = state.assignments.flatMap((a) => a.experiences.flatMap((e) => e.skipped));
    expect(skipped.length).toBeGreaterThan(0);

    // 건너뛴 슬롯에는 항목이 없어야 한다
    for (const a of state.assignments) {
      for (const e of a.experiences) {
        for (const s of e.skipped) {
          expect(e.items.some((i) => i.field === s.field)).toBe(false);
        }
      }
    }
  });

  it("경력기술서가 완성되어 바로 내려받을 수 있다", async () => {
    const state = await buildSampleSession();
    const doc = buildCareerDocument(state);

    expect(doc.name).toBe("홍길동");
    expect(doc.summary.totalPeriod).toContain("2019.03 ~ 2024.02");
    expect(doc.summary.totalPeriod).toContain("5년");
    expect(doc.history).toHaveLength(2);
    expect(doc.history[0]?.moveReason).toBe("정기인사");
    expect(doc.history[1]?.moveReason).toBe("전역");
    expect(doc.sections.length).toBeGreaterThanOrEqual(3);

    // 미확인 항목은 본문이 아니라 미확인 블록에 들어간다
    const unconfirmed = doc.sections.flatMap((s) => s.unconfirmed).join(" ");
    expect(unconfirmed).toContain("수치로 기록해 둔 결과는 없습니다");
    const facts = doc.sections.flatMap((s) => [...s.duties, ...s.work, ...s.results]).join(" ");
    expect(facts).not.toContain("수치로 기록해 둔 결과는 없습니다");

    // 초안 상태 문장도 본문에 들어가지 않는다
    expect(facts).not.toContain("중대별로 나눠 불출했습니다");

    // 미리보기가 만들어져 있고, 확인만 누르면 내려받을 수 있는 상태
    expect(state.doc.preview.length).toBeGreaterThan(300);
    expect(canExport({ ...state, doc: { ...state.doc, confirmed: true } })).toBe(true);
  });

  it("한 단계씩 진행할 수 있다", async () => {
    const first = await buildSampleSession(1);
    expect(first.service.branch).toBe("육군");
    expect(first.assignments).toHaveLength(0);

    const mid = await buildSampleSession(8);
    expect(mid.assignments).toHaveLength(1);
    expect(mid.assignments[0]?.experiences).toHaveLength(1);
    expect(allItems(mid)).toHaveLength(0);

    expect(SAMPLE_TURNS).toBeGreaterThan(30);
  });

  it("Word 파일로 출력된다", async () => {
    const state = await buildSampleSession();
    const doc = buildCareerDocument(state);
    const buffer = await buildDocxBuffer(doc);

    expect(buffer.length).toBeGreaterThan(4000);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);

    if (OUT) {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, buffer);
      // eslint-disable-next-line no-console
      console.log(`\n[파일] ${OUT} (${buffer.length} bytes) / ${docxFileName(doc.name)}\n`);
      // eslint-disable-next-line no-console
      console.log(renderPreview(doc));
    }
  });
});
