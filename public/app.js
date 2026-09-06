const socket = io();

// DOM 요소 참조
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code');
const btnJoin = document.getElementById('btn-join');
const btnAI = document.getElementById('btn-ai');

const myNameEl = document.getElementById('my-name');
const myHpEl = document.getElementById('my-hp');
const myItemsEl = document.getElementById('my-items');

const oppNameEl = document.getElementById('opp-name');
const oppHpEl = document.getElementById('opp-hp');
const oppItemsEl = document.getElementById('opp-items');

const bulletInfoEl = document.getElementById('bullet-info');
const statusTextEl = document.getElementById('status-text');
const btnShootOpp = document.getElementById('btn-shoot-opp');
const btnShootSelf = document.getElementById('btn-shoot-self');

const itemModal = document.getElementById('item-modal');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const modalClose = document.getElementById('modal-close');

const appEl = document.getElementById('app');
const shotgunEl = document.querySelector('.shotgun-icon');

// 상태 관리
let isMyTurn = false;
let isStealingMode = false;
let isOpponentHandcuffed = false;

const ITEM_DATA = {
  cigarette: { name: '🚬 담배', desc: '체력을 1 회복합니다. (최대 체력 이상 회복 불가)' },
  beer: { name: '🍺 맥주', desc: '현재 약실의 총알을 한 발 배출합니다.' },
  magnifier: { name: '🔍 돋보기', desc: '현재 약실에 들어있는 총알의 종류(실탄/공포탄)를 확인합니다.' },
  saw: { name: '🪚 톱', desc: '다음 발사되는 실탄의 데미지를 2배(2데미지)로 만듭니다.' },
  handcuffs: { name: '⛓️ 수갑', desc: '상대의 다음 턴을 건너뜁니다. (연속 사용 불가)' },
  medicine: { name: '💊 만료된 약', desc: '40% 확률로 체력 2 회복, 60% 확률로 체력 1 손실.' },
  inverter: { name: '🔄 반전기', desc: '현재 약실의 총알 종류를 반전시킵니다. (실탄 ↔ 공포탄)' },
  phone: { name: '📞 대포폰', desc: '미래의 총알 중 하나에 대한 정보를 무작위로 얻습니다.' },
  adrenaline: { name: '💉 아드레날린', desc: '상대의 아이템 중 하나를 즉시 빼앗아 사용합니다.' }
};

// 🎬 Visual Effects
function triggerLiveShotEffect() {
  appEl.classList.remove('shake-heavy', 'flash-red-bg');
  shotgunEl.classList.remove('recoil-fire', 'flash-red-active');

  void appEl.offsetWidth;

  appEl.classList.add('shake-heavy', 'flash-red-bg');
  shotgunEl.classList.add('recoil-fire', 'flash-red-active');

  setTimeout(() => {
    appEl.classList.remove('shake-heavy', 'flash-red-bg');
    shotgunEl.classList.remove('recoil-fire', 'flash-red-active');
  }, 400);
}

function triggerBlankShotEffect() {
  appEl.classList.remove('flash-white-bg');
  shotgunEl.classList.remove('recoil-blank');

  void appEl.offsetWidth;

  appEl.classList.add('flash-white-bg');
  shotgunEl.classList.add('recoil-blank');

  setTimeout(() => {
    appEl.classList.remove('flash-white-bg');
    shotgunEl.classList.remove('recoil-blank');
  }, 200);
}

function triggerItemEffect(type) {
  appEl.classList.remove('flash-heal', 'flash-poison', 'flash-saw', 'flash-yellow');
  void appEl.offsetWidth;

  if (type === 'heal') appEl.classList.add('flash-heal');
  else if (type === 'poison') appEl.classList.add('flash-poison');
  else if (type === 'saw') appEl.classList.add('flash-saw');
  else appEl.classList.add('flash-yellow');

  setTimeout(() => {
    appEl.classList.remove('flash-heal', 'flash-poison', 'flash-saw', 'flash-yellow');
  }, 400);
}

function updateHpWithEffect(el, count) {
  el.textContent = '❤️'.repeat(Math.max(0, count));
  el.classList.add('hp-damage');
  setTimeout(() => el.classList.remove('hp-damage'), 500);
}

// 🎮 아이템 꾹 누르기 (설명 보기)
function attachLongPressInfo(element, itemKey, onShortClick) {
  let timer = null;
  let isLongPress = false;

  const start = () => {
    isLongPress = false;
    timer = setTimeout(() => {
      isLongPress = true;
      const info = ITEM_DATA[itemKey] || { name: itemKey, desc: '정보가 없습니다.' };
      showModal(info.name, info.desc);
    }, 500);
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const end = () => {
    cancel();
    if (!isLongPress && onShortClick) {
      onShortClick();
    }
  };

  element.addEventListener('touchstart', start, { passive: true });
  element.addEventListener('touchend', end);
  element.addEventListener('touchmove', cancel);

  element.addEventListener('mousedown', start);
  element.addEventListener('mouseup', end);
  element.addEventListener('mouseleave', cancel);

  element.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const info = ITEM_DATA[itemKey] || { name: itemKey, desc: '정보가 없습니다.' };
    showModal(info.name, info.desc);
  });
}

// 🎮 Event Handlers & Game Loop
btnJoin.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || '플레이어';
  const room = roomCodeInput.value.trim() || 'default';
  socket.emit('joinRoom', { name, room });
});

btnAI.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || '플레이어';
  socket.emit('startVsAI', { name });
});

socket.on('gameStart', () => {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  showModal('게임 시작', '목숨을 건 벅샷 룰렛에 오신 것을 환영합니다.\n아이템을 꾹 누르면 설명을 볼 수 있습니다.');
});

socket.on('updateGameState', (state) => {
  isMyTurn = state.turn === socket.id;
  isOpponentHandcuffed = state.isOpponentHandcuffed || false;

  updateHpWithEffect(myHpEl, state.myHp);
  updateHpWithEffect(oppHpEl, state.oppHp);

  myNameEl.textContent = state.myName;
  oppNameEl.textContent = state.oppName;

  bulletInfoEl.textContent = `실탄: ${state.liveBullets} | 공포탄: ${state.blankBullets}`;

  btnShootOpp.disabled = !isMyTurn;
  btnShootSelf.disabled = !isMyTurn;

  statusTextEl.textContent = isMyTurn ? '🔥 당신의 턴입니다! 행동을 선택하세요.' : '⏳ 상대방의 Turn 진행 중...';

  renderItems(state.myItems, state.oppItems);
});

function renderItems(myItems, oppItems) {
  myItemsEl.innerHTML = '';
  oppItemsEl.innerHTML = '';

  myItems.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.className = 'item-btn';
    btn.textContent = ITEM_DATA[item]?.name || item;

    if (!isMyTurn || (item === 'handcuffs' && isOpponentHandcuffed)) {
      btn.disabled = true;
    }

    attachLongPressInfo(btn, item, () => {
      if (!btn.disabled) useItem(item, idx);
    });

    myItemsEl.appendChild(btn);
  });

  oppItems.forEach((item, idx) => {
    const btn = document.createElement('button');
    btn.className = 'item-btn';
    btn.textContent = ITEM_DATA[item]?.name || item;

    if (isStealingMode) {
      btn.classList.add('stealable');
      attachLongPressInfo(btn, item, () => stealItem(item, idx));
    } else {
      btn.disabled = true;
      attachLongPressInfo(btn, item, null);
    }

    oppItemsEl.appendChild(btn);
  });
}

function useItem(itemKey, index) {
  if (!isMyTurn) return;

  if (itemKey === 'cigarette') triggerItemEffect('heal');
  else if (itemKey === 'saw') triggerItemEffect('saw');
  else triggerItemEffect('yellow');

  if (itemKey === 'adrenaline') {
    isStealingMode = true;
    statusTextEl.textContent = '💉 훔칠 상대 아이템을 클릭하세요!';
    socket.emit('useItem', { itemKey, index });
    return;
  }

  socket.emit('useItem', { itemKey, index });
}

function stealItem(itemKey, index) {
  if (!isStealingMode) return;
  isStealingMode = false;
  socket.emit('stealItem', { itemKey, index });
}

btnShootOpp.addEventListener('click', () => {
  if (!isMyTurn) return;
  socket.emit('shoot', { target: 'opponent' });
});

btnShootSelf.addEventListener('click', () => {
  if (!isMyTurn) return;
  socket.emit('shoot', { target: 'self' });
});

socket.on('shotResult', (res) => {
  if (res.isLive) {
    triggerLiveShotEffect();
    statusTextEl.textContent = `💥 탕! 실탄이 격발되었습니다! (${res.target === 'self' ? '자해' : '상대 피격'})`;
  } else {
    triggerBlankShotEffect();
    statusTextEl.textContent = `⚙️ 딱! 공포탄이었습니다.`;
  }
});

socket.on('itemResult', (res) => {
  showModal(res.title || '아이템', res.message);
  if (res.effect === 'poison') triggerItemEffect('poison');
  if (res.effect === 'heal') triggerItemEffect('heal');
});

function showModal(title, text) {
  modalTitle.textContent = title;
  modalDesc.textContent = text;
  itemModal.classList.remove('hidden');
}

modalClose.addEventListener('click', () => {
  itemModal.classList.add('hidden');

  if (modalTitle.textContent.includes('승리') || modalTitle.textContent.includes('패배')) {
    gameScreen.classList.add('hidden');
    lobbyScreen.classList.remove('hidden');
  }
});
// 🎬 장전 애니메이션 연출
function triggerReloadEffect(liveCount, blankCount) {
  // 총기 그래픽 젖힘/움직임 애니메이션
  shotgunEl.classList.remove('reload-anim');
  void shotgunEl.offsetWidth; // Reflow
  shotgunEl.classList.add('reload-anim');

  // 화면 중앙에 장전 텍스트 팝업 및 화면 번쩍임
  statusTextEl.textContent = `🔄 [재장전] 실탄 ${liveCount}발 / 공포탄 ${blankCount}발이 장전되었습니다!`;
  appEl.classList.add('flash-yellow');

  setTimeout(() => {
    shotgunEl.classList.remove('reload-anim');
    appEl.classList.remove('flash-yellow');
  }, 600);
}

// 서버에서 재장전 신호가 오면 연출 실행
socket.on('reloadBullets', (data) => {
  triggerReloadEffect(data.liveBullets, data.blankBullets);
});
