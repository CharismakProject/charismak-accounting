import Link from "next/link";

const entries = [
  ["Quick Estimate", "Fast preliminary cost for early decisions."],
  ["Build Estimate", "Guided dimensions and questions for a fuller building estimate."],
  ["Upload BOQ", "Bring an existing priced or unpriced BOQ for pricing, materials and review."],
  ["Upload Drawing", "AI-assisted interpretation with user verification before quantities are accepted."],
  ["Enter Quantities", "Direct measured-quantity entry for QSs and experienced contractors."],
  ["BOQ Studio", "Create, edit, price and prepare a BOQ for project conversion."],
] as const;

export default function EstimateHome(){
  return <main className="page-canvas">
    <div className="page-wrap" style={{maxWidth:1080}}>
      <div className="page-toolbar"><Link href="/" className="back-link">← Home</Link><span style={{fontSize:10,color:"#738292"}}>Charismak App · Estimate</span></div>
      <header className="page-heading compact">
        <p className="page-eyebrow">EXPECTED COST</p>
        <h1>What are you trying to estimate?</h1>
        <p>Start with a BOQ, drawing, measurements or a simple idea. Each route will eventually feed one reviewed quantity, BOQ and project-cost engine.</p>
      </header>

      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
        {entries.map(([title,note])=><article key={title} className="data-card" style={{padding:18}}>
          <small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#0b668f"}}>ESTIMATE ENTRY</small>
          <h2 style={{fontSize:18,margin:"7px 0 5px",color:"#14354d"}}>{title}</h2>
          <p style={{margin:0,fontSize:12,lineHeight:1.55,color:"#687c8c"}}>{note}</p>
        </article>)}
      </section>

      <section className="data-card" style={{marginTop:14,padding:18}}>
        <small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#16825c"}}>ONE PROJECT-COST FLOW</small>
        <h2 style={{margin:"7px 0",fontSize:19,color:"#14354d"}}>Input → Review → Quantities → BOQ → Materials → Budget → Create Project</h2>
        <p style={{margin:0,fontSize:12,lineHeight:1.6,color:"#687c8c"}}>AI may interpret descriptions and drawings, but deterministic rules calculate quantities and money. A reviewer confirms the result before it becomes a project budget.</p>
      </section>
    </div>
  </main>;
}
