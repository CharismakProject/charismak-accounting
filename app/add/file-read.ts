"use client";

// Android-safe file access used by universal document intake.
export function readWithFileReader(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("The browser could not read this file."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("The browser returned an unreadable file result."));
    };
    reader.readAsArrayBuffer(blob);
  });
}

export async function readFileArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  try {
    return await blob.arrayBuffer();
  } catch {}
  try {
    return await new Response(blob).arrayBuffer();
  } catch {}
  return readWithFileReader(blob);
}

export async function optionalFileHash(file: File): Promise<string | null> {
  try {
    const bytes = await readFileArrayBuffer(file);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
