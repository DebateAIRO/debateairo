export default function WorkersPage() {
  return (
    <div className="screen scroll">
      <div className="screenInner wide">
        <div className="eyebrow">Infrastructure</div>
        <h1 className="display sm" style={{ marginTop: 12 }}>
          Workers
        </h1>
        <div className="card" style={{ marginTop: 18 }}>
          <strong>Operator-only view</strong>
          <p>
            Fleet status is unavailable in the ordinary asker interface. This page does not request
            deployment state or infer worker counts from a refused operator response.
          </p>
        </div>
      </div>
    </div>
  );
}
