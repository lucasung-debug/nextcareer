import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CareerDoc } from "./components/CareerDoc.js";
import { Interview } from "./components/Interview.js";
import { StartScreen } from "./components/StartScreen.js";
import { Modal, Notice } from "./components/bits.js";
import { buildCareerDocument, renderPreview } from "./lib/career/careerDocument.js";
import { requestExtraction } from "./lib/career/client.js";
import { advance, currentQuestion, startInterview, submitAnswer } from "./lib/career/conductor.js";
import { buildSampleSession, SAMPLE_TURNS } from "./lib/career/sample.js";
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
  /** 가상 사례를 몇 단계까지 진행해 보여줄지 */
  const [sampleStep, setSampleStep] = useState(SAMPLE_TURNS);
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
    <div className={`app-shell ${started ? "app-shell-active" : ""}`}>
      {/* 상단 */}
      <header className="app-header">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[16px] font-semibold tracking-tight">다음경력</span>
          <span className="rounded-full bg-[#e5e7eb] px-2 py-[2px] text-[11px] text-[#505967]">
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
          onSample={async () => {
            setSampleStep(SAMPLE_TURNS);
            setState(await buildSampleSession());
            setTab("doc");
          }}
        />
      ) : (
        <>
          {state.mode === "sample" && (
            <div className="mb-3">
              <Notice
                text={`가상 사례입니다. 실제 인물의 정보가 아니고 AI 요청도 보내지 않습니다. 질문 순서와 근거 연결은 실제 면담과 같은 방식으로 동작합니다. 전체 ${SAMPLE_TURNS}단계.`}
              />
            </div>
          )}

          {/* 모바일 탭 */}
          <div className="mobile-tabs" role="tablist" aria-label="화면 전환">
            {(
              [
                ["chat", "대화"],
                ["doc", "경력 · 채용"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                id={`workspace-tab-${k}`}
                role="tab"
                aria-controls={`workspace-${k}`}
                tabIndex={tab === k ? 0 : -1}
                onKeyDown={(e) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                    e.preventDefault();
                    const next = e.key === "Home" ? "chat" : e.key === "End" ? "doc" : k === "chat" ? "doc" : "chat";
                    setTab(next);
                    document.getElementById(`workspace-tab-${next}`)?.focus();
                  }
                }}
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

          <main className="workspace">
            <div id="workspace-chat" className={`workspace-column ${tab === "chat" ? "is-active" : ""}`}>
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
                sampleControls={
                  state.mode === "sample" ? (
                    <SampleControls
                      step={sampleStep}
                      onStep={async (next) => {
                        const clamped = Math.max(0, Math.min(next, SAMPLE_TURNS));
                        setSampleStep(clamped);
                        setState(await buildSampleSession(clamped));
                      }}
                    />
                  ) : undefined
                }
              />
            </div>
            <div id="workspace-doc" className={`workspace-column ${tab === "doc" ? "is-active" : ""}`}>
              <CareerDoc state={state} actions={actions} />
            </div>
          </main>
        </>
      )}

      <footer className="app-footer meta-text">
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

/**
 * 가상 사례 조작바.
 * 심사하는 사람이 면담이 어떻게 진행되는지 한 단계씩 따라볼 수 있게 한다.
 */
function SampleControls({
  step,
  onStep,
}: {
  step: number;
  onStep: (next: number) => void;
}) {
  const atStart = step === 0;
  const atEnd = step >= SAMPLE_TURNS;
  const pct = Math.round((step / SAMPLE_TURNS) * 100);

  return (
    <div className="rounded-[10px] border border-[#e5e7eb] bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold">
          가상 사례 따라가기 · {step} / {SAMPLE_TURNS}단계
        </span>
        <span className="meta-text">{atEnd ? "완성" : "진행 중"}</span>
      </div>

      <div
        className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[#f4f4f4]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="가상 사례 진행률"
      >
        <div className="h-full bg-[#101010] transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-quiet tap" disabled={atStart} onClick={() => onStep(0)}>
          처음으로
        </button>
        <button
          type="button"
          className="btn-quiet tap"
          disabled={atStart}
          onClick={() => onStep(step - 1)}
        >
          이전
        </button>
        <button
          type="button"
          className="btn-primary tap"
          disabled={atEnd}
          onClick={() => onStep(step + 1)}
        >
          다음 대화 보기
        </button>
        <button
          type="button"
          className="btn-quiet tap"
          disabled={atEnd}
          onClick={() => onStep(SAMPLE_TURNS)}
        >
          결과까지 한 번에
        </button>
      </div>

      <p className="meta-text mt-2">
        {atEnd
          ? "면담이 끝난 상태입니다. 경력 · 채용 화면에서 근거를 확인하고 Word로 내려받으실 수 있습니다."
          : "다음 대화를 누르면 질문과 답변이 한 개씩 진행됩니다. 경력 내용도 같이 채워집니다."}
      </p>
    </div>
  );
}
