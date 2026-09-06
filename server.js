const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

const rooms = {};

// 9종 전체 아이템 목록
const ITEMS = [
  "MAGNIFIER",  // 돋보기
  "CIGARETTE",  // 담배
  "SAW",        // 톱
  "HANDCUFFS",  // 수갑
  "BEER",       // 맥주
  "PHONE",      // 일회용 전화기
  "INVERTER",   // 변환기
  "ADRENALINE", // 아드레날린
  "MEDICINE"    // 만료된 약
];

function getRandomItem() {
  return ITEMS[Math.floor(Math.random() * ITEMS.length)];
}

function startNewRound(room) {
  const live = Math.floor(Math.random() * 3) + 2; // 2~4개
  const blank = Math.floor(Math.random() * 3) + 2; // 2~4개
  
  let bullets = [];
  for (let i = 0; i < live; i++) bullets.push(true);
  for (let i = 0; i < blank; i++) bullets.push(false);
  bullets.sort(() => Math.random() - 0.5);

  room.bullets = bullets;
  room.sawActive = false;
  room.handcuffsActive = false;

  Object.keys(room.players).forEach(id => {
    const p = room.players[id];
    // 최대 8개까지 아이템 보유 가능
    p.items = [...p.items, getRandomItem(), getRandomItem()].slice(0, 8);
  });

  room.logs = `새 탄환 장전! (실탄 ${live}개, 공포탄 ${blank}개)`;
}

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ name, roomCode }) => {
    socket.join(roomCode);
    socket.roomCode = roomCode;

    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: {},
        turnOrder: [],
        currentTurnIndex: 0,
        bullets: [],
        sawActive: false,
        handcuffsActive: false,
        logs: "상대방을 기다리는 중..."
      };
    }

    const room = rooms[roomCode];

    if (Object.keys(room.players).length >= 2) {
      socket.emit('errorMsg', '방이 가득 찼습니다.');
      return;
    }

    room.players[socket.id] = {
      id: socket.id,
      name: name || '플레이어',
      hp: 4,
      items: []
    };
    room.turnOrder.push(socket.id);

    if (room.turnOrder.length === 2) {
      startNewRound(room);
    }

    io.to(roomCode).emit('updateState', getPublicState(room));
  });

  // 아이템 사용 처리
  socket.on('useItem', ({ itemIndex, targetItemIndex }) => {
    const room = rooms[socket.roomCode];
    if (!room) return;
    const player = room.players[socket.id];
    const oppId = room.turnOrder.find(id => id !== socket.id);
    const opponent = room.players[oppId];

    if (room.turnOrder[room.currentTurnIndex] !== socket.id) return;

    let item = player.items[itemIndex];

    // 아드레날린 사용 시 상대 아이템 강탈
    if (item === "ADRENALINE") {
      if (!opponent.items[targetItemIndex]) return;
      item = opponent.items[targetItemIndex];
      opponent.items.splice(targetItemIndex, 1); // 상대 아이템 제거
      player.items.splice(itemIndex, 1); // 본인 아드레날린 제거
      room.logs = `${player.name}이(가) 아드레날린으로 상대의 아이템을 훔쳐 사용했습니다!`;
    } else {
      player.items.splice(itemIndex, 1);
    }

    // 아이템별 효과 실행
    if (item === "MAGNIFIER") { // 돋보기
      const nextBullet = room.bullets[room.bullets.length - 1] ? "실탄 🔴" : "공포탄 ⚪";
      socket.emit('secretInfo', `[돋보기] 다음 탄환은 ${nextBullet} 입니다!`);
      room.logs = `${player.name}이(가) 돋보기를 사용했습니다.`;
    } 
    else if (item === "CIGARETTE") { // 담배
      player.hp = Math.min(4, player.hp + 1);
      room.logs = `${player.name}이(가) 담배를 피워 체력을 1 회복했습니다.`;
    } 
    else if (item === "SAW") { // 톱
      room.sawActive = true;
      room.logs = `${player.name}이(가) 톱으로 샷건을 잘라 데미지를 2배로 만듭니다!`;
    } 
    else if (item === "HANDCUFFS") { // 수갑
      room.handcuffsActive = true;
      room.logs = `${player.name}이(가) 수갑을 채워 상대의 다음 턴을 넘깁니다!`;
    } 
    else if (item === "BEER") { // 맥주
      const popped = room.bullets.pop();
      const typeStr = popped ? "실탄 🔴" : "공포탄 ⚪";
      room.logs = `${player.name}이(가) 맥주를 마셔 탄환 하나를 배출했습니다! (배출된 탄: ${typeStr})`;
    } 
    else if (item === "PHONE") { // 전화기
      if (room.bullets.length <= 1) {
        socket.emit('secretInfo', '[전화기] 남은 탄환이 너무 적어 힌트를 얻을 수 없습니다.');
      } else {
        const randIndex = Math.floor(Math.random() * (room.bullets.length - 1)); // 현재 탄 제외한 탄환 중 랜덤
        const numFromBack = room.bullets.length - randIndex; // 뒤에서부터 몇 번째인지
        const bulletType = room.bullets[randIndex] ? "실탄 🔴" : "공포탄 ⚪";
        socket.emit('secretInfo', `[전화기] 귓속말: ${numFromBack}번째 탄환은 ${bulletType} 입니다.`);
      }
      room.logs = `${player.name}이(가) 전화기로 힌트를 확인했습니다.`;
    } 
    else if (item === "INVERTER") { // 변환기
      if (room.bullets.length > 0) {
        const lastIdx = room.bullets.length - 1;
        room.bullets[lastIdx] = !room.bullets[lastIdx]; // 반전
      }
      room.logs = `${player.name}이(가) 변환기를 사용해 다음 탄환의 종류를 반대로 바꿨습니다!`;
    } 
    else if (item === "MEDICINE") { // 만료된 약
      const success = Math.random() < 0.4; // 40% 확률 성공
      if (success) {
        player.hp = Math.min(4, player.hp + 2);
        room.logs = `${player.name}이(가) 약을 먹고 체력을 2 회복했습니다!`;
      } else {
        player.hp = Math.max(0, player.hp - 1);
        room.logs = `${player.name}이(가) 부작용으로 체력 1을 잃었습니다...`;
      }
    }

    // 탄환 없으면 라운드 재시작
    if (room.bullets.length === 0) {
      startNewRound(room);
    }

    io.to(socket.roomCode).emit('updateState', getPublicState(room));
  });

  socket.on('shoot', ({ targetSelf }) => {
    const room = rooms[socket.roomCode];
    if (!room) return;
    if (room.turnOrder[room.currentTurnIndex] !== socket.id) return;

    const shooter = room.players[socket.id];
    const oppId = room.turnOrder.find(id => id !== socket.id);
    const opponent = room.players[oppId];

    const isLive = room.bullets.pop();
    const damage = room.sawActive ? 2 : 1;
    let keepTurn = false;

    if (targetSelf) {
      if (isLive) {
        shooter.hp = Math.max(0, shooter.hp - damage);
        room.logs = `탕! 💥 실탄이었습니다! ${shooter.name}이(가) ${damage} 데미지를 입었습니다.`;
      } else {
        room.logs = `찰칵! ⚪ 공포탄이었습니다. ${shooter.name}이(가) 턴을 한 번 더 갖습니다!`;
        keepTurn = true;
      }
    } else {
      if (isLive) {
        opponent.hp = Math.max(0, opponent.hp - damage);
        room.logs = `탕! 💥 ${opponent.name}에게 실탄을 맞췄습니다! (${damage} 데미지)`;
      } else {
        room.logs = `찰칵! ⚪ 공포탄이었습니다.`;
      }
    }

    room.sawActive = false;

    if (!keepTurn) {
      if (room.handcuffsActive) {
        room.logs += " (수갑 효과로 턴 유지!)";
        room.handcuffsActive = false;
      } else {
        room.currentTurnIndex = (room.currentTurnIndex + 1) % 2;
      }
    }

    if (room.bullets.length === 0 && shooter.hp > 0 && opponent.hp > 0) {
      startNewRound(room);
    }

    io.to(socket.roomCode).emit('updateState', getPublicState(room));
  });

  socket.on('disconnect', () => {
    delete rooms[socket.roomCode];
  });
});

function getPublicState(room) {
  const liveCount = room.bullets.filter(b => b === true).length;
  const blankCount = room.bullets.filter(b => b === false).length;

  return {
    players: room.players,
    turn: room.turnOrder[room.currentTurnIndex],
    bulletInfo: `남은 실탄: ${liveCount} | 공포탄: ${blankCount}`,
    logs: room.logs
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on port ${PORT}`));
