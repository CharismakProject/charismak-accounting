export type MatchableAccount = { id: string; name: string };

const STOP_WORDS = new Set([
  "account", "bank", "business", "current", "savings", "wallet", "charismak",
  "project", "projects", "nigeria", "limited", "ltd", "statement", "transactions",
]);

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function usefulTokens(value: string) {
  return normalize(value).split(" ").filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

function scoreAccount(fileName: string, account: MatchableAccount) {
  const file = normalize(fileName);
  const fileDigits = digits(fileName);
  const accountDigits = digits(account.name);
  let score = 0;

  if (accountDigits.length >= 4 && fileDigits.includes(accountDigits.slice(-4))) score += 10;
  for (const token of usefulTokens(account.name)) {
    if (file.includes(token)) score += token.length >= 5 ? 4 : 3;
  }
  return score;
}

export function matchStatementAccount(fileName: string, accounts: MatchableAccount[]) {
  if (!accounts.length) return null;
  if (accounts.length === 1) return accounts[0].id;

  const ranked = accounts
    .map(account => ({ id: account.id, score: scoreAccount(fileName, account) }))
    .sort((a, b) => b.score - a.score);
  const first = ranked[0];
  const second = ranked[1];
  return first.score >= 3 && first.score > (second?.score ?? 0) ? first.id : null;
}

export function suggestAccountName(fileName: string) {
  const text = normalize(fileName);
  if (text.includes("opay")) return "OPay";
  if (/(^| )uba( |$)/.test(text)) return "UBA Business";
  if (text.includes("access")) return "Access Bank";
  if (text.includes("zenith")) return "Zenith Bank";
  if (text.includes("gtbank") || text.includes("guaranty trust") || /(^| )gtb( |$)/.test(text)) return "GTBank";
  if (text.includes("first bank") || text.includes("firstbank")) return "FirstBank";
  if (text.includes("fidelity")) return "Fidelity Bank";
  if (text.includes("fcmb")) return "FCMB";
  if (text.includes("stanbic")) return "Stanbic IBTC";
  if (text.includes("sterling")) return "Sterling Bank";
  return "Imported bank account";
}
