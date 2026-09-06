const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static('public'));

const rooms = {};
const ITEMS = ["MAGNIFIER", "CIGARETTE", "SAW", "HANDCUFFS"];
const ITEM_NAMES = { MAGNIFIER: "🔍돋보기", CIGARETTE: "🚬담배", SAW: "🪚톱", HANDCUFFS: "🔗수갑" };

function getRandomItem() {
  return ITEMS[Math.floor(Math.random() * ITEMS.length)];
}

function startNewRound(room) {
  const live = Math.floor(Math.random() * 3) + 1;
  const blank = Math.floor(Math.random() * 3) + 1;
  
  let bullets = [];
  for (let i = 0; i < live; i++) bullets.push(true);
  for (let i = 0; i < blank; i++) bullets.push(false);
  bullets.sort(() => Math.random() - 0.5);

  room.bullets = bullets;
  room.sawActive = false;
  room.handcuffsActive = false;

  Object.keys(room.players).forEach(id => {
    const p = room.players[id];
    p.items = [...p.items, getRandomItem()].slice(0, 4);
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

  socket.on('useItem', (itemIndex) => {
    const room = rooms[socket.roomCode];
    if (!room) return;
    const player = room.players[socket.id];
    if (room.turnOrder[room.currentTurnIndex] !== socket.id) return;

    const item = player.items[itemIndex];
    player.items.splice(itemIndex, 1);

    if (item === "MAGNIFIER") {
      const nextBullet = room.bullets[room.bullets.length - 1] ? "실탄 🔴" : "공포탄 ⚪";
      socket.emit('secretInfo', `[돋보기] 다음 탄환은 ${nextBullet} 입니다!`);
      room.logs = `${player.name}이(가) 돋보기를 사용했습니다.`;
    } else if (item === "CIGARETTE") {
      player.hp = Math.min(4, player.hp + 1);
      room.logs = `${player.name}이(가) 담배를 피워 체력을 1 회복했습니다.`;
    } else if (item === "SAW") {
      room.sawActive = true;
      room.logs = `${player.name}이(가) 톱으로 샷건을 잘라 데미지를 2배로 만듭니다!`;
    } else if (item === "HANDCUFFS") {
      room.handcuffsActive = true;
      room.logs = `${player.name}이(가) 수갑을 채워 상대의 다음 턴을 넘깁니다!`;
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
        room.logs = `탕! 💥 실탄이었습니다! ${shooter.name}이(가) ${damage}의 데미지를 입었습니다.`;
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
    const room = rooms[socket.roomCode];
    if (room) {
      delete room.players[socket.id];
      io.to(socket.roomCode).emit('logs', '상대방의 연결이 끊어졌습니다.');
      delete rooms[socket.roomCode];
    }
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
