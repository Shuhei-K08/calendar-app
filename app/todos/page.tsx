import { redirect } from "next/navigation";

// TODO機能は廃止しました。リンク集ページへ転送します。
export default function TodosPage() {
  redirect("/links");
}
