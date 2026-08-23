export default function FleetPage() {
  return (
    <main className="screen scroll">
      <div className="screenInner">
        <div className="eyebrow">Fleet</div>
        <h1 className="display">Execution state</h1>
        <div className="card">
          <strong>Operator-only view</strong>
          <p>
            Deployment state is unavailable in the ordinary asker interface. No privileged request
            is issued and no worker state is fabricated.
          </p>
        </div>
      </div>
    </main>
  );
}
