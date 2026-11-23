/** Shared by import and preview, including names reserved by archived bots. */
export function takeImportName(value: string, taken: Set<string>, maxLength = 100): string {
  const max = Math.max(0, maxLength);
  const base = Array.from(value.trim()).slice(0, max).join("");
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) {
    const suffix = ` ${n}`;
    const head = Array.from(base).slice(0, Math.max(0, max - suffix.length)).join("").trimEnd();
    name = head ? `${head}${suffix}` : (max > 0 ? Array.from(String(n)).slice(0, max).join("") : "") || `${n}`;
    if (!head && taken.has(name.toLowerCase())) name = `${n}`;
  }
  taken.add(name.toLowerCase());
  return name;
}
