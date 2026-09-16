export function StartScreen({ onStart, onSample }: { onStart: () => void; onSample: () => void }) {
  return (
    <main className="surface welcome" aria-labelledby="welcome-title">
      <div className="welcome-intro">
        <p className="welcome-eyebrow">전역 간부를 위한 경력 정리</p>
        <h1 id="welcome-title" className="display-title" lang="en">
          Thank you for your service, sir.
        </h1>
        <p className="welcome-thanks">복무해 주셔서 감사합니다.</p>
        <p className="welcome-description">
          특별한 성과가 없어도 괜찮습니다.<br />
          매일 하시던 일을 하나씩 여쭤보고,<br className="sm:hidden" /> 민간 채용자가 읽을 수 있는<br className="hidden sm:block" />
          경력기술서로 함께 정리합니다.
        </p>
        <div className="welcome-actions">
          <button type="button" className="btn-primary tap" onClick={onStart}>내 경험 시작하기</button>
          <button type="button" className="btn-quiet tap" onClick={onSample}>가상 사례 먼저 보기</button>
        </div>
        <p className="meta-text mt-3">회원가입 없이 시작 · 가상 사례는 AI 요청 없이 체험</p>
      </div>

      <ol className="welcome-steps" aria-label="경력 정리 과정">
        {[
          ["01", "편하게 이야기합니다", "잘 정리해 말하지 않아도 됩니다. 질문은 한 번에 하나씩 드립니다."],
          ["02", "근거를 직접 확인합니다", "말씀하신 원문과 대조하고, 확인한 내용만 Word 문서에 담습니다."],
          ["03", "다음 경력을 살펴봅니다", "확인한 업무를 바탕으로 직군을 살펴보고, 원티드에서 공고를 찾습니다."],
        ].map(([number, title, text]) => (
          <li key={number}>
            <span className="welcome-step-number" aria-hidden="true">{number}</span>
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
              <p className="meta-text mt-1.5">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
