const socket = io();

const ITEM_NAMES = { MAGNIFIER: "🔍돋보기", CIGARETTE: "🚬담배", SAW: "🪚톱", HANDCUFFS: "🔗수갑" };

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
    renderItems("my-items", me.items, state.turn === myId);
  }

  if (opp) {
    document.getElementById("opp-name").innerText = opp.name;
    document.getElementById("opp-hp").innerText = "❤️".repeat(opp.hp);
    renderItems("opp-items", opp.items, false);
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

function renderItems(elementId, items, isMyTurn) {
  const container = document.getElementById(elementId);
  container.innerHTML = "";
  items.forEach((item, index) => {
    const btn = document.createElement("button");
    btn.className = "item-btn";
    btn.innerText = ITEM_NAMES[item];
    if (elementId === "my-items" && isMyTurn) {
      btn.onclick = () => socket.emit("useItem", index);
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
