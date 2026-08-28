export default function LoadingDebate() {
  return (
    <div className="screen scroll">
      <div className="screenInner narrow" aria-live="polite" aria-busy="true">
        <p className="eyebrow">Debate accepted</p>
        <h1 className="display md">Starting your debate…</h1>
        <p className="muted">Connecting to the coordinator and the discovered models.</p>
      </div>
    </div>
  );
}
