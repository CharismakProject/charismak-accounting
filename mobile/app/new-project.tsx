import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { baseStyles as b, Card, ScreenTitle } from "../components/ui";

const num=(v:string)=>{const n=Number(v.replace(/[,₦\s]/g,""));return Number.isFinite(n)&&v.trim()!==""&&n>=0?n:null;};
const clean=(v:string)=>v.trim();
const unique=(values:string[])=>Array.from(new Set(values.map(value=>value.trim()).filter(Boolean)));

export default function NewProject(){
  const [code,setCode]=useState("");
  const [name,setName]=useState("");
  const [client,setClient]=useState("");
  const [location,setLocation]=useState("");
  const [type,setType]=useState("");
  const [contract,setContract]=useState("");
  const [aliases,setAliases]=useState("");
  const [busy,setBusy]=useState(false);

  async function create(){
    if(name.trim().length<2)return Alert.alert("Project name required","Enter the project name.");
    if(location.trim().length<2)return Alert.alert("Project location required","Enter the project location so records can be identified correctly.");
    setBusy(true);
    try{
      const w=await loadWorkspace();
      if(!w.membership.is_owner)throw new Error("Only the MD / Owner can create a project in this build.");
      const projectName=clean(name);const projectCode=clean(code).toUpperCase()||null;const clientName=clean(client)||null;const projectLocation=clean(location);const projectType=clean(type)||null;const contractValue=num(contract);
      const importKeywords=unique([projectName,projectCode??"",clientName??"",projectLocation,...aliases.split(",")]);
      const {data,error}=await supabase.from("projects").insert({
        company_id:w.membership.company_id,
        project_code:projectCode,
        name:projectName,
        location:projectLocation,
        status:"active",
        reported_progress:0,
        created_by:w.user.id,
        client_name:clientName,
        import_keywords:importKeywords,
        project_type:projectType,
        contract_value:contractValue,
      }).select("id").single();
      if(error)throw error;
      router.replace({pathname:"/project/[id]",params:{id:data.id}});
    }catch(e){Alert.alert("Could not create project",e instanceof Error?e.message:"Please try again.");}
    finally{setBusy(false);}
  }

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content} keyboardShouldPersistTaps="handled">
    <ScreenTitle eyebrow="NEW PROJECT" title="Start clean" subtitle="Create the project first. Then upload its BOQ and let Charismak review only the exceptions that need you."/>
    <Card style={s.form}>
      <Field label="Project name *" value={name} onChange={setName} placeholder="e.g. Two Bedroom Apartment"/>
      <Field label="Location *" value={location} onChange={setLocation} placeholder="e.g. Jahi, Abuja"/>
      <Field label="Project code" value={code} onChange={setCode} placeholder="Optional · e.g. JAHI-01"/>
      <Field label="Client / managed company" value={client} onChange={setClient} placeholder="Optional"/>
      <Field label="Project type" value={type} onChange={setType} placeholder="Residential, fit-out, civil…"/>
      <Field label="Contract / client value" value={contract} onChange={setContract} placeholder="Optional" keyboard="numeric"/>
      <Field label="Import keywords" value={aliases} onChange={setAliases} placeholder="Optional extra names, separated by commas"/>
      <View style={s.nextBox}><Text style={s.nextTitle}>After creation</Text><Text style={s.nextCopy}>Open the project and tap “Upload BOQ”. The project itself does not depend on any future clients/budget tables.</Text></View>
      <Pressable disabled={busy} onPress={create} style={[s.button,busy&&{opacity:.55}]}><Text style={s.buttonText}>{busy?"Creating project…":"Create project"}</Text></Pressable>
    </Card>
  </ScrollView></SafeAreaView>;
}

function Field({label,value,onChange,placeholder,keyboard}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string;keyboard?:"numeric"}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboard} autoCapitalize={label.toLowerCase().includes("code")?"characters":"sentences"} style={s.input}/></View>}

const s=StyleSheet.create({form:{gap:14},field:{gap:6},label:{fontSize:12,fontWeight:"900",color:"#4a6273",fontFamily:"sans-serif"},input:{height:49,borderWidth:1,borderColor:"#d8e3ea",borderRadius:12,paddingHorizontal:12,fontSize:14,color:"#183a52",backgroundColor:"#fff",fontFamily:"sans-serif"},nextBox:{backgroundColor:"#eef5f9",padding:12,borderRadius:11},nextTitle:{fontSize:12,fontWeight:"900",color:"#173f5a",fontFamily:"sans-serif"},nextCopy:{fontSize:11,lineHeight:16,color:"#617786",marginTop:4,fontFamily:"sans-serif"},button:{height:50,borderRadius:14,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center"},buttonText:{fontSize:14,fontWeight:"900",color:"white",fontFamily:"sans-serif"}});
