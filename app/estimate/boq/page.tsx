import Link from "next/link";
import SectionedBoqClient from "./sectioned-boq-client";
import type { SectionedBoq } from "../../../lib/estimate/sectioned-boq";

const sampleBoq: SectionedBoq = {
  id: "sample-estimate-v1",
  name: "Sample Residential BOQ",
  currency: "NGN",
  sections: [
    {
      id: "section-04",
      code: "04",
      title: "Blockwork & Masonry",
      items: [
        {
          id: "bw-001",
          itemNo: "4.1",
          description: "225mm hollow sandcrete block wall in cement and sand mortar",
          unit: "m²",
          quantity: 1820,
          rate: 18500,
          amount: 33670000,
          materialBreakdown: {
            status: "available",
            recipeName: "225mm blockwork",
            assumptions: ["10 blocks per m² before waste.", "Mortar recipe is reviewed separately from the block count.", "Material quantities remain traceable to this BOQ item."],
            materials: [
              { id: "bw-blocks", material: "225mm hollow blocks", unit: "pcs", baseQuantity: 18200, wastePercent: 5, totalQuantity: 19110, source: "recipe" },
              { id: "bw-cement", material: "Cement", unit: "bags", baseQuantity: 546, wastePercent: 5, totalQuantity: 573.3, source: "recipe", note: "Mortar allowance for this item" },
              { id: "bw-sand", material: "Sharp sand", unit: "m³", baseQuantity: 27.3, wastePercent: 10, totalQuantity: 30.03, source: "recipe" },
            ],
          },
        },
        {
          id: "bw-002",
          itemNo: "4.2",
          description: "150mm hollow sandcrete block wall in cement and sand mortar",
          unit: "m²",
          quantity: 640,
          rate: 16200,
          amount: 10368000,
          materialBreakdown: {
            status: "needs_review",
            materials: [],
            assumptions: ["A reviewer must confirm the 150mm blockwork material recipe before quantities are accepted."],
          },
        },
      ],
    },
    {
      id: "section-03",
      code: "03",
      title: "Concrete & Reinforcement",
      items: [
        {
          id: "conc-001",
          itemNo: "3.1",
          description: "Reinforced concrete in foundations",
          unit: "m³",
          quantity: 85,
          rate: 145000,
          amount: 12325000,
          materialBreakdown: {
            status: "available",
            recipeName: "Structural concrete review recipe",
            assumptions: ["Illustrative mix for interaction testing only; project mix design remains authoritative."],
            materials: [
              { id: "conc-cement", material: "Cement", unit: "bags", baseQuantity: 595, wastePercent: 5, totalQuantity: 624.75, source: "recipe" },
              { id: "conc-sand", material: "Sharp sand", unit: "m³", baseQuantity: 42.5, wastePercent: 10, totalQuantity: 46.75, source: "recipe" },
              { id: "conc-granite", material: "Granite", unit: "m³", baseQuantity: 85, wastePercent: 5, totalQuantity: 89.25, source: "recipe" },
            ],
          },
        },
      ],
    },
  ],
};

export default function SectionedBoqPage(){
  return <main className="page-canvas">
    <div className="page-wrap" style={{maxWidth:1180}}>
      <div className="page-toolbar"><Link href="/estimate" className="back-link">← Estimate</Link><span style={{fontSize:10,color:"#738292"}}>Charismak App · BOQ Studio</span></div>
      <header className="page-heading compact">
        <p className="page-eyebrow">BOQ → MATERIAL TRACEABILITY</p>
        <h1>Sectioned bill with quantity drilldown</h1>
        <p>Each BOQ keeps its original work sections. The quantity is interactive: select it to inspect the materials, waste allowance and assumptions attached to that specific measured item.</p>
      </header>
      <SectionedBoqClient boq={sampleBoq}/>
      <section className="data-card" style={{marginTop:14,padding:17}}>
        <small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#7b5c13"}}>V1 RULE</small>
        <p style={{margin:"5px 0 0",fontSize:12,lineHeight:1.6,color:"#657989"}}>Imported BOQ headings become sections. Charismak may suggest missing sections or material recipes, but it does not flatten the bill or hide the source item. Material totals must always be traceable back to the BOQ quantity that generated them.</p>
      </section>
    </div>
  </main>;
}
