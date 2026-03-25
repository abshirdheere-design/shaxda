const socket = io();

// --- VARIABLES ---
let myColor = null, roomCode = null, board = Array(25).fill(null);
let phase = "placing", turn = null, selectedIndex = null;
let possibleMoves = [], gameEnded = false;

// Solo Mode States
let isSoloMode = false;
let soloTurn = "red"; 
let redPlaced = 0, bluePlaced = 0;
let isCaptureState = false; 

// --- INITIAL LOAD ---
window.onload = () => {
    const savedRoom = localStorage.getItem("shaxRoom");
    const savedName = localStorage.getItem("shaxName");
    if (savedRoom && savedName) {
        socket.emit("joinRoom", { roomCode: savedRoom, playerName: savedName });
    }
};

// --- 1. ONLINE MODE FIX ---
window.startRandomMatch = function() {
    isSoloMode = false;
    const nameInput = document.getElementById("nameInput");
    const name = nameInput ? nameInput.value.trim() : "";
    if (!name) return alert("Geli magacaaga marka hore!");
    localStorage.setItem("shaxName", name);
    socket.emit("findMatch", name); // Hubi in Server-kaagu leeyahay 'findMatch'
};

// --- 2. SOLO MODE (BOT) START ---
window.startSoloGame = function() {
    isSoloMode = true;
    gameEnded = false;
    board = Array(25).fill(null);
    phase = "placing";
    soloTurn = "red";
    redPlaced = 0;
    bluePlaced = 0;
    isCaptureState = false;
    
    showGameScreen();
    document.getElementById("p1-display").innerText = "🔴 Adiga";
    document.getElementById("p2-display").innerText = "🔵 Robot (Bot)";
    updateSoloUI();
    renderBoard();
};

// --- CORE GAMEPLAY LOGIC ---
function handleCellClick(index) {
    if (gameEnded || myColor === "spectator") return;

    if (isSoloMode) {
        handleSoloMove(index);
    } else {
        handleOnlineMove(index);
    }
}

// --- SOLO LOGIC (A, B, C FIXES) ---
function handleSoloMove(index) {
    if (isCaptureState) {
        if (soloTurn === "red" && board[index] === "blue") {
            board[index] = null;
            isCaptureState = false;
            playSound("capture");
            soloTurn = "blue";
            updateSoloUI();
            renderBoard();
            setTimeout(botMove, 800);
        }
        return;
    }

    if (soloTurn !== "red") return;

    if (phase === "placing") {
        // XEERKA 2-2: Labo labo u dhig (2 Red, then 2 Blue)
        if (board[index] === null && redPlaced < 12) {
            board[index] = "red";
            redPlaced++;
            playSound("move");

            // Hubi haddii loo wareejinayo Bot-ka (Markaad 2 dhigto)
            if (redPlaced % 2 === 0 || redPlaced === 12) {
                soloTurn = "blue";
                setTimeout(botMove, 800);
            }
            if (redPlaced === 12 && bluePlaced === 12) phase = "moving";
        }
    } else {
        // MOVING PHASE & CAPTURE
        if (board[index] === "red") {
            selectedIndex = index;
            possibleMoves = getMoves(index);
        } else if (selectedIndex !== null && possibleMoves.includes(index)) {
            board[selectedIndex] = null;
            board[index] = "red";
            selectedIndex = null;
            possibleMoves = [];
            playSound("move");

            if (checkCapture(index, "red")) {
                isCaptureState = true;
            } else {
                soloTurn = "blue";
                setTimeout(botMove, 800);
            }
        }
    }
    updateSoloUI();
    renderBoard();
}

function botMove() {
    if (!isSoloMode || gameEnded || isCaptureState) return;

    if (phase === "placing") {
        let available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (available.length > 0) {
            let move = available[Math.floor(Math.random() * available.length)];
            board[move] = "blue";
            bluePlaced++;
            
            // Bot-kuna 2 jeer ayuu dhigayaa
            if (bluePlaced % 2 !== 0 && bluePlaced < 12) {
                setTimeout(botMove, 500);
            } else {
                soloTurn = "red";
            }
        }
    } else {
        // Bot Moving
        let botPieces = board.map((v, i) => v === "blue" ? i : null).filter(v => v !== null);
        let moved = false;
        for (let p of botPieces) {
            let moves = getMoves(p);
            if (moves.length > 0) {
                let target = moves[Math.floor(Math.random() * moves.length)];
                board[p] = null;
                board[target] = "blue";
                if (checkCapture(target, "blue")) {
                    // Robot-ka ayaa dhibic kaa qaadaya
                    let mine = board.map((v, i) => v === "red" ? i : null).filter(v => v !== null);
                    if (mine.length > 0) board[mine[0]] = null;
                }
                moved = true; break;
            }
        }
        // XEERKA C: GO'DOON (Trap)
        if (!moved) { 
            alert("Robot-ku waa go'doon! Turn-ka adigaa iska leh.");
            soloTurn = "red";
        } else {
            soloTurn = "red";
        }
    }
    if (redPlaced === 12 && bluePlaced === 12) phase = "moving";
    updateSoloUI();
    renderBoard();
}

// --- CAPTURE CALCULATOR (3 ISKU XIRAN) ---
function checkCapture(index, color) {
    const row = Math.floor(index / 5);
    const col = index % 5;
    const checkLine = (indices) => indices.every(i => board[i] === color);

    // Horizontal
    for (let c = 0; c <= 2; c++) {
        let base = row * 5 + c;
        if (checkLine([base, base+1, base+2])) return true;
    }
    // Vertical
    for (let r = 0; r <= 2; r++) {
        let base = r * 5 + col;
        if (checkLine([base, base+5, base+10])) return true;
    }
    return false;
}

// --- ONLINE HELPERS ---
function handleOnlineMove(index) {
    if (turn !== socket.id) return;
    const rCode = roomCode || localStorage.getItem("shaxRoom");
    if (phase === "placing") {
        if (board[index] === null) socket.emit("move", { roomCode: rCode, move: { type: "place", index } });
    } else {
        if (board[index] === myColor) {
            selectedIndex = index;
            possibleMoves = getMoves(index);
        } else if (selectedIndex !== null && possibleMoves.includes(index)) {
            socket.emit("move", { roomCode: rCode, move: { type: "move", from: selectedIndex, to: index } });
            selectedIndex = null;
        }
    }
}

// --- SHARED UTILS ---
function getMoves(pos) {
    let list = [], r = Math.floor(pos/5), c = pos%5;
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dr, dc]) => {
        let nr = r+dr, nc = c+dc;
        if (nr>=0 && nr<5 && nc>=0 && nc<5 && board[nr*5+nc] === null) list.push(nr*5+nc);
    });
    return list;
}

function renderBoard() {
    const boardDiv = document.getElementById("board");
    boardDiv.innerHTML = "";
    board.forEach((cell, i) => {
        const div = document.createElement("div");
        div.className = `cell ${cell || ''}`;
        if (selectedIndex === i) div.classList.add("selected");
        if (possibleMoves.includes(i)) div.classList.add("highlight-move");
        div.onclick = () => handleCellClick(i);
        boardDiv.appendChild(div);
    });
}

function updateSoloUI() {
    const turnText = document.getElementById("turnText");
    if (isCaptureState) {
        turnText.innerText = "🎯 QAAD DHIBIC!";
        turnText.style.color = "#f1c40f";
    } else {
        turnText.innerText = (soloTurn === "red") ? "Turn-kaaga" : "Robot-ka...";
        turnText.style.color = (soloTurn === "red") ? "#2ecc71" : "#f39c12";
    }
}

function showGameScreen() {
    document.getElementById("setup-area").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
}

function playSound(type) {
    const s = document.getElementById(type === "move" ? "moveSound" : "captureSound");
    if (s) s.play().catch(() => {});
}

// Online Socket events (assignedColor, gameState, etc.) sidiisii u daa...
socket.on("gameState", (state) => {
    if (isSoloMode) return;
    board = state.board; phase = state.phase; turn = state.turn;
    showGameScreen(); renderBoard();
});
