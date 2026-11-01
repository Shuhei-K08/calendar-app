import { redirect } from "next/navigation";

export default function RequestsPage() {
  redirect("/settings?p=partner");
}
