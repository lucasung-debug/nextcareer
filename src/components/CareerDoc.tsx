import { useMemo, useState } from "react";

import { buildCareerDocument, renderPreview } from "../lib/career/careerDocument.js";
import { formatPeriod } from "../lib/career/period.js";
import { canExport, isDocStale } from "../lib/career/session.js";
import {
  FIELD_LABELS,
  type CardItem,
  type Experience,
  type ItemStatus,
  type SessionState,
} from "../lib/career/types.js";
import { EvidenceChip, Notice, StatusBadge } from "./bits.js";

type Actions = {
  setItemStatus: (id: string, status: ItemStatus) => void;
  editItem: (id: string, text: string) => void;
  removeItem: (id: string) => void;
  setUnitDisplay: (assignmentId: string, asGiven: boolean) => void;
  setName: (name: string) => void;
  generate: () => void;
  confirmDoc: (v: boolean) => void;
};

export function CareerDoc({ state, actions }: { state: SessionState; actions: Actions }) {
  const doc = useMemo(() => buildCareerDocument(state), [state]);
  const stale = isDocStale(state);
  const exportable = canExport(state);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const totalItems = state.assignments.flatMap((a) => a.experiences.flatMap((e) => e.items));
  const confirmedCount = totalItems.filter((i) => i.status === "confirmed").length;

  const download = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      // Word 생성기는 무거우므로 내려받을 때만 불러온다.
      const { buildDocxBlob, docxFileName } = await import("../lib/career/docxBuilder.js");
      const blob = await buildDocxBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = docxFileName(doc.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError("파일을 만들지 못했습니다. 미리보기 내용을 복사해서 사용해 주세요.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="surface flex h-full min-h-0 flex-col" aria-label="경력 문서">
      <header className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-3">
        <h2 className="text-[13.5px] font-semibold">경력기술서</h2>
        <span className="meta-text">
          확인 {confirmedCount} / 전체 {totalItems.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* 복무 요약 */}
        <div>
          <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-[#5c6270]">복무 요약</h3>
          <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
            <dt className="text-[#5c6270]">군별 / 신분</dt>
            <dd>
              {doc.summary.branch} / {doc.summary.serviceType}
            </dd>
            <dt className="text-[#5c6270]">복무기간</dt>
            <dd>{doc.summary.totalPeriod}</dd>
            <dt className="text-[#5c6270]">전역 사유</dt>
            <dd>{doc.summary.separationReason}</dd>
          </dl>

          <div className="mt-3">
            <label htmlFor="displayName" className="meta-text block">
              문서에 넣을 이름 (비워두면 빈칸으로 나갑니다)
            </label>
            <input
              id="displayName"
              value={state.service.displayName}
              onChange={(e) => actions.setName(e.target.value)}
              placeholder="성명"
              className="mt-1 w-[180px] rounded-[8px] border border-[#e5e7eb] px-2.5 py-1.5 text-[13.5px] outline-none focus:border-[#101010]"
            />
          </div>
        </div>

        {/* 보직별 */}
        {state.assignments.length === 0 && (
          <Notice text="아직 정리된 내용이 없습니다. 왼쪽 질문에 답하시면 여기에 쌓입니다." />
        )}

        {state.assignments.map((a, idx) => (
          <div key={a.id} className="rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-[14px] font-semibold">
                {idx + 1}. {a.role || "보직 미기재"}
              </h3>
              <span className="meta-text">
                {formatPeriod(a.period, a.periodRaw) || "기간 미기재"} · 이동 사유{" "}
                {a.moveReasonRaw || "미확인"}
              </span>
            </div>

            {/* 부대명 표기 선택 */}
            {a.unitLabel && (
              <div className="mt-2 rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2">
                <p className="meta-text mb-1.5">문서에 넣을 소속 표기</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => actions.setUnitDisplay(a.id, false)}
                    aria-pressed={a.unitDisplay === "generalized"}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] ${
                      a.unitDisplay === "generalized"
                        ? "border-[#101010] bg-[#101010] text-white"
                        : "border-[#d4d4d8] bg-white text-[#242424]"
                    }`}
                  >
                    {a.unitDisplay === "generalized" ? "✓ " : ""}
                    {a.unitGeneralized}
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.setUnitDisplay(a.id, true)}
                    aria-pressed={a.unitDisplay === "as-given"}
                    className={`rounded-full border px-3 py-1.5 text-[12.5px] ${
                      a.unitDisplay === "as-given"
                        ? "border-[#101010] bg-[#101010] text-white"
                        : "border-[#d4d4d8] bg-white text-[#242424]"
                    }`}
                  >
                    {a.unitDisplay === "as-given" ? "✓ " : ""}
                    {a.unitLabel}
                  </button>
                </div>
                <p className="meta-text mt-1.5">
                  실제 부대명을 넣을지는 직접 고르실 수 있습니다.
                </p>
              </div>
            )}

            {a.experiences.map((exp) => (
              <ExperienceBlock key={exp.id} exp={exp} actions={actions} />
            ))}
          </div>
        ))}

        {/* 문서 미리보기 */}
        <div className="border-t border-[#e5e7eb] pt-4">
          <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-[#5c6270]">
            경력기술서 만들기
          </h3>
          <p className="meta-text mb-2.5">
            “확인”으로 표시한 내용만 사실로 들어갑니다. 미확인 항목은 미확인이라고 표시해서 따로
            싣습니다.
          </p>

          <button
            type="button"
            className="btn-primary tap"
            onClick={actions.generate}
            disabled={confirmedCount === 0}
          >
            {state.doc.preview ? "다시 만들기" : "확인한 내용으로 만들기"}
          </button>
          {confirmedCount === 0 && (
            <p className="meta-text mt-1.5">확인한 항목이 하나도 없어 아직 만들 수 없습니다.</p>
          )}

          {state.doc.preview && (
            <div className="mt-3 space-y-2.5">
              {stale && (
                <Notice
                  tone="warn"
                  text="내용을 고치셨습니다. 아래 미리보기는 고치기 전 버전이라 내려받을 수 없습니다. ‘다시 만들기’를 눌러 주세요."
                />
              )}
              <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-[#e5e7eb] bg-white p-3 text-[12.5px] leading-relaxed">
                {state.doc.preview}
              </pre>

              <label className="flex items-start gap-2 text-[13.5px]">
                <input
                  type="checkbox"
                  checked={state.doc.confirmed}
                  disabled={stale}
                  onChange={(e) => actions.confirmDoc(e.target.checked)}
                  className="mt-[3px] h-4 w-4 accent-[#101010]"
                />
                <span>
                  실제 경험과 일치하는지 확인했습니다.
                  <span className="meta-text block">본인 확인 · 경력 인증은 아닙니다</span>
                </span>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary tap"
                  disabled={!exportable || downloading}
                  onClick={download}
                >
                  {downloading ? "만드는 중…" : "Word로 내려받기"}
                </button>
                <button
                  type="button"
                  className="btn-quiet tap"
                  disabled={!exportable}
                  onClick={() => navigator.clipboard?.writeText(renderPreview(doc))}
                >
                  글로 복사
                </button>
              </div>
              {downloadError && <Notice tone="warn" text={downloadError} />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function ExperienceBlock({ exp, actions }: { exp: Experience; actions: Actions }) {
  if (exp.items.length === 0) {
    return (
      <div className="mt-3 rounded-[8px] border border-dashed border-[#d4d4d8] bg-white px-3 py-2.5">
        <p className="text-[13.5px] font-medium">{exp.title}</p>
        <p className="meta-text">아직 정리된 항목이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-[8px] border border-[#e5e7eb] bg-white p-3">
      <p className="mb-2 text-[13.5px] font-semibold">{exp.title}</p>
      <ul className="space-y-2.5">
        {exp.items.map((item, i) => (
          <ItemRow key={item.id} item={item} index={i + 1} actions={actions} />
        ))}
      </ul>
      {exp.interpretations.length > 0 && (
        <div className="mt-3 rounded-[8px] bg-[#fafafa] px-3 py-2">
          <p className="meta-text mb-1">참고 해석 · AI 해석이며 검증된 사실이 아닙니다</p>
          <ul className="list-inside list-disc text-[13px] text-[#5c6270]">
            {exp.interpretations.map((p) => (
              <li key={p.id}>{p.text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  index,
  actions,
}: {
  item: CardItem;
  index: number;
  actions: Actions;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  if (editing) {
    return (
      <li className="rounded-[8px] border border-[#101010] p-2.5">
        <label className="meta-text mb-1 block">항목 수정</label>
        <textarea
          value={draft}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full resize-none rounded-[6px] border border-[#e5e7eb] px-2.5 py-2 text-[13.5px] outline-none focus:border-[#101010]"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="btn-primary tap"
            onClick={() => {
              actions.editItem(item.id, draft);
              setEditing(false);
            }}
          >
            저장
          </button>
          <button
            type="button"
            className="btn-quiet tap"
            onClick={() => {
              setDraft(item.text);
              setEditing(false);
            }}
          >
            취소
          </button>
        </div>
        <p className="meta-text mt-1.5">고치시면 이전에 만든 경력기술서는 무효가 됩니다.</p>
      </li>
    );
  }

  return (
    <li>
      <p className="meta-text">{FIELD_LABELS[item.field]}</p>
      <p className="text-[13.5px] leading-relaxed">
        {item.text} <EvidenceChip item={item} index={index} />
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={item.status} />
        <button
          type="button"
          onClick={() => actions.setItemStatus(item.id, "confirmed")}
          className="tap rounded-full border border-[#d4d4d8] px-2.5 py-1 text-[12px] hover:bg-[#fafafa]"
        >
          맞습니다
        </button>
        <button
          type="button"
          onClick={() => actions.setItemStatus(item.id, "unknown")}
          className="tap rounded-full border border-[#d4d4d8] px-2.5 py-1 text-[12px] hover:bg-[#fafafa]"
        >
          확실하지 않음
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="tap rounded-full border border-[#d4d4d8] px-2.5 py-1 text-[12px] hover:bg-[#fafafa]"
        >
          수정
        </button>
        <button
          type="button"
          onClick={() => actions.removeItem(item.id)}
          className="tap rounded-full border border-[#d4d4d8] px-2.5 py-1 text-[12px] text-[#5c6270] hover:bg-[#fafafa]"
        >
          삭제
        </button>
      </div>
    </li>
  );
}
