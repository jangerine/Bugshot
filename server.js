const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};
const ITEMS = ['cigarette', 'beer', 'magnifier', 'saw', 'handcuffs', 'medicine', 'inverter', 'phone', 'adrenaline'];

function getRandomItems(count = 2) {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(ITEMS[Math.floor(Math.random() * ITEMS.length)]);
  }
  return result;
}

function generateBullets() {
  const live = Math.floor(Math.random() * 3) + 2; // 2~4발
  const blank = Math.floor(Math.random() * 3) + 1; // 1~3발
  const bullets = [];
  for (let i = 0; i < live; i++) bullets.push('live');
  for (let i = 0; i < blank; i++) bullets.push('blank');
  
  for (let i = bullets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bullets[i], bullets[j]] = [bullets[j], bullets[i]];
  }
  
  return { bullets, liveCount: live, blankCount: blank };
}

// 🏆 게임 종료 및 승패 확인 헬퍼
function checkGameOver(roomId) {
  const game = rooms[roomId];
  if (!game) return false;

  let deadPlayerId = null;
  let winnerId = null;

  for (const id in game.players) {
    if (game.players[id].hp <= 0) {
      deadPlayerId = id;
      break;
    }
  }

  if (deadPlayerId) {
    if (game.isAI) {
      if (deadPlayerId === 'ai_dealer') {
        io.to(game.humanSocketId).emit('itemResult', { 
          title: '🏆 승리!', 
          message: '딜러를 쓰러뜨리고 생존했습니다!' 
        });
      } else {
        io.to(game.humanSocketId).emit('itemResult', { 
          title: '💀 패배', 
          message: '딜러의 총에 맞아 사망했습니다...' 
        });
      }
    } else {
      // 멀티플레이어 승패 처리
      game.playerOrder.forEach((id) => {
        if (id === deadPlayerId) {
          io.to(id).emit('itemResult', { title: '💀 패배', message: '목숨을 잃었습니다...' });
        } else {
          io.to(id).emit('itemResult', { title: '🏆 승리!', message: '최종 생존자가 되었습니다!' });
        }
      });
    }

    // 게임 종료 후 방 데이터 삭제
    delete rooms[roomId];
    return true;
  }

  return false;
}

io.on('connection', (socket) => {
  console.log(`플레이어 접속: ${socket.id}`);

  // 1. AI전 시작
  socket.on('startVsAI', ({ name }) => {
    const roomId = `ai_${socket.id}`;
    const bulletData = generateBullets();

    rooms[roomId] = {
      isAI: true,
      humanSocketId: socket.id,
      players: {
        [socket.id]: { name: name || '플레이어', hp: 4, items: getRandomItems(2) },
        'ai_dealer': { name: '딜러 (AI)', hp: 4, items: getRandomItems(2) }
      },
      turn: socket.id,
      bullets: bulletData.bullets,
      liveCount: bulletData.liveCount,
      blankCount: bulletData.blankCount,
      isSawActive: false,
      isOpponentHandcuffed: false
    };

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('gameStart', { roomId });
    sendGameState(roomId);
  });

  // 2. 멀티플레이 방 입장
  socket.on('joinRoom', ({ name, room }) => {
    const roomId = room || 'default';
    socket.join(roomId);
    socket.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        isAI: false,
        players: {},
        playerOrder: [],
        turn: null,
        bullets: [],
        liveCount: 0,
        blankCount: 0,
        isSawActive: false,
        isOpponentHandcuffed: false
      };
    }

    const roomData = rooms[roomId];
    roomData.players[socket.id] = { name: name || '플레이어', hp: 4, items: getRandomItems(2) };
    if (!roomData.playerOrder.includes(socket.id)) {
      roomData.playerOrder.push(socket.id);
    }

    if (roomData.playerOrder.length === 2) {
      const bulletData = generateBullets();
      roomData.bullets = bulletData.bullets;
      roomData.liveCount = bulletData.liveCount;
      roomData.blankCount = bulletData.blankCount;
      roomData.turn = roomData.playerOrder[0];

      io.to(roomId).emit('gameStart', { roomId });
      sendGameState(roomId);
    } else {
      socket.emit('itemResult', { title: '대기 중', message: '다른 플레이어의 입장을 기다리고 있습니다...' });
    }
  });

  function sendGameState(roomId) {
    const gameState = rooms[roomId];
    if (!gameState) return;

    if (gameState.isAI) {
      const player = gameState.players[socket.id];
      const ai = gameState.players['ai_dealer'];

      socket.emit('updateGameState', {
        turn: gameState.turn,
        isOpponentHandcuffed: gameState.isOpponentHandcuffed,
        myName: player.name,
        myHp: player.hp,
        myItems: player.items,
        oppName: ai.name,
        oppHp: ai.hp,
        oppItems: ai.items,
        liveBullets: gameState.liveCount,
        blankBullets: gameState.blankCount
      });
    } else {
      gameState.playerOrder.forEach((id) => {
        const oppId = gameState.playerOrder.find(pId => pId !== id);
        const me = gameState.players[id];
        const opp = gameState.players[oppId] || { name: '대기 중', hp: 0, items: [] };

        io.to(id).emit('updateGameState', {
          turn: gameState.turn,
          isOpponentHandcuffed: gameState.isOpponentHandcuffed,
          myName: me.name,
          myHp: me.hp,
          myItems: me.items,
          oppName: opp.name,
          oppHp: opp.hp,
          oppItems: opp.items,
          liveBullets: gameState.liveCount,
          blankBullets: gameState.blankCount
        });
      });
    }
  }

  // 3. 사격 처리
  socket.on('shoot', ({ target }) => {
    const roomId = socket.roomId;
    const game = rooms[roomId];
    if (!game || game.turn !== socket.id) return;

    const bullet = game.bullets.shift();
    const isLive = bullet === 'live';
    const damage = game.isSawActive && isLive ? 2 : 1;
    game.isSawActive = false;

    if (isLive) game.liveCount--;
    else game.blankCount--;

    let targetId = target === 'opponent' ? (game.isAI ? 'ai_dealer' : game.playerOrder.find(id => id !== socket.id)) : socket.id;

    if (isLive) {
      game.players[targetId].hp = Math.max(0, game.players[targetId].hp - damage);
    }

    io.to(socket.id).emit('shotResult', { isLive, target });

    // 💥 체력 0 판정 먼저 실행
    if (checkGameOver(roomId)) return;

    if (!(target === 'self' && !isLive)) {
      if (game.isOpponentHandcuffed) {
        game.isOpponentHandcuffed = false;
      } else {
        game.turn = game.isAI ? (game.turn === socket.id ? 'ai_dealer' : socket.id) : game.playerOrder.find(id => id !== socket.id);
      }
    }

    if (game.bullets.length === 0) {
      const newBullets = generateBullets();
      game.bullets = newBullets.bullets;
      game.liveCount = newBullets.liveCount;
      game.blankCount = newBullets.blankCount;
    }

    sendGameState(roomId);

    if (game.isAI && game.turn === 'ai_dealer') {
      setTimeout(() => processAITurn(roomId), 1200);
    }
  });

  function processAITurn(roomId) {
    const game = rooms[roomId];
    if (!game || game.turn !== 'ai_dealer') return;

    const bullet = game.bullets.shift();
    const isLive = bullet === 'live';
    const damage = game.isSawActive && isLive ? 2 : 1;
    game.isSawActive = false;

    if (isLive) {
      game.liveCount--;
      game.players[socket.id].hp = Math.max(0, game.players[socket.id].hp - damage);
    } else {
      game.blankCount--;
    }

    io.to(socket.id).emit('shotResult', { isLive, target: 'opponent' });

    // 💥 체력 0 판정
    if (checkGameOver(roomId)) return;

    if (game.isOpponentHandcuffed) {
      game.isOpponentHandcuffed = false;
    } else {
      game.turn = socket.id;
    }

    if (game.bullets.length === 0) {
      const newBullets = generateBullets();
      game.bullets = newBullets.bullets;
      game.liveCount = newBullets.liveCount;
      game.blankCount = newBullets.blankCount;
    }

    sendGameState(roomId);
  }

  // 4. 아이템 사용
  socket.on('useItem', ({ itemKey, index }) => {
    const roomId = socket.roomId;
    const game = rooms[roomId];
    if (!game || game.turn !== socket.id) return;

    const user = game.players[socket.id];
    user.items.splice(index, 1);

    if (itemKey === 'cigarette') {
      user.hp = Math.min(4, user.hp + 1);
      socket.emit('itemResult', { title: '담배', message: '체력을 1 회복했습니다.', effect: 'heal' });
    } else if (itemKey === 'saw') {
      game.isSawActive = true;
      socket.emit('itemResult', { title: '톱', message: '다음 실탄 데미지가 2배가 됩니다!', effect: 'saw' });
    } else if (itemKey === 'handcuffs') {
      if (!game.isOpponentHandcuffed) {
        game.isOpponentHandcuffed = true;
        socket.emit('itemResult', { title: '수갑', message: '상대의 다음 턴을 묶었습니다.' });
      }
    } else if (itemKey === 'magnifier') {
      const nextBullet = game.bullets[0] === 'live' ? '실탄' : '공포탄';
      socket.emit('itemResult', { title: '돋보기', message: `현재 약실의 총알은 [ ${nextBullet} ] 입니다.` });
    } else if (itemKey === 'medicine') {
      if (Math.random() < 0.4) {
        user.hp = Math.min(4, user.hp + 2);
        socket.emit('itemResult', { title: '만료된 약', message: '약이 효과가 있었습니다! 체력 +2', effect: 'heal' });
      } else {
        user.hp = Math.max(0, user.hp - 1);
        socket.emit('itemResult', { title: '만료된 약', message: '부작용 발생! 체력 -1', effect: 'poison' });
        
        // 약 먹고 체력이 0이 되어 자멸했을 경우 체크
        if (checkGameOver(roomId)) return;
      }
    }

    sendGameState(roomId);
  });

  socket.on('disconnect', () => {
    if (socket.roomId && rooms[socket.roomId]) {
      delete rooms[socket.roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
