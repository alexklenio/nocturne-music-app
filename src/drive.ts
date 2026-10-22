type DriveConfig = {
  apiKey: string;
  clientId: string;
  appId: string;
};

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

const config: DriveConfig = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY ?? "",
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "",
  appId: import.meta.env.VITE_GOOGLE_APP_ID ?? "",
};

export function isDriveConfigured() {
  return Boolean(config.apiKey && config.clientId && config.appId);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      const marker = (existing as HTMLScriptElement).dataset.loaded;
      if (marker === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Falha ao carregar biblioteca do Google.")), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("Falha ao carregar biblioteca do Google."));
    document.head.appendChild(script);
  });
}

async function getAccessToken(): Promise<string> {
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) return reject(new Error("A autenticação Google não foi carregada."));
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (response: any) => {
        if (response?.access_token) resolve(response.access_token);
        else reject(new Error(response?.error_description || "Não foi possível autorizar o Google Drive."));
      },
      error_callback: () => reject(new Error("A autenticação foi cancelada ou bloqueada pelo navegador.")),
    });
    client.requestAccessToken({ prompt: "consent" });
  });
}

export type PickedDriveFile = { id: string; name: string; mimeType?: string; size?: string };

export async function pickAudioFiles(): Promise<{ files: PickedDriveFile[]; accessToken: string }> {
  if (!isDriveConfigured()) {
    throw new Error("Configure VITE_GOOGLE_API_KEY, VITE_GOOGLE_CLIENT_ID e VITE_GOOGLE_APP_ID no arquivo .env.local.");
  }
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve, reject) => {
    window.gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("Não foi possível carregar o seletor do Drive.")) });
  });
  const accessToken = await getAccessToken();
  return new Promise((resolve) => {
    const picker = new window.google.picker.PickerBuilder()
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setOAuthToken(accessToken)
      .addView(new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
        .setMimeTypes("audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/flac,audio/ogg,audio/webm"))
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .setCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const files = (data.docs ?? []).map((doc: any) => ({
            id: doc.id, name: doc.name, mimeType: doc.mimeType, size: doc.sizeBytes ? String(doc.sizeBytes) : undefined
          }));
          resolve({ files, accessToken });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          resolve({ files: [], accessToken });
        }
      })
      .build();
    picker.setVisible(true);
  });
}

export async function downloadDriveAudio(file: PickedDriveFile, token: string): Promise<Blob> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`Falha ao baixar "${file.name}" do Drive (HTTP ${response.status}).`);
  return await response.blob();
}
