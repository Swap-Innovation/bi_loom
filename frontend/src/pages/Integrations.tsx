export function Integrations() {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 pb-16">
      <section className="pt-10 sm:pt-14 pb-10 animate-rise">
        <p className="text-eyebrow mb-3">Platform</p>
        <h1 className="text-display">Integrations</h1>
        <p className="text-body mt-3 text-[15px] max-w-xl">
          Supported source and target stack for enterprise Business Objects migrations.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-12 border-y border-border py-10 animate-rise-delay-1">
        <div>
          <p className="text-eyebrow mb-4">Source</p>
          <h2 className="text-title mb-6">SAP Business Objects</h2>
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-4 border-b border-border/80 pb-3">
              <dt className="text-ink-faint">Products</dt>
              <dd className="font-medium text-ink text-right">WebI, Crystal, Dashboard, Analysis</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/80 pb-3">
              <dt className="text-ink-faint">Input formats</dt>
              <dd className="font-medium text-ink text-right">ZIP, XML</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Parser</dt>
              <dd className="font-medium text-ink text-right">business_objects</dd>
            </div>
          </dl>
        </div>

        <div className="pt-10 md:pt-0 border-t md:border-t-0 border-border">
          <p className="text-eyebrow mb-4">Target</p>
          <h2 className="text-title mb-6">Microsoft Power BI</h2>
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-4 border-b border-border/80 pb-3">
              <dt className="text-ink-faint">Output</dt>
              <dd className="font-medium text-ink text-right">.pbip project</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border/80 pb-3">
              <dt className="text-ink-faint">Semantic model</dt>
              <dd className="font-medium text-ink text-right">Pluto gold layer</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-faint">Generator</dt>
              <dd className="font-medium text-ink text-right">powerbi</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="pt-10 animate-rise-delay-2">
        <p className="text-eyebrow mb-3">Workflow</p>
        <h2 className="text-title mb-3">Five controlled phases</h2>
        <p className="text-body max-w-2xl mb-6">
          <span className="font-semibold text-ink">Ingest</span>
          {' → '}
          <span className="font-semibold text-ink">Target</span>
          {' → '}
          <span className="font-semibold text-ink">Map</span>
          {' → '}
          <span className="font-semibold text-ink">Convert</span>
          {' → '}
          <span className="font-semibold text-ink">Deliver</span>
          . Select an active semantic model before AI mapping; Convert unlocks Deliver.
        </p>
        <ul className="text-[13px] space-y-2 text-ink-muted font-mono bg-white/60 border border-border rounded-lg px-5 py-4">
          <li>sample-data/projects/fixed-telco-orders/</li>
          <li>…/artifacts/fixed-telco-orders.zip</li>
          <li>…/target/pluto-model.json</li>
          <li>…/target/glossary.json</li>
        </ul>
      </section>
    </div>
  );
}
