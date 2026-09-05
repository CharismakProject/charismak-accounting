import Link from "next/link";

const tools = [
  ["Add Money Record", "/add", "Upload or record statements, receipts, bills and transactions."],
  ["Approvals", "/approvals", "Review payment, stipend and other project requests."],
  ["Treasury", "/treasury", "Accounts, available funds and company/project cash position."],
  ["Accounting Control", "/accounting", "Accounting review and financial control workflows."],
  ["Money Activity", "/statements", "Statement imports, transaction history and matching."],
  ["Reports", "/reports", "Project and company financial reporting."],
] as const;

export default function MoneyHome(){
  return <main className="page-canvas">
    <div className="page-wrap" style={{maxWidth:1080}}>
      <div className="page-toolbar"><Link href="/" className="back-link">← Home</Link><span style={{fontSize:10,color:"#738292"}}>Charismak App · Money</span></div>
      <header className="page-heading compact">
        <p className="page-eyebrow">FINANCIAL TRUTH</p>
        <h1>Know where every naira went.</h1>
        <p>Accounting is the Money engine inside Charismak App. Estimates provide expected cost; this area controls actual transactions, commitments, approvals, cash and profitability.</p>
      </header>

      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:12}}>
        {tools.map(([title,href,note])=><Link key={href} href={href} className="data-card" style={{padding:18,textDecoration:"none",display:"block"}}>
          <small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#16825c"}}>MONEY</small>
          <h2 style={{fontSize:18,margin:"7px 0 5px",color:"#14354d"}}>{title}</h2>
          <p style={{margin:0,fontSize:12,lineHeight:1.55,color:"#687c8c"}}>{note}</p>
        </Link>)}
      </section>

      <section className="data-card" style={{marginTop:14,padding:18}}>
        <small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#0b668f"}}>PROJECT COST INTELLIGENCE</small>
        <h2 style={{margin:"7px 0",fontSize:19,color:"#14354d"}}>Approved Budget → Commitments → Actual Spend → Forecast → Profitability</h2>
        <p style={{margin:0,fontSize:12,lineHeight:1.6,color:"#687c8c"}}>The shared cost-code bridge will connect Estimator budgets to Accounting actuals while keeping contract value, direct cost, contingency, overhead, profit and tax as separate concepts.</p>
      </section>
    </div>
  </main>;
}
