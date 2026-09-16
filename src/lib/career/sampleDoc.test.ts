import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { buildSampleSession } from "./sample.js";
import { buildCareerDocument, renderPreview } from "./careerDocument.js";
import { buildDocxBuffer, docxFileName } from "./docxBuilder.js";

/** 파일로 뽑아 보고 싶을 때 OUT_DOCX 를 지정한다. */
const OUT = process.env["OUT_DOCX"];

describe("가상 사례 경력기술서", () => {
  it("보직 2개가 모두 문서에 들어간다", async () => {
    const state = buildSampleSession();
    const doc = buildCareerDocument(state);

    expect(doc.history).toHaveLength(2);
    expect(doc.history[0]?.unit).toBe("○○사단 군사경찰대");
    expect(doc.history[1]?.role).toBe("인사담당관");
    expect(doc.summary.totalPeriod).toContain("2021.03 ~ 2025.02");
    expect(doc.summary.totalPeriod).toContain("4년");

    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0]?.duties.length).toBeGreaterThan(0);
    expect(doc.sections[0]?.unconfirmed[0]).toContain("수치로 기록해 둔 결과는 없습니다");
    expect(doc.sections[1]?.work.length).toBeGreaterThan(0);

    const preview = renderPreview(doc);
    expect(preview).toContain("보직 이력");
    expect(preview).toContain("인사담당관");
    expect(preview).toContain("경력 인증 문서가 아닙니다");

    const buffer = await buildDocxBuffer(doc);
    expect(buffer.length).toBeGreaterThan(3000);

    if (OUT) {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, buffer);
      // eslint-disable-next-line no-console
      console.log(`\n[파일] ${OUT} (${buffer.length} bytes)\n[파일명 예시] ${docxFileName(doc.name)}\n`);
      // eslint-disable-next-line no-console
      console.log(preview);
    }
  });
});
