export async function nameEncode(name: string, length = 20): Promise<string> {
  const data = new TextEncoder().encode(name);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, length);
}
