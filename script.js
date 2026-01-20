// 参与者列表
let participants = [];
// 获奖者列表
let winners = [];
// 是否正在滚动
let isRolling = false;
// 当前滚动定时器
let rollingTimerId = null;
// 随机自动停止定时器
let autoStopTimeoutId = null;
// 当前屏幕显示的名字
let currentShownName = '';
// “速度”滑块值（1-10）
let speedLevel = 5;
// 本轮已预抽的获奖者（保证公平：开始滚动时就确定结果）
let pendingWinners = [];

const DEFAULT_PARTICIPANTS_TEXT = `
梁永红
于含
邹德君
廖晓涛
宋立新
路亮
于孝民
赵红云
郑瑶
李欣然
李洪栋
郑茜
张靖
李婷婷
周静
赵洋
魏阔
赵晨
冀娟
魏庆飞
赵静
魏丽红
左丽萍
刘津酉
颜颜
张方
王雷
孙丽颖
白红英
贾燕
姜立娜
吴萍
司霞
刘春花
张雪
赵涛
王琼
杨星雨
唐丽萍
曹雪梅
李敏
黄玲
王杰
李京川
刘伟
陈明
王毅
何莉婕
莫小枫
银焕邦
黄丽娟
王杰
周兴颖
姜鹏
肖旺
陈皓
郑航
崔昕瞳
乔国桂
袁伦鹏
周自棋
于光华
李魏
董德旭
李洋
袁学
吴彬
杨永志
干川川
张应华
张代根
吕静
徐明军
左明伟
胡先豪
沈清元
华健森
赵玉林
魏阳
白成渝
龙洪彬
徐操
祝东
陶中富
张万勤
宋先福
唐发祥
赵德福
谢永洪
郭鹏博
石玉刚
郭鹏飞
秦晓东
梁伟
袁宝忠
吕相超
胡云奎
毛波
邹亮
石强
张家豪
刘良明
何琦
李洪兆
张文宇
唐洪全
张利红
付明兴
施祖成
秦小风
袁文月
吴富发
张静
胡洪
张作昌
周贵权
王代强
张俊雨
张立丰
向申磊
车宛靖
郭宇
黄治龙
白志敏
廖义根
于文达
`.trim();

// DOM元素
const rollingNameEl = document.getElementById('rollingName');
const startBtn = document.getElementById('startBtn');
const addParticipantBtn = document.getElementById('addParticipantBtn');
const participantInput = document.getElementById('participantInput');
const participantsList = document.getElementById('participantsList');
const winnersList = document.getElementById('winnersList');
const drawCountInput = document.getElementById('drawCount');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const autoStopToggle = document.getElementById('autoStopToggle');
const autoStopMinSecInput = document.getElementById('autoStopMinSec');
const autoStopMaxSecInput = document.getElementById('autoStopMaxSec');
const soundToggle = document.getElementById('soundToggle');
const winnerModal = document.getElementById('winnerModal');
const closeModal = document.getElementById('closeModal');
const confirmBtn = document.getElementById('confirmBtn');
const importModal = document.getElementById('importModal');
const importBtn = document.getElementById('importBtn');
const closeImportModal = document.getElementById('closeImportModal');
const confirmImportBtn = document.getElementById('confirmImportBtn');
const importTextarea = document.getElementById('importTextarea');
const clearWinnersBtn = document.getElementById('clearWinnersBtn');

function parseNamesFromText(text) {
    return text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function uniqueNames(names) {
    const seen = new Set();
    const result = [];
    for (const n of names) {
        if (!seen.has(n)) {
            seen.add(n);
            result.push(n);
        }
    }
    return result;
}

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function init() {
    // 事件：开始/停止
    startBtn.addEventListener('click', toggleRolling);
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            toggleRolling();
        }
    });

    addParticipantBtn.addEventListener('click', addParticipant);
    participantInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addParticipant();
    });

    speedSlider.addEventListener('input', (e) => {
        speedLevel = parseInt(e.target.value, 10);
        speedValue.textContent = String(speedLevel);
        if (isRolling) restartRollingTimer();
    });

    // 自动停止参数变化时，如果在滚动则重设自动停止
    [autoStopToggle, autoStopMinSecInput, autoStopMaxSecInput].forEach((el) => {
        el.addEventListener('change', () => {
            if (isRolling) scheduleAutoStop();
        });
    });

    closeModal.addEventListener('click', closeWinnerModal);
    confirmBtn.addEventListener('click', closeWinnerModal);

    importBtn.addEventListener('click', () => {
        importModal.classList.add('show');
        importTextarea.value = '';
    });
    closeImportModal.addEventListener('click', () => {
        importModal.classList.remove('show');
    });
    confirmImportBtn.addEventListener('click', importParticipants);
    clearWinnersBtn.addEventListener('click', clearWinners);

    // 点击模态框外部关闭
    winnerModal.addEventListener('click', (e) => {
        if (e.target === winnerModal) closeWinnerModal();
    });
    importModal.addEventListener('click', (e) => {
        if (e.target === importModal) importModal.classList.remove('show');
    });

    // 默认导入你提供的名单（自动去重）
    participants = uniqueNames(parseNamesFromText(DEFAULT_PARTICIPANTS_TEXT));
    // 打乱显示顺序（不影响公平性：每次抽奖仍然是等概率抽取）
    shuffleInPlace(participants);
    updateParticipantsList();
    setRollingDisplayText(`已导入 ${participants.length} 人`);
}

function toggleRolling() {
    if (!isRolling) {
        startRolling();
    } else {
        stopRollingAndPickWinners();
    }
}

function getRollingIntervalMs() {
    // speedLevel: 1(快) -> 40ms, 10(慢) -> 160ms
    const min = 40;
    const max = 160;
    const t = (speedLevel - 1) / 9;
    return Math.round(min + (max - min) * t);
}

function setRollingDisplayText(text) {
    rollingNameEl.textContent = text;
}

function setRollingStateUI(rolling) {
    const textEl = startBtn.querySelector('.btn-text');
    const iconEl = startBtn.querySelector('.btn-icon');

    if (rolling) {
        textEl.textContent = '停止';
        iconEl.textContent = '■';
        rollingNameEl.classList.add('rolling');
        rollingNameEl.classList.remove('locked');
    } else {
        textEl.textContent = '开始';
        iconEl.textContent = '▶';
        rollingNameEl.classList.remove('rolling');
    }
}

function restartRollingTimer() {
    if (!isRolling) return;
    if (rollingTimerId) window.clearInterval(rollingTimerId);
    rollingTimerId = window.setInterval(() => {
        if (participants.length === 0) {
            setRollingDisplayText('暂无参与者');
            return;
        }
        const idx = Math.floor(Math.random() * participants.length);
        currentShownName = participants[idx];
        setRollingDisplayText(currentShownName);
        if (soundToggle.checked) playTickSound();
    }, getRollingIntervalMs());
}

function startRolling() {
    if (participants.length === 0) {
        alert('请先添加参与者！');
        return;
    }

    const drawCount = parseInt(drawCountInput.value, 10) || 1;
    if (drawCount > participants.length) {
        alert(`参与者数量不足！当前只有 ${participants.length} 人。`);
        return;
    }

    // 公平性：开始滚动时就从参与者池中等概率抽出本轮最终获奖者（不受停止时机影响）
    pendingWinners = sampleWithoutReplacement(participants, drawCount);

    isRolling = true;
    setRollingStateUI(true);
    restartRollingTimer();
    scheduleAutoStop();
}

function sampleWithoutReplacement(list, k) {
    // Fisher–Yates shuffle 的前 k 个（均匀无放回抽样）
    const arr = [...list];
    const n = arr.length;
    const m = Math.min(k, n);
    for (let i = 0; i < m; i++) {
        const j = i + Math.floor(Math.random() * (n - i));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, m);
}

function getAutoStopRangeMs() {
    const minSec = Math.max(1, parseInt(autoStopMinSecInput.value, 10) || 3);
    const maxSec = Math.max(1, parseInt(autoStopMaxSecInput.value, 10) || 8);
    const lo = Math.min(minSec, maxSec);
    const hi = Math.max(minSec, maxSec);
    return { minMs: lo * 1000, maxMs: hi * 1000 };
}

function clearAutoStop() {
    if (autoStopTimeoutId) {
        window.clearTimeout(autoStopTimeoutId);
        autoStopTimeoutId = null;
    }
}

function scheduleAutoStop() {
    clearAutoStop();
    if (!isRolling) return;
    if (!autoStopToggle.checked) return;

    const { minMs, maxMs } = getAutoStopRangeMs();
    const duration = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
    autoStopTimeoutId = window.setTimeout(() => {
        // 自动停止也走同一套逻辑（允许用户提前手动停止）
        if (isRolling) stopRollingAndPickWinners();
    }, duration);
}

function stopRollingAndPickWinners() {
    if (!isRolling) return;

    isRolling = false;
    if (rollingTimerId) {
        window.clearInterval(rollingTimerId);
        rollingTimerId = null;
    }
    clearAutoStop();

    setRollingStateUI(false);

    // 本轮结果使用 pendingWinners，保证公平
    const selectedWinners = [...pendingWinners];
    pendingWinners = [];

    if (selectedWinners.length === 0) {
        setRollingDisplayText('暂无获奖者');
        return;
    }

    // 锁定显示（显示第一个）
    currentShownName = selectedWinners[0];
    setRollingDisplayText(currentShownName);
    rollingNameEl.classList.add('locked');

    // 记录获奖并从参与者池移除（避免重复中奖）
    for (const w of selectedWinners) {
        if (!winners.includes(w)) winners.push(w);
    }
    participants = participants.filter((p) => !selectedWinners.includes(p));

    updateParticipantsList();
    updateWinnersList();
    showWinnerModal(selectedWinners);

    if (soundToggle.checked) playWinSound();
}

// 显示获奖弹窗
function showWinnerModal(winners) {
    const winnerDisplay = document.getElementById('winnerDisplay');
    if (winners.length === 1) {
        winnerDisplay.innerHTML = `<div style="font-size: 3rem; margin-bottom: 20px;">${winners[0]}</div>`;
    } else {
        winnerDisplay.innerHTML = winners.map((winner, index) => 
            `<div style="font-size: 2rem; margin: 10px 0;">${index + 1}. ${winner}</div>`
        ).join('');
    }
    
    // 创建彩纸效果
    createConfetti();
    
    winnerModal.classList.add('show');
}

// 创建彩纸效果
function createConfetti() {
    const confettiContainer = document.querySelector('.confetti');
    confettiContainer.innerHTML = '';
    
    const colors = ['#f093fb', '#f5576c', '#4facfe', '#00f2fe', '#43e97b', '#fee140'];
    const count = 50;
    
    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = Math.random() * 3 + 's';
        piece.style.width = (Math.random() * 10 + 5) + 'px';
        piece.style.height = piece.style.width;
        confettiContainer.appendChild(piece);
    }
}

// 关闭获奖弹窗
function closeWinnerModal() {
    winnerModal.classList.remove('show');
}

// 重置转盘
function resetWheel() {
    if (isSpinning) return;
    currentRotation = 0;
    drawWheel();
}

// 添加参与者
function addParticipant() {
    const name = participantInput.value.trim();
    if (name === '') {
        alert('请输入参与者姓名！');
        return;
    }
    if (participants.includes(name)) {
        alert('该参与者已存在！');
        return;
    }
    
    participants.push(name);
    participantInput.value = '';
    updateParticipantsList();
    drawWheel();
}

// 更新参与者列表
function updateParticipantsList() {
    participantsList.innerHTML = '';
    
    if (participants.length === 0) {
        participantsList.innerHTML = '<div class="empty-state">暂无参与者</div>';
        return;
    }
    
    participants.forEach((participant, index) => {
        const item = document.createElement('div');
        item.className = 'participant-item';
        item.innerHTML = `
            <span>${participant}</span>
            <button class="remove-btn" data-index="${index}" title="移除">×</button>
        `;
        item.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            removeParticipant(idx);
        });
        participantsList.appendChild(item);
    });
}

// 移除参与者
function removeParticipant(index) {
    if (isSpinning) return;
    participants.splice(index, 1);
    updateParticipantsList();
    drawWheel();
}

// 批量导入参与者
function importParticipants() {
    const text = importTextarea.value.trim();
    if (text === '') {
        alert('请输入参与者名单！');
        return;
    }
    
    const names = parseNamesFromText(text);
    
    if (names.length === 0) {
        alert('未找到有效的参与者姓名！');
        return;
    }
    
    let added = 0;
    let skipped = 0;
    
    const beforeSet = new Set(participants);
    for (const name of names) {
        if (!beforeSet.has(name)) {
            participants.push(name);
            beforeSet.add(name);
            added++;
        } else {
            skipped++;
        }
    }
    
    importModal.classList.remove('show');
    updateParticipantsList();
    drawWheel();
    
    alert(`成功添加 ${added} 位参与者${skipped > 0 ? `，跳过 ${skipped} 位重复参与者` : ''}！`);
}

// 更新获奖名单
function updateWinnersList() {
    winnersList.innerHTML = '';
    
    if (winners.length === 0) {
        winnersList.innerHTML = '<div class="empty-state">暂无获奖者</div>';
        return;
    }
    
    winners.forEach((winner, index) => {
        const item = document.createElement('div');
        item.className = 'winner-item';
        item.innerHTML = `
            <div class="winner-rank">${index + 1}</div>
            <div class="winner-name">${winner}</div>
        `;
        winnersList.appendChild(item);
    });
}

// 清空获奖名单
function clearWinners() {
    if (confirm('确定要清空所有获奖记录吗？')) {
        winners = [];
        updateWinnersList();
    }
}

function safeGetAudioContext() {
    try {
        return new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        return null;
    }
}

function playTone({ frequency, durationMs, type = 'sine', gain = 0.15 }) {
    const audioContext = safeGetAudioContext();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(gain, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + durationMs / 1000);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + durationMs / 1000);
}

function playTickSound() {
    playTone({ frequency: 660, durationMs: 35, type: 'square', gain: 0.06 });
}

function playWinSound() {
    playTone({ frequency: 523.25, durationMs: 120, type: 'sine', gain: 0.18 });
    window.setTimeout(() => playTone({ frequency: 659.25, durationMs: 120, type: 'sine', gain: 0.18 }), 140);
    window.setTimeout(() => playTone({ frequency: 783.99, durationMs: 160, type: 'sine', gain: 0.18 }), 280);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
