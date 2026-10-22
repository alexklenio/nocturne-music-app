import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Album, AudioLines, Disc3, Heart, Library, Music2, Pause, Play, Plus, Search, SkipBack, SkipForward, Trash2, Upload, Volume2, Link2, Cloud, X, Radio } from "lucide-react";
import { deleteTrack, getTracks, saveTrack } from "./db";
import type { Track } from "./db";
import { downloadDriveAudio, isDriveConfigured, pickAudioFiles } from "./drive";

type View = "all" | "favorites";
type ImportMode = "local" | "link" | "drive" | "youtube";

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
};
const prettySize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [notice, setNotice] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("local");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeEmbed, setYoutubeEmbed] = useState<{ url: string; kind: "video" | "playlist" } | null>(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const activeTrack = tracks.find(t => t.id === activeId) ?? null;
  const visibleTracks = useMemo(() => tracks.filter(t => {
    const matchesView = view === "all" || t.favorite;
    return matchesView && `${t.title} ${t.artist} ${t.album} ${t.fileName}`.toLowerCase().includes(query.toLowerCase());
  }), [tracks, view, query]);

  useEffect(() => { getTracks().then(setTracks).catch(() => setNotice("Não foi possível abrir a biblioteca neste navegador.")); }, []);

  useEffect(() => {
    if (!activeTrack) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = activeTrack.audioBlob ? URL.createObjectURL(activeTrack.audioBlob) : null;
    audio.src = objectUrlRef.current ?? activeTrack.sourceUrl ?? "";
    audio.load();
    setCurrentTime(0); setDuration(0);
    if (playing) audio.play().catch(() => setPlaying(false));
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    if (playing) audio.play().catch(() => { setPlaying(false); setNotice("Não foi possível reproduzir esta faixa. Verifique o link ou o formato do áudio."); });
    else audio.pause();
  }, [playing, activeTrack]);

  async function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const audioFiles = files.filter(file => file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|aiff|flac|ogg|opus)$/i.test(file.name));
    if (!audioFiles.length) { setNotice("Selecione arquivos de áudio, como MP3, M4A, WAV ou FLAC."); event.target.value = ""; return; }
    setBusy(true);
    try {
      const imported: Track[] = [];
      for (const file of audioFiles) {
        const track: Track = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ""), artist: "Artista desconhecido", album: "Álbum desconhecido", fileName: file.name, mimeType: file.type || "audio/mpeg", size: file.size, addedAt: Date.now(), favorite: false, audioBlob: file, sourceType: "local" };
        await saveTrack(track); imported.push(track);
      }
      setTracks(prev => [...imported, ...prev]);
      if (!activeId && imported[0]) { setActiveId(imported[0].id); }
      setNotice(`${imported.length} música(s) importada(s) para ouvir offline.`);
      setImportOpen(false);
    } catch { setNotice("Não foi possível guardar os arquivos. Verifique o espaço disponível no dispositivo."); }
    finally { setBusy(false); event.target.value = ""; }
  }

  async function importLink() {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) { setNotice("Cole um link completo começando com https:// ou http://."); return; }
    setBusy(true);
    try {
      const nameFromUrl = decodeURIComponent(url.split("?")[0].split("/").pop() || "Áudio online");
      const title = linkTitle.trim() || nameFromUrl.replace(/\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i, "") || "Áudio online";
      // Save as a link-backed track: audio playback can work without downloading the file,
      // provided the URL points directly to playable audio and the host permits access.
      const track: Track = { id: crypto.randomUUID(), title, artist: "Fonte online", album: "Link externo", fileName: nameFromUrl, mimeType: "audio/unknown", size: 0, addedAt: Date.now(), favorite: false, sourceUrl: url, sourceType: "link" };
      await saveTrack(track);
      setTracks(prev => [track, ...prev]);
      setActiveId(track.id); setPlaying(true);
      setNotice("Link adicionado. A reprodução depende de o endereço apontar diretamente para um áudio acessível.");
      setLinkUrl(""); setLinkTitle(""); setImportOpen(false);
    } catch { setNotice("Não foi possível guardar este link."); }
    finally { setBusy(false); }
  }

  function addYouTubeLink() {
    const raw = youtubeUrl.trim();
    let parsed: URL;
    try { parsed = new URL(raw); } catch { setNotice("Cole um link válido do YouTube."); return; }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (!(["youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host) || host.endsWith(".youtube.com"))) {
      setNotice("Esse link não parece ser do YouTube."); return;
    }
    const playlistId = parsed.searchParams.get("list");
    const videoId = host === "youtu.be"
      ? parsed.pathname.split("/").filter(Boolean)[0]
      : parsed.searchParams.get("v") || parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
    if (playlistId && /^[a-zA-Z0-9_-]+$/.test(playlistId)) {
      setYoutubeEmbed({ url: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlistId)}&playsinline=1`, kind: "playlist" });
    } else if (videoId && /^[a-zA-Z0-9_-]+$/.test(videoId)) {
      setYoutubeEmbed({ url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?playsinline=1`, kind: "video" });
    } else {
      setNotice("Não encontrei um vídeo ou uma playlist nesse link. Confira o endereço e tente novamente."); return;
    }
    setYoutubeUrl(""); setImportOpen(false); setPlaying(false);
    setNotice(playlistId ? "Playlist do YouTube preparada para reprodução." : "Vídeo do YouTube preparado para reprodução.");
  }

  async function importFromDrive() {
    setBusy(true);
    try {
      const picked = await pickAudioFiles();
      if (!picked.files.length) { setNotice("Nenhum arquivo selecionado no Google Drive."); return; }
      const imported: Track[] = [];
      for (const file of picked.files) {
        const blob = await downloadDriveAudio(file, picked.accessToken);
        const track: Track = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ""), artist: "Artista desconhecido", album: "Google Drive", fileName: file.name, mimeType: file.mimeType || blob.type || "audio/mpeg", size: blob.size, addedAt: Date.now(), favorite: false, audioBlob: blob, sourceType: "drive" };
        await saveTrack(track); imported.push(track);
      }
      setTracks(prev => [...imported, ...prev]);
      if (!activeId && imported[0]) setActiveId(imported[0].id);
      setNotice(`${imported.length} música(s) do Drive baixada(s) para ouvir offline.`);
      setImportOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível importar do Google Drive.");
    } finally { setBusy(false); }
  }

  async function toggleFavorite(track: Track) {
    const updated = { ...track, favorite: !track.favorite };
    await saveTrack(updated); setTracks(prev => prev.map(t => t.id === track.id ? updated : t));
  }
  async function removeTrack(track: Track) {
    if (!window.confirm(`Remover "${track.title}" da biblioteca?`)) return;
    await deleteTrack(track.id);
    const remaining = tracks.filter(t => t.id !== track.id); setTracks(remaining);
    if (activeId === track.id) { setPlaying(false); setActiveId(remaining[0]?.id ?? null); }
    setNotice("Música removida da biblioteca.");
  }
  function playTrack(track: Track) { if (activeId === track.id) setPlaying(true); else { setActiveId(track.id); setPlaying(true); } }
  function stepTrack(direction: number) {
    if (!tracks.length) return;
    const index = tracks.findIndex(t => t.id === activeId);
    setActiveId(tracks[(index + direction + tracks.length) % tracks.length].id); setPlaying(true);
  }
  function onEnded() { stepTrack(1); }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><AudioLines size={22}/></div><span>nocturne</span></div>
      <div className="side-label">SUA MÚSICA</div>
      <button className={`nav-item ${view === "all" ? "selected" : ""}`} onClick={() => setView("all")}><Library size={18}/> Biblioteca <span className="nav-count">{tracks.length}</span></button>
      <button className={`nav-item ${view === "favorites" ? "selected" : ""}`} onClick={() => setView("favorites")}><Heart size={18}/> Favoritas</button>
      <div className="sidebar-bottom"><div className="mini-note"><Disc3 size={18}/><span>Feito para ouvir<br/>do seu jeito.</span></div><span className="version">NOCTURNE · 0.2</span></div>
    </aside>
    <main className="main-content">
      <header className="topbar">
        <div className="mobile-brand"><AudioLines size={20}/> nocturne</div>
        <div className="privacy-label"><span className="privacy-dot"/> Biblioteca neste dispositivo</div>
        <button className="add-button" onClick={() => setImportOpen(true)}><Plus size={18}/> <span>Adicionar músicas</span></button>
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.aiff,.flac,.ogg,.opus" multiple hidden onChange={importFiles}/>
      </header>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line"/> SUA COLEÇÃO PESSOAL</div><h1>O som que<br/><em>é só seu.</em></h1><p>Suas músicas, no seu ritmo.<br/>Uma biblioteca feita por você.</p><button className="hero-button" onClick={() => setImportOpen(true)}><Upload size={17}/> Adicionar músicas</button></div>
        <div className="hero-art" aria-hidden="true"><div className="art-glow"/><div className="vinyl"><div className="vinyl-grooves"/><div className="vinyl-label"><AudioLines size={31}/></div></div><div className="floating-note note-one">♪</div><div className="floating-note note-two">♫</div></div>
      </section>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Fechar aviso">×</button></div>}
      {youtubeEmbed && <section className="youtube-section">
        <div className="youtube-heading"><div><span className="section-kicker">REPRODUÇÃO DO YOUTUBE</span><h2>{youtubeEmbed.kind === "playlist" ? "Sua playlist" : "Vídeo selecionado"}</h2><p>Use os controles oficiais do YouTube para reproduzir. Esta reprodução permanece no player incorporado.</p></div><button className="icon-button" onClick={() => setYoutubeEmbed(null)} aria-label="Fechar reprodução do YouTube"><X size={18}/></button></div>
        <div className="youtube-frame-wrap"><iframe src={youtubeEmbed.url} title={youtubeEmbed.kind === "playlist" ? "Playlist do YouTube" : "Vídeo do YouTube"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
      </section>}
      <section className="library-section">
        <div className="section-heading"><div><span className="section-kicker">A SUA BIBLIOTECA</span><h2>{view === "favorites" ? "Suas favoritas" : "Todas as músicas"} <span className="muted-count">{visibleTracks.length}</span></h2></div><label className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar música..." aria-label="Buscar música"/></label></div>
        {visibleTracks.length === 0 ? <div className="empty-state"><div className="empty-icon">{view === "favorites" ? <Heart size={25}/> : <Music2 size={25}/>}</div><h3>{view === "favorites" ? "Suas favoritas começam aqui" : tracks.length ? "Nada encontrado" : "Sua biblioteca está esperando"}</h3><p>{view === "favorites" ? "Toque no coração de uma música para guardá-la aqui." : tracks.length ? "Tente outro termo ou importe novas músicas." : "Importe arquivos do iPhone, do Google Drive ou adicione um link direto para áudio."}</p>{!tracks.length && <button className="subtle-button" onClick={() => setImportOpen(true)}><Plus size={16}/> Escolher fonte</button>}</div> :
          <div className="track-list"><div className="track-header"><span>#</span><span>TÍTULO</span><span className="album-column">ARQUIVO / ORIGEM</span><span>TAMANHO</span><span></span></div>
            {visibleTracks.map((track, index) => <div key={track.id} className={`track-row ${activeId === track.id ? "active-track" : ""}`}>
              <button className="track-number" onClick={() => playTrack(track)} aria-label={`Tocar ${track.title}`}>{activeId === track.id && playing ? <AudioLines size={17}/> : activeId === track.id ? <Play size={15}/> : <span>{String(index + 1).padStart(2, "0")}</span>}</button>
              <button className="track-info" onClick={() => playTrack(track)}><span className="cover-thumb">{track.sourceType === "link" ? <Radio size={19}/> : <Album size={19}/>}</span><span className="track-text"><strong>{track.title}</strong><small>{track.artist}</small></span></button>
              <span className="file-name album-column">{track.sourceType === "drive" ? "Google Drive · offline" : track.sourceType === "link" ? "Link online" : track.fileName}</span>
              <span className="track-size">{track.size ? prettySize(track.size) : "Online"}</span>
              <div className="row-actions"><button className={`icon-button ${track.favorite ? "is-favorite" : ""}`} onClick={() => toggleFavorite(track)} aria-label="Alternar favorita"><Heart size={17} fill={track.favorite ? "currentColor" : "none"}/></button><button className="icon-button delete-button" onClick={() => removeTrack(track)} aria-label="Remover música"><Trash2 size={16}/></button></div>
            </div>)}
          </div>}
      </section>
      <footer className="footer-note"><span><span className="privacy-dot"/> Seus arquivos locais ficam neste navegador</span><span>Um espaço para a sua trilha sonora.</span></footer>
    </main>

    {importOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setImportOpen(false); }}>
      <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-heading"><div><span className="section-kicker">AUMENTE SUA COLEÇÃO</span><h2 id="import-title">Adicionar músicas</h2></div><button className="icon-button" onClick={() => setImportOpen(false)} disabled={busy} aria-label="Fechar"><X size={19}/></button></div>
        <div className="import-tabs">
          <button className={importMode === "local" ? "active" : ""} onClick={() => setImportMode("local")}><Upload size={16}/> Arquivos</button>
          <button className={importMode === "drive" ? "active" : ""} onClick={() => setImportMode("drive")}><Cloud size={16}/> Google Drive</button>
          <button className={importMode === "link" ? "active" : ""} onClick={() => setImportMode("link")}><Link2 size={16}/> Link online</button>
          <button className={importMode === "youtube" ? "active" : ""} onClick={() => setImportMode("youtube")}><Radio size={16}/> YouTube</button>
        </div>
        {importMode === "local" && <div className="import-pane"><div className="pane-icon"><Upload size={22}/></div><h3>Importar do dispositivo</h3><p>Escolha músicas no app Arquivos do iPhone ou no computador. Uma cópia será guardada para ouvir offline.</p><button className="modal-primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? "Importando…" : "Escolher arquivos de áudio"}</button></div>}
        {importMode === "drive" && <div className="import-pane"><div className="pane-icon"><Cloud size={22}/></div><h3>Importar do Google Drive</h3><p>Escolha os arquivos de áudio na sua conta Google. O Nocturne baixará uma cópia para a biblioteca local, para ouvir offline.</p>{!isDriveConfigured() && <div className="setup-note">Integração quase pronta: configure as credenciais do Google Cloud seguindo o README e o arquivo <code>.env.example</code>.</div>}<button className="modal-primary" disabled={busy} onClick={importFromDrive}>{busy ? "Conectando e importando…" : "Conectar e escolher no Drive"}</button><small className="modal-small">Permissão solicitada: acesso somente aos arquivos que você selecionar para o app.</small></div>}
        {importMode === "youtube" && <div className="import-pane link-pane"><div className="pane-icon"><Radio size={22}/></div><h3>Adicionar link do YouTube</h3><p>Cole o link de um vídeo ou playlist. O Nocturne identifica o tipo e abre o player oficial para reprodução.</p><label>Link do vídeo ou playlist<input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" inputMode="url" autoComplete="url" onKeyDown={e => { if (e.key === "Enter" && youtubeUrl.trim()) addYouTubeLink(); }}/></label><div className="setup-note">O YouTube será reproduzido no player incorporado. Não é possível extrair o áudio nem usar este modo como reprodução em segundo plano/controles de tela bloqueada. Para isso, use arquivos locais, Google Drive ou links diretos de áudio autorizados.</div><button className="modal-primary" disabled={!youtubeUrl.trim()} onClick={addYouTubeLink}>Preparar reprodução</button></div>}
        {importMode === "link" && <div className="import-pane link-pane"><div className="pane-icon"><Link2 size={22}/></div><h3>Reproduzir de um link</h3><p>Cole um endereço direto para um arquivo de áudio. Ele será salvo como fonte online, sem baixar uma cópia permanente.</p><label>Link do áudio<input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://site.com/minha-musica.mp3" inputMode="url" autoComplete="url"/></label><label>Nome da música (opcional)<input value={linkTitle} onChange={e => setLinkTitle(e.target.value)} placeholder="Nome da faixa"/></label><div className="setup-note">Links de páginas do YouTube, Spotify e páginas de compartilhamento do Drive geralmente não são arquivos de áudio diretos. O servidor precisa permitir acesso ao arquivo.</div><button className="modal-primary" disabled={busy || !linkUrl.trim()} onClick={importLink}>{busy ? "Adicionando…" : "Adicionar link online"}</button></div>}
      </section>
    </div>}

    <div className="player">
      <div className="now-playing"><div className="player-cover"><Disc3 size={23}/></div><div className="now-text"><strong>{activeTrack?.title ?? "Escolha uma música"}</strong><span>{activeTrack?.sourceType === "link" ? "Fonte online" : activeTrack?.sourceType === "drive" ? "Google Drive · offline" : activeTrack?.artist ?? "Sua próxima favorita está aqui"}</span></div></div>
      <div className="player-center"><div className="player-controls"><button className="control-button" onClick={() => stepTrack(-1)} disabled={!tracks.length} aria-label="Faixa anterior"><SkipBack size={19} fill="currentColor"/></button><button className="play-button" onClick={() => activeTrack ? setPlaying(!playing) : setImportOpen(true)} aria-label={playing ? "Pausar" : "Reproduzir"}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button className="control-button" onClick={() => stepTrack(1)} disabled={!tracks.length} aria-label="Próxima faixa"><SkipForward size={19} fill="currentColor"/></button></div><div className="progress-row"><span>{formatTime(currentTime)}</span><input type="range" min={0} max={duration || 0} step={1} value={Math.min(currentTime, duration || 0)} onChange={e => { if (audioRef.current) audioRef.current.currentTime = Number(e.target.value); }} aria-label="Progresso da música"/><span>{formatTime(duration)}</span></div></div>
      <div className="player-right"><Volume2 size={18}/><span className="player-caption">{playing ? "TOCANDO AGORA" : "NOCTURNE PLAYER"}</span></div>
    </div>
    <audio ref={audioRef} onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} onEnded={onEnded} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
  </div>;
}
