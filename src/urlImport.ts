export async function fetchAudioUrl(url: string): Promise<{ blob: Blob; name: string }> {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`O endereço respondeu com HTTP ${response.status}.`);
  const blob = await response.blob();
  if (!blob.type.startsWith("audio/") && !/\.(mp3|m4a|aac|wav|aiff|flac|ogg|opus)(\?|#|$)/i.test(url)) {
    throw new Error("O endereço não parece apontar diretamente para um arquivo de áudio.");
  }
  const last = decodeURIComponent(new URL(url).pathname.split("/").pop() || "audio-importado");
  return { blob, name: last };
}
