/**
 * 가상 사례 픽스처
 *
 * 실제 인물의 정보가 아니다. 데모와 테스트에만 쓴다.
 * 화면에서는 항상 "가상 사례 · 실제 AI 요청 없음" 으로 표시한다.
 */

import {
  addAssignment,
  addExperience,
  addMessage,
  applyExtraction,
  emptySession,
  setItemStatus,
  setMoveReason,
  setService,
  updateAssignment,
} from "./session.js";
import type { SessionState } from "./types.js";

export function buildSampleSession(): SessionState {
  let s = emptySession();
  s = { ...s, mode: "sample" };
  s = setService(s, {
    branch: "육군",
    serviceType: "장교",
    separationReason: "의무복무 만료",
    displayName: "홍길동",
  });

  /* ---------- 보직 1 ---------- */
  s = addAssignment(s, "제1사단 군사경찰대");
  const a1 = s.assignments[0]!.id;
  s = updateAssignment(s, a1, { role: "군사경찰 수사관", periodRaw: "2021.03~2023.02" });
  s = setMoveReason(s, a1, "정기인사");

  s = addMessage(
    s,
    "user",
    "근무표를 확인하고 변경 요청이 있으면 담당자와 일정을 조정했어요. 요청을 접수하고 담당자와 가능한 시간을 맞춘 뒤 변경 내용을 안내했습니다.",
    true,
  );
  const m1 = s.messages[s.messages.length - 1]!.id;

  s = addExperience(s, a1, "근무 일정 운영");
  const e1 = s.activeExperienceId!;
  s = applyExtraction(s, e1, {
    reflection: "근무표를 관리하고 변경 요청을 처리하셨군요.",
    items: [
      {
        field: "duties",
        text: "근무표를 확인하고 변경 요청을 처리하는 업무를 맡았습니다.",
        evidence: [{ messageId: m1, quote: "근무표를 확인하고 변경 요청이 있으면" }],
      },
      {
        field: "actions",
        text: "요청을 접수하고 담당자와 가능한 시간을 맞춘 뒤 변경 내용을 안내했습니다.",
        evidence: [{ messageId: m1, quote: "요청을 접수하고 담당자와 가능한 시간을 맞춘 뒤" }],
      },
      {
        field: "collaboration",
        text: "일정 조정은 담당자와 직접 협의해 진행했습니다.",
        evidence: [{ messageId: m1, quote: "담당자와 일정을 조정했어요" }],
      },
      {
        field: "outcomes",
        text: "수치로 기록해 둔 결과는 없습니다.",
        evidence: [{ messageId: m1, quote: "근무표를 확인하고" }],
      },
    ],
    interpretations: [
      { text: "일정 조율 및 관련자 커뮤니케이션", sourceQuotes: ["담당자와 일정을 조정했어요"] },
    ],
    skipped: false,
    conflicts: [],
  });

  const items1 = s.assignments[0]!.experiences[0]!.items;
  s = setItemStatus(s, items1[0]!.id, "confirmed");
  s = setItemStatus(s, items1[1]!.id, "confirmed");
  s = setItemStatus(s, items1[2]!.id, "confirmed");
  s = setItemStatus(s, items1[3]!.id, "unknown");

  /* ---------- 보직 2 ---------- */
  s = addAssignment(s, "제2군수지원사령부 인사처");
  const a2 = s.assignments[1]!.id;
  s = updateAssignment(s, a2, { role: "인사담당관", periodRaw: "2023.03~2025.02" });
  s = setMoveReason(s, a2, "전역");

  s = addMessage(s, "user", "인사명령을 확인해서 대장에 반영하고 담당 부서에 전달했어요.", true);
  const m2 = s.messages[s.messages.length - 1]!.id;

  s = addExperience(s, a2, "인사명령 처리");
  const e2 = s.activeExperienceId!;
  s = applyExtraction(s, e2, {
    reflection: "인사명령을 대장에 반영하고 전달하셨군요.",
    items: [
      {
        field: "duties",
        text: "인사명령을 확인해 대장에 반영하는 업무를 담당했습니다.",
        evidence: [{ messageId: m2, quote: "인사명령을 확인해서 대장에 반영하고" }],
      },
      {
        field: "actions",
        text: "명령을 확인하고 대장에 반영한 뒤 담당 부서에 전달했습니다.",
        evidence: [{ messageId: m2, quote: "대장에 반영하고 담당 부서에 전달했어요" }],
      },
    ],
    interpretations: [],
    skipped: false,
    conflicts: [],
  });

  const items2 = s.assignments[1]!.experiences[0]!.items;
  s = setItemStatus(s, items2[0]!.id, "confirmed");
  s = setItemStatus(s, items2[1]!.id, "confirmed");

  return s;
}
