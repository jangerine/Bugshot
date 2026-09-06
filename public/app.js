const socket = io();

// 9종 아이템 명칭 대응표
const ITEM_NAMES = { 
  MAGNIFIER: "🔍돋보기", 
  CIGARETTE: "🚬담배", 
  SAW: "🪚톱", 
  HANDCUFFS: "🔗수갑",
  BEER: "🍺맥주",
  PHONE: "📞전화기",
  INVERTER: "🔄변환기",
  ADRENALINE: "💉아드레날린",
  MEDICINE: "💊만료된약"
};

document.getElementById("btn-join").addEventListener("click", () => {
  const name = document.getElementById("player-name").value || "익명";
  const roomCode = document.getElementById("room-code").value;
  if (!roomCode) return alert("방 코드를 입력하세요.");

  socket.emit("joinRoom", { name, roomCode });
  document.getElementById("lobby-screen").classList.add("hidden");
  document.getElementById("game-screen").classList.remove("hidden");
});

socket.on("updateState", (state) => {
  const myId = socket.id;
  const oppId = Object.keys(state.players).find(id => id !== myId);

  const me = state.players[myId];
  const opp = oppId ? state.players[oppId] : null;

  if (me) {
    document.getElementById("my-name").innerText = `${me.name} (나)`;
    document.getElementById("my-hp").innerText = "❤️".repeat(me.hp);
    renderMyItems(me.items, state.turn === myId);
  }

  if (opp) {
    document.getElementById("opp-name").innerText = opp.name;
    document.getElementById("opp-hp").innerText = "❤️".repeat(opp.hp);
    renderOppItems(opp.items, state.turn === myId);
  }

  document.getElementById("status-text").innerText = state.logs;
  document.getElementById("bullet-info").innerText = state.bulletInfo;

  const isMyTurn = state.turn === myId;
  document.getElementById("btn-shoot-opp").disabled = !isMyTurn;
  document.getElementById("btn-shoot-self").disabled = !isMyTurn;
});

socket.on("secretInfo", (msg) => {
  alert(msg);
});

socket.on("errorMsg", (msg) => {
  alert(msg);
  location.reload();
});

// 내 아이템 렌더링
function renderMyItems(items, isMyTurn) {
  const container = document.getElementById("my-items");
  container.innerHTML = "";
  items.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.innerText = ITEM_NAMES[item];
    if (isMyTurn) {
      btn.onclick = () => {
        if (item === "ADRENALINE") {
          alert("훔쳐올 상대방의 아이템 버튼을 클릭하세요!");
        } else {
          socket.emit("useItem", { itemIndex: index });
        }
      };
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  });
}

// 상대 아이템 렌더링 (아드레날린 사용 클릭 지원)
function renderOppItems(items, isMyTurn) {
  const container = document.getElementById("opp-items");
  container.innerHTML = "";
  items.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.innerText = ITEM_NAMES[item];
    
    // 내 턴일 때 상대 아이템 클릭 시 아드레날린 강탈 실행
    if (isMyTurn) {
      btn.onclick = () => {
        const myItemNodes = document.getElementById("my-items").children;
        // 내 아이템 중 아드레날린 인덱스 찾기
        let adrIndex = -1;
        for (let i = 0; i < myItemNodes.length; i++) {
          if (myItemNodes[i].innerText === ITEM_NAMES["ADRENALINE"]) {
            adrIndex = i;
            break;
          }
        }

        if (adrIndex !== -1) {
          socket.emit("useItem", { itemIndex: adrIndex, targetItemIndex: index });
        }
      };
    } else {
      btn.disabled = true;
    }
    container.appendChild(btn);
  });
}

document.getElementById("btn-shoot-opp").addEventListener("click", () => {
  socket.emit("shoot", { targetSelf: false });
});

document.getElementById("btn-shoot-self").addEventListener("click", () => {
  socket.emit("shoot", { targetSelf: true });
});
