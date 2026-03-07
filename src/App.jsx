import { useState, useEffect, useRef } from "react";

// ─── API BAĞLANTISI ───────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "https://turbo-mega-cark-backend-production.up.railway.app";

function getSessionToken() {
  return new URLSearchParams(window.location.search).get("token");
}

async function apiFetch(path, options = {}) {
  const token = getSessionToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-session-token": token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API hatası");
  return data;
}

// ─── SES SİSTEMİ ─────────────────────────────────────────────────────────────
// Ses dosyaları /public/sounds/ klasöründe olmalı (GitHub'a koyun)
// Dosya isimleri: bg-music.mp3, spin.mp3, win.mp3, lose.mp3
const SOUNDS = {
  bg:   "/sounds/bg-music.mp3",   // Sürekli çalan arka plan müziği (loop)
  spin: "/sounds/spin.mp3",        // Çark dönerken çalan ses
  win:  "/sounds/win.mp3",         // Kazanma sesi (çarpan ve mini oyun)
  lose: "/sounds/lose.mp3",        // Kaybetme sesi (çarpan ve mini oyun)
};

function useGameSounds() {
  const audioRefs = useRef({});
  const bgStarted = useRef(false);

  const getAudio = (key) => {
    if (!audioRefs.current[key]) {
      const a = new Audio(SOUNDS[key]);
      if (key === "bg") {
        a.loop = true;
        a.volume = 0.18; // arka plan müziği sessiz
      } else if (key === "spin") {
        a.volume = 0.55;
      } else {
        a.volume = 0.75;
      }
      audioRefs.current[key] = a;
    }
    return audioRefs.current[key];
  };

  const startBg = () => {
    if (bgStarted.current) return;
    const bg = getAudio("bg");
    bg.play().catch(() => {}); // autoplay policy — sessizce hata yut
    bgStarted.current = true;
  };

  const playSpin = () => {
    startBg(); // ilk etkileşimde bg müziği başlat
    const s = getAudio("spin");
    s.currentTime = 0;
    s.play().catch(() => {});
  };

  const stopSpin = () => {
    const s = audioRefs.current["spin"];
    if (s) { s.pause(); s.currentTime = 0; }
  };

  const playWin = () => {
    stopSpin();
    const w = getAudio("win");
    w.currentTime = 0;
    w.play().catch(() => {});
  };

  const playLose = () => {
    stopSpin();
    const l = getAudio("lose");
    l.currentTime = 0;
    l.play().catch(() => {});
  };

  return { startBg, playSpin, stopSpin, playWin, playLose };
}

// ─── SEGMENT YAPISI (20 dilim) ─────────────────────────────────────────────────
// RTP Hesabı ~%75.5:
//   Çarpan E[R]: (0×5 + 0.5×2 + 1.2×2 + 2×2 + 10×1 + 25×1) / 13 × (13/20 ağırlıklı)
//   Mini E[R]:   Quick(0.35×2)=0.70, Guess(0.41×1.8)=0.738, Combo(0.10×4+0.25×1.5)=0.775
//   Jackpot x25: ~her 145 spinde 1 | x10: ~her 72 spinde 1
const SEGMENTS = [
  // Hiçbir KAYIP yan yana değil — eşit dağılım
  { label: "KAYIP", type: "mult", mult: 0,   color: "#160820", accent: "#7c3aed", jackpot: false }, // 0
  { label: "x0.5",  type: "mult", mult: 0.5, color: "#1a0e04", accent: "#8b5e00", jackpot: false }, // 1
  { label: "KAYIP", type: "mult", mult: 0,   color: "#160820", accent: "#7c3aed", jackpot: false }, // 2
  { label: "QUICK", type: "quick",            color: "#00101e", accent: "#00e5ff", jackpot: false }, // 3
  { label: "KAYIP", type: "mult", mult: 0,   color: "#160820", accent: "#7c3aed", jackpot: false }, // 4
  { label: "x1.2",  type: "mult", mult: 1.2, color: "#0a1e0e", accent: "#00b348", jackpot: false }, // 5
  { label: "KAYIP", type: "mult", mult: 0,   color: "#160820", accent: "#7c3aed", jackpot: false }, // 6
  { label: "GUESS", type: "guess",            color: "#120010", accent: "#d500f9", jackpot: false }, // 7
  { label: "KAYIP", type: "mult", mult: 0,   color: "#160820", accent: "#7c3aed", jackpot: false }, // 8
  { label: "x2",    type: "mult", mult: 2,   color: "#0a1820", accent: "#00b8d4", jackpot: false }, // 9
  { label: "QUICK", type: "quick",            color: "#00101e", accent: "#00e5ff", jackpot: false }, // 10
  { label: "x10",   type: "mult", mult: 10,  color: "#1a0500", accent: "#ff6d00", jackpot: false }, // 11
  { label: "COMBO", type: "combo",            color: "#120800", accent: "#ff9100", jackpot: false }, // 12
  { label: "x25",   type: "mult", mult: 25,  color: "#1a1000", accent: "#ffd600", jackpot: true  }, // 13
  { label: "x0.5",  type: "mult", mult: 0.5, color: "#1a0e04", accent: "#8b5e00", jackpot: false }, // 14
  { label: "GUESS", type: "guess",            color: "#120010", accent: "#d500f9", jackpot: false }, // 15
  { label: "x1.2",  type: "mult", mult: 1.2, color: "#0a1e0e", accent: "#00b348", jackpot: false }, // 16
  { label: "QUICK", type: "quick",            color: "#00101e", accent: "#00e5ff", jackpot: false }, // 17
  { label: "x2",    type: "mult", mult: 2,   color: "#0a1820", accent: "#00b8d4", jackpot: false }, // 18
  { label: "COMBO", type: "combo",            color: "#120800", accent: "#ff9100", jackpot: false }, // 19
];

// Ağırlıklar — SEGMENTS ile birebir hizalı
const SEG_WEIGHTS = [
  14,      // 0  KAYIP
  6,       // 1  x0.5
  14,      // 2  KAYIP
  7,       // 3  QUICK
  14,      // 4  KAYIP
  5,       // 5  x1.2
  14,      // 6  KAYIP
  6,       // 7  GUESS
  14,      // 8  KAYIP
  4,       // 9  x2
  7,       // 10 QUICK
  2,       // 11 x10
  4,       // 12 COMBO
  1,       // 13 x25 JACKPOT
  6,       // 14 x0.5
  6,       // 15 GUESS
  5,       // 16 x1.2
  7,       // 17 QUICK
  4,       // 18 x2
  4,       // 19 COMBO
];

const NUM_SEGS = SEGMENTS.length;   // 20
const SEG_ANGLE = 360 / NUM_SEGS;   // 18°

// Mini game ikonları
const SEG_ICON = { quick: "⚡", guess: "🔮", combo: "🎰" };

// Tüm RNG backend'e taşındı (Railway) — frontend Math.random() kullanmıyor
// Artık tüm RNG Railway backend'de çalışıyor

// ─── Açı Matematiği ───────────────────────────────────────────────────────────
// SVG'de segment i: startAngle = i*SEG_ANGLE - 90°  (CW, 0=sağ)
// midAngle_svg = (i+0.5)*SEG_ANGLE - 90
// Pointer tepede = SVG 270°
// Çark rotate(R) iken pointer'ın üstündeki SVG açısı = (270 - R) mod 360
// Segment i'yi pointer'a getirmek: R ≡ 360 - (i+0.5)*SEG_ANGLE  (mod 360)
function calcTargetRotation(segIndex, currentRotation) {
  const targetMod = ((360 - (segIndex + 0.5) * SEG_ANGLE) % 360 + 360) % 360;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  let delta = targetMod - currentMod;
  if (delta <= 0) delta += 360;
  return currentRotation + 8 * 360 + delta;
}

function detectSegmentFromRotation(finalRotation) {
  const finalMod = ((finalRotation % 360) + 360) % 360;
  const pointerSVGAngle = ((270 - finalMod) % 360 + 360) % 360;
  const normalized = ((pointerSVGAngle + 90) % 360 + 360) % 360;
  return Math.floor(normalized / SEG_ANGLE) % NUM_SEGS;
}

// ─── Wheel ────────────────────────────────────────────────────────────────────
function Wheel({ spinTrigger, onSpinEnd }) {
  const [currentRotation, setCurrentRotation] = useState(0);
  const rotRef = useRef(0);
  const animRef = useRef(null);
  const lastTriggerIdRef = useRef(null);

  useEffect(() => {
    if (!spinTrigger || spinTrigger.id === lastTriggerIdRef.current) return;
    lastTriggerIdRef.current = spinTrigger.id;
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const startRot = rotRef.current;
    const targetRot = calcTargetRotation(spinTrigger.segIndex, startRot);
    const duration = 4200 + Math.random() * 600;
    let startTs = null;

    const animate = (ts) => {
      if (!startTs) startTs = ts;
      const progress = Math.min((ts - startTs) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      const rot = startRot + (targetRot - startRot) * ease;
      rotRef.current = rot;
      setCurrentRotation(rot);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        rotRef.current = targetRot;
        setCurrentRotation(targetRot);
        onSpinEnd(detectSegmentFromRotation(targetRot));
      }
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [spinTrigger]);

  const size = 340;
  const cx = size / 2, cy = size / 2, r = size / 2 - 12;

  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      {/* Glow ring */}
      <div style={{
        position: "absolute", inset: -20, borderRadius: "50%",
        boxShadow: "0 0 60px 10px rgba(0,229,255,0.18), 0 0 120px 24px rgba(213,0,249,0.10)",
        animation: "pulseRing 2.8s ease-in-out infinite", pointerEvents: "none"
      }} />
      {/* Pointer */}
      <div style={{
        position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0,
        borderLeft: "15px solid transparent", borderRight: "15px solid transparent",
        borderTop: "34px solid #ffd600",
        filter: "drop-shadow(0 0 14px #ffd600) drop-shadow(0 3px 8px rgba(0,0,0,0.9))",
        zIndex: 10
      }} />

      <svg width={size} height={size}
        style={{ transform: `rotate(${currentRotation}deg)`, transformOrigin: "center", display: "block" }}>
        <defs>
          {SEGMENTS.map((s, i) => (
            <radialGradient key={i} id={`wg${i}`} cx="40%" cy="35%">
              <stop offset="0%" stopColor={s.accent} stopOpacity={s.jackpot ? 0.6 : (s.mult === 0 ? 0.45 : 0.28)} />
              <stop offset="100%" stopColor={s.color} stopOpacity="1" />
            </radialGradient>
          ))}
          <radialGradient id="wcg" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#1a0840" />
            <stop offset="100%" stopColor="#040410" />
          </radialGradient>
          {/* Jackpot için özel altın gradient */}
          <radialGradient id="jackpotGrad" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#ffe066" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#c8860a" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#3a2000" stopOpacity="1" />
          </radialGradient>
          <filter id="jackpotGlow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {SEGMENTS.map((seg, i) => {
          const sa = ((i * SEG_ANGLE - 90) * Math.PI) / 180;
          const ea = (((i + 1) * SEG_ANGLE - 90) * Math.PI) / 180;
          const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
          const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);

          // Segment ortası
          const ma = sa + (SEG_ANGLE * Math.PI) / 180 / 2;
          const radialDeg = (ma * 180) / Math.PI; // radyal yön (SVG derece)

          // Metin konumu: merkezden %70 uzakta (radyal yazı için daha geniş alan)
          const tr = r * 0.70;
          const tx = cx + tr * Math.cos(ma);
          const ty = cy + tr * Math.sin(ma);

          // ── METIN AÇISI MANTIĞI ──
          //
          // RADYAL yazı (KAYIP, QUICK, GUESS, COMBO):
          //   Metin radyal eksen boyunca, geniş kenardan (dış) dar kenarına (iç) doğru okunur.
          //   SVG rotate(radialDeg) → metin x-ekseni yönünde (sağa) yazılır, radyal yönde döner.
          //   Sağ yarı (radialDeg -90..90): normal
          //   Sol yarı (radialDeg 90..270): metin ters gelir → +180° flip
          const needsFlip = radialDeg > 90 && radialDeg < 270;
          const textAngleRadial = needsFlip ? radialDeg + 180 : radialDeg;

          // TANJANTIYEL yazı (çarpanlar — mevcut hali):
          //   radialDeg + 90, flip yok (kısa metin, her yönde okunur)
          const textAngleTan = radialDeg + 90;

          // Accent arc (rim'in içinde)
          const arcR = r - 8;
          const ax1 = cx + arcR * Math.cos(sa + 0.04);
          const ay1 = cy + arcR * Math.sin(sa + 0.04);
          const ax2 = cx + arcR * Math.cos(ea - 0.04);
          const ay2 = cy + arcR * Math.sin(ea - 0.04);

          const isJackpot = seg.jackpot;
          const isBigMult = seg.type === "mult" && seg.mult >= 10;

          return (
            <g key={i}>
              {/* Segment dolgusu */}
              <path
                d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                fill={isJackpot ? "url(#jackpotGrad)" : `url(#wg${i})`}
                stroke="rgba(0,0,0,0.45)" strokeWidth="1"
              />

              {/* Jackpot için ekstra parlak border */}
              {isJackpot && (
                <path
                  d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                  fill="none" stroke="#ffd600" strokeWidth="2" strokeOpacity="0.7"
                />
              )}

              {/* Accent arc */}
              <path
                d={`M ${ax1} ${ay1} A ${arcR} ${arcR} 0 0 1 ${ax2} ${ay2}`}
                fill="none" stroke={seg.accent}
                strokeWidth={isJackpot ? 4 : isBigMult ? 3 : 2.5}
                strokeOpacity={isJackpot ? 0.95 : seg.mult === 0 ? 0.75 : 0.6}
                strokeLinecap="round"
              />

              {/* ── METIN GRUBU ── */}
              {seg.type !== "mult" ? (
                // MİNİ OYUN (QUICK/GUESS/COMBO)
                // rotate(radialDeg): +x = dışa, -x = içe
                // İkon dışta, label içte → dıştan içe okunur
                <g transform={`rotate(${textAngleRadial}, ${tx}, ${ty})`}>
                  <text
                    x={tx + 13} y={ty}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="11"
                    style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))" }}>
                    {SEG_ICON[seg.type]}
                  </text>
                  <text
                    x={tx - 9} y={ty}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="9" fontWeight="800"
                    fontFamily="'Orbitron', monospace"
                    fill={seg.accent}
                    style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,1))" }}>
                    {seg.label}
                  </text>
                </g>
              ) : seg.mult === 0 ? (
                // KAYIP — RADYAL
                <g transform={`rotate(${textAngleRadial}, ${tx}, ${ty})`}>
                  <text
                    x={tx} y={ty}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="9" fontWeight="700"
                    fontFamily="'Orbitron', monospace"
                    fill={seg.accent}
                    opacity="0.75"
                    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,1))" }}>
                    KAYIP
                  </text>
                </g>
              ) : isJackpot ? (
                // x25 JACKPOT — RADYAL, dıştan içe okunur (KAYIP ile aynı mantık)
                // İkon en dışta, x25 ortada, JACKPOT içte
                <g transform={`rotate(${textAngleRadial}, ${tx}, ${ty})`}>
                  <text
                    x={tx + 22} y={ty}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="11">⭐</text>
                  <text
                    x={tx + 4} y={ty}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="13" fontWeight="900"
                    fontFamily="'Orbitron', monospace"
                    fill="#ffd600"
                    filter="url(#jackpotGlow)"
                    style={{ letterSpacing: "0.5px" }}>
                    x25
                  </text>
                  <text
                    x={tx - 13} y={ty}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="6" fontWeight="700"
                    fontFamily="'Orbitron', monospace"
                    fill="#ffe066" opacity="0.85">
                    JACKPOT
                  </text>
                </g>
              ) : isBigMult ? (
                // x10 — tanjantiyel, büyük turuncu
                <g transform={`rotate(${textAngleTan}, ${tx}, ${ty})`}>
                  <text
                    x={tx} y={ty}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="14" fontWeight="900"
                    fontFamily="'Orbitron', monospace"
                    fill={seg.accent}
                    style={{ filter: "drop-shadow(0 0 6px rgba(255,109,0,0.8))" }}>
                    {seg.label}
                  </text>
                </g>
              ) : (
                // Normal çarpan (x0.5, x1.2, x2) — tanjantiyel
                <g transform={`rotate(${textAngleTan}, ${tx}, ${ty})`}>
                  <text
                    x={tx} y={ty}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize="12" fontWeight="800"
                    fontFamily="'Orbitron', monospace"
                    fill={seg.accent}
                    style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,1))" }}>
                    {seg.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={46} fill="url(#wcg)" stroke="rgba(0,229,255,0.4)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={39} fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="1" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fontWeight="900" fontFamily="'Orbitron', monospace"
          fill="#00e5ff" letterSpacing="2">ÇARK</text>

        {/* Rim dots — segment sınırlarında (altın) */}
        {Array.from({ length: NUM_SEGS }).map((_, i) => {
          const a = (i / NUM_SEGS) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i}
            cx={cx + (r + 7) * Math.cos(a)} cy={cy + (r + 7) * Math.sin(a)}
            r={3.5} fill="#ffd600" opacity="0.9" />;
        })}
        {/* Ara noktalar (küçük) */}
        {Array.from({ length: NUM_SEGS }).map((_, i) => {
          const a = ((i + 0.5) / NUM_SEGS) * Math.PI * 2 - Math.PI / 2;
          return <circle key={`m${i}`}
            cx={cx + (r + 7) * Math.cos(a)} cy={cy + (r + 7) * Math.sin(a)}
            r={1.8} fill="rgba(255,255,255,0.18)" />;
        })}
      </svg>
    </div>
  );
}

// ─── Quick Match ──────────────────────────────────────────────────────────────
const CARD_ICONS = ["🦋", "🌙", "💫", "🔮", "⚡", "🌈"];

function QuickMatch({ bet, outcome, onResult }) {
  const [deck] = useState(() => {
    if (outcome === "win") {
      const pair = CARD_ICONS[Math.floor(Math.random() * 3)];
      const others = CARD_ICONS.filter(c => c !== pair).slice(0, 4);
      return [...others, pair, pair].sort(() => Math.random() - 0.5)
        .map((icon, i) => ({ id: i, icon, flipped: false }));
    }
    return [...CARD_ICONS].sort(() => Math.random() - 0.5)
      .map((icon, i) => ({ id: i, icon, flipped: false }));
  });
  const [state, setState] = useState(deck);
  const [selected, setSelected] = useState([]);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(null);

  const flip = (idx) => {
    if (done || state[idx].flipped || selected.length >= 2) return;
    const next = state.map((c, i) => i === idx ? { ...c, flipped: true } : c);
    setState(next);
    const sel = [...selected, idx];
    setSelected(sel);
    if (sel.length === 2) {
      setTimeout(() => {
        const matched = next[sel[0]].icon === next[sel[1]].icon;
        const amount = matched ? Math.round(bet * 2 * 100) / 100 : 0;
        setMsg({ win: matched, text: matched ? "✅ EŞLEŞTİ! x2" : "❌ Eşleşmedi" });
        setDone(true);
        setTimeout(() => onResult(amount), 900);
      }, 450);
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ color: "#00e5ff", fontFamily: "Orbitron", marginBottom: 5, fontSize: 16 }}>⚡ QUICK MATCH</h3>
      <p style={{ color: "rgba(255,255,255,0.45)", marginBottom: 14, fontSize: 12 }}>2 eşleşen kartı bul → x2 kazan</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9, maxWidth: 246, margin: "0 auto 14px" }}>
        {state.map((card, i) => (
          <button key={i} onClick={() => flip(i)}
            style={{
              width: 68, height: 68, borderRadius: 11, border: "2px solid",
              borderColor: card.flipped ? "#00e5ff" : "rgba(0,229,255,0.18)",
              background: card.flipped ? "rgba(0,229,255,0.1)" : "rgba(0,8,24,0.85)",
              fontSize: 26, cursor: done || card.flipped ? "default" : "pointer",
              transition: "all 0.22s", transform: card.flipped ? "scale(1.07)" : "scale(1)",
              boxShadow: card.flipped ? "0 0 14px rgba(0,229,255,0.45)" : "none"
            }}>{card.flipped ? card.icon : "?"}</button>
        ))}
      </div>
      {msg && (
        <div style={{
          padding: "9px 16px", borderRadius: 9,
          background: msg.win ? "rgba(0,230,118,0.09)" : "rgba(255,68,68,0.09)",
          border: `1px solid ${msg.win ? "rgba(0,230,118,0.38)" : "rgba(255,68,68,0.38)"}`,
          color: msg.win ? "#00e676" : "#ff5555", fontFamily: "Orbitron", fontSize: 13
        }}>{msg.text}</div>
      )}
    </div>
  );
}

// ─── Guess Next ───────────────────────────────────────────────────────────────
function GuessNext({ bet, outcome, onResult }) {
  const [current] = useState(() => Math.floor(Math.random() * 7) + 2);
  const [guessed, setGuessed] = useState(false);
  const [next, setNext] = useState(null);
  const [msg, setMsg] = useState(null);

  const guess = (dir) => {
    if (guessed) return;
    setGuessed(true);
    let nv;
    if (outcome === "win") {
      nv = dir === "high"
        ? current + 1 + Math.floor(Math.random() * Math.max(1, 9 - current))
        : current - 1 - Math.floor(Math.random() * Math.max(1, current - 2));
    } else {
      nv = dir === "high"
        ? Math.max(1, current - 1 - Math.floor(Math.random() * 2))
        : Math.min(9, current + 1 + Math.floor(Math.random() * 2));
    }
    nv = Math.max(1, Math.min(9, nv));
    setNext(nv);
    const win = (dir === "high" && nv > current) || (dir === "low" && nv < current);
    const amount = win ? Math.round(bet * 1.8 * 100) / 100 : 0;
    setMsg({ win, text: win ? `🎯 Doğru! ${nv} çıktı → x1.8` : `💀 Yanlış! ${nv} çıktı` });
    setTimeout(() => onResult(amount), 1100);
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ color: "#d500f9", fontFamily: "Orbitron", marginBottom: 5, fontSize: 16 }}>🔮 GUESS NEXT</h3>
      <p style={{ color: "rgba(255,255,255,0.45)", marginBottom: 16, fontSize: 12 }}>Sonraki sayı yüksek mi düşük mü?</p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 20 }}>
        <div style={{
          width: 76, height: 76, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #35085a, #080018)",
          border: "3px solid #d500f9", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, fontFamily: "Orbitron", fontWeight: 900, color: "white",
          boxShadow: "0 0 28px rgba(213,0,249,0.55)"
        }}>{current}</div>
        {next !== null && (
          <>
            <div style={{ fontSize: 20, color: "rgba(255,255,255,0.25)" }}>→</div>
            <div style={{
              width: 76, height: 76, borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, #1a103a, #060018)",
              border: `3px solid ${msg?.win ? "#00e676" : "#ff4444"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, fontFamily: "Orbitron", fontWeight: 900, color: "white",
              boxShadow: `0 0 22px ${msg?.win ? "rgba(0,230,118,0.5)" : "rgba(255,68,68,0.5)"}`,
              animation: "popIn 0.35s ease"
            }}>{next}</div>
          </>
        )}
      </div>
      {!guessed && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          {[["high", "▲ YÜKSEK"], ["low", "▼ DÜŞÜK"]].map(([dir, label]) => (
            <button key={dir} onClick={() => guess(dir)}
              style={{
                padding: "11px 22px", borderRadius: 9, border: "2px solid #d500f9",
                background: "rgba(213,0,249,0.1)", color: "white",
                fontFamily: "Orbitron", fontSize: 12, fontWeight: 700, cursor: "pointer"
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(213,0,249,0.26)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(213,0,249,0.10)"}
            >{label}</button>
          ))}
        </div>
      )}
      {msg && (
        <div style={{
          marginTop: 14, padding: "9px 16px", borderRadius: 9,
          background: msg.win ? "rgba(0,230,118,0.09)" : "rgba(255,68,68,0.09)",
          border: `1px solid ${msg.win ? "rgba(0,230,118,0.38)" : "rgba(255,68,68,0.38)"}`,
          color: msg.win ? "#00e676" : "#ff5555", fontFamily: "Orbitron", fontSize: 12
        }}>{msg.text}</div>
      )}
    </div>
  );
}

// ─── Combo Match ──────────────────────────────────────────────────────────────
const SLOT_ICONS = ["💎", "⭐", "🔥", "👑", "🍀", "⚡"];

function ComboMatch({ bet, outcome, onResult }) {
  const [reels, setReels] = useState(["?", "?", "?"]);
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState(null);

  const spinReels = () => {
    if (spinning || done) return;
    setSpinning(true);
    let final;
    if (outcome === "win3") {
      const ic = SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)];
      final = [ic, ic, ic];
    } else if (outcome === "win2") {
      const ic = SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)];
      const diff = SLOT_ICONS.filter(x => x !== ic)[Math.floor(Math.random() * 5)];
      final = [ic, ic, diff].sort(() => Math.random() - 0.5);
    } else {
      do { final = Array.from({ length: 3 }, () => SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)]); }
      while (final[0] === final[1] || final[1] === final[2] || final[0] === final[2]);
    }
    let tick = 0;
    const iv = setInterval(() => {
      setReels(Array.from({ length: 3 }, () => SLOT_ICONS[Math.floor(Math.random() * SLOT_ICONS.length)]));
      tick++;
      if (tick > 16) {
        clearInterval(iv);
        setReels(final);
        setSpinning(false);
        setDone(true);
        const all3 = final[0] === final[1] && final[1] === final[2];
        const two = final[0] === final[1] || final[1] === final[2] || final[0] === final[2];
        let amount = 0, text = "";
        if (all3) { amount = Math.round(bet * 4 * 100) / 100; text = "🎰 3 AYNI! x4"; }
        else if (two) { amount = Math.round(bet * 1.5 * 100) / 100; text = "✨ 2 Aynı! x1.5"; }
        else text = "💀 Farklı semboller";
        setMsg({ win: amount > 0, text });
        setTimeout(() => onResult(amount), 900);
      }
    }, 85);
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h3 style={{ color: "#ff9100", fontFamily: "Orbitron", marginBottom: 5, fontSize: 16 }}>🎰 COMBO MATCH</h3>
      <p style={{ color: "rgba(255,255,255,0.45)", marginBottom: 16, fontSize: 12 }}>2 aynı → x1.5 &nbsp;|&nbsp; 3 aynı → x4</p>
      <div style={{ display: "flex", gap: 9, justifyContent: "center", marginBottom: 18 }}>
        {reels.map((icon, i) => (
          <div key={i} style={{
            width: 74, height: 74, borderRadius: 12, border: "2px solid",
            borderColor: spinning ? "#ff9100" : "rgba(255,145,0,0.28)",
            background: "rgba(20,10,0,0.9)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 32,
            boxShadow: spinning ? "0 0 18px rgba(255,145,0,0.55)" : "inset 0 2px 8px rgba(0,0,0,0.6)"
          }}>{icon}</div>
        ))}
      </div>
      {!done && (
        <button onClick={spinReels} disabled={spinning}
          style={{
            padding: "11px 34px", borderRadius: 9, border: "2px solid #ff9100",
            background: spinning ? "rgba(255,145,0,0.06)" : "rgba(255,145,0,0.16)",
            color: spinning ? "rgba(255,255,255,0.35)" : "white",
            fontFamily: "Orbitron", fontSize: 12, fontWeight: 700, cursor: spinning ? "not-allowed" : "pointer"
          }}>
          {spinning ? "🎰 Döndürülüyor..." : "🎰 DÖNDÜR"}
        </button>
      )}
      {msg && (
        <div style={{
          marginTop: 12, padding: "9px 16px", borderRadius: 9,
          background: msg.win ? "rgba(255,145,0,0.1)" : "rgba(255,68,68,0.09)",
          border: `1px solid ${msg.win ? "rgba(255,145,0,0.45)" : "rgba(255,68,68,0.38)"}`,
          color: msg.win ? "#ff9100" : "#ff5555", fontFamily: "Orbitron", fontSize: 12
        }}>{msg.text}</div>
      )}
    </div>
  );
}

// ─── Mult Result ──────────────────────────────────────────────────────────────
function MultResult({ seg, bet, winAmount, onDone }) {
  // winAmount backend'den geliyor — frontend hesaplamıyor
  const win = winAmount !== undefined ? winAmount : Math.round(bet * (seg.mult || 0) * 100) / 100;
  const isJackpot = seg.jackpot;
  const isBig = seg.mult >= 10;
  const isLoss = seg.mult === 0;

  useEffect(() => {
    const delay = isLoss ? 1100 : isJackpot ? 2800 : isBig ? 2200 : 1700;
    const t = setTimeout(() => onDone(win), delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ textAlign: "center", animation: "popIn 0.4s ease" }}>
      {isJackpot ? (
        <>
          <div style={{ fontSize: 62, marginBottom: 8, animation: "jackpotPulse 0.6s ease-in-out infinite alternate" }}>🏆</div>
          <div style={{
            fontFamily: "Orbitron", fontSize: 28, fontWeight: 900, color: "#ffd600",
            textShadow: "0 0 30px #ffd600, 0 0 60px #ffd60088", marginBottom: 6, letterSpacing: 2
          }}>JACKPOT!</div>
          <div style={{
            fontSize: 36, fontFamily: "Orbitron", fontWeight: 900, color: "#ffe066",
            textShadow: "0 0 20px #ffd600", marginBottom: 6
          }}>x25</div>
          <div style={{ fontSize: 26, fontFamily: "Orbitron", color: "#ffd600", marginBottom: 4 }}>
            +{win.toFixed(2)} TL
          </div>
          <p style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Orbitron", fontSize: 12 }}>
            {bet} TL × 25
          </p>
        </>
      ) : isLoss ? (
        <>
          <div style={{ fontSize: 54, marginBottom: 10 }}>💀</div>
          <h3 style={{ fontFamily: "Orbitron", color: "#ff4444", fontSize: 24, marginBottom: 6 }}>KAYIP</h3>
          <p style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Orbitron", fontSize: 12 }}>Bet: {bet} TL</p>
        </>
      ) : (
        <>
          <div style={{ fontSize: 54, marginBottom: 10 }}>{isBig ? "🔥" : "💰"}</div>
          <h3 style={{
            fontFamily: "Orbitron", fontSize: 28, marginBottom: 4,
            color: isBig ? "#ff6d00" : "#00e676",
            textShadow: isBig ? "0 0 20px #ff6d0088" : "none"
          }}>{seg.label}</h3>
          <div style={{
            fontSize: 30, fontFamily: "Orbitron", fontWeight: 900,
            color: isBig ? "#ff6d00" : "#ffd600",
            textShadow: `0 0 20px ${isBig ? "#ff6d0066" : "#ffd60066"}`, marginBottom: 6
          }}>+{win.toFixed(2)} TL</div>
          <p style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Orbitron", fontSize: 12 }}>
            {bet} TL × {seg.mult}
          </p>
        </>
      )}
    </div>
  );
}

// ─── Result Screen ────────────────────────────────────────────────────────────
function ResultScreen({ amount, bet, onContinue }) {
  const isWin = amount > 0;
  const isJackpot = amount >= bet * 20;
  return (
    <div style={{ textAlign: "center", animation: "fadeIn 0.3s ease" }}>
      <div style={{ fontSize: 58, marginBottom: 10 }}>
        {isJackpot ? "🏆" : isWin ? (amount >= bet * 3 ? "🔥" : "💰") : "💀"}
      </div>
      <h3 style={{
        fontFamily: "Orbitron", fontSize: 24, marginBottom: 5,
        color: isJackpot ? "#ffd600" : isWin ? "#00e676" : "#ff4444",
        textShadow: isJackpot ? "0 0 24px #ffd600" : "none"
      }}>
        {isWin ? `+${amount.toFixed(2)} TL` : "KAYIP"}
      </h3>
      <p style={{ color: "rgba(255,255,255,0.3)", fontFamily: "Orbitron", fontSize: 11, marginBottom: 22 }}>
        BET: {bet} TL
      </p>
      <button onClick={onContinue}
        style={{
          padding: "12px 44px", borderRadius: 11, border: "2px solid #ffd600",
          background: "rgba(255,214,0,0.1)", color: "#ffd600",
          fontFamily: "Orbitron", fontSize: 14, fontWeight: 700, cursor: "pointer",
          boxShadow: "0 0 18px rgba(255,214,0,0.28)"
        }}>DEVAM →</button>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ type, seg, bet, miniOutcome, winAmount, onClose, onWin, onLose }) {
  const [phase, setPhase] = useState("game");
  const [resultAmount, setResultAmount] = useState(0);
  // miniOutcome ve winAmount backend'den geliyor — frontend RNG kullanmıyor
  const outcomeRef = useRef(miniOutcome || null);
  const accentColor = { mult: seg?.jackpot ? "#ffd600" : "#00e5ff", quick: "#00e5ff", guess: "#d500f9", combo: "#ff9100" }[type] || "#ffd600";
  const handleResult = (amt) => {
    // Backend'den gelen winAmount'ı kullan, animasyon parametresi değil
    const finalAmt = (winAmount !== undefined && winAmount !== null) ? winAmount : amt;
    if (finalAmt > 0) onWin?.(); else onLose?.();
    setResultAmount(finalAmt);
    setPhase("result");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(14px)", animation: "fadeIn 0.22s ease"
    }}>
      <div style={{
        background: seg?.jackpot
          ? "linear-gradient(155deg, #1a1000 0%, #2a1800 100%)"
          : "linear-gradient(155deg, #09091d 0%, #110825 100%)",
        border: seg?.jackpot ? "2px solid #ffd600" : "1.5px solid rgba(255,255,255,0.07)",
        borderRadius: 22, padding: "26px 26px 22px",
        width: "min(380px, 92vw)", position: "relative",
        boxShadow: seg?.jackpot
          ? "0 8px 70px rgba(0,0,0,0.85), 0 0 80px rgba(255,214,0,0.3)"
          : `0 8px 70px rgba(0,0,0,0.85), 0 0 60px ${accentColor}18`
      }}>
        <div style={{
          position: "absolute", top: 0, left: "12%", right: "12%", height: 3, borderRadius: 2,
          background: accentColor, boxShadow: `0 0 16px ${accentColor}`
        }} />
        {type === "mult" && phase === "game" && <MultResult seg={seg} bet={bet} winAmount={winAmount} onDone={handleResult} />}
        {type === "quick" && phase === "game" && <QuickMatch bet={bet} outcome={outcomeRef.current} winAmount={winAmount} onResult={handleResult} />}
        {type === "guess" && phase === "game" && <GuessNext bet={bet} outcome={outcomeRef.current} winAmount={winAmount} onResult={handleResult} />}
        {type === "combo" && phase === "game" && <ComboMatch bet={bet} outcome={outcomeRef.current} winAmount={winAmount} onResult={handleResult} />}
        {phase === "result" && <ResultScreen amount={resultAmount} bet={bet} onContinue={() => onClose(resultAmount)} />}
      </div>
    </div>
  );
}

// ─── Info Panel ───────────────────────────────────────────────────────────────
function InfoPanel({ onClose }) {
  const rows = [
    ["KAYIP (×5)",   "~%48", "#7c3aed", "0 TL"],
    ["x0.5 (×2)",   "~%8",  "#8b5e00", "0.5× bet"],
    ["x1.2 (×2)",   "~%7",  "#00b348", "1.2× bet"],
    ["x2 (×2)",     "~%5",  "#00b8d4", "2× bet"],
    ["x10 (×1)",    "~%1.4","#ff6d00", "10× bet 🔥"],
    ["x25 (×1)",    "~%0.7","#ffd600", "25× bet ⭐ JACKPOT"],
    ["⚡Quick (×3)", "~%14", "#00e5ff", "E[R]=0.70"],
    ["🔮Guess (×2)", "~%9",  "#d500f9", "E[R]=0.74"],
    ["🎰Combo (×2)", "~%6",  "#ff9100", "E[R]=0.78"],
  ];
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)"
    }} onClick={onClose}>
      <div style={{
        background: "linear-gradient(150deg, #09091d, #110825)",
        border: "1px solid rgba(0,229,255,0.18)", borderRadius: 18, padding: "22px 20px",
        width: "min(360px, 92vw)"
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: "Orbitron", color: "#00e5ff", marginBottom: 4, fontSize: 14 }}>📊 OYUN BİLGİSİ</h3>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Orbitron", marginBottom: 14 }}>
          Hedef RTP: ~%75.5 &nbsp;|&nbsp; 20 dilim
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 16 }}>
          {rows.map(([label, prob, color, payout]) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "5px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)"
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontFamily: "Rajdhani", fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{label}</span>
              <span style={{ color, fontFamily: "Orbitron", fontSize: 10 }}>{prob}</span>
              <span style={{ color: "rgba(255,255,255,0.3)", fontFamily: "Orbitron", fontSize: 10 }}>{payout}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{
          width: "100%", padding: "10px", borderRadius: 9,
          border: "1px solid rgba(0,229,255,0.25)", background: "rgba(0,229,255,0.06)",
          color: "#00e5ff", fontFamily: "Orbitron", fontSize: 11, cursor: "pointer"
        }}>KAPAT</button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [balance, setBalance]       = useState(null);   // null = henüz yüklenmedi
  const [currency, setCurrency]     = useState("TRY");
  const [sessionStatus, setSessionStatus] = useState("loading"); // loading | ok | error
  const [bet, setBet]               = useState(10);
  const [spinTrigger, setSpinTrigger] = useState(null);
  const [pendingSpin, setPendingSpin] = useState(null); // backend'den gelen spin sonucu
  const [modal, setModal]           = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory]       = useState([]);
  const [showInfo, setShowInfo]     = useState(false);
  const [stats, setStats]           = useState({ spent: 0, won: 0 });
  const lastModalRef                = useRef(null);

  const quickBets = [5, 10, 25, 50, 100];
  const spinning   = spinTrigger !== null;
  const sounds     = useGameSounds();

  // ── Sayfa yüklenince bakiyeyi backend'den al ────────────────────────────────
  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      setSessionStatus("error");
      return;
    }
    apiFetch("/game/balance")
      .then(data => {
        setBalance(parseFloat(data.balance));
        setCurrency(data.currency || "TRY");
        setSessionStatus("ok");
      })
      .catch(() => setSessionStatus("error"));
  }, []);

  const startSpin = async () => {
    if (spinning || balance === null || balance < bet) return;
    setLastResult(null);
    sounds.playSpin();

    try {
      // Backend'e spin isteği at — RNG orada çalışır
      const result = await apiFetch("/game/spin", {
        method: "POST",
        body: JSON.stringify({ bet }),
      });

      // Bakiyeyi hemen güncelle (optimistik değil, gerçek)
      setBalance(parseFloat(result.balance));
      setStats(s => ({
        spent: parseFloat((s.spent + bet).toFixed(2)),
        won:   parseFloat((s.won + result.winAmount).toFixed(2)),
      }));

      // Spin sonucunu sakla — çark durduğunda modal açılacak
      setPendingSpin(result);

      // Çarkı döndür — backend'den gelen segIndex ile
      setSpinTrigger({ segIndex: result.segIndex, id: Date.now() });

    } catch (err) {
      sounds.stopSpin();
      console.error("Spin hatası:", err.message);
      // Bakiyeyi yenile (olası tutarsızlık için)
      apiFetch("/game/balance").then(d => setBalance(parseFloat(d.balance))).catch(() => {});
    }
  };

  const handleSpinEnd = (detectedIndex) => {
    setSpinTrigger(null);
    sounds.stopSpin();
    const seg = SEGMENTS[detectedIndex];
    // pendingSpin backend'den geldi — miniOutcome, winAmount vs. orada belirlendi
    const spin = pendingSpin;
    setPendingSpin(null);
    const m = {
      type: seg.type,
      seg,
      // Backend'den gelen mini oyun sonucu ve kazanç
      miniOutcome: spin?.miniOutcome ?? null,
      winAmount:   spin?.winAmount  ?? 0,
    };
    lastModalRef.current = m;
    setTimeout(() => setModal(m), 320);
  };

  const handleModalClose = (amount) => {
    const m = lastModalRef.current;
    setModal(null);
    const win = parseFloat((amount || 0).toFixed(2));
    // Bakiye zaten startSpin'de backend'den güncellendi — burada tekrar değiştirmiyoruz
    if (m) {
      setLastResult({ amount: win, label: m.seg.label, type: m.seg.type, jackpot: m.seg.jackpot });
      setHistory(h => [{ label: m.seg.label, bet, win, jackpot: m.seg.jackpot }, ...h.slice(0, 11)]);
    }
  };

  const liveRTP = stats.spent > 0 ? ((stats.won / stats.spent) * 100).toFixed(1) : "—";

  // ── Session yükleniyor ────────────────────────────────────────────────────
  if (sessionStatus === "loading") {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:"#060614" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:16 }}>🎡</div>
          <div style={{ fontFamily:"Orbitron", color:"rgba(255,255,255,0.5)", fontSize:13 }}>Yükleniyor...</div>
        </div>
      </div>
    );
  }

  // ── Session geçersiz veya token yok ──────────────────────────────────────
  if (sessionStatus === "error") {
    return (
      <div style={{ minHeight:"100dvh", display:"flex", alignItems:"center", justifyContent:"center", background:"#060614" }}>
        <div style={{ textAlign:"center", padding:24 }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
          <div style={{ fontFamily:"Orbitron", color:"#ff4444", fontSize:16, marginBottom:8 }}>GEÇERSİZ OTURUM</div>
          <div style={{ fontFamily:"Rajdhani", color:"rgba(255,255,255,0.4)", fontSize:13 }}>
            Bu oyuna erişmek için geçerli bir oturum token'ı gereklidir.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#060614;color:white;font-family:'Rajdhani',sans-serif;overflow-x:hidden;}
        @keyframes fadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
        @keyframes pulseRing{0%,100%{opacity:0.4}50%{opacity:0.9}}
        @keyframes popIn{0%{transform:scale(0.4);opacity:0}65%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
        @keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes jackpotPulse{from{transform:scale(1)}to{transform:scale(1.15)}}
        @keyframes jackpotBg{0%,100%{box-shadow:0 0 30px rgba(255,214,0,0.4)}50%{box-shadow:0 0 60px rgba(255,214,0,0.8)}}
        button{outline:none;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:rgba(0,229,255,0.2);border-radius:2px;}
      `}</style>

      <div style={{
        position: "fixed", inset: 0, zIndex: -1,
        background: "radial-gradient(ellipse at 15% 45%, rgba(0,45,85,0.26) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(65,0,100,0.2) 0%, transparent 48%), #060614"
      }} />

      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", maxWidth: 460, margin: "0 auto", padding: "10px 13px 14px" }}>

        {/* Top Bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 13px", borderRadius: 13,
          background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.065)",
          backdropFilter: "blur(12px)", marginBottom: 10
        }}>
          <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 15, letterSpacing: 1.5 }}>
            <span style={{ color: "#ff6d00" }}>🔥</span>
            <span style={{ color: "white" }}>TURBO </span>
            <span style={{ color: "#ffd600" }}>MEGA</span>
            <span style={{ color: "#00e5ff" }}> ÇARK</span>
          </div>
          <div style={{
            padding: "4px 13px", borderRadius: 8,
            background: "rgba(255,214,0,0.07)", border: "1px solid rgba(255,214,0,0.22)"
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "Orbitron", textAlign: "center" }}>BAKİYE</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#ffd600", fontFamily: "Orbitron" }}>
              {balance !== null ? balance.toFixed(2) : "..."} <span style={{ fontSize: 10, opacity: 0.6 }}>{currency}</span>
            </div>
          </div>
          <button onClick={() => setShowInfo(true)}
            style={{
              width: 32, height: 32, borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 14
            }}>ℹ️</button>
        </div>

        {/* Wheel */}
        <div style={{ margin: "0 0 8px" }}>
          <Wheel spinTrigger={spinTrigger} onSpinEnd={handleSpinEnd} />
        </div>

        {/* Tüm durum mesajları çarkın ALTINDA — pointer ile hiç çakışmaz */}
        <div style={{ height: 36, marginBottom: 8, position: "relative" }}>
          {lastResult ? (
            <div style={{
              position: "absolute", inset: 0,
              textAlign: "center", padding: "6px 13px", borderRadius: 9,
              background: lastResult.jackpot
                ? "rgba(255,214,0,0.15)"
                : lastResult.amount > 0 ? "rgba(255,214,0,0.08)" : "rgba(255,68,68,0.07)",
              border: `1px solid ${lastResult.jackpot ? "rgba(255,214,0,0.6)" : lastResult.amount > 0 ? "rgba(255,214,0,0.3)" : "rgba(255,68,68,0.28)"}`,
              fontFamily: "Orbitron",
              color: lastResult.jackpot ? "#ffd600" : lastResult.amount > 0 ? "#ffd600" : "#ff5555",
              fontSize: lastResult.jackpot ? 14 : 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "slideUp 0.35s ease",
              boxShadow: lastResult.jackpot ? "0 0 20px rgba(255,214,0,0.3)" : "none"
            }}>
              {lastResult.jackpot
                ? `🏆 JACKPOT! +${lastResult.amount.toFixed(2)} TL`
                : lastResult.amount > 0
                ? `💰 +${lastResult.amount.toFixed(2)} TL — ${lastResult.label}`
                : `💀 KAYIP — ${lastResult.label}`}
            </div>
          ) : (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "Orbitron", fontSize: 11,
              color: "rgba(255,214,0,0.6)", letterSpacing: 1,
              pointerEvents: "none"
            }}>
              ⭐ x25 JACKPOT çarkta seni bekliyor
            </div>
          )}
        </div>

        {/* Spin Button */}
        <button onClick={startSpin} disabled={spinning || balance < bet}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: spinning || balance < bet
              ? "rgba(255,255,255,0.04)"
              : "linear-gradient(135deg, #005f78 0%, #003448 100%)",
            color: spinning || balance < bet ? "rgba(255,255,255,0.25)" : "white",
            fontFamily: "Orbitron", fontSize: 16, fontWeight: 900,
            cursor: spinning || balance < bet ? "not-allowed" : "pointer",
            letterSpacing: 3, marginBottom: 10,
            boxShadow: spinning || balance < bet ? "none" : "0 4px 22px rgba(0,170,210,0.32)",
            transition: "all 0.28s"
          }}>
          {spinning ? "🎡 DÖNDÜRÜLÜYOR..." : "🎡 DÖNDÜR"}
        </button>

        {/* Bet Selector */}
        <div style={{
          padding: "11px 13px", borderRadius: 12,
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
          marginBottom: 9
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <span style={{ fontFamily: "Orbitron", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>BET</span>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <button onClick={() => setBet(b => Math.max(5, b - 5))}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(0,229,255,0.3)",
                  background: "rgba(0,229,255,0.07)", color: "#00e5ff", fontSize: 15, cursor: "pointer"
                }}>−</button>
              <span style={{ fontFamily: "Orbitron", fontSize: 17, fontWeight: 700, color: "#ffd600", minWidth: 60, textAlign: "center" }}>
                {bet} TL
              </span>
              <button onClick={() => setBet(b => Math.min(200, b + 5))}
                style={{
                  width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(0,229,255,0.3)",
                  background: "rgba(0,229,255,0.07)", color: "#00e5ff", fontSize: 15, cursor: "pointer"
                }}>+</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            {quickBets.map(b => (
              <button key={b} onClick={() => setBet(b)}
                style={{
                  flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid",
                  borderColor: bet === b ? "#ffd600" : "rgba(255,255,255,0.09)",
                  background: bet === b ? "rgba(255,214,0,0.1)" : "rgba(255,255,255,0.025)",
                  color: bet === b ? "#ffd600" : "rgba(255,255,255,0.4)",
                  fontFamily: "Orbitron", fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all 0.14s"
                }}>{b}</button>
            ))}
          </div>
        </div>

        {/* Jackpot banner */}
        <div style={{
          padding: "8px 13px", borderRadius: 10, marginBottom: 9,
          background: "rgba(255,214,0,0.06)", border: "1px solid rgba(255,214,0,0.2)",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <span style={{ fontFamily: "Orbitron", fontSize: 10, color: "rgba(255,214,0,0.7)" }}>
            ⭐ JACKPOT x25
          </span>
          <span style={{ fontFamily: "Orbitron", fontSize: 13, color: "#ffd600", fontWeight: 700 }}>
            = {(bet * 25).toFixed(0)} TL
          </span>
          <span style={{ fontFamily: "Orbitron", fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
            ~%0.7 ihtimal
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
          {[
            ["HARCANAN", `${stats.spent.toFixed(0)} TL`, "#ff5555"],
            ["KAZANILAN", `${stats.won.toFixed(0)} TL`, "#00e676"],
            ["CANLI RTP", `%${liveRTP}`, "#ffd600"],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              flex: 1, padding: "7px 0", borderRadius: 9, textAlign: "center",
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.055)"
            }}>
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", fontFamily: "Orbitron", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, fontFamily: "Orbitron", color, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div style={{
            padding: "9px 13px", borderRadius: 12,
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)"
          }}>
            <div style={{ fontFamily: "Orbitron", fontSize: 9, color: "rgba(255,255,255,0.27)", marginBottom: 6 }}>SON TURLAR</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {history.map((h, i) => (
                <div key={i} style={{
                  padding: "2px 7px", borderRadius: 5, fontSize: 10,
                  background: h.jackpot ? "rgba(255,214,0,0.15)" : h.win > 0 ? "rgba(255,214,0,0.07)" : "rgba(255,68,68,0.07)",
                  border: `1px solid ${h.jackpot ? "rgba(255,214,0,0.5)" : h.win > 0 ? "rgba(255,214,0,0.22)" : "rgba(255,68,68,0.18)"}`,
                  color: h.jackpot ? "#ffd600" : h.win > 0 ? "#ffd600" : "#ff6666",
                  fontFamily: "Orbitron"
                }}>
                  {h.jackpot ? "⭐" : ""}{h.win > 0 ? `+${h.win.toFixed(0)}` : `-${h.bet}`}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {modal && <Modal type={modal.type} seg={modal.seg} bet={bet} miniOutcome={modal.miniOutcome} winAmount={modal.winAmount} onClose={handleModalClose} onWin={sounds.playWin} onLose={sounds.playLose} />}
      {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}
    </>
  );
}
