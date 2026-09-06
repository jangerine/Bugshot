const socket = io();

const ITEM_NAMES = { 
  MAGNIFIER: "🔍돋보기", CIGARETTE: "🚬담배", SAW: "🪚톱", HANDCUFFS: "🔗수갑",
  BEER: "🍺맥주", PHONE: "📞전화기", INVERTER: "🔄변환기", ADRENALINE: "💉아드레날린", MEDICINE: "💊만료된약"
};

const ITEM_DESCS = {
  MAGNIFIER: "다음 탄환이 실탄인지 공포탄인지 확인합니다.",
  CIGARETTE: "체력을 1 회복합니다.",
  SAW: "다음 실탄의 데미지를 2배로 만듭니다.",
  HANDCUFFS: "상대의 다음 턴을 스킵합니다.",
  BEER: "현재 장전된 탄환을 하나 배출합니다.",
  PHONE: "미래의 탄환 힌트를 얻습니다.",
  INVERTER: "다음 탄환의 종류를 반대로 전환합니다.",
  ADRENALINE: "상대의 아이템 중 하나를 빼앗아 즉시 사용합니다.",
  MEDICINE: "40% 확률로 체력 2 회복, 60% 확률로 체력 1 손실."
};

const ITEMS = Object.keys(ITEM_NAMES);

let isAdrenalineMode = false;
let selectedAdrenalineIndex = -1;

/* ================= 모션 / 이펙트 함수 ================= */
function triggerEffect(isLive) {
  const app = document.getElementById("app");
  const shotgun = document.querySelector(".shotgun-icon");

  if (shotgun) {
    shotgun.classList.add("recoil");
    setTimeout(() => shotgun.classList.remove("recoil"), 150);
  }

  if (isLive) {
    app.classList.add("shake", "flash-red");
    setTimeout(() => app.classList.remove("shake", "flash-red"), 300);
  } else {
    app.classList.add("flash-white");
    setTimeout(() => app.classList.remove("flash-white"), 150);
  }
}

// 아이템 사용 시 모션 연출
function triggerItemEffect(item) {
  const app = document.getElementById("app");
  const shotgun = document.querySelector(".shotgun-icon");

  let animationClass = "";
  if (["CIGARETTE", "MEDICINE"].includes(item)) {
    animationClass = "flash-item-green";
  } else if (["BEER", "INVERTER"].includes(item)) {
    animationClass = "flash-item-blue";
  } else if (["MAGNIFIER", "PHONE"].includes(item)) {
    animationClass = "flash-item-purple";
  } else if (["HANDCUFFS"].includes(item)) {
    animationClass = "flash-item-yellow";
  } else if (item === "SAW") {
    app.classList.add("shake");
    setTimeout(() => app.classList.remove("shake"), 250);
    if (shotgun) {
      shotgun.classList.add("recoil");
      setTimeout(() => shotgun.classList.remove("recoil"), 200);
    }
    return;
  }

  if (animationClass) {
    app.classList.add(animationClass);
    setTimeout(() => app.classList.remove(animationClass), 300);
  }
}

function showItemDesc(itemKey) {
  document.getElementById("modal-title").innerText = ITEM_NAMES[itemKey];
  document.getElementById("modal-desc").innerText = ITEM_DESCS[itemKey];
  document.getElementById("item-modal").classList.remove("hidden");
}

document.getElementById("modal-close")?.addEventListener("click", () => {
  document.getElementById("item-modal").classList.add("hidden");
});

function bindLongTouchDesc(btnElement, itemKey) {
  let timer = null;
  btnElement.addEventListener("touchstart", () => {
    timer = setTimeout(() => showItemDesc(itemKey), 500);
  });
  btnElement.addEventListener("touchend", () => clearTimeout(timer));
  btnElement.addEventListener("touchmove", () => clearTimeout(timer));
  btnElement.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showItemDesc(itemKey);
  });
}

/* ================= 게임 상태 ================= */
let isAiMode = false;
let aiState = {
  playerHp: 4, aiHp: 4, playerItems: [], aiItems: [],
  bullets: [], turn: "player", sawActive: false, handcuffsActive: false, knownNextBullet: null
};

// 버튼 이벤트 연결
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-join")?.addEventListener("click", () => {
    isAiMode = false;
    const name = document.getElementById("player-name").value || "익명";
    const roomCode = document.getElementById("room-code").value;
    if (!roomCode) return alert("방 코드를 입력하세요.");
    socket.emit("joinRoom", { name, roomCode });
    document.getElementById("lobby-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
  });

  document.getElementById("btn-ai")?.addEventListener("click", () => {
    isAiMode = true;
    document.getElementById("lobby-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    startAiGame();
  });
});

/* ================= AI 모드 ================= */
function startAiGame() {
  const name = document.getElementById("player-name").value || "플레이어";
  document.getElementById("my-name").innerText = `${name} (나)`;
  document.getElementById("opp-name").innerText = "딜러 (AI)";
  aiState.playerHp = 4; aiState.aiHp = 4;
  aiState.playerItems = []; aiState.aiItems = [];
  aiState.turn = "player";
  startAiRound("게임 시작! 새 탄환이 장전됩니다.");
}

function startAiRound(msg) {
  const live = Math.floor(Math.random() * 3) + 2;
  const blank = Math.floor(Math.random() * 3) + 2;
  let bullets = [];
  for (let i = 0; i < live; i++) bullets.push(true);
  for (let i = 0; i < blank; i++) bullets.push(false);
  bullets.sort(() => Math.random() - 0.5);

  aiState.bullets = bullets;
  aiState.sawActive = false;
  aiState.handcuffsActive = false;
  aiState.knownNextBullet = null;
  isAdrenalineMode = false;

  const getRandomItem = () => ITEMS[Math.floor(Math.random() * ITEMS.length)];
  aiState.playerItems = [...aiState.playerItems, getRandomItem(), getRandomItem()].slice(0, 8);
  aiState.aiItems = [...aiState.aiItems, getRandomItem(), getRandomItem()].slice(0, 8);

  updateAiUI(`${msg} (실탄 ${live}개, 공포탄 ${blank}개)`);

  if (aiState.turn === "ai") {
    setTimeout(playAiTurn, 1000);
  }
}

function updateAiUI(logMsg) {
  document.getElementById("my-hp").innerText = "❤️".repeat(aiState.playerHp);
  document.getElementById("opp-hp").innerText = "❤️".repeat(aiState.aiHp);

  const live = aiState.bullets.filter(b => b === true).length;
  const blank = aiState.bullets.filter(b => b === false).length;
  document.getElementById("bullet-info").innerText = `실탄: ${live} | 공포탄: ${blank}`;
  document.getElementById("status-text").innerText = logMsg;

  const isMyTurn = aiState.turn === "player";
  document.getElementById("btn-shoot-opp").disabled = !isMyTurn;
  document.getElementById("btn-shoot-self").disabled = !isMyTurn;

  renderAiItems();

  if (aiState.playerHp <= 0 || aiState.aiHp <= 0) {
    alert(`게임 종료! ${aiState.playerHp > 0 ? "당신의 승리!" : "딜러(AI)의 승리!"}`);
    location.reload();
  }
}

function renderAiItems() {
  const isMyTurn = aiState.turn === "player";

  // 내 아이템
  const myContainer = document.getElementById("my-items");
  myContainer.innerHTML = "";
  aiState.playerItems.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.innerText = ITEM_NAMES[item];
    bindLongTouchDesc(btn, item);

    if (isMyTurn) {
      btn.onclick = () => {
        if (item === "ADRENALINE") {
          const hasStealable = aiState.aiItems.some(i => i !== "ADRENALINE");
          if (!hasStealable) return alert("훔쳐올 수 있는 상대 아이템이 없습니다! (아드레날린 제외)");
          
          isAdrenalineMode = true;
          selectedAdrenalineIndex = index;
          triggerItemEffect("ADRENALINE");
          updateAiUI("훔쳐올 상대 아이템을 클릭하세요!");
        } else {
          isAdrenalineMode = false;
          usePlayerItemInAi(index);
        }
      };
    } else {
      btn.disabled = true;
    }
    myContainer.appendChild(btn);
  });

  // 상대 아이템
  const oppContainer = document.getElementById("opp-items");
  oppContainer.innerHTML = "";
  aiState.aiItems.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.innerText = ITEM_NAMES[item];
    bindLongTouchDesc(btn, item);

    if (isMyTurn && isAdrenalineMode) {
      if (item === "ADRENALINE") {
        btn.disabled = true;
        btn.classList.remove("stealable");
      } else {
        btn.disabled = false;
        btn.classList.add("stealable");
        btn.onclick = () => {
          const stolenItem = aiState.aiItems.splice(index, 1)[0];
          aiState.playerItems.splice(selectedAdrenalineIndex, 1);
          isAdrenalineMode = false;
          executeItemEffect(stolenItem, true, `상대의 ${ITEM_NAMES[stolenItem]}을(를) 훔쳐 사용했습니다!`);
        };
      }
    } else {
      btn.disabled = true;
      btn.classList.remove("stealable");
    }
    oppContainer.appendChild(btn);
  });
}

function usePlayerItemInAi(index) {
  const item = aiState.playerItems[index];
  aiState.playerItems.splice(index, 1);
  executeItemEffect(item, true, "");
}

function executeItemEffect(item, isPlayer, logPrefix) {
  triggerItemEffect(item); // 모션 애니메이션 트리거
  let log = logPrefix;

  if (item === "MAGNIFIER") {
    const next = aiState.bullets[aiState.bullets.length - 1] ? "실탄 🔴" : "공포탄 ⚪";
    if (isPlayer) alert(`[돋보기] 다음 탄환은 ${next} 입니다!`);
    log += " 돋보기를 사용했습니다.";
  } else if (item === "CIGARETTE") {
    if (isPlayer) aiState.playerHp = Math.min(4, aiState.playerHp + 1);
    else aiState.aiHp = Math.min(4, aiState.aiHp + 1);
    log += " 담배를 피워 체력을 1 회복했습니다.";
  } else if (item === "SAW") {
    aiState.sawActive = true;
    log += " 톱으로 총열을 잘라 데미지를 2배로 만듭니다!";
  } else if (item === "HANDCUFFS") {
    aiState.handcuffsActive = true;
    log += " 수갑을 채워 상대 턴을 넘깁니다!";
  } else if (item === "BEER") {
    const popped = aiState.bullets.pop();
    log += ` 맥주를 마셔 탄환 하나를 배출했습니다! (${popped ? "실탄🔴" : "공포탄⚪"})`;
  } else if (item === "INVERTER") {
    if (aiState.bullets.length > 0) {
      const idx = aiState.bullets.length - 1;
      aiState.bullets[idx] = !aiState.bullets[idx];
    }
    log += " 변환기를 사용해 다음 탄환을 반대로 바꿨습니다!";
  } else if (item === "MEDICINE") {
    if (Math.random() < 0.4) {
      if (isPlayer) aiState.playerHp = Math.min(4, aiState.playerHp + 2);
      else aiState.aiHp = Math.min(4, aiState.aiHp + 2);
      log += " 약을 먹고 체력을 2 회복했습니다!";
    } else {
      if (isPlayer) aiState.playerHp = Math.max(0, aiState.playerHp - 1);
      else aiState.aiHp = Math.max(0, aiState.aiHp - 1);
      log += " 약 부작용으로 체력 1을 잃었습니다...";
    }
  }

  if (aiState.bullets.length === 0) startAiRound("탄환 소진!");
  else updateAiUI(log);
}

function shootInAi(targetSelf) {
  isAdrenalineMode = false;
  const isLive = aiState.bullets.pop();
  triggerEffect(isLive);

  const damage = aiState.sawActive ? 2 : 1;
  aiState.sawActive = false;
  let keepTurn = false;
  let log = "";

  if (targetSelf) {
    if (isLive) {
      aiState.playerHp = Math.max(0, aiState.playerHp - damage);
      log = `탕! 💥 실탄입니다! ${damage} 데미지를 입었습니다.`;
    } else {
      log = "찰칵! ⚪ 공포탄입니다! 턴 유지!";
      keepTurn = true;
    }
  } else {
    if (isLive) {
      aiState.aiHp = Math.max(0, aiState.aiHp - damage);
      log = `탕! 💥 딜러에게 실탄을 맞췄습니다! (${damage} 데미지)`;
    } else {
      log = "찰칵! ⚪ 공포탄이었습니다.";
    }
  }

  aiState.knownNextBullet = null;

  if (!keepTurn) {
    if (aiState.handcuffsActive) {
      log += " (수갑 효과로 턴 유지!)";
      aiState.handcuffsActive = false;
    } else {
      aiState.turn = "ai";
    }
  }

  if (aiState.bullets.length === 0 && aiState.playerHp > 0 && aiState.aiHp > 0) {
    startAiRound(log);
  } else {
    updateAiUI(log);
    if (aiState.turn === "ai" && aiState.playerHp > 0 && aiState.aiHp > 0) {
      setTimeout(playAiTurn, 1200);
    }
  }
}

function playAiTurn() {
  if (aiState.turn !== "ai" || aiState.playerHp <= 0 || aiState.aiHp <= 0) return;

  if (aiState.bullets.length === 0) {
    startAiRound("탄환 소진!");
    return;
  }

  const liveCount = aiState.bullets.filter(b => b === true).length;
  const liveProb = liveCount / aiState.bullets.length;

  if (aiState.aiHp <= 2 && useAiItem("CIGARETTE")) return;
  if (aiState.knownNextBullet === null && useAiItem("MAGNIFIER")) {
    aiState.knownNextBullet = aiState.bullets[aiState.bullets.length - 1];
    triggerItemEffect("MAGNIFIER");
    updateAiUI("딜러(AI)가 돋보기를 사용했습니다.");
    setTimeout(playAiTurn, 1000);
    return;
  }

  let targetSelf = aiState.knownNextBullet !== null ? !aiState.knownNextBullet : liveProb < 0.5;

  const isLive = aiState.bullets.pop();
  triggerEffect(isLive);

  const damage = aiState.sawActive ? 2 : 1;
  aiState.sawActive = false;
  aiState.knownNextBullet = null;
  let keepTurn = false;
  let log = "";

  if (targetSelf) {
    if (isLive) {
      aiState.aiHp = Math.max(0, aiState.aiHp - damage);
      log = `탕! 💥 딜러(AI)가 자해 실탄을 맞았습니다! (${damage} 데미지)`;
    } else {
      log = "찰칵! ⚪ 딜러(AI) 공포탄! 턴 유지!";
      keepTurn = true;
    }
  } else {
    if (isLive) {
      aiState.playerHp = Math.max(0, aiState.playerHp - damage);
      log = `탕! 💥 딜러(AI)가 당신에게 실탄을 쐈습니다! (${damage} 데미지)`;
    } else {
      log = "찰칵! ⚪ 딜러(AI)가 쏜 총은 공포탄이었습니다.";
    }
  }

  if (!keepTurn) {
    if (aiState.handcuffsActive) {
      log += " (수갑 효과로 딜러 턴 유지!)";
      aiState.handcuffsActive = false;
    } else {
      aiState.turn = "player";
    }
  }

  if (aiState.bullets.length === 0 && aiState.playerHp > 0 && aiState.aiHp > 0) {
    startAiRound(log);
  } else {
    updateAiUI(log);
    if (aiState.turn === "ai" && aiState.playerHp > 0 && aiState.aiHp > 0) {
      setTimeout(playAiTurn, 1200);
    }
  }
}

function useAiItem(itemName) {
  const idx = aiState.aiItems.indexOf(itemName);
  if (idx !== -1) {
    aiState.aiItems.splice(idx, 1);
    return true;
  }
  return false;
}

/* ================= 멀티플레이 소켓 ================= */
socket.on("updateState", (state) => {
  if (isAiMode) return;
  const myId = socket.id;
  const oppId = Object.keys(state.players).find(id => id !== myId);
  const me = state.players[myId];
  const opp = oppId ? state.players[oppId] : null;

  if (me) {
    document.getElementById("my-name").innerText = `${me.name} (나)`;
    document.getElementById("my-hp").innerText = "❤️".repeat(me.hp);
  }

  if (opp) {
    document.getElementById("opp-name").innerText = opp.name;
    document.getElementById("opp-hp").innerText = "❤️".repeat(opp.hp);
  }

  document.getElementById("status-text").innerText = state.logs;
  document.getElementById("bullet-info").innerText = state.bulletInfo;

  const isMyTurn = state.turn === myId;
  document.getElementById("btn-shoot-opp").disabled = !isMyTurn;
  document.getElementById("btn-shoot-self").disabled = !isMyTurn;
});

document.getElementById("btn-shoot-opp")?.addEventListener("click", () => {
  if (isAiMode) shootInAi(false);
  else socket.emit("shoot", { targetSelf: false });
});

document.getElementById("btn-shoot-self")?.addEventListener("click", () => {
  if (isAiMode) shootInAi(true);
  else socket.emit("shoot", { targetSelf: true });
});
