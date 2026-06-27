import knownScams from "@/data/known-scams-base.json";

const LOCAL_HIDDEN_KEY = "dust-sweep-hidden-tokens";
const LOCAL_REPORTS_KEY = "dust-sweep-reported-scams";

export type ScamEntry = {
  address: string;
  reason: string;
};

export function getKnownScamAddresses(): Set<string> {
  return new Set(
    knownScams
      .map((e) => e.address.toLowerCase())
      .filter((a) => a !== "0x0000000000000000000000000000000000000000"),
  );
}

export function getKnownScamReason(address: string): string | undefined {
  const entry = knownScams.find(
    (e) => e.address.toLowerCase() === address.toLowerCase(),
  );
  return entry?.reason;
}

export function getHiddenTokens(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(LOCAL_HIDDEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function hideToken(address: string): void {
  const hidden = getHiddenTokens();
  hidden.add(address.toLowerCase());
  localStorage.setItem(LOCAL_HIDDEN_KEY, JSON.stringify([...hidden]));
}

export function unhideToken(address: string): void {
  const hidden = getHiddenTokens();
  hidden.delete(address.toLowerCase());
  localStorage.setItem(LOCAL_HIDDEN_KEY, JSON.stringify([...hidden]));
}

export function reportScamToken(address: string, reason: string): void {
  hideToken(address);
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
    const reports = raw ? (JSON.parse(raw) as ScamEntry[]) : [];
    reports.push({ address: address.toLowerCase(), reason });
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(reports));
  } catch {
    /* ignore */
  }
}

export function getLocalReports(): ScamEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_REPORTS_KEY);
    return raw ? (JSON.parse(raw) as ScamEntry[]) : [];
  } catch {
    return [];
  }
}

export function isScamAddress(
  address: string,
  blockscoutFlag?: boolean | null,
): boolean {
  if (blockscoutFlag) return true;
  return getKnownScamAddresses().has(address.toLowerCase());
}
