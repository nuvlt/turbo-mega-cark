import { useState, useEffect, useRef } from "react";

// ─── SEGMENT YAPISI (16 dilim) ─────────────────────────────────────────────────
const SEGMENTS = [
  { label: "KAYIP",   type: "mult", mult: 0,   color: "#0e0e22", accent: "#33336a" },
  { label: "x1.5",   type: "mult", mult: 1.5,  color: "#0a2218", accent: "#00e676" },
  { label: "KAYIP",   type: "mult", mult: 0,   color: "#0e0e22", accent: "#33336a" },
  { label: "QUICK",  type: "quick",             color: "#00101e", accent: "#00e5ff" },
  { label: "x0.8",   type: "mult", mult: 0.8,  color: "#1e0e04", accent: "#ff9100" },
  { label: "GUESS",  type: "guess",             color: "#120010", accent: "#d500f9" },
  { label: "KAYIP",   type: "mult", mult: 0,   color: "#0e0e22", accent: "#33336a" },
  { label: "x1.5",   type: "mult", mult: 1.5,  color: "#0a2218", accent: "#00e676" },
  { label: "QUICK",  type: "quick",             color: "#00101e", accent: "#00e5ff" },
  { label: "KAYIP",   type: "mult", mult: 0,   color: "#0e0e22", accent: "#33336a" },
  { label: "x3.5",   type: "mult", mult: 3.5,  color: "#200808", accent: "#ff1744" },
  { label: "GUESS",  type: "guess",             color: "#120010", accent: "#d500f9" },
  { label: "KAYIP",   type: "mult", mult: 0,   color: "#0e0e22", accent: "#33336a" },
  { label: "x0.8",   type: "mult", mult: 0.8,  color: "#1e0e04", accent: "#ff9100" },
  { label: "QUICK",  type: "quick",             color: "#00101e", accent: "#00e5ff" },
  { label: "COMBO",  type: "combo",             color: "#120800", accent: "#ff6d00" },
];

// Mini game ikonları (çark'ta görünür)
const SEG_ICON = {
  quick: "⚡",
  guess: "🔮",
  combo: "🎰",
};

const NUM_SEGS = SEGMENTS.length;
const SEG_ANGLE = 360 / NUM_SEGS; // 22.5°

// ─── Ağırlıklı segment seçimi ─────────────────────────────────────────────────
// Ağırlıklar SEGMENTS dizisiyle birebir eşleşiyor
const SEG_WEIGHTS = [8, 6, 8, 7, 5, 6, 8, 6, 7, 8, 2, 6, 8, 5, 7, 3];

function pickSegmentIndex() {
  const total = SEG_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SEGMENTS.length; i++) {
    r -= SEG_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return 0;
}

// ─── Mini oyun server outcome ─────────────────────────────────────────────────
function serverMiniOutcome(type) {
  const r = Math.random();
  if (type === "quick") return r < 0.38 ? "win" : "lose";
  if (type === "guess") return r < 0.44 ? "win" : "lose";
  if (type === "combo") {
    if (r < 0.10) return "win3";
    if (r < 0.35) return "win2";
    return "lose";
  }
  return "lose";
}

// ─── Açı Matematiği ───────────────────────────────────────────────────────────
//
// SVG'de segment i şu şekilde çiziliyor:
//   startAngle_svg = i * SEG_ANGLE - 90   (derece)
//   midAngle_svg   = (i + 0.5) * SEG_ANGLE - 90
//
// CSS rotate(R) uygulanınca çark CW R derece döner.
// Pointer sabit, SVG'nin tepesinde → SVG açısı 270° (veya -90°) noktasına bakıyor.
// Çark rotate(R) iken pointer'ın üstüne gelen SVG noktasının açısı = (270 - R) mod 360
//
// Segment i'nin ortasını pointer'a getirmek için:
//   (270 - R) mod 360  ≡  (i + 0.5) * SEG_ANGLE - 90   (mod 360)
//   R  ≡  270 - ((i + 0.5)*SEG_ANGLE - 90)              (mod 360)
//   R  ≡  360 - (i + 0.5) * SEG_ANGLE                   (mod 360)

function calcTargetRotation(segIndex, currentRotation) {
  const targetMod = ((360 - (segIndex + 0.5) * SEG_ANGLE) % 360 + 360) % 360;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  let delta = targetMod - currentMod;
  if (delta <= 0) delta += 360; // her zaman ileri git
  return currentRotation + 8 * 360 + delta;
}

// Final rotation'dan segment index tespiti (doğrulama için)
function detectSegmentFromRotation(finalRotation) {
  const finalMod = ((finalRotation % 360) + 360) % 360;
  const pointerSVGAngle = ((270 - finalMod) % 360 + 360) % 360;
  // Segment i'nin SVG aralığı: [i*SEG_ANGLE - 90, (i+1)*SEG_ANGLE - 90)
  // pointerSVGAngle + 90 → [0, 360) aralığına normalize et
  const normalized = ((pointerSVGAngle + 90) % 360 + 360) % 360;
  return Math.floor(normalized / SEG_ANGLE) % NUM_SEGS;
}

// ─── Wheel Component ──────────────────────────────────────────────────────────
// spinTrigger: { segIndex, id } — id değişince spin başlar, segIndex hedef segment
// Bu yaklaşım race condition'ı tamamen ortadan kaldırır.
function Wheel({ spinTrigger, onSpinEnd }) {
  const [currentRotation, setCurrentRotation] = useState(0);
  const rotRef = useRef(0);        // birikimli rotasyon (ref = sync)
  const animRef = useRef(null);
  const lastTriggerIdRef = useRef(null);

  useEffect(() => {
    // spinTrigger null veya aynı id ise işlem yapma
    if (!spinTrigger || spinTrigger.id === lastTriggerIdRef.current) return;
    lastTriggerIdRef.current = spinTrigger.id;

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const startRot = rotRef.current;
    const targetRot = calcTargetRotation(spinTrigger.segIndex, startRot);
    const duration = 4200 + Math.random() * 600;
    let startTs = null;

    const animate = (ts) => {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      const rot = startRot + (targetRot - startRot) * ease;
      rotRef.current = rot;
      setCurrentRotation(rot);
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        rotRef.current = targetRot;
        setCurrentRotation(targetRot);
        // Hedeflenen segment ile detect edilen segment — her zaman aynı olmalı
        const detectedIndex = detectSegmentFromRotation(targetRot);
        onSpinEnd(detectedIndex);
      }
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [spinTrigger]);

  const size = 330;
  const cx = size / 2, cy = size / 2, r = size / 2 - 12;

  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      {/* Glow ring */}
      <div style={{
        position: "absolute", inset: -18, borderRadius: "50%",
        boxShadow: "0 0 60px 10px rgba(0,229,255,0.18), 0 0 100px 20px rgba(213,0,249,0.10)",
        animation: "pulseRing 2.8s ease-in-out infinite", pointerEvents: "none"
      }} />
      {/* Pointer */}
      <div style={{
        position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0,
        borderLeft: "14px solid transparent", borderRight: "14px solid transparent",
        borderTop: "32px solid #ffd600",
        filter: "drop-shadow(0 0 12px #ffd600) drop-shadow(0 3px 6px rgba(0,0,0,0.9))",
        zIndex: 10
      }} />

      <svg width={size} height={size}
        style={{ transform: `rotate(${currentRotation}deg)`, transformOrigin: "center", display: "block" }}>
        <defs>
          {SEGMENTS.map((s, i) => (
            <radialGradient key={i} id={`wg${i}`} cx="38%" cy="32%">
              <stop offset="0%" stopColor={s.accent} stopOpacity="0.22" />
              <stop offset="100%" stopColor={s.color} stopOpacity="1" />
            </radialGradient>
          ))}
          <radialGradient id="wcg" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#1a0840" />
            <stop offset="100%" stopColor="#040410" />
          </radialGradient>
        </defs>

        {SEGMENTS.map((seg, i) => {
          const sa = ((i * SEG_ANGLE - 90) * Math.PI) / 180;
          const ea = (((i + 1) * SEG_ANGLE - 90) * Math.PI) / 180;
          const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
          const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
          const ma = sa + (SEG_ANGLE * Math.PI) / 180 / 2;
          const tr = r * 0.67;
          const tx = cx + tr * Math.cos(ma), ty = cy + tr * Math.sin(ma);
          // Metin döndürme: segment orta açısına dik (radyal)
          // Yatay okunabilirlik için SABİT açı yerine segment merkezine dönük yazıyoruz
          // ama SVG'de transform kullanarak metni segment eksenine paralel yapıyoruz
          const textRotate = (ma * 180) / Math.PI + 90;
          const arcR = r - 7;
          const ax1 = cx + arcR * Math.cos(sa + 0.03);
          const ay1 = cy + arcR * Math.sin(sa + 0.03);
          const ax2 = cx + arcR * Math.cos(ea - 0.03);
          const ay2 = cy + arcR * Math.sin(ea - 0.03);

          return (
            <g key={i}>
              <path d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                fill={`url(#wg${i})`} stroke="rgba(0,0,0,0.5)" strokeWidth="1.2" />
              {/* Accent arc */}
              <path d={`M ${ax1} ${ay1} A ${arcR} ${arcR} 0 0 1 ${ax2} ${ay2}`}
                fill="none" stroke={seg.accent} strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" />

              {/* İkon (mini oyun türü için) */}
              {seg.type !== "mult" && (
                <text x={cx + r * 0.42 * Math.cos(ma)} y={cy + r * 0.42 * Math.sin(ma)}
                  textAnchor="middle" dominantBaseline="middle"
                  transform={`rotate(${textRotate}, ${cx + r * 0.42 * Math.cos(ma)}, ${cy + r * 0.42 * Math.sin(ma)})`}
                  fontSize="14">
                  {SEG_ICON[seg.type]}
                </text>
              )}

              {/* Etiket — segment eksenine göre döndürülmüş, radyal */}
              <text x={tx} y={ty}
                textAnchor="middle" dominantBaseline="middle"
                transform={`rotate(${textRotate}, ${tx}, ${ty})`}
                fontSize={seg.type === "mult" && seg.label.length <= 4 ? "13" : "11"}
                fontWeight="800" fontFamily="'Orbitron', monospace"
                fill={seg.accent}
                style={{ filter: "drop-shadow(0 0 5px rgba(0,0,0,1)) drop-shadow(0 1px 2px rgba(0,0,0,1))" }}>
                {seg.label}
              </text>
            </g>
          );
        })}

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={44} fill="url(#wcg)" stroke="rgba(0,229,255,0.4)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={37} fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="1" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fontWeight="900" fontFamily="'Orbitron', monospace" fill="#00e5ff" letterSpacing="2">
          SPIN
        </text>

        {/* Rim dots — segment sınırlarında */}
        {Array.from({ length: NUM_SEGS }).map((_, i) => {
          const a = (i / NUM_SEGS) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i}
            cx={cx + (r + 6) * Math.cos(a)} cy={cy + (r + 6) * Math.sin(a)}
            r={3.5} fill="#ffd600" opacity="0.9" />;
        })}
        {/* Ara noktalar (daha küçük) */}
        {Array.from({ length: NUM_SEGS }).map((_, i) => {
          const a = ((i + 0.5) / NUM_SEGS) * Math.PI * 2 - Math.PI / 2;
          return <circle key={`m${i}`}
            cx={cx + (r + 6) * Math.cos(a)} cy={cy + (r + 6) * Math.sin(a)}
            r={1.8} fill="rgba(255,255,255,0.2)" />;
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
                fontFamily: "Orbitron", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.18s"
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
      <h3 style={{ color: "#ff6d00", fontFamily: "Orbitron", marginBottom: 5, fontSize: 16 }}>🎰 COMBO MATCH</h3>
      <p style={{ color: "rgba(255,255,255,0.45)", marginBottom: 16, fontSize: 12 }}>2 aynı → x1.5 &nbsp;|&nbsp; 3 aynı → x4</p>
      <div style={{ display: "flex", gap: 9, justifyContent: "center", marginBottom: 18 }}>
        {reels.map((icon, i) => (
          <div key={i} style={{
            width: 74, height: 74, borderRadius: 12, border: "2px solid",
            borderColor: spinning ? "#ff6d00" : "rgba(255,109,0,0.28)",
            background: "rgba(20,10,0,0.9)", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 32,
            boxShadow: spinning ? "0 0 18px rgba(255,109,0,0.55)" : "inset 0 2px 8px rgba(0,0,0,0.6)",
            transition: "box-shadow 0.1s"
          }}>{icon}</div>
        ))}
      </div>
      {!done && (
        <button onClick={spinReels} disabled={spinning}
          style={{
            padding: "11px 34px", borderRadius: 9, border: "2px solid #ff6d00",
            background: spinning ? "rgba(255,109,0,0.06)" : "rgba(255,109,0,0.16)",
            color: spinning ? "rgba(255,255,255,0.35)" : "white",
            fontFamily: "Orbitron", fontSize: 12, fontWeight: 700,
            cursor: spinning ? "not-allowed" : "pointer", transition: "all 0.18s"
          }}>
          {spinning ? "🎰 Döndürülüyor..." : "🎰 DÖNDÜR"}
        </button>
      )}
      {msg && (
        <div style={{
          marginTop: 12, padding: "9px 16px", borderRadius: 9,
          background: msg.win ? "rgba(255,109,0,0.1)" : "rgba(255,68,68,0.09)",
          border: `1px solid ${msg.win ? "rgba(255,109,0,0.45)" : "rgba(255,68,68,0.38)"}`,
          color: msg.win ? "#ff9100" : "#ff5555", fontFamily: "Orbitron", fontSize: 12
        }}>{msg.text}</div>
      )}
    </div>
  );
}

// ─── Mult Result (instant) ────────────────────────────────────────────────────
function MultResult({ seg, bet, onDone }) {
  const win = Math.round(bet * (seg.mult || 0) * 100) / 100;
  useEffect(() => {
    const t = setTimeout(() => onDone(win), (seg.mult || 0) === 0 ? 1100 : 1700);
    return () => clearTimeout(t);
  }, []);
  const isLoss = !seg.mult || seg.mult === 0;
  const isBig = seg.mult >= 3;
  return (
    <div style={{ textAlign: "center", animation: "popIn 0.4s ease" }}>
      <div style={{ fontSize: 54, marginBottom: 10 }}>{isLoss ? "💀" : isBig ? "🔥" : "💰"}</div>
      {isLoss ? (
        <>
          <h3 style={{ fontFamily: "Orbitron", color: "#ff4444", fontSize: 24, marginBottom: 6 }}>KAYIP</h3>
          <p style={{ color: "rgba(255,255,255,0.35)", fontFamily: "Orbitron", fontSize: 12 }}>Bet: {bet} TL</p>
        </>
      ) : (
        <>
          <h3 style={{ fontFamily: "Orbitron", color: isBig ? "#ff6d00" : "#00e676", fontSize: 26, marginBottom: 4 }}>
            {seg.label}
          </h3>
          <div style={{
            fontSize: 34, fontFamily: "Orbitron", fontWeight: 900,
            color: isBig ? "#ff6d00" : "#ffd600",
            textShadow: `0 0 24px ${isBig ? "#ff6d0099" : "#ffd60099"}`, marginBottom: 6
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
  return (
    <div style={{ textAlign: "center", animation: "fadeIn 0.3s ease" }}>
      <div style={{ fontSize: 58, marginBottom: 10 }}>{isWin ? (amount >= bet * 3 ? "🔥" : "🏆") : "💀"}</div>
      <h3 style={{
        fontFamily: "Orbitron", fontSize: 24, marginBottom: 5,
        color: isWin ? "#ffd600" : "#ff4444",
        textShadow: isWin ? "0 0 22px rgba(255,214,0,0.75)" : "none"
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
function Modal({ type, seg, bet, onClose }) {
  const [phase, setPhase] = useState("game");
  const [resultAmount, setResultAmount] = useState(0);
  // Mini oyun outcome server-side belirleniyor — BURASI KRİTİK
  // type === "mult" ise doğrudan seg.mult kullanılıyor, serverMiniOutcome çağrılmıyor
  const outcomeRef = useRef(type !== "mult" ? serverMiniOutcome(type) : null);
  const accentColor = { mult: "#ffd600", quick: "#00e5ff", guess: "#d500f9", combo: "#ff6d00" }[type] || "#ffd600";

  const handleResult = (amt) => { setResultAmount(amt); setPhase("result"); };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(14px)", animation: "fadeIn 0.22s ease"
    }}>
      <div style={{
        background: "linear-gradient(155deg, #09091d 0%, #110825 100%)",
        border: "1.5px solid rgba(255,255,255,0.07)", borderRadius: 22, padding: "26px 26px 22px",
        width: "min(380px, 92vw)", position: "relative",
        boxShadow: `0 8px 70px rgba(0,0,0,0.85), 0 0 60px ${accentColor}18`
      }}>
        <div style={{
          position: "absolute", top: 0, left: "12%", right: "12%", height: 2.5, borderRadius: 2,
          background: accentColor, boxShadow: `0 0 12px ${accentColor}`
        }} />
        {type === "mult" && phase === "game" && <MultResult seg={seg} bet={bet} onDone={handleResult} />}
        {type === "quick" && phase === "game" && <QuickMatch bet={bet} outcome={outcomeRef.current} onResult={handleResult} />}
        {type === "guess" && phase === "game" && <GuessNext bet={bet} outcome={outcomeRef.current} onResult={handleResult} />}
        {type === "combo" && phase === "game" && <ComboMatch bet={bet} outcome={outcomeRef.current} onResult={handleResult} />}
        {phase === "result" && <ResultScreen amount={resultAmount} bet={bet} onContinue={() => onClose(resultAmount)} />}
      </div>
    </div>
  );
}

// ─── Info Panel ───────────────────────────────────────────────────────────────
function InfoPanel({ onClose }) {
  const rows = [
    ["KAYIP (×5)", "%31", "#33336a", "0 TL"],
    ["x0.8 (×2)", "%12", "#ff9100", "0.8× bet"],
    ["x1.5 (×2)", "%12", "#00e676", "1.5× bet"],
    ["x3.5 (×1)", "%6",  "#ff1744", "3.5× bet"],
    ["⚡Quick (×3)", "%18", "#00e5ff", "E[R]=0.76"],
    ["🔮Guess (×2)", "%12", "#d500f9", "E[R]=0.79"],
    ["🎰Combo (×1)", "%6",  "#ff6d00", "E[R]=0.78"],
  ];
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)"
    }} onClick={onClose}>
      <div style={{
        background: "linear-gradient(150deg, #09091d, #110825)",
        border: "1px solid rgba(0,229,255,0.18)", borderRadius: 18, padding: "22px 20px",
        width: "min(350px, 90vw)"
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontFamily: "Orbitron", color: "#00e5ff", marginBottom: 4, fontSize: 14 }}>📊 OYUN BİLGİSİ</h3>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "Orbitron", marginBottom: 14 }}>
          Hedef RTP: ~%75 &nbsp;|&nbsp; 16 dilim
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {rows.map(([label, prob, color, payout]) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)"
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontFamily: "Rajdhani", fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{label}</span>
              <span style={{ color, fontFamily: "Orbitron", fontSize: 11 }}>{prob}</span>
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
  const [balance, setBalance] = useState(1000);
  const [bet, setBet] = useState(10);
  // spinTrigger: null = idle, { segIndex, id } = spinning
  // segIndex ve id AYNI state güncellemesinde set edilir → race condition yok
  const [spinTrigger, setSpinTrigger] = useState(null);
  const [modal, setModal] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const [stats, setStats] = useState({ spent: 0, won: 0 });
  const lastModalRef = useRef(null); // closure-safe modal ref

  const quickBets = [5, 10, 25, 50, 100];
  const spinning = spinTrigger !== null;

  const startSpin = () => {
    if (spinning || balance < bet) return;
    setBalance(b => parseFloat((b - bet).toFixed(2)));
    setStats(s => ({ ...s, spent: s.spent + bet }));
    setLastResult(null);
    const idx = pickSegmentIndex();
    // segIndex ve trigger id tek seferde → Wheel useEffect her zaman doğru segIndex'i görür
    setSpinTrigger({ segIndex: idx, id: Date.now() });
  };

  const handleSpinEnd = (detectedIndex) => {
    setSpinTrigger(null); // spinning bitti
    const seg = SEGMENTS[detectedIndex];
    const m = { type: seg.type, seg };
    lastModalRef.current = m;
    setTimeout(() => setModal(m), 320);
  };

  const handleModalClose = (amount) => {
    const m = lastModalRef.current;
    setModal(null);
    const win = parseFloat(amount.toFixed(2));
    if (win > 0) {
      setBalance(b => parseFloat((b + win).toFixed(2)));
      setStats(s => ({ ...s, won: s.won + win }));
    }
    if (m) {
      setLastResult({ amount: win, label: m.seg.label, type: m.seg.type });
      setHistory(h => [{ label: m.seg.label, bet, win }, ...h.slice(0, 11)]);
    }
  };

  const liveRTP = stats.spent > 0 ? ((stats.won / stats.spent) * 100).toFixed(1) : "—";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box;}
        body{background:#060614;color:white;font-family:'Rajdhani',sans-serif;overflow-x:hidden;}
        @keyframes fadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
        @keyframes pulseRing{0%,100%{opacity:0.45}50%{opacity:1}}
        @keyframes popIn{0%{transform:scale(0.4);opacity:0}65%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
        @keyframes slideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        button{outline:none;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:rgba(0,229,255,0.2);border-radius:2px;}
      `}</style>

      <div style={{
        position: "fixed", inset: 0, zIndex: -1,
        background: "radial-gradient(ellipse at 15% 45%, rgba(0,45,85,0.26) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(65,0,100,0.2) 0%, transparent 48%), #060614"
      }} />

      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", maxWidth: 450, margin: "0 auto", padding: "10px 13px 14px" }}>

        {/* Top Bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 13px", borderRadius: 13,
          background: "rgba(255,255,255,0.028)", border: "1px solid rgba(255,255,255,0.065)",
          backdropFilter: "blur(12px)", marginBottom: 10
        }}>
          <div style={{ fontFamily: "Orbitron", fontWeight: 900, fontSize: 15, letterSpacing: 1.5 }}>
            <span style={{ color: "#00e5ff" }}>⚡</span>
            <span style={{ color: "white" }}>SPIN</span>
            <span style={{ color: "#d500f9" }}>VERSE</span>
          </div>
          <div style={{
            padding: "4px 13px", borderRadius: 8,
            background: "rgba(255,214,0,0.07)", border: "1px solid rgba(255,214,0,0.22)"
          }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "Orbitron", textAlign: "center" }}>BAKİYE</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#ffd600", fontFamily: "Orbitron" }}>
              {balance.toFixed(2)} <span style={{ fontSize: 10, opacity: 0.6 }}>TL</span>
            </div>
          </div>
          <button onClick={() => setShowInfo(true)}
            style={{
              width: 32, height: 32, borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 14
            }}>ℹ️</button>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div style={{
            textAlign: "center", padding: "6px 13px", borderRadius: 9, marginBottom: 9,
            background: lastResult.amount > 0 ? "rgba(255,214,0,0.08)" : "rgba(255,68,68,0.07)",
            border: `1px solid ${lastResult.amount > 0 ? "rgba(255,214,0,0.3)" : "rgba(255,68,68,0.28)"}`,
            fontFamily: "Orbitron", color: lastResult.amount > 0 ? "#ffd600" : "#ff5555", fontSize: 13,
            animation: "slideUp 0.35s ease"
          }}>
            {lastResult.amount > 0
              ? `🏆 +${lastResult.amount.toFixed(2)} TL — ${lastResult.label}`
              : `💀 KAYIP — ${lastResult.label}`}
          </div>
        )}

        {/* Wheel */}
        <div style={{ margin: "2px 0 14px" }}>
          <Wheel
            spinTrigger={spinTrigger}
            onSpinEnd={handleSpinEnd}
          />
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
            <span style={{ fontFamily: "Orbitron", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>BET MİKTARI</span>
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

        {/* Legend */}
        <div style={{
          padding: "9px 13px", borderRadius: 12,
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.055)",
          marginBottom: 9
        }}>
          <div style={{ fontFamily: "Orbitron", fontSize: 9, color: "rgba(255,255,255,0.27)", marginBottom: 7 }}>
            %62.5 ÇARPAN / %37.5 MİNİ OYUN
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[
              ["#33336a", "KAYIP", "×5"],
              ["#ff9100", "x0.8", "×2"],
              ["#00e676", "x1.5", "×2"],
              ["#ff1744", "x3.5🔥", "×1"],
              ["#00e5ff", "⚡Quick", "×3"],
              ["#d500f9", "🔮Guess", "×2"],
              ["#ff6d00", "🎰Combo", "×1"],
            ].map(([color, label, count]) => (
              <div key={label} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "3px 7px",
                borderRadius: 5, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)"
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "Rajdhani", fontWeight: 600 }}>
                  {label} <span style={{ color: "rgba(255,255,255,0.22)", fontSize: 9 }}>{count}</span>
                </span>
              </div>
            ))}
          </div>
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
                  background: h.win > 0 ? "rgba(255,214,0,0.07)" : "rgba(255,68,68,0.07)",
                  border: `1px solid ${h.win > 0 ? "rgba(255,214,0,0.22)" : "rgba(255,68,68,0.18)"}`,
                  color: h.win > 0 ? "#ffd600" : "#ff6666", fontFamily: "Orbitron"
                }}>
                  {h.win > 0 ? `+${h.win.toFixed(0)}` : `-${h.bet}`}
                  <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 8, marginLeft: 3 }}>{h.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {modal && <Modal type={modal.type} seg={modal.seg} bet={bet} onClose={handleModalClose} />}
      {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}
    </>
  );
}
