import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { baseStyles as b, Card, money, ScreenTitle, SectionHead, Stat } from "../components/ui";

export default function Treasury(){
  const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [accounts,setAccounts]=useState<any[]>([]);const [transfers,setTransfers]=useState<any[]>([]);
  const load=useCallback(async()=>{const w=await loadWorkspace();const [{data:a},{data:t}]=await Promise.all([
    supabase.from("financial_accounts").select("id,institution_name,account_name,account_type,current_balance,balance_as_of,last_statement_at").eq("company_id",w.membership.company_id).eq("is_active",true).order("institution_name"),
    supabase.from("internal_transfers").select("id,amount,transfer_date,status,transfer_type,from_account_id,to_account_id,from_project_id,to_project_id,description").eq("company_id",w.membership.company_id).order("transfer_date",{ascending:false}).limit(20),
  ]);setAccounts(a??[]);setTransfers(t??[]);setLoading(false);setRefreshing(false)},[]);
  useFocusEffect(useCallback(()=>{load().catch(()=>setLoading(false))},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  const known=accounts.filter(a=>a.current_balance!==null&&a.current_balance!==undefined);const total=known.reduce((n,a)=>n+Number(a.current_balance||0),0);
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="MONEY" title="Treasury" subtitle="Where company and project money currently sits. Balances remain pending until a statement provides a reliable balance."/>
    <View style={b.grid}><View style={b.half}><Stat label="Recorded cash" value={known.length?money(total):"Pending"} note={`${known.length}/${accounts.length} balances known`}/></View><View style={b.half}><Stat label="Accounts" value={String(accounts.length)} note="Banks, wallets and cash"/></View></View>
    <SectionHead title="Banks & wallets"/>{accounts.map(a=><Card key={a.id}><View style={b.row}><View style={{flex:1}}><Text style={s.name}>{a.institution_name||a.account_name}</Text><Text style={s.note}>{a.account_name} · {String(a.account_type||"").replaceAll("_"," ")}</Text></View><Text style={s.amount}>{a.current_balance==null?"Balance pending":money(a.current_balance)}</Text></View><Text style={s.asof}>{a.balance_as_of?`Balance as at ${a.balance_as_of}`:a.last_statement_at?`Last statement ${new Date(a.last_statement_at).toLocaleDateString("en-NG")}`:"No statement balance yet"}</Text></Card>)}
    <SectionHead title="Recent internal movements"/>{transfers.length?transfers.map(t=><Card key={t.id}><View style={b.row}><View style={{flex:1}}><Text style={s.name}>{String(t.transfer_type||"Internal transfer").replaceAll("_"," ")}</Text><Text style={s.note}>{t.description||`${t.transfer_date} · ${t.status}`}</Text></View><Text style={s.amount}>{money(t.amount)}</Text></View></Card>):<Card><Text style={b.muted}>No recorded internal transfers yet.</Text></Card>}
  </ScrollView></SafeAreaView>
}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},name:{fontSize:13,fontWeight:"900",color:"#183a52",textTransform:"capitalize"},note:{fontSize:9,color:"#7c8d99",marginTop:3,textTransform:"capitalize"},amount:{fontSize:13,fontWeight:"900",color:"#0a456c",maxWidth:150,textAlign:"right"},asof:{fontSize:8,color:"#8a98a3",marginTop:10}});
