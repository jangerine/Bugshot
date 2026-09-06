// Firebase 설정 (본인의 Firebase 프로젝트 설정값으로 변경 필요)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let roomCode = "";
let myRole = ""; // "p1" 또는 "p2"
let roomRef = null;
let gameState = {};

const ITEMS = ["MAGNIFIER", "CIGARETTE", "SAW", "HANDCUFFS"];
const ITEM_NAMES = { MAGNIFIER: "🔍돋보기", CIGARETTE: "🚬담배", SAW: "🪚톱", HANDCUFFS: "🔗수갑" };

// DOM 요소
const lobbyScreen = document.getElementById("lobby-screen");
const gameScreen = document.getElementById("game-screen");

// 방 생성
document.getElementById("btn-create").addEventListener("click", () => {
  const name = document.getElementById("player-name").value || "P1";
  roomCode = document.getElementById("room-code").value || Math.floor(1000 + Math.random() * 9000).toString();
  myRole = "p1";
  
  roomRef = db.ref("rooms/" + roomCode);
  roomRef.set({
    p1: { name: name, hp: 4, items: [] },
    p2: { name: "대기 중...", hp: 4, items: [] },
    turn: "p1",
    bullets: [], // [true(실탄), false(공포탄)]
    sawActive: false,
    handcuffsActive: false,
    status: "WAITING",
    logs: "상대방 접속을 기다립니다."
  }).then(() => initRoomListener());
});

// 방 입장
document.getElementById("btn-join").addEventListener("click", () => {
  const name = document.getElementById("player-name").value || "P2";
  roomCode = document.getElementById("room-code").value;
  if (!roomCode) return alert("방 코드를 입력하세요.");
  myRole = "p2";

  roomRef = db.ref("rooms/" + roomCode);
  roomRef.once("value", (snapshot) => {
    if (!snapshot.exists()) return alert("존재하지 않는 방입니다.");
    
    roomRef.update({
      "p2/name": name,
      status: "PLAYING"
    });
    
    // P2 입장 시 첫 라운드 셋팅 (P1이 진행해도 됨)
    startNewRound();
    initRoomListener();
  });
});

// 리스너 연동
function initRoomListener() {
  lobbyScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  document.getElementById("my-name").innerText = myRole === "p1" ? "나 (P1)" : "나 (P2)";
  document.getElementById("opp-name").innerText = myRole === "p1" ? "상대 (P2)" : "상대 (P1)";

  roomRef.on("value", (snapshot) => {
    gameState = snapshot.val();
    if (!gameState) return;
    updateUI();
  });
}

// 새로운 라운드 (탄환 & 아이템 지급)
function startNewRound() {
  const live = Math.floor(Math.random() * 3) + 1; // 실탄 1~3개
  const blank = Math.floor(Math.random() * 3) + 1; // 공포탄 1~3개
  
  let bullets = [];
  for(let i=0; i<live; i++) bullets.push(true);
  for(let i=0; i<blank; i++) bullets.push(false);
  bullets.sort(() => Math.random() - 0.5); // 셔플

  const p1NewItems = [...(gameState.p1?.items || []), getRandomItem()].slice(0, 4);
  const p2NewItems = [...(gameState.p2?.items || []), getRandomItem()].slice(0, 4);

  roomRef.update({
    bullets: bullets,
    "p1/items": p1NewItems,
    "p2/items": p2NewItems,
    status: "PLAYING",
    logs: `새 탄환 장전! (실탄 ${live}개, 공포탄 ${blank}개)`
  });
}

function getRandomItem() {
  return ITEMS[Math.floor(Math.random() * ITEMS.length)];
}

// 화면 동기화
function updateUI() {
  const oppRole = myRole === "p1" ? "p2" : "p1";
  
  // HP 업데이트 (하트 표시)
  document.getElementById("my-hp").innerText = "❤️".repeat(gameState[myRole].hp);
  document.getElementById("opp-hp").innerText = "❤️".repeat(gameState[oppRole].hp);
  document.getElementById("opp-name").innerText = gameState[oppRole].name;

  // 탄환 남은 개수
  const liveCount = gameState.bullets.filter(b => b === true).length;
  const blankCount = gameState.bullets.filter(b => b === false).length;
  document.getElementById("bullet-info").innerText = `남은 실탄: ${liveCount} | 공포탄: ${blankCount}`;
  document.getElementById("status-text").innerText = gameState.logs;

  // 턴 및 버튼 상태
  const isMyTurn = gameState.turn === myRole && gameState.status === "PLAYING";
  document.getElementById("btn-shoot-opp").disabled = !isMyTurn;
  document.getElementById("btn-shoot-self").disabled = !isMyTurn;

  // 아이템 UI 렌더링
  renderItems("my-items", gameState[myRole].items || [], true, isMyTurn);
  renderItems("opp-items", gameState[oppRole].items || [], false, false);

  // 탄환이 다 떨어졌으면 새 라운드 (P1이 주도)
  if (gameState.bullets.length === 0 && myRole === "p1" && gameState.status === "PLAYING") {
    setTimeout(startNewRound, 1500);
  }
}

// 아이템 목록 표시
function renderItems(elementId, items, isMine, isMyTurn) {
  const container = document.getElementById(elementId);
  container.innerHTML = "";
  items.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.innerText = ITEM_NAMES[item];
    if (isMine && isMyTurn) {
      btn.onclick = () => useItem(item, index);
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  });
}

// 아이템 사용 로직
function useItem(item, index) {
  let bullets = [...gameState.bullets];
  let myItems = [...gameState[myRole].items];
  myItems.splice(index, 1); // 사용한 아이템 제거

  let updates = {};
  updates[`${myRole}/items`] = myItems;

  if (item === "MAGNIFIER") {
    const nextBullet = bullets[bullets.length - 1] ? "실탄 🔴" : "공포탄 ⚪";
    alert(`[돋보기] 다음 탄환은 ${nextBullet} 입니다!`);
    updates["logs"] = `${gameState[myRole].name}이(가) 돋보기를 사용했습니다.`;
  } 
  else if (item === "CIGARETTE") {
    const newHp = Math.min(4, gameState[myRole].hp + 1);
    updates[`${myRole}/hp`] = newHp;
    updates["logs"] = `${gameState[myRole].name}이(가) 담배를 피워 체력을 1 회복했습니다.`;
  } 
  else if (item === "SAW") {
    updates["sawActive"] = true;
    updates["logs"] = `${gameState[myRole].name}이(가) 톱으로 샷건을 잘라 데미지를 2배로 만듭니다!`;
  } 
  else if (item === "HANDCUFFS") {
    updates["handcuffsActive"] = true;
    updates["logs"] = `${gameState[myRole].name}이(가) 수갑을 채워 상대의 다음 턴을 넘깁니다!`;
  }

  roomRef.update(updates);
}

// 발사 로직
document.getElementById("btn-shoot-opp").addEventListener("click", () => shoot(false));
document.getElementById("btn-shoot-self").addEventListener("click", () => shoot(true));

function shoot(targetSelf) {
  let bullets = [...gameState.bullets];
  const isLive = bullets.pop(); // 맨 위 탄환 발사
  const oppRole = myRole === "p1" ? "p2" : "p1";
  
  let damage = gameState.sawActive ? 2 : 1;
  let nextTurn = oppRole;
  let logMsg = "";

  if (targetSelf) { // 자신에게 발사
    if (isLive) {
      const newHp = Math.max(0, gameState[myRole].hp - damage);
      logMsg = `탕! 💥 실탄이었습니다! ${gameState[myRole].name}이(가) ${damage}의 데미지를 입었습니다.`;
      roomRef.update({ [`${myRole}/hp`]: newHp });
    } else {
      logMsg = `찰칵! ⚪ 공포탄이었습니다. ${gameState[myRole].name}이(가) 턴을 한 번 더 갖습니다!`;
      nextTurn = myRole; // 자신에게 공포탄 쏘면 턴 유지!
    }
  } else { // 상대에게 발사
    if (isLive) {
      const newHp = Math.max(0, gameState[oppRole].hp - damage);
      logMsg = `탕! 💥 ${gameState[oppRole].name}에게 실탄을 맞췄습니다! (${damage} 데미지)`;
      roomRef.update({ [`${oppRole}/hp`]: newHp });
    } else {
      logMsg = `찰칵! ⚪ 공포탄이었습니다.`;
    }
  }

  // 수갑 적용 처리
  if (gameState.handcuffsActive && nextTurn !== myRole) {
    nextTurn = myRole;
    logMsg += " (수갑 효과로 턴이 계속됩니다!)";
  }

  // 승패 판정
  let status = "PLAYING";
  if (gameState[myRole].hp <= 0 || gameState[oppRole].hp <= 0) {
    status = "ENDED";
    logMsg = "게임 종료!";
  }

  roomRef.update({
    bullets: bullets,
    turn: nextTurn,
    sawActive: false,
    handcuffsActive: false,
    status: status,
    logs: logMsg
  });
}

