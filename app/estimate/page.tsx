import Link from "next/link";

type EstimateEntry = {
  title: string;
  note: string;
  href?: string;
  action?: string;
};

const entries: EstimateEntry[] = [
  { title:"Quick Estimate", note:"Fast preliminary cost for early decisions." },
  { title:"Build Estimate", note:"Guided dimensions and questions for a fuller building estimate." },
  { title:"Upload BOQ", note:"Bring an existing priced or unpriced BOQ for pricing, materials and review.", href:"/estimate/upload-boq", action:"Upload Excel BOQ" },
  { title:"Upload Drawing", note:"AI-assisted interpretation with user verification before quantities are accepted." },
  { title:"Enter Quantities", note:"Direct measured-quantity entry for QSs and experienced contractors." },
  { title:"BOQ Studio", note:"Create, edit, price and prepare a sectioned BOQ for project conversion.", href:"/estimate/boq", action:"Open BOQ Studio" },
];

export default function EstimateHome(){
  return <main className="page-canvas">
    <div className="page-wrap" style={{maxWidth:1080}}>
      <div className="page-toolbar"><Link href="/" className="back-link">← Home</Link><span style={{fontSize:10,color:"#738292"}}>Charismak App · Estimate</span></div>
      <header className="page-heading compact">
        <p className="page-eyebrow">EXPECTED COST</p>
        <h1>What are you trying to estimate?</h1>
        <p>Start with a BOQ, drawing, measurements or a simple idea. Each route feeds one reviewed quantity, sectioned BOQ and project-cost engine.</p>
      </header>

      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
        {entries.map((entry)=>{
          const card=<article className="data-card" style={{padding:18,height:"100%"}}>
            <small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#0b668f"}}>ESTIMATE ENTRY</small>
            <h2 style={{fontSize:18,margin:"7px 0 5px",color:"#14354d"}}>{entry.title}</h2>
            <p style={{margin:0,fontSize:12,lineHeight:1.55,color:"#687c8c"}}>{entry.note}</p>
            {entry.href&&<p style={{margin:"10px 0 0",fontSize:11,fontWeight:900,color:"#0b668f"}}>{entry.action} →</p>}
          </article>;
          return entry.href?<Link key={entry.title} href={entry.href} style={{textDecoration:"none",color:"inherit"}}>{card}</Link>:<div key={entry.title}>{card}</div>;
        })}
      </section>

      <section className="data-card" style={{marginTop:14,padding:18}}>
        <small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#16825c"}}>ONE PROJECT-COST FLOW</small>
        <h2 style={{margin:"7px 0",fontSize:19,color:"#14354d"}}>Input → Review → Quantities → Sectioned BOQ → Materials → Budget → Create Project</h2>
        <p style={{margin:0,fontSize:12,lineHeight:1.6,color:"#687c8c"}}>BOQ sections remain intact. Quantity cells drill into the material recipe and assumptions for that exact work item. AI may interpret descriptions and drawings, but deterministic rules calculate quantities and money before user confirmation.</p>
      </section>
    </div>
  </main>;
}
