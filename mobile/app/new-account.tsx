import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { Card, ScreenTitle, baseStyles as b, palette } from "../components/ui";
import { readableError } from "../lib/mobile-error";

const ACCOUNT_TYPES=[
  ["bank","Bank account"],["wallet","Wallet / fintech"],["cash","Cash"]
] as const;

export default function NewAccount(){
  const [name,setName]=useState("");
  const [type,setType]=useState<(typeof ACCOUNT_TYPES)[number][0]>("bank");
  const [busy,setBusy]=useState(false);

  async function save(){
    if(!name.trim())return Alert.alert("Account name","Enter a short name such as UBA Business, OPay Wallet or Site Cash.");
    setBusy(true);
    try{
      const w=await loadWorkspace();
      const {error}=await supabase.from("financial_accounts").insert({
        company_id:w.membership.company_id,
        name:name.trim(),
        account_type:type,
        currency_code:"NGN",
        is_active:true,
        created_by:w.user.id,
      });
      if(error)throw error;
      Alert.alert("Account added","The account is ready. Its recorded balance will come from posted accounting activity, not a manually typed balance.",[{text:"Continue",onPress:()=>router.replace("/(tabs)/money")}]);
    }catch(e){Alert.alert("Could not add account",readableError(e));}
    finally{setBusy(false);}
  }

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content} keyboardShouldPersistTaps="handled">
    <Pressable onPress={()=>router.back()}><Text style={s.back}>← Back</Text></Pressable>
    <ScreenTitle eyebrow="ACCOUNT" title="Add an account" subtitle="Usually you can upload a statement first and Charismak will match or create the account. Use this only when you want to add one manually."/>
    <Card style={s.form}>
      <Text style={s.label}>Account type</Text>
      <View style={s.chips}>{ACCOUNT_TYPES.map(([value,label])=><Pressable key={value} onPress={()=>setType(value)} style={[s.chip,type===value&&s.chipActive]}><Text style={[s.chipText,type===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
      <Field label="Account name" value={name} onChange={setName} placeholder={type==="wallet"?"e.g. OPay Wallet":type==="cash"?"e.g. Site Cash":"e.g. UBA Business"}/>
      <View style={s.note}><Text style={s.noteTitle}>No opening-balance box.</Text><Text style={s.noteCopy}>Recorded balance comes from the ledger. That prevents a typed balance from being mistaken for income or hiding real money movements.</Text></View>
      <Pressable disabled={busy} onPress={save} style={[s.button,busy&&{opacity:.5}]}><Text style={s.buttonText}>{busy?"Saving…":"Add account"}</Text></Pressable>
    </Card>
  </ScrollView></SafeAreaView>;
}

function Field({label,value,onChange,placeholder}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} style={s.input}/></View>}

const s=StyleSheet.create({back:{fontSize:15,fontWeight:"800",color:palette.navy,fontFamily:"sans-serif"},form:{gap:15},field:{gap:7},label:{fontSize:14,fontWeight:"800",color:"#38566b",fontFamily:"sans-serif"},input:{minHeight:56,borderWidth:1,borderColor:"#cbd9e2",borderRadius:14,paddingHorizontal:14,fontSize:17,color:palette.ink,backgroundColor:"#fff",fontFamily:"sans-serif"},chips:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{paddingVertical:10,paddingHorizontal:12,borderRadius:12,borderWidth:1,borderColor:"#cfdce5",backgroundColor:"#fff"},chipActive:{backgroundColor:palette.navy,borderColor:palette.navy},chipText:{fontSize:13,fontWeight:"800",color:"#526b7b",fontFamily:"sans-serif"},chipTextActive:{color:"#fff"},note:{backgroundColor:"#eef5f8",borderRadius:13,padding:13},noteTitle:{fontSize:14,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},noteCopy:{fontSize:13,lineHeight:19,color:"#627987",marginTop:3,fontFamily:"sans-serif"},button:{minHeight:56,borderRadius:14,backgroundColor:palette.navy,alignItems:"center",justifyContent:"center"},buttonText:{fontSize:16,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"}});