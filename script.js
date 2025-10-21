// ===== URL 파라미터: race_id & start_time & race_token =====
const url = new URL(location.href);
const raceId     = Number(url.searchParams.get("race_id") || 1);
const startTime  = Number(url.searchParams.get("start_time") || Math.floor(Date.now()/1000));
const raceToken  = url.searchParams.get("race_token") || ""; // 서버가 생성한 토큰
const bettingSeconds = 300; // 5분
const raceSeconds    = 12;

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.setHeaderColor("#0b0f15");
  tg.setBackgroundColor("#0b0f15");
}
const initData = tg?.initData || ""; // 서명된 사용자 정보(검증용)

// ===== 데이터 =====
const horses = [
  { emoji: "⚫", name: "블랙썬더", odd: 8.5,  color: "#9ca3af" },
  { emoji: "🔴", name: "레드불",   odd: 3.2,  color: "#ef4444" },
  { emoji: "🟡", name: "골든윈드", odd: 12.0, color: "#f59e0b" },
  { emoji: "🔵", name: "블루스트ーム", odd: 5.1, color: "#3b82f6" },
  { emoji: "🟢", name: "그린파워", odd: 7.8,  color: "#10b981" },
  { emoji: "🟣", name: "퍼플킹",   odd: 15.0, color: "#a855f7" },
];

// ===== UI =====
const meta       = document.getElementById("raceMeta");
const canvas     = document.getElementById("track");
const ctx        = canvas.getContext("2d");
const oddsRow    = document.getElementById("oddsRow");
const betButtons = document.getElementById("betButtons");
const statusEl   = document.getElementById("status");
const scoreBtn   = document.getElementById("scoreBtn");

// 태그 렌더
horses.forEach(h => {
  const div = document.createElement("div");
  div.className = "tag";
  div.textContent = `${h.emoji} ${h.name} (${h.odd}배)`;
  oddsRow.appendChild(div);
});

// 베팅 버튼
let selected = null;
horses.forEach((h, i) => {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = `${h.emoji} ${h.name}`;
  b.onclick = () => {
    selected = i;
    [...betButtons.children].forEach(x => x.classList.remove("selected"));
    b.classList.add("selected");
    statusEl.textContent = `선택됨: ${h.emoji} ${h.name}`;
    sendBet(i);
  };
  betButtons.appendChild(b);
});

scoreBtn.onclick = () => {
  sendData({ action: "myscore" });
};

// ===== 캔버스 =====
const W = canvas.width;
const H = canvas.height;
const lanes = horses.length;
const laneHeight = Math.floor(H / lanes);

function drawTrackBackground() {
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < lanes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#0b1220" : "#0d1525";
    ctx.fillRect(0, i*laneHeight, W, laneHeight);
    ctx.strokeStyle = "#1f2937";
    ctx.beginPath(); ctx.moveTo(0, i*laneHeight); ctx.lineTo(W, i*laneHeight); ctx.stroke();
  }
  ctx.strokeStyle = "#22d3ee";
  ctx.setLineDash([6,4]);
  ctx.beginPath(); ctx.moveTo(W-40, 0); ctx.lineTo(W-40, H); ctx.stroke();
  ctx.setLineDash([]);
}

function drawHorse(x, y, color, emoji) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 6, 26, 12);
  ctx.beginPath(); ctx.arc(x + 30, y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x + 4,  y + 7, 6, 4);
  ctx.fillRect(x + 14, y + 7, 6, 4);
  ctx.font = "12px system-ui";
  ctx.fillText(emoji, x - 12, y + 4);
}

// ===== 레이스 애니메이션 =====
const pxFinish = W - 50;
const pos = new Array(lanes).fill(10);
const velBase = horses.map(h => 1.6 + (1 / h.odd));
let phase = "betting";  // betting → racing → finished
let startRaceAt = 0;
let winnerIdx = null;

function updateMeta() {
  const now = Math.floor(Date.now()/1000);
  const elapsed = now - startTime;
  const remain = bettingSeconds - elapsed;
  if (remain > 0) {
    phase = "betting";
    const m = Math.floor(remain / 60);
    const s = remain % 60;
    meta.textContent = `제${raceId}경기 베팅 오픈 • ${m}:${String(s).padStart(2,"0")} 남음`;
  } else if (remain <= 0 && remain > -raceSeconds) {
    if (phase !== "racing") startRaceAt = Date.now();
    phase = "racing";
    const sec = Math.min(raceSeconds, Math.floor((Date.now() - startRaceAt) / 1000) + 1);
    meta.textContent = `제${raceId}경기 LIVE • ${sec}초`;
  } else {
    phase = "finished";
    meta.textContent = `제${raceId}경기 종료 (공식 결과는 채널 메시지 참조)`;
  }
}

function stepPhysics(dt) {
  for (let i = 0; i < lanes; i++) {
    const base = velBase[i];
    const fatigue = Math.max(0, (Date.now() - startRaceAt)/1000) / 20;
    const jitter = (Math.random()-0.5) * 0.6;
    const accel = Math.max(1.0, base + jitter - fatigue);
    pos[i] = Math.min(pxFinish, pos[i] + accel * (dt * 12));
  }
}

let lastTs = performance.now();
function loop(ts) {
  const dt = (ts - lastTs) / 1000;
  lastTs = ts;

  updateMeta();
  drawTrackBackground();

  if (phase === "racing") stepPhysics(dt);

  for (let i = 0; i < lanes; i++) {
    const y = Math.floor(i*laneHeight + laneHeight/2);
    drawHorse(pos[i], y, horses[i].color, horses[i].emoji);
  }

  if (phase === "finished" && winnerIdx === null) {
    let best = 0, idx = 0;
    for (let i = 0; i < lanes; i++) {
      if (pos[i] > best) { best = pos[i]; idx = i; }
    }
    winnerIdx = idx;
    statusEl.textContent = `비공식 우승: ${horses[idx].emoji} ${horses[idx].name} (공식: 채널 확인)`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ===== 데이터 전송 =====
function sendData(obj) {
  if (!tg) {
    alert("Telegram WebApp 아님: " + JSON.stringify(obj));
    return;
  }
  obj.init_data = initData;         // 서명 검증용
  tg.sendData(JSON.stringify(obj));
  tg.HapticFeedback?.impactOccurred("soft");
}

function sendBet(horseIndex) {
  const now = Math.floor(Date.now()/1000);
  if (now - startTime >= bettingSeconds) {
    statusEl.textContent = "베팅 마감되었습니다.";
    tg?.HapticFeedback?.notificationOccurred("error");
    return;
  }
  if (!raceToken) {
    statusEl.textContent = "레이스 토큰 누락(관리자에게 문의)";
    return;
  }
  sendData({ action: "bet", race_id: raceId, horse: horseIndex, race_token: raceToken });
  const h = horses[horseIndex];
  statusEl.textContent = `보냄: 제${raceId}경기 ${h.emoji} ${h.name} 베팅`;
}

// 초기 라벨
statusEl.textContent = `제${raceId}경기 • 베팅 또는 관전 가능`;
