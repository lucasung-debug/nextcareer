import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CareerDoc } from "./components/CareerDoc.js";
import { Interview } from "./components/Interview.js";
import { Modal, Notice } from "./components/bits.js";
import { buildCareerDocument, renderPreview } from "./lib/career/careerDocument.js";
import { requestExtraction } from "./lib/career/client.js";
import { advance, currentQuestion, startInterview, submitAnswer } from "./lib/career/conductor.js";
import { buildSampleSession } from "./lib/career/sample.js";
import {
  closeExperience,
  confirmDoc,
  editItem,
  emptySession,
  removeItem,
  resetSession,
  setDocPreview,
  setItemStatus,
  setMoveReason,
  setService,
  updateAssignment,
} from "./lib/career/session.js";
import { parsePeriod } from "./lib/career/period.js";
import type { ItemStatus, SessionState } from "./lib/career/types.js";

export default function App() {
  const [state, setState] = useState<SessionState>(() => emptySession());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "doc">("chat");
  const [guideOpen, setGuideOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);

  // 초기화·모드전환 후 이전 요청 결과가 되살아나지 못하게 세대를 검사한다.
  const generationRef = useRef(state.generation);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    generationRef.current = state.generation;
  }, [state.generation]);

  const plan = useMemo(() => (state.mode === "idle" ? null : currentQuestion(state)), [state]);
  const started = state.mode !== "idle";

  // 새로고침 경고 (대화가 저장되지 않으므로)
  useEffect(() => {
    const hasContent = state.messages.length > 0 || state.assignments.length > 0;
    if (!hasContent || state.mode === "sample") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.messages.length, state.assignments.length, state.mode]);

  const hardReset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setNotice(null);
    setState((prev) => resetSession(prev));
    setTab("chat");
  }, []);

  const handleAnswer = useCallback(
    async (text: string) => {
      if (state.mode === "sample") {
        setNotice("가상 사례에서는 새 답변을 받지 않습니다. ‘새로 시작’을 눌러 직접 시작해 주세요.");
        return;
      }

      const myGeneration = state.generation;
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setNotice(null);

      const result = await submitAnswer(state, text, async (messages, ctx) => {
        const res = await requestExtraction(messages, ctx, controller.signal);
        if (res.ok) return { ok: true, extraction: res.extraction };
        return { ok: false, error: { message: res.error.message, retryable: res.error.retryable } };
      });

      // 그 사이 초기화되었으면 결과를 버린다.
      if (generationRef.current !== myGeneration) return;

      setState(result.state);
      setNotice(result.notice ?? null);
      setBusy(false);
      abortRef.current = null;
    },
    [state],
  );

  const actions = useMemo(
    () => ({
      setItemStatus: (id: string, status: ItemStatus) =>
        setState((s) => setItemStatus(s, id, status)),
      editItem: (id: string, text: string) => setState((s) => editItem(s, id, text)),
      removeItem: (id: string) => setState((s) => removeItem(s, id)),
      setUnitDisplay: (assignmentId: string, asGiven: boolean) =>
        setState((s) =>
          updateAssignment(s, assignmentId, { unitDisplay: asGiven ? "as-given" : "generalized" }),
        ),
      setName: (name: string) => setState((s) => setService(s, { displayName: name })),
      updateAssignmentField: (
        assignmentId: string,
        patch: { role?: string; unitLabel?: string; periodRaw?: string; moveReasonRaw?: string },
      ) =>
        setState((s) => {
          if (patch.moveReasonRaw !== undefined) {
            return setMoveReason(s, assignmentId, patch.moveReasonRaw);
          }
          if (patch.periodRaw !== undefined) {
            return updateAssignment(s, assignmentId, {
              periodRaw: patch.periodRaw,
              period: parsePeriod(patch.periodRaw),
            });
          }
          return updateAssignment(s, assignmentId, patch);
        }),
      generate: () =>
        setState((s) => setDocPreview(s, renderPreview(buildCareerDocument(s)))),
      confirmDoc: (v: boolean) => setState((s) => confirmDoc(s, v)),
    }),
    [],
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-[1240px] flex-col px-4 pb-6 md:px-6">
      {/* 상단 */}
      <header className="flex items-center justify-between py-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[17px] font-bold tracking-tight">다음경력</span>
          <span className="rounded-full border border-[#d4d4d8] px-2 py-[2px] text-[11px] text-[#5c6270]">
            베타
          </span>
          <span className="meta-text hidden sm:inline">군 경험에서, 다음 경력으로</span>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-quiet tap" onClick={() => setGuideOpen(true)}>
            이용 안내
          </button>
          {started && (
            <button type="button" className="btn-quiet tap" onClick={() => setResetOpen(true)}>
              새로 시작
            </button>
          )}
        </div>
      </header>

      {!started ? (
        <StartScreen
          onStart={() => setConsentOpen(true)}
          onSample={() => {
            setState(buildSampleSession());
            setTab("doc");
          }}
        />
      ) : (
        <>
          {state.mode === "sample" && (
            <div className="mb-3">
              <Notice text="가상 사례입니다. 실제 AI 요청 없이 미리 만들어 둔 예시로 동작합니다." />
            </div>
          )}

          {/* 모바일 탭 */}
          <div className="mb-3 flex gap-1.5 md:hidden" role="tablist" aria-label="화면 전환">
            {(
              [
                ["chat", "대화"],
                ["doc", "경력기술서"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`tap flex-1 rounded-full border px-3 py-2 text-[13.5px] ${
                  tab === k
                    ? "border-[#101010] bg-[#101010] text-white"
                    : "border-[#d4d4d8] bg-white text-[#242424]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <main className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
            <div className={`${tab === "chat" ? "block" : "hidden"} min-h-[62vh] md:block md:min-h-[72vh]`}>
              <Interview
                messages={state.messages}
                plan={plan}
                busy={busy}
                notice={notice}
                onSubmit={handleAnswer}
                onSkip={() => handleAnswer("넘어갈게요")}
                onFinishExperience={() =>
                  setState((s) =>
                    s.activeExperienceId
                      ? advance(closeExperience(s, s.activeExperienceId))
                      : s,
                  )
                }
              />
            </div>
            <div className={`${tab === "doc" ? "block" : "hidden"} min-h-[62vh] md:block md:min-h-[72vh]`}>
              <CareerDoc state={state} actions={actions} />
            </div>
          </main>
        </>
      )}

      <footer className="meta-text mt-5 border-t border-[#e5e7eb] pt-4">
        대화 내용은 브라우저 메모리에만 있고 저장되지 않습니다. 새로고침하거나 창을 닫으면 사라지니
        완성된 문서는 내려받아 두세요. 이 서비스는 본인 확인을 돕는 도구이며 경력 인증 기관이
        아닙니다.
      </footer>

      {/* 이용 안내 */}
      <Modal open={guideOpen} title="이용 안내" onClose={() => setGuideOpen(false)}>
        <ul className="list-outside list-disc space-y-2 pl-4 text-[14px]">
          <li>한 번에 하나씩 여쭤봅니다. 잘 정리해서 답하지 않으셔도 됩니다.</li>
          <li>모르시면 “기억이 안 나요”라고 하셔도 됩니다. 넘어가고 사실로 적지 않습니다.</li>
          <li>AI가 만든 문장은 직접 말씀하신 문장에 근거가 붙어 있을 때만 화면에 올라갑니다.</li>
          <li>말씀하지 않은 숫자나 성과는 만들지 않습니다. 결과가 없으면 “미확인”으로 둡니다.</li>
          <li>
            부대명은 여쭤보지만, 문서에 실제 명칭을 넣을지 <b>○○사단</b>처럼 일반 표기로 넣을지는
            직접 고르십니다.
          </li>
          <li>
            부대 위치, 병력·총기·탄약 수량, 장비 식별번호, 보안 절차, 주민등록번호·연락처는 입력해도
            AI로 보내지 않고 차단합니다.
          </li>
          <li>대화는 저장하지 않습니다. 문서 파일은 브라우저에서 직접 만듭니다.</li>
        </ul>
      </Modal>

      {/* 시작 동의 */}
      <Modal
        open={consentOpen}
        title="시작하기 전에"
        onClose={() => setConsentOpen(false)}
        footer={
          <>
            <button type="button" className="btn-quiet tap" onClick={() => setConsentOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn-primary tap"
              onClick={() => {
                setConsentOpen(false);
                setState((s) => startInterview({ ...emptySession(s.generation + 1), consentGiven: true }));
              }}
            >
              확인했습니다
            </button>
          </>
        }
      >
        <ul className="list-outside list-disc space-y-2 pl-4 text-[14px]">
          <li>답변은 경력 정리를 위해 AI로 전송됩니다.</li>
          <li>
            보안·개인정보에 해당하는 내용(부대 위치, 병력·탄약 수량, 장비 식별번호, 보안 절차,
            주민등록번호·연락처)은 <b>적지 말아 주세요</b>. 감지되면 전송을 막습니다.
          </li>
          <li>대화 내용은 서버에 저장하지 않습니다.</li>
          <li>이 서비스는 경력을 인증해 주지 않습니다. 본인 진술을 정리해 드립니다.</li>
        </ul>
      </Modal>

      {/* 새로 시작 */}
      <Modal
        open={resetOpen}
        title="새로 시작할까요?"
        onClose={() => setResetOpen(false)}
        footer={
          <>
            <button type="button" className="btn-quiet tap" onClick={() => setResetOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn-primary tap"
              onClick={() => {
                setResetOpen(false);
                hardReset();
              }}
            >
              새로 시작
            </button>
          </>
        }
      >
        지금까지의 대화와 정리된 내용이 모두 지워집니다. 저장되지 않으니 필요한 문서는 먼저 내려받아
        주세요.
      </Modal>
    </div>
  );
}

function StartScreen({ onStart, onSample }: { onStart: () => void; onSample: () => void }) {
  return (
    <main className="surface flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-[28px] font-bold leading-[1.35] tracking-tight md:text-[34px]">
        당연했던 일에도,
        <br />
        경력은 있습니다.
      </h1>
      <p className="chat-text readable mt-4 text-[#5c6270]">
        특별한 성과가 없어도 괜찮습니다. 매일 하시던 일을 하나씩 여쭤보고, 민간 채용담당자가 읽을 수
        있는 경력기술서로 정리해 드립니다.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2.5">
        <button type="button" className="btn-primary tap" onClick={onStart}>
          내 경험 시작하기
        </button>
        <button type="button" className="btn-quiet tap" onClick={onSample}>
          가상 사례 먼저 보기
        </button>
      </div>

      <div className="mt-9 grid max-w-[620px] gap-2.5 text-left sm:grid-cols-3">
        {[
          ["지어내지 않습니다", "말씀하신 문장에 근거가 붙어야만 기록됩니다."],
          ["몰아붙이지 않습니다", "모르시면 넘어갑니다. 결과가 없어도 됩니다."],
          ["문서로 나갑니다", "확인하신 내용만 Word 경력기술서로 내려받습니다."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] p-3">
            <p className="text-[13px] font-semibold">{title}</p>
            <p className="meta-text mt-0.5">{body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
