// 外部のページを取りに行くとき、社内ネットワークやサーバー自身（localhost など）には行かないようにする
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const privateV4 = (ip: string) => {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
};

const privateV6 = (ip: string) => {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  return mapped ? privateV4(mapped[1]) : false;
};

const isPrivateIp = (ip: string) => (isIP(ip) === 4 ? privateV4(ip) : isIP(ip) === 6 ? privateV6(ip) : true);

/** http(s) の普通のサイトなら true。社内アドレス・localhost・変なポートは false */
export async function isSafePublicUrl(raw: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  if (isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

/** リダイレクト先も1回ずつ確かめながら取りに行く（最大5回） */
export async function safeFetch(url: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    if (!(await isSafePublicUrl(current))) throw new Error("blocked url");
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location") as string, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}
