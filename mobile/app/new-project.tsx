import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { baseStyles as b, Card, ScreenTitle } from "../components/ui";

const uniqueKeywords=(values:string[])=>Array.from(new Set(values.map(v=>v.trim()).filter(Boolean)));

function newProjectId(){
  const cryptoObject=(globalThis as typeof globalThis&{crypto?:{randomUUID?:()=>string}}).crypto;
  if(cryptoObject?.randomUUID)return cryptoObject.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,(char)=>{
    const random=Math.floor(Math.random()*16);
    const value=char==="x"?random:(random&0x3)|0x8;
    return value.toString(16);
  });
}

function errorMessage(error:unknown){
  if(error instanceof Error&&error.message)return error.message;
  if(error&&typeof error==="object"&&"message" in error){
    const message=String((error as {message?:unknown}).message??"").trim();
    if(message)return message;
  }
  return "Please try again.";
}

export default function NewProject(){
  const [name,setName]=useState("");
  const [location,setLocation]=useState("");
  const [code,setCode]=useState("");
  const [client,setClient]=useState("");
  const [busy,setBusy]=useState(false);

  async function create(){
    if(!name.trim()||!location.trim())return Alert.alert("Project details","Project name and location are required.");
    setBusy(true);
    try{
      const w=await loadWorkspace();
      const role=String(w.membership.role||"").toLowerCase();
      if(role!=="md"&&role!=="owner")throw new Error("Only the MD can create a live project right now.");
      const projectName=name.trim();
      const projectCode=code.trim().toUpperCase()||null;
      const clientName=client.trim()||null;
      const projectLocation=location.trim();
      const projectId=newProjectId();

      // Do not chain .select()/RETURNING here. The live projects INSERT policy
      // is valid for MDs, while INSERT ... RETURNING also forces the new row
      // through the SELECT RLS policy in the same request and can reject the
      // otherwise-valid insert. We already know the UUID, so RETURNING is not
      // necessary.
      const {error}=await supabase.from("projects").insert({
        id:projectId,
        company_id:w.membership.company_id,
        project_code:projectCode,
        name:projectName,
        location:projectLocation,
        status:"active",
        reported_progress:0,
        created_by:w.user.id,
        client_name:clientName,
        import_keywords:uniqueKeywords([projectName,projectCode||"",clientName||""])
      });
      if(error)throw error;
      router.replace({pathname:"/project/[id]",params:{id:projectId}});
    }catch(error){Alert.alert("Could not create project",errorMessage(error));}
    finally{setBusy(false);}
  }

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content} keyboardShouldPersistTaps="handled">
    <ScreenTitle eyebrow="NEW PROJECT" title="Start with the job" subtitle="Only enter what identifies the project. BOQ, contract value, budget and money records come later when their source is available."/>
    <Card style={s.form}>
      <Field label="Project name" value={name} onChange={setName} placeholder="e.g. Jahi Residence" required/>
      <Field label="Location" value={location} onChange={setLocation} placeholder="e.g. Jahi, Abuja" required/>
      <Field label="Project code" value={code} onChange={setCode} placeholder="Optional, e.g. JAHI-01" caps/>
      <Field label="Client" value={client} onChange={setClient} placeholder="Optional"/>
      <View style={s.note}><Text style={s.noteTitle}>That is enough to start.</Text><Text style={s.noteCopy}>After creation, open the project and upload its BOQ. Charismak will keep the source bill separate from Money and from later procurement decisions.</Text></View>
      <Pressable disabled={busy} onPress={create} style={[s.button,busy&&s.disabled]}><Text style={s.buttonText}>{busy?"Creating…":"Create project"}</Text></Pressable>
    </Card>
  </ScrollView></SafeAreaView>;
}

function Field({label,value,onChange,placeholder,required,caps}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string;required?:boolean;caps?:boolean}){
  return <View style={s.field}><Text style={s.label}>{label}{required?" *":""}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} autoCapitalize={caps?"characters":"words"} style={s.input}/></View>;
}

const s=StyleSheet.create({
  form:{gap:16},field:{gap:7},label:{fontSize:13,fontWeight:"800",color:"#3e5a6d",fontFamily:"sans-serif"},input:{minHeight:54,borderWidth:1,borderColor:"#cfdae2",borderRadius:14,paddingHorizontal:14,fontSize:16,color:"#173f5a",backgroundColor:"#fff",fontFamily:"sans-serif"},note:{backgroundColor:"#f1f7fa",borderRadius:14,padding:14},noteTitle:{fontSize:14,fontWeight:"900",color:"#173f5a",fontFamily:"sans-serif"},noteCopy:{fontSize:13,lineHeight:20,color:"#627987",marginTop:4,fontFamily:"sans-serif"},button:{height:54,borderRadius:14,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center"},buttonText:{fontSize:15,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},disabled:{opacity:.5}
});