/**
 * 경력기술서 문서 모델
 *
 * 규칙
 *  - "확인"으로 표시한 항목만 사실로 싣는다.
 *  - "미확인" 항목은 지우지 않고, 미확인이라고 밝혀서 따로 싣는다.
 *  - AI 해석은 사실과 분리된 블록에만 싣고, 근거가 확인된 경우에만 넣는다.
 *  - 문장은 다시 쓰지 않는다. 사용자가 확인한 문장 그대로 옮긴다.
 */

import { formatPeriod, parsePeriod, totalServicePeriod } from "./period.js";
import { confirmedItems, unknownItems } from "./session.js";
import {
  FIELD_BLOCK,
  FIELD_LABELS,
  type CardItem,
  type SessionState,
} from "./types.js";

export type DocumentSection = {
  /** "1. 군사경찰 수사관" */
  index: number;
  role: string;
  unit: string;
  period: string;
  duties: string[];
  work: string[];
  results: string[];
  unconfirmed: string[];
  interpretations: string[];
};

export type HistoryRow = {
  period: string;
  unit: string;
  role: string;
  moveReason: string;
};

export type CareerDocument = {
  title: string;
  name: string;
  summary: {
    branch: string;
    serviceType: string;
    totalPeriod: string;
    separationReason: string;
  };
  history: HistoryRow[];
  sections: DocumentSection[];
  notices: string[];
};

export const DOC_NOTICES = [
  "본 문서는 본인이 직접 확인한 진술을 정리한 것이며, 경력 인증 문서가 아닙니다.",
  "확인되지 않은 내용은 '미확인'으로 표기했으며, 추정해 채우지 않았습니다.",
  "'참고 해석'은 AI가 정리한 해석이며 검증된 사실이 아닙니다.",
];

function displayUnit(unitLabel: string, unitGeneralized: string, asGiven: boolean): string {
  const value = asGiven ? unitLabel : unitGeneralized;
  return value.trim() || "미기재";
}

function itemTexts(items: CardItem[], block: "담당업무" | "수행내용" | "결과"): string[] {
  return items.filter((i) => FIELD_BLOCK[i.field] === block).map((i) => i.text.trim());
}

export function buildCareerDocument(state: SessionState): CareerDocument {
  const periods = state.assignments.map((a) => a.period ?? parsePeriod(a.periodRaw));

  const history: HistoryRow[] = state.assignments.map((a, idx) => ({
    period: formatPeriod(periods[idx] ?? null, a.periodRaw) || "미기재",
    unit: displayUnit(a.unitLabel, a.unitGeneralized, a.unitDisplay === "as-given"),
    role: a.role.trim() || "미기재",
    moveReason: a.moveReasonRaw.trim() || "미확인",
  }));

  const sections: DocumentSection[] = [];
  let index = 0;

  for (const [ai, a] of state.assignments.entries()) {
    for (const exp of a.experiences) {
      const confirmed = confirmedItems(exp);
      const unknown = unknownItems(exp);
      if (confirmed.length === 0 && unknown.length === 0) continue;

      index += 1;
      const confirmedIds = new Set(confirmed.map((i) => i.id));

      sections.push({
        index,
        role: exp.title.trim() || a.role.trim() || "미기재",
        unit: displayUnit(a.unitLabel, a.unitGeneralized, a.unitDisplay === "as-given"),
        period: formatPeriod(periods[ai] ?? null, a.periodRaw) || "미기재",
        duties: itemTexts(confirmed, "담당업무"),
        work: itemTexts(confirmed, "수행내용"),
        results: itemTexts(confirmed, "결과"),
        unconfirmed: unknown.map((i) => `${FIELD_LABELS[i.field]}: ${i.text.trim()}`),
        interpretations: exp.interpretations
          .filter((p) => p.sourceItemIds.length > 0 && p.sourceItemIds.every((id) => confirmedIds.has(id)))
          .map((p) => p.text.trim()),
      });
    }
  }

  return {
    title: "경력기술서",
    name: state.service.displayName.trim(),
    summary: {
      branch: state.service.branch === "미입력" ? "미기재" : state.service.branch,
      serviceType: state.service.serviceType === "미입력" ? "미기재" : state.service.serviceType,
      totalPeriod: totalServicePeriod(periods),
      separationReason: state.service.separationReason.trim() || "미기재",
    },
    history,
    sections,
    notices: DOC_NOTICES,
  };
}

/** 화면 미리보기용 텍스트 */
export function renderPreview(doc: CareerDocument): string {
  const lines: string[] = [];
  lines.push(doc.title);
  lines.push(`성명: ${doc.name || "___________"}`);
  lines.push("");
  lines.push("[복무 요약]");
  lines.push(`군별/신분: ${doc.summary.branch} / ${doc.summary.serviceType}`);
  lines.push(`복무기간: ${doc.summary.totalPeriod}`);
  lines.push(`전역(예정) 사유: ${doc.summary.separationReason}`);
  lines.push("");

  if (doc.history.length > 0) {
    lines.push("[보직 이력]");
    for (const row of doc.history) {
      lines.push(`- ${row.period} | ${row.unit} | ${row.role} | 이동 사유: ${row.moveReason}`);
    }
    lines.push("");
  }

  if (doc.sections.length === 0) {
    lines.push("[수행 업무]");
    lines.push("확인된 항목이 아직 없습니다. 경험 카드에서 '확인'을 표시하면 여기에 실립니다.");
    lines.push("");
  }

  for (const s of doc.sections) {
    lines.push(`${s.index}. ${s.role} (${s.unit}, ${s.period})`);
    if (s.duties.length > 0) {
      lines.push("  담당업무");
      s.duties.forEach((t) => lines.push(`   - ${t}`));
    }
    if (s.work.length > 0) {
      lines.push("  수행내용");
      s.work.forEach((t) => lines.push(`   - ${t}`));
    }
    if (s.results.length > 0) {
      lines.push("  결과");
      s.results.forEach((t) => lines.push(`   - ${t}`));
    }
    if (s.unconfirmed.length > 0) {
      lines.push("  미확인 (사실로 확인되지 않음)");
      s.unconfirmed.forEach((t) => lines.push(`   - ${t}`));
    }
    if (s.interpretations.length > 0) {
      lines.push("  참고 해석 (AI 해석 · 검증된 사실 아님)");
      s.interpretations.forEach((t) => lines.push(`   - ${t}`));
    }
    lines.push("");
  }

  lines.push("[확인 안내]");
  doc.notices.forEach((n) => lines.push(`- ${n}`));
  return lines.join("\n");
}
