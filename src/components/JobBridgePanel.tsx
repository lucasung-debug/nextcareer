import { useMemo, useState } from "react";

import { buildJobBridge, jobBridgeAvailable, wantedSearchUrl, type JobFamilyId } from "../lib/career/jobBridge.js";
import { FIELD_LABELS, type SessionState } from "../lib/career/types.js";
import { EvidenceChip, Notice } from "./bits.js";

export function JobBridgePanel({ state, onReview }: { state: SessionState; onReview: () => void }) {
  const bridge = useMemo(() => buildJobBridge(state), [state]);
  const [selectedId, setSelectedId] = useState<JobFamilyId | null>(null);
  const selected = bridge.families.find((family) => family.id === selectedId) ?? bridge.families[0];
  const items = new Map(state.assignments.flatMap((a) => a.experiences.flatMap((e) => e.items)).map((i) => [i.id, i]));

  if (!jobBridgeAvailable(state)) {
    return (
      <div className="space-y-4">
        <h3 className="text-[20px] font-semibold tracking-tight">확인한 경험부터 시작합니다</h3>
        <p className="chat-text text-[#626d7c]">직군을 먼저 정하지 않습니다. 실제로 하신 업무를 확인하면, 겹치는 일을 하는 직군과 탐색 이유를 보여드립니다.</p>
        <button className="btn-quiet tap" type="button" onClick={onReview}>근거 확인하러 가기</button>
      </div>
    );
  }

  const uniqueReasons = selected?.reasons.filter((reason, index, reasons) => reasons.findIndex((r) => r.itemId === reason.itemId) === index) ?? [];

  return (
    <div className="job-bridge space-y-5">
      <div>
        <h3 className="text-[20px] font-semibold leading-snug tracking-tight">확인한 경험에서,<br />다음 일을 찾아봅니다.</h3>
        <p className="meta-text mt-2">직군 제안은 탐색의 출발점입니다. 적합도·직급·자격을 판단하거나 합격을 보장하지 않습니다.</p>
      </div>

      {!selected ? (
        <div className="space-y-3">
          <Notice text="지금 확인한 문장에서는 연결할 직군을 찾지 못했습니다. 없는 역량을 붙이지 않고, 직접 살펴볼 수 있는 채용 목록을 열어드립니다." />
          <a href={bridge.catalogUrl} target="_blank" rel="noopener noreferrer" className="btn-quiet tap inline-flex items-center">원티드 채용 전체 보기 <span aria-hidden="true" className="ml-2">↗</span><span className="sr-only"> (새 창)</span></a>
        </div>
      ) : (
        <>
          <div>
            <p className="mb-2 text-[12px] font-semibold text-[#626d7c]">살펴볼 직군 {bridge.families.length}개</p>
            <div className="flex flex-wrap gap-2" aria-label="살펴볼 직군 선택">
              {bridge.families.map((family) => (
                <button key={family.id} type="button" onClick={() => setSelectedId(family.id)} aria-pressed={selected.id === family.id}
                  className={`tap rounded-[8px] border px-3.5 py-2 text-[13px] font-medium ${selected.id === family.id ? "border-[#1c1d1f] bg-[#1c1d1f] text-white" : "border-[#d3d8df] bg-white text-[#242424]"}`}>
                  {family.label}
                </button>
              ))}
            </div>
          </div>

          <section aria-label={`${selected.label} 탐색 이유`} className="rounded-[8px] border border-[#e5e7eb] bg-[#fafafa] p-4">
            <p className="text-[11px] font-semibold tracking-wide text-[#626d7c]">왜 이 직군인가요?</p>
            <h4 className="mt-1 text-[18px] font-semibold">{selected.label}</h4>
            <p className="mt-2 text-[14px] leading-relaxed text-[#505967]">{selected.description}</p>
            <ul className="mt-4 space-y-3">
              {uniqueReasons.map((reason, index) => {
                const item = items.get(reason.itemId);
                return (
                  <li key={reason.itemId} className="border-l-2 border-[var(--color-evidence)] pl-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[11px] font-medium text-[#626d7c]">본인 확인 · {FIELD_LABELS[reason.field]}</span>
                      {item && <EvidenceChip item={item} index={index + 1} />}
                    </div>
                    <blockquote className="text-[14px] leading-relaxed text-[#242424]">“{reason.quote}”</blockquote>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="원티드 공고 검색">
            <h4 className="text-[14px] font-semibold">이 업무를 하는 공고 찾아보기</h4>
            <p className="meta-text mt-1">아래는 공고가 아니라 검색 링크입니다. 원티드에서 실제 채용 중인 공고와 조건을 확인해 주세요.</p>
            <div className="mt-3 flex flex-col gap-2">
              {selected.keywords.map((keyword, index) => (
                <a key={keyword} href={wantedSearchUrl(keyword)} target="_blank" rel="noopener noreferrer"
                  className={`${index === 0 ? "btn-primary" : "btn-quiet"} tap flex items-center justify-between gap-2`}>
                  <span>원티드에서 ‘{keyword}’ 검색</span><span aria-hidden="true">↗</span><span className="sr-only"> (새 창)</span>
                </a>
              ))}
            </div>
            {selected.listUrl !== selected.searchUrl && (
              <a href={selected.listUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block py-2 text-[13px] text-[#505967] underline">
                {selected.label} 직군 전체 보기<span className="sr-only"> (새 창)</span>
              </a>
            )}
          </section>

          <section className="border-t border-[#e5e7eb] pt-4" aria-label="공고 확인 안내">
            <h4 className="text-[13px] font-semibold">공고를 열면, 세 가지만 비교해 보세요</h4>
            <ol className="mt-2 list-inside list-decimal space-y-1.5 text-[13px] leading-relaxed text-[#626d7c]">
              <li>담당 업무가 내가 실제로 한 일과 겹치는지</li>
              <li>필수 자격·경력 연차를 충족하는지</li>
              <li>근무 지역·고용 형태·조건이 맞는지</li>
            </ol>
          </section>
        </>
      )}
      <p className="meta-text border-t border-[#e5e7eb] pt-3">검색에는 정해진 일반 업무 키워드만 사용합니다. 이름·부대명·대화 원문은 검색 링크에 넣지 않습니다. 공고를 수집하거나 저장하지 않습니다.</p>
    </div>
  );
}
