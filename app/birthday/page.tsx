"use client";

// 誕生日の特設ページ
//  - 誕生日までは「カウントダウン」、当日は「おめでとう」の画面（日本時間で切り替え）
//  - 見られるのは本人と、つながっている相手だけ（URL: /birthday?u=<相手のID>。なしは自分）
//  - 本人だけ、下の「特設ページの設定」で誕生日と写真を入れられる
//  - 試すとき：?view=today で当日の画面、?view=countdown でカウントダウン
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { jstToday } from "@/lib/season";
import {
  ALBUM_MAX,
  COUNTDOWN_DAYS,
  addBirthdayPhoto,
  fetchBirthdayPhotos,
  msUntil,
  nextBirthday,
  removeBirthdayPhoto,
  type BirthdayPhoto,
  type PhotoSlot,
} from "@/lib/birthday";

const FONTS =
  "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Shippori+Mincho+B1:wght@700;800&display=swap";
const TILTS = [-5, 4, -3, 3, -4, 2];

type Person = { id: string; username: string; birthday: string | null };
type Load = { state: "loading" } | { state: "denied" } | { state: "ready"; me: string; person: Person };

const pad = (n: number) => String(n).padStart(2, "0");
const isLatin = (s: string) => /^[\x20-\x7e]+$/.test(s);
const weekday = (date: string) => "日月火水木金土"[new Date(`${date}T00:00:00Z`).getUTCDay()];

export default function BirthdayPage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [photos, setPhotos] = useState<BirthdayPhoto[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [forced, setForced] = useState<"today" | "countdown" | null>(null);

  const reload = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const me = auth.user?.id;
    if (!me) {
      window.location.href = "/login";
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const id = params.get("u") || me;
    const v = params.get("view");
    setForced(v === "today" || v === "countdown" ? v : null);
    const { data, error } = await supabase.from("profiles").select("id, username, birthday").eq("id", id).maybeSingle();
    if (error || !data) {
      setLoad(id === me ? { state: "ready", me, person: { id: me, username: "", birthday: null } } : { state: "denied" });
      return;
    }
    const p = data as { id: string; username: string | null; birthday: string | null };
    setLoad({ state: "ready", me, person: { id: p.id, username: p.username ?? "", birthday: p.birthday } });
    setPhotos(await fetchBirthdayPhotos(p.id));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [reload]);

  if (load.state === "loading") return <main className="bd-page is-loading" aria-busy="true" />;
  if (load.state === "denied")
    return (
      <main className="bd-page">
        <div className="bd-empty">
          <p>このページは、本人とつながっている相手だけが見られます。</p>
          <Link href="/">カレンダーにもどる</Link>
        </div>
      </main>
    );

  const { me, person } = load;
  const isOwner = me === person.id;
  const today = jstToday(now);
  const nb = person.birthday ? nextBirthday(person.birthday, today) : null;
  const showToday = forced ? forced === "today" : !!nb?.isToday;
  const name = person.username || "あなた";
  const hero = photos.find((p) => p.slot === "hero");
  const todayCut = photos.find((p) => p.slot === "today") ?? hero;
  const album = photos.filter((p) => p.slot === "album").slice(0, ALBUM_MAX);

  return (
    <>
      <link rel="stylesheet" href={FONTS} precedence="default" />
      {!nb ? (
        <main className="bd-page">
          <div className="bd-empty">
            <p>{isOwner ? "誕生日を入れると、特設ページができます。" : `${name}さんは、まだ誕生日を入れていません。`}</p>
            <Link href="/">カレンダーにもどる</Link>
          </div>
          {isOwner && <OwnerPanel me={me} person={person} photos={photos} onChange={reload} open />}
        </main>
      ) : showToday ? (
        <TodayView name={name} age={nb.age} date={nb.date} cut={todayCut} album={album} />
      ) : (
        <CountdownView name={name} age={nb.age} date={nb.date} left={msUntil(nb.date, now)} today={today} hero={hero} album={album} />
      )}
      {nb && isOwner && (
        <div className="bd-owner-wrap">
          <OwnerPanel me={me} person={person} photos={photos} onChange={reload} />
        </div>
      )}
    </>
  );
}

function Album({ album, dark }: { album: BirthdayPhoto[]; dark?: boolean }) {
  if (!album.length) return null;
  return (
    <div className={`bd-album${dark ? " is-dark" : ""}`}>
      {album.map((p, i) => (
        <figure key={p.id} className="bd-polaroid" style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt="思い出の写真" />
        </figure>
      ))}
    </div>
  );
}

function CountdownView({
  name,
  age,
  date,
  left,
  today,
  hero,
  album,
}: {
  name: string;
  age: number;
  date: string;
  left: number;
  today: string;
  hero?: BirthdayPhoto;
  album: BirthdayPhoto[];
}) {
  const sec = Math.floor(left / 1000);
  const days = Math.floor(sec / 86400);
  const decade = age % 10 === 0 && age >= 20;
  // 誕生日の約1か月前から当日までのバー（過ぎた日は墨、今日と誕生日は朱）
  const start = Date.parse(`${date}T00:00:00Z`) - COUNTDOWN_DAYS * 86400000;
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const ticks = Array.from({ length: COUNTDOWN_DAYS + 1 }, (_, i) => {
    const t = start + i * 86400000;
    return i === COUNTDOWN_DAYS || t === todayMs ? "is-hot" : t < todayMs ? "is-past" : "";
  });
  const md = `${Number(date.slice(5, 7))}.${pad(Number(date.slice(8, 10)))}`;

  return (
    <main className="bd-page bd-countdown">
      <div className="bd-top">
        <Link href="/" className="bd-back" aria-label="カレンダーにもどる">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          SHARECAL
        </Link>
        <span>VOL.{age} ／ {md} {weekday(date)}</span>
      </div>
      <h1 className={`bd-mast${isLatin(name) ? "" : " is-ja"}`}>{isLatin(name) ? name.toUpperCase() : name}</h1>
      <div className="bd-hero">
        <span className="bd-sun" aria-hidden="true" />
        {hero && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="bd-hero-cut" src={hero.url} alt={`${name}さん`} />
        )}
        <div className="bd-count">
          <p className="bd-mono">DAYS TO {age}</p>
          <p className="bd-days" aria-label={`あと${days}日`}>{days}</p>
          <div className="bd-hms bd-mono" aria-label={`${Math.floor((sec % 86400) / 3600)}時間${Math.floor((sec % 3600) / 60)}分`}>
            <span><b>{pad(Math.floor((sec % 86400) / 3600))}</b><small>HRS</small></span>
            <span><b>{pad(Math.floor((sec % 3600) / 60))}</b><small>MIN</small></span>
            <span className="is-hot"><b>{pad(sec % 60)}</b><small>SEC</small></span>
          </div>
          <p className="bd-lead">
            {decade ? (
              <>
                {age - 10}代、<br />
                {days > 0 ? `ラスト${days}日。` : "最後の日。"}
              </>
            ) : (
              <>
                {age}歳まで、<br />
                {days > 0 ? `あと${days}日。` : "あと少し。"}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="bd-ticks" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${ticks.length}, minmax(0, 1fr))` }}>
        {ticks.map((c, i) => (
          <span key={i} className={c} />
        ))}
      </div>
      <p className="bd-ticks-label bd-mono">
        <span>あと{days}日</span>
        <span className="is-hot">{md} = {age}</span>
      </p>
      {album.length > 0 && <p className="bd-kicker bd-mono">PHOTOS — {age - 1}歳のいい日たち</p>}
      <Album album={album} />
    </main>
  );
}

function TodayView({ name, age, date, cut, album }: { name: string; age: number; date: string; cut?: BirthdayPhoto; album: BirthdayPhoto[] }) {
  return (
    <main className="bd-page bd-today">
      <span className="bd-frame" aria-hidden="true" />
      <div className="bd-top">
        <span className="is-gold">{date.replaceAll("-", ".")} {weekday(date)}</span>
        <Link href="/" className="bd-close" aria-label="閉じて、カレンダーにもどる">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </Link>
      </div>
      <div className="bd-today-hero">
        <p className="bd-happy">Happy</p>
        <span className="bd-age" aria-hidden="true">{age}</span>
        {cut && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="bd-today-cut" src={cut.url} alt={`${name}さん`} />
        )}
      </div>
      <h1 className="bd-congrats">{name}、{age}歳おめでとう。</h1>
      <Album album={album} dark />
    </main>
  );
}

function OwnerPanel({ me, person, photos, onChange, open }: { me: string; person: Person; photos: BirthdayPhoto[]; onChange: () => Promise<void>; open?: boolean }) {
  const [birthday, setBirthday] = useState(person.birthday ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pending = useRef<PhotoSlot>("album");
  const fileRef = useRef<HTMLInputElement>(null);
  const album = photos.filter((p) => p.slot === "album");

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await onChange();
      setMsg(done);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMsg(/birthday/.test(text) ? "保存の準備ができていません（supabase-birthday.sql を実行してください）" : `うまくいきませんでした：${text}`);
    } finally {
      setBusy(false);
    }
  };

  const pick = (slot: PhotoSlot) => {
    pending.current = slot;
    fileRef.current?.click();
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const slot = pending.current;
    void run(() => addBirthdayPhoto(me, slot, file, slot === "album" ? album.length : 0), "写真を入れました");
  };

  const slotPhoto = (slot: PhotoSlot) => photos.find((p) => p.slot === slot);

  return (
    <details className="bd-owner" open={open}>
      <summary>特設ページの設定（本人だけに表示）</summary>
      <div className="bd-owner-body">
        <label className="bd-field">
          <span>誕生日</span>
          <span className="bd-row">
            <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} disabled={busy} />
            <button
              type="button"
              disabled={busy || !birthday || birthday === person.birthday}
              onClick={() =>
                void run(async () => {
                  const { error } = await supabase.from("profiles").update({ birthday }).eq("id", me);
                  if (error) throw error;
                }, "誕生日を保存しました")
              }
            >
              保存
            </button>
          </span>
        </label>
        <p className="bd-hint">誕生日の約1か月前から、あなたと、つながっている相手のカレンダーの上にカウントダウンが出ます。当日は、おめでとうの画面に変わります。</p>

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />

        {(["hero", "today"] as const).map((slot) => {
          const p = slotPhoto(slot);
          return (
            <div key={slot} className="bd-slot">
              <div className="bd-slot-text">
                <b>{slot === "hero" ? "カウントダウンの切り抜き" : "当日の切り抜き"}</b>
                <small>{slot === "hero" ? "全身の写真がおすすめ" : "なければカウントダウンと同じ写真"}</small>
              </div>
              {p && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="bd-thumb is-cut" />
              )}
              <button type="button" disabled={busy} onClick={() => pick(slot)}>{p ? "変える" : "入れる"}</button>
              {p && <button type="button" className="is-quiet" disabled={busy} onClick={() => void run(() => removeBirthdayPhoto(p.id, p.path), "消しました")}>消す</button>}
            </div>
          );
        })}
        <p className="bd-hint">背景を切り抜いた PNG を使うと、雑誌の表紙のようになります（iPhone の写真アプリで人を長押しすると切り抜けます）。</p>

        <div className="bd-slot is-album">
          <div className="bd-slot-text">
            <b>写真（{album.length}/{ALBUM_MAX}）</b>
            <small>この1年の思い出</small>
          </div>
          <button type="button" disabled={busy || album.length >= ALBUM_MAX} onClick={() => pick("album")}>追加</button>
        </div>
        {album.length > 0 && (
          <ul className="bd-thumbs">
            {album.map((p) => (
              <li key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="bd-thumb" />
                <button type="button" aria-label="この写真を消す" disabled={busy} onClick={() => void run(() => removeBirthdayPhoto(p.id, p.path), "消しました")}>×</button>
              </li>
            ))}
          </ul>
        )}
        <p className="bd-row">
          <a href="?view=countdown">カウントダウンを見る</a>
          <a href="?view=today">当日の画面を見る</a>
        </p>
        {msg && <p className="bd-msg" role="status">{msg}</p>}
      </div>
    </details>
  );
}
