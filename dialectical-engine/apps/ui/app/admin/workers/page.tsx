/* Turn 7 · 7c "Fleet". The refusal is the screen: no deployment request is
   issued and no worker state is inferred from a refused operator response. */
export default function WorkersPage() {
  return (
    <div className="screen scroll fleetScreen">
      <div className="fleetCard">
        <p className="fleetEyebrow">FLEET</p>
        <h1 className="fleetTitle">Execution state</h1>
        <div className="fleetPanel">
          <div className="fleetPanelCore">
            <span className="fleetAccent" aria-hidden="true" />
            <p className="fleetNoticeTitle">Operator-only view</p>
            <p className="fleetNoticeBody">
              Deployment state is unavailable in the ordinary asker interface. No privileged request
              is issued and no worker state is fabricated.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
