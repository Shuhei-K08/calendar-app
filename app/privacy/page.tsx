import type { Metadata } from "next";
import Link from "next/link";
import { ShareCalLogo } from "@/app/components/AppNavigation";

// プライバシーポリシー（ログインしなくても見られる。Google ログインの同意画面からもリンクする）
export const metadata: Metadata = {
  title: "プライバシーポリシー | ShareCal",
  description: "ShareCal が取り扱う情報と、その使い方について",
};

const CONTACT_EMAIL = "shuheikubo1208@gmail.com";
const UPDATED = "2026年11月7日";

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. このポリシーについて",
    body: (
      <p>
        ShareCal（以下「本アプリ」）は、予定やカレンダーを相手と共有するためのアプリです。このページでは、本アプリが取り扱う情報と、その使い方を説明します。
      </p>
    ),
  },
  {
    title: "2. 取得する情報",
    body: (
      <ul>
        <li>アカウント情報：メールアドレス、パスワード（暗号化して保存）、ニックネーム、名前（本名・任意）</li>
        <li>Google でログインした場合：Google アカウントのメールアドレス、名前、プロフィール画像の URL</li>
        <li>あなたが入力した情報：予定、繰り返しの予定、やること、リンク・行きたい場所、勤怠の記録、コメントやスタンプ、予定に添付した画像</li>
        <li>つながりの情報：つながっている相手、共有の設定</li>
        <li>通知の情報：プッシュ通知を受け取るための端末ごとの登録情報と、通知の設定</li>
        <li>端末に保存する設定：テーマや表示の設定などは、お使いの端末（ブラウザ）にだけ保存します</li>
      </ul>
    ),
  },
  {
    title: "3. 使う目的",
    body: (
      <ul>
        <li>ログインと、あなたのアカウントを見分けるため</li>
        <li>予定などを保存し、あなたが選んだ相手と共有するため</li>
        <li>リマインドや、共有・コメントのお知らせを届けるため</li>
        <li>勤怠表など、あなたが書き出す書類を作るため（名前を記入します）</li>
        <li>画像から予定を読み取る機能（OCR）のため</li>
        <li>不正な利用を防ぎ、本アプリを安定して動かすため</li>
      </ul>
    ),
  },
  {
    title: "4. 情報を見られる人",
    body: (
      <p>
        予定やプロフィールは、あなた自身と、あなたがつながった相手のうち共有を選んだ相手だけが見られます。本アプリの管理者は、運営とサポートに必要な範囲（アカウントの一覧など）でのみ情報を確認することがあります。法令にもとづく場合を除き、あなたの同意なく第三者に提供することはありません。広告のために情報を使ったり、販売したりすることもありません。
      </p>
    ),
  },
  {
    title: "5. 利用している外部のサービス",
    body: (
      <ul>
        <li>Supabase：アカウント、データ、画像の保存</li>
        <li>Vercel：本アプリの配信</li>
        <li>Google：Google アカウントでのログイン</li>
        <li>Google Gemini API：画像から予定を読み取る機能を使ったときに、その画像を送ります</li>
        <li>HeartRails Geo API：場所を入力するときの市区町村の候補（あなたの情報は送りません）</li>
      </ul>
    ),
  },
  {
    title: "6. Google アカウントの情報について",
    body: (
      <p>
        Google でログインしたときに受け取る情報（メールアドレス、名前、プロフィール画像の URL）は、ログインとアカウントの表示にだけ使います。Google のカレンダーやメールなど、そのほかのデータを読み取ることはありません。
      </p>
    ),
  },
  {
    title: "7. 保存期間と削除",
    body: (
      <p>
        情報は、あなたがアカウントを使っている間保存します。設定画面の「アカウントを削除」から、いつでもアカウントと保存した情報を削除できます。
      </p>
    ),
  },
  {
    title: "8. 変更について",
    body: <p>このポリシーを変更するときは、このページでお知らせします。</p>,
  },
  {
    title: "9. お問い合わせ",
    body: (
      <p>
        本アプリの情報の取り扱いについてのお問い合わせは、<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> までご連絡ください。
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="page-shell min-h-screen px-4 py-8 text-[var(--fg)] sm:px-6">
      <article className="mx-auto max-w-2xl rounded-3xl border border-[#d9e2ef] bg-white p-5 shadow-[0_24px_70px_rgb(15_23_42_/_8%)] sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <ShareCalLogo />
          <Link href="/" className="text-sm font-bold text-[#0f766e]">
            ShareCal へ
          </Link>
        </div>
        <h1 className="text-2xl font-black text-[#0f172a]">プライバシーポリシー</h1>
        <p className="mt-2 text-sm text-[#64748b]">最終更新日：{UPDATED}</p>
        <div className="privacy-body mt-6 space-y-6 text-sm leading-7 text-[#334155]">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="mb-2 text-base font-black text-[#0f172a]">{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
