// ===== URL 파라미터(텔레그램 웹앱에서 전달됨) =====
const url = new URL(location.href);
const raceId     = Number(url.searchParams.get("race_id") || 1);
const startTime  = Number(url.searchParams.get("start_time") || Math.floor(Date.now()/1000));
const raceToken  = url.searchParams.get("race_token") || "";
const BETTING_SEC = 300;    // 5분
const RACE_SEC    = 12;     // 서버 기준과 UI 맞춤

// 텔레그램 WebApp
const tg = window.Telegram?.WebApp;
if (tg){ tg.expand(); tg.setHeaderColor("#0b0f15"); tg.setBackgroundColor("#0b0f15"); }
const initData = tg?.initData || "";

// ===== 데이터 =====
const horses = [
  { emoji:"⚫", name:"블랙썬더",   odd:8.5,  color:"#d1d5db" },
  { emoji:"🔴", name:"레드불",     odd:3.2,  color:"#ef4444" },
  { emoji:"🟡", name:"골든윈드",   odd:12.0, color:"#f59e0b" },
  { emoji:"🔵", name:"블루스트ーム",odd:5.1, color:"#60a5fa" },
  { emoji:"🟢", name:"그린파워",   odd:7.8,  color:"#10b981" },
  { emoji:"🟣", name:"퍼플킹",     odd:15.0, color:"#a78bfa" },
];

// ===== DOM =====
const meta = document.getElementById("raceMeta");
const statusEl = document.getElementById("status");
const oddsRow = document.getElementById("oddsRow");
const betButtons = document.getElementById("betButtons");
const scoreBtn = document.getElementById("scoreBtn");
const stage = document.getElementById("stage");
const cdBox = document.getElementById("countdown");
const photo = document.getElementById("photoFinish");
const confettiBox = document.getElementById("confetti");

// 캔버스
const bg = document.getElementById("bg");
const track = document.getElementById("track");
const fx = document.getElementById("fx");
const bgx = bg.getContext("2d");
const ctx = track.getContext("2d");
const fxx = fx.getContext("2d");

// ===== UI 생성 =====
horses.forEach(h=>{
  const t=document.createElement("div");
  t.className="tag";
  t.textContent=`${h.emoji} ${h.name} (${h.odd}배)`;
  oddsRow.appendChild(t);
});
let selected=null;
horses.forEach((h,i)=>{
  const b=document.createElement("button");
  b.className="btn";
  b.textContent=`${h.emoji} ${h.name}`;
  b.onclick=()=>{
    if (initAudioIfNeeded()) playTap();
    selected=i;
    [...betButtons.children].forEach(x=>x.classList.remove("selected"));
    b.classList.add("selected");
    sendBet(i);
  };
  betButtons.appendChild(b);
});
scoreBtn.onclick=()=>{ if (initAudioIfNeeded()) playTap(); sendData({action:"myscore"}); };

// ===== 오디오(말발굽 소리 합성) =====
let audioInited=false, ac, hoofGain, tapGain;
function initAudioIfNeeded(){
  if (audioInited) return true;
  try{
    ac = new (window.AudioContext||window.webkitAudioContext)();
    hoofGain = ac.createGain(); hoofGain.gain.value = 0.0; hoofGain.connect(ac.destination);
    tapGain  = ac.createGain();  tapGain.gain.value  = 0.0; tapGain.connect(ac.destination);
    audioInited=true; return true;
  }catch{ return false; }
}
function thump(volume=0.4, pitch=90){
  if (!audioInited) return;
  const o = ac.createOscillator(); o.type="triangle"; o.frequency.value = pitch;
  const g = ac.createGain(); g.gain.setValueAtTime(volume, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+0.12);
  o.connect(g).connect(hoofGain); o.start(); o.stop(ac.currentTime+0.13);
}
function playTap(){
  if (!audioInited) return;
  const o = ac.createOscillator(); o.type="square"; o.frequency.value=400;
  const g = ac.createGain(); g.gain.setValueAtTime(0.08, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+0.07);
  o.connect(g).connect(tapGain); o.start(); o.stop(ac.currentTime+0.08);
}
function updateMix(leadSpeedNorm){
  if (!audioInited) return;
  hoofGain.gain.linearRampToValueAtTime(0.08 + leadSpeedNorm*0.12, ac.currentTime+0.05);
  tapGain.gain.linearRampToValueAtTime(0.04, ac.currentTime+0.05);
}

// ===== 트랙/카메라 파라미터 =====
const W = track.width, H = track.height;
const lanes = horses.length;
const laneH = Math.floor(H/lanes);
const finishX = W - 52;    // 결승선
const startX  = 26;        // 출발선
const cam = { x:0, target:0, zoom:1 };

const pos   = new Array(lanes).fill(startX);
const phase = new Array(lanes).fill(0);        // 다리 사이클
const velBase = horses.map(h => 1.55 + (1/h.odd)); // 배당 영향
const vel   = velBase.slice();

// 버스트(스프린트) 스케줄/먼지/트레일
const bursts = horses.map(h=>({t1:2+Math.random()*4, t2:6+Math.random()*4, on:false, left:0}));
const particles=[];

function addDust(x,y,color){
  for(let i=0;i<3;i++){
    particles.push({
      x: x-6, y: y+6, vx: -(0.6+Math.random()*1.3), vy: - (Math.random()*0.6),
      life: 380+Math.random()*280, age:0, color
    });
  }
}

// ===== 말 그리기(벡터 애니메이션) =====
// gallopPhase: 0~2π, 속도에 따라 위/아래 바운싱, 앞/뒷다리 위상차
function drawHorseVector(x,y,color,emoji,gallopPhase,scale=1){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);

  // 체중이동(상/하)
  const bob = Math.sin(gallopPhase*2)*1.5;

  // 몸통
  ctx.translate(0,bob);
  ctx.fillStyle = color;
  roundedRect(-16,-7,34,14,6);
  ctx.fill();
  // 목+머리
  ctx.beginPath();
  ctx.ellipse(22,-2,7,6,0,0,Math.PI*2); ctx.fill();

  // 갈기(사인파)
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const px = -12 + i*4;
    const py = -7 - Math.sin(gallopPhase*3 + i*.7)*2;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.stroke();

  // 꼬리(지연 위상)
  ctx.beginPath();
  ctx.moveTo(-16,0);
  for(let t=0;t<5;t++){
    const px = -20 - t*3;
    const py = Math.sin(gallopPhase*3 - t*.6)*2;
    ctx.lineTo(px,py);
  }
  ctx.stroke();

  // 다리(앞/뒤 위상차, 삼각형/사각형 단순화)
  const a = Math.sin(gallopPhase)*7;      // 앞다리 각
  const b = Math.sin(gallopPhase+Math.PI)*7; // 뒷다리 각
  leg(-6,7,a);  leg(4,7,a*0.85);
  leg(-12,7,b); leg(-2,7,b*0.9);

  // 이모지(말 머리 앞쪽)
  ctx.font="13px system-ui"; ctx.fillStyle="#fff";
  ctx.fillText(emoji, -28, 4);

  ctx.restore();

  // 내부 도우미
  function roundedRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
  function leg(lx,ly,ang){
    ctx.save();
    ctx.translate(lx,ly);
    ctx.rotate(ang*Math.PI/180);
    ctx.fillStyle=color;
    ctx.fillRect(-2,0,4,8);        // 허벅지
    ctx.fillRect(-1,8,2,6);        // 정강이
    ctx.fillRect(-3,13,6,3);       // 발굽
    ctx.restore();
  }
}

// ===== 배경/레이어 =====
function drawBackground(time){
  bgx.clearRect(0,0,W,H);

  // 관중 점 + 웨이브
  const rows=4;
  for(let r=0;r<rows;r++){
    const y=10+r*8;
    const amp=0.6 + r*0.25;
    for(let i=0;i<38;i++){
      const x=6+i*12 + Math.sin(time*.002 + i*.32 + r)*amp;
      const a=.24 + r*.08;
      bgx.fillStyle=`rgba(226,232,240,${a})`;
      bgx.fillRect(x,y,3,3);
    }
  }

  // 잔디/트랙 라인
  for(let i=0;i<lanes;i++){
    bgx.fillStyle = i%2? "#0e1728":"#0c1423";
    bgx.fillRect(0,i*laneH,W,laneH);
    bgx.strokeStyle="#152033";
    bgx.beginPath(); bgx.moveTo(0,i*laneH); bgx.lineTo(W,i*laneH); bgx.stroke();
  }

  // 결승선
  bgx.strokeStyle="#22d3ee"; bgx.setLineDash([6,4]);
  bgx.beginPath(); bgx.moveTo(finishX,0); bgx.lineTo(finishX,H); bgx.stroke();
  bgx.setLineDash([]);
}

function drawFX(dt){
