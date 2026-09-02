import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const tools = [
  {title:"Add Money Record",note:"Upload or record statements, receipts, bills and transactions.",route:"/(tabs)/add"},
  {title:"Approvals",note:"Review payment, stipend and other requests that need a decision.",route:"/(tabs)/approvals"},
  {title:"Treasury",note:"See accounts, available funds and money position.",route:"/treasury"},
  {title:"Review",note:"Resolve records that need confirmation before they become accounting truth.",route:"/review"},
  {title:"Audit",note:"Review important accounting and access history.",route:"/audit"},
] as const;

export default function MoneyTab(){
  const router=useRouter();
  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CHARISMAK APP · MONEY</Text>
        <Text style={styles.title}>Know where every naira went.</Text>
        <Text style={styles.subtitle}>Accounting remains the financial source of truth. Estimates and BOQs become reviewed budgets; transactions remain actual money.</Text>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>PROJECT COST FLOW</Text>
        <Text style={styles.summaryText}>Estimate → Approved Budget → Commitments → Actual Spend → Forecast → Profitability</Text>
      </View>

      <View style={styles.tools}>
        {tools.map((tool)=><Pressable key={tool.title} onPress={()=>router.push(tool.route)} style={styles.card}>
          <View style={{flex:1,gap:4}}><Text style={styles.cardTitle}>{tool.title}</Text><Text style={styles.cardText}>{tool.note}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>)}
      </View>

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Budget vs Actual</Text>
        <Text style={styles.noteText}>The new shared project-cost core will connect BOQ cost codes to commitments and actual transactions without letting AI silently post financial records.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f4f7fa"},
  page:{padding:16,paddingBottom:100,gap:14},
  header:{backgroundColor:"#082945",borderRadius:20,padding:20,gap:7},
  eyebrow:{fontSize:10,fontWeight:"900",letterSpacing:1.4,color:"#9ec5df"},
  title:{fontSize:24,fontWeight:"900",color:"#fff"},
  subtitle:{fontSize:12,lineHeight:18,color:"#d7e5ef"},
  summary:{backgroundColor:"#eaf5f1",borderRadius:15,padding:14,gap:5,borderWidth:1,borderColor:"#cde4da"},
  summaryLabel:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#16825c"},
  summaryText:{fontSize:12,lineHeight:18,fontWeight:"700",color:"#245642"},
  tools:{gap:9},
  card:{flexDirection:"row",alignItems:"center",gap:12,backgroundColor:"#fff",borderRadius:15,padding:15,borderWidth:1,borderColor:"#dbe5ec"},
  cardTitle:{fontSize:15,fontWeight:"800",color:"#14354d"},
  cardText:{fontSize:11,lineHeight:17,color:"#687c8c"},
  chevron:{fontSize:26,color:"#7690a2"},
  note:{backgroundColor:"#fff",borderRadius:15,padding:15,borderWidth:1,borderColor:"#dbe5ec",gap:5},
  noteTitle:{fontSize:15,fontWeight:"900",color:"#14354d"},
  noteText:{fontSize:11,lineHeight:17,color:"#687c8c"},
});
