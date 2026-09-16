import { useEffect, useRef, useState, type ReactNode } from "react";

import type { QuestionPlan } from "../lib/career/planner.js";
import type { ChatMessage } from "../lib/career/types.js";
import { Notice } from "./bits.js";

const PHASE_LABEL: Record<string, string> = {
  service: "복무 기본정보",
  assignment: "보직 정보",
  experience_pick: "업무 고르기",
  deep_dive: "자세히 여쭤보기",
  review: "확인",
  document: "경력기술서",
};

export function Interview({
  messages,
  plan,
  busy,
  notice,
  onSubmit,
  onSkip,
  onFinishExperience,
  sampleControls,
}: {
  messages: ChatMessage[];
  plan: QuestionPlan | null;
  busy: boolean;
  notice: string | null;
  onSubmit: (text: string) => void;
  onSkip: () => void;
  onFinishExperience: () => void;
  /** 가상 사례일 때는 입력란 대신 이 내용을 보여준다 */
  sampleControls?: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy, plan?.question]);

  const send = (value: string) => {
    const text = value.trim();
    if (!text || busy) return;
    setDraft("");
    onSubmit(text);
  };

  return (
    <section className="surface interview-panel flex h-full min-h-0 flex-col" aria-label="면담">
      {/* 진행 상태 */}
      <header className="panel-header">
        <h2 className="text-[15px] font-semibold">
          {plan ? PHASE_LABEL[plan.phase] ?? "면담" : "정리 완료"}
        </h2>
        <span className="meta-text">한 번에 하나씩 여쭤봅니다</span>
      </header>

      {/* 대화 로그 */}
      <div ref={logRef} role="log" aria-label="면담 대화" aria-live="polite" aria-relevant="additions text" className="chat-log">
        {messages.length === 0 && (
          <p className="chat-text readable text-[#5c6270]">
            잘 정리해서 말하지 않으셔도 괜찮습니다. 실제로 하신 일을 하나씩 여쭤보겠습니다.
          </p>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "chat-text readable max-w-[90%] rounded-[10px] rounded-br-[3px] bg-[#f3f4f6] px-4 py-3 text-[#1c1d1f]"
                  : "chat-text readable max-w-[96%] py-2 text-[#242424]"
              }
            >
              <span className="mb-1 block text-[11px] font-semibold tracking-wide text-[#6f7988]">{m.role === "user" ? "나의 답변" : "다음경력"}</span>
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="chat-text flex items-center gap-2 text-[#5c6270]">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5c6270] [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5c6270] [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#5c6270]" />
            </span>
            말씀하신 내용을 정리하고 있습니다
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <div className="interview-controls">
        {notice && <Notice text={notice} tone="warn" />}

        {sampleControls}

        {!sampleControls && plan?.hint && <p className="meta-text readable">{plan.hint}</p>}

        {!sampleControls && plan?.choices && plan.choices.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {plan.choices.map((c) => (
              <button
                key={c}
                type="button"
                className="btn-quiet tap"
                disabled={busy}
                onClick={() => send(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {sampleControls ? null : plan ? (
          <>
            <label htmlFor="answer" className="sr-only">
              답변 입력
            </label>
            <div className="composer">
            <textarea
              id="answer"
              ref={inputRef}
              rows={3}
              value={draft}
              disabled={busy}
              placeholder="편하게 말씀해 주세요"
              onChange={(e) => setDraft(e.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onKeyDown={(e) => {
                // 한글 입력 중(IME 조합 중) Enter 는 글자 확정이므로 전송하지 않는다.
                if (e.key === "Enter" && !e.shiftKey && !composing && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              className="w-full resize-none bg-transparent px-1 py-1 text-[16px] leading-relaxed outline-none placeholder:text-[#6f7988] disabled:opacity-60"
            />
            <div className="composer-toolbar">
              <span className="meta-text hidden lg:block">Enter 전송 · Shift+Enter 줄바꿈</span>
              <div className="flex gap-2">
                {plan.phase === "deep_dive" && (
                  <button
                    type="button"
                    className="btn-quiet tap"
                    disabled={busy}
                    onClick={onFinishExperience}
                    title="이 업무에 대한 질문을 멈추고 다음으로 넘어갑니다"
                  >
                    이만 정리
                  </button>
                )}
                {plan.skippable && (
                  <button type="button" className="btn-quiet tap" disabled={busy} onClick={onSkip}>
                    건너뛰기
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary tap"
                  disabled={busy || !draft.trim()}
                  onClick={() => send(draft)}
                >
                  보내기
                </button>
              </div>
            </div>
            </div>
          </>
        ) : (
          <Notice text="여쭤볼 내용이 끝났습니다. 경력 · 채용 화면에서 확인하고 경력기술서를 내려받으세요." />
        )}
      </div>
    </section>
  );
}
