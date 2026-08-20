import { redirect } from "next/navigation";

export default function UploadStatementPage() {
  redirect("/add?from=statements");
}
