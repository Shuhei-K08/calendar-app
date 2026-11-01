import { redirect } from "next/navigation";

// 「ふたり」は設定の中に移動しました
export default function ConnectPage() {
  redirect("/settings?p=partner");
}
