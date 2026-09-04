import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { loadWorkspace } from "../../lib/workspace";
import { Card, money, ScreenTitle, SectionHead, Stat, baseStyles as b } from "../../components/ui";

export default function MoneyTab(){
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [accounts,setAccounts]=useState<any[]>([]);
  const [projects,setProjects]=useState<any[]>([]);
  const [transactions,setTransactions]=useState<any[]>([]);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setError("");
    const w=await loadWorkspace();
    const [{data:a,error:ae},{data:p,error:pe},{data:t,error:te}]=await Promise.all([
      supabase.from("account_recorded_balances").select("account_id,name,account_type,currency_code,recorded_balance").eq("company_id",w.membership.company_id),
      supabase.from("project_financial_positions").select("project_id,name,received,spent,funding_position,status").eq("company_id",w.membership.company_id),
      supabase.from("transactions").select("id,transaction_date,title,description,amount,kind,project_id").eq("company_id",w.membership.company_id).eq("status","posted").order("transaction_date",{ascending:false}).limit(12),
    ]);
    const firstError=ae||pe||te;if(firstError)throw firstError;
    setAccounts(a??[]);setProjects(p??[]);setTransactions(t??[]);setLoading(false);setRefreshing(false);
  },[]);

  useFocusEffect(useCallback(()=>{load().catch((e:any)=>{setError(e?.message||"Could not load Money");setLoading(false);setRefreshing(false);});},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={styles.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;

  const recordedCash=accounts.reduce((sum,row)=>sum+Number(row.recorded_balance||0),0);
  const received=projects.reduce((sum,row)=>sum+Number(row.received||0),0);
  const spent=projects.reduce((sum,row)=>sum+Number(row.spent||0),0);
  const position=projects.reduce((sum,row)=>sum+Number(row.funding_position||0),0);

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load().catch((e:any)=>{setError(e?.message||"Could not refresh Money");setRefreshing(false);})}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="CHARISMAK APP · MONEY" title="Know where the money went" subtitle="This internal build reads the current live Accounting ledger. New forecast, commitment and approval layers stay gated until their backend is approved."/>

    {!!error&&<Card style={styles.errorCard}><Text style={styles.errorTitle}>Could not load all Money data</Text><Text style={styles.errorCopy}>{error}</Text></Card>}

    <View style={b.grid}>
      <View style={b.half}><Stat label="Recorded account cash" value={money(recordedCash)} note={`${accounts.length} account${accounts.length===1?"":"s"}`}/></View>
      <View style={b.half}><Stat label="Project received" value={money(received)} note={`${projects.length} project${projects.length===1?"":"s"}`}/></View>
      <View style={b.half}><Stat label="Project spend" value={money(spent)} note="Posted expenses"/></View>
      <View style={b.half}><Stat label="Funding position" value={money(position)} note="Received less recorded spend" tone={position<0?"orange":"navy"}/></View>
    </View>

    <View style={styles.actions}>
      <Pressable style={styles.primary} onPress={()=>router.push("/(tabs)/projects")}><Text style={styles.primaryTitle}>Projects</Text><Text style={styles.primaryCopy}>See each project's received, spent and balance.</Text></Pressable>
      <Pressable style={styles.secondary} onPress={()=>router.push("/(tabs)/add")}><Text style={styles.secondaryTitle}>Add records</Text><Text style={styles.secondaryCopy}>BOQ upload is ready; general intake remains gated.</Text></Pressable>
    </View>

    <SectionHead title="Recorded accounts"/>
    {accounts.length?accounts.map(a=><Card key={a.account_id}><View style={b.row}><View style={{flex:1}}><Text style={styles.accountName}>{a.name}</Text><Text style={styles.accountMeta}>{String(a.account_type||"account").replaceAll("_"," ")} · {a.currency_code||"NGN"}</Text></View><Text style={styles.accountAmount}>{money(a.recorded_balance)}</Text></View></Card>):<Card><Text style={b.muted}>No recorded financial accounts yet.</Text></Card>}

    <SectionHead title="Recent posted money activity"/>
    {transactions.length?transactions.map(t=>{const signed=t.kind==="income"?Number(t.amount||0):t.kind==="expense"?-Number(t.amount||0):0;return <View key={t.id} style={styles.tx}><View style={{flex:1}}><Text numberOfLines={1} style={styles.txTitle}>{t.title||t.description||"Transaction"}</Text><Text style={styles.txMeta}>{t.transaction_date} · {String(t.kind||"movement").replaceAll("_"," ")}</Text></View><Text style={[styles.txAmount,{color:signed<0?"#a9443b":"#087450"}]}>{t.kind==="transfer"?"Transfer":money(signed)}</Text></View>}):<Card><Text style={b.muted}>No posted transactions yet.</Text></Card>}

    <Card style={styles.gatedCard}><Text style={styles.gatedEye}>V0.1 SAFETY</Text><Text style={styles.gatedTitle}>Approvals, commitments and forecast are not enabled in this APK</Text><Text style={styles.gatedCopy}>Those controls require the reviewed project-cost backend. They will not appear as working buttons until the required migrations are explicitly approved.</Text></Card>
  </ScrollView></SafeAreaView>;
}

const styles=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},actions:{flexDirection:"row",gap:9},primary:{flex:1,backgroundColor:"#073f65",borderRadius:15,padding:14},primaryTitle:{fontSize:14,fontWeight:"900",color:"#fff"},primaryCopy:{fontSize:9,lineHeight:14,color:"#c8dce9",marginTop:4},secondary:{flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#d7e3ea",borderRadius:15,padding:14},secondaryTitle:{fontSize:14,fontWeight:"900",color:"#173b55"},secondaryCopy:{fontSize:9,lineHeight:14,color:"#718492",marginTop:4},accountName:{fontSize:12,fontWeight:"900",color:"#173b55"},accountMeta:{fontSize:9,color:"#7c8d99",marginTop:3,textTransform:"capitalize"},accountAmount:{fontSize:13,fontWeight:"900",color:"#0a456c"},tx:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#e2e8ec"},txTitle:{fontSize:10,fontWeight:"800",color:"#29475c"},txMeta:{fontSize:8,color:"#84929c",marginTop:3},txAmount:{fontSize:9,fontWeight:"900"},gatedCard:{backgroundColor:"#fff8e8",borderColor:"#ecd9a7"},gatedEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#866416"},gatedTitle:{fontSize:13,fontWeight:"900",color:"#55451d",marginTop:4},gatedCopy:{fontSize:10,lineHeight:15,color:"#74694f",marginTop:4},errorCard:{borderColor:"#e4b9b9",backgroundColor:"#fff8f8"},errorTitle:{fontSize:13,fontWeight:"900",color:"#7f2929"},errorCopy:{fontSize:10,lineHeight:15,color:"#815858",marginTop:4}});
