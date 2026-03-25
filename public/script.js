const socket = io();

// --- VARIABLES ---
let myColor = null, roomCode = null, board = Array(25).fill(null);
let phase = "placing", turn = null, selectedIndex = null;
let possibleMoves = [], gameEnded = false, activePiece = null;

// Solo Mode States
let isSoloMode = false;
let soloTurn = "red"; // 'red' waa adiga (X), 'blue' waa Bot-ka (O)
let redPiecesPlaced = 0, bluePiecesPlaced = 0;

// --- INITIAL LOAD ---
window.onload = () => {
    const savedRoom = localStorage.getItem("shaxRoom");
    const savedName = localStorage.getItem("shaxName");
    if (savedRoom && savedName && !isSoloMode) {
        socket.emit("joinRoom", { roomCode: savedRoom, playerName: savedName });
    }
};

// --- MULTIPLAYER SOCKET EVENTS ---

socket.on("assignedColor", (color) => { 
    myColor = color; 
    const boardElement = document.getElementById("board");
    const turnText = document.getElementById("turnText");

    if (color === "spectator") {
        if (turnText) {
            turnText.innerText = "👀 Waxaad tahay Daawade";
            turnText.style.color = "#ffd60a";
        }
        if (boardElement) {
            boardElement.style.pointerEvents = "none"; 
            boardElement.style.opacity = "0.8"; 
        }
    }
});

socket.on("gameState", (state) => {
    if (isSoloMode) return; // MUHIIM: Jooji server-ka haddii Solo lagu jiro
    if (!state) return;
    board = state.board;
    phase = state.phase;
    turn = state.turn;
    activePiece = state.activePiece;
    gameEnded = !!state.winner;

    updateUI(state);
    renderBoard();
});

// --- SOLO MODE FUNCTIONS ---

window.initSoloGame = function() {
    isSoloMode = true;
    gameEnded = false;
    board = Array(25).fill(null);
    phase = "placing";
    soloTurn = "red";
    myColor = "red";
    redPiecesPlaced = 0;
    bluePiecesPlaced = 0;
    
    document.getElementById("p1-display").innerText = "🔴 Adiga";
    document.getElementById("p2-display").innerText = "🔵 Robot (Bot)";
    
    updateSoloUI();
    renderBoard();
};

function updateSoloUI() {
    const turnText = document.getElementById("turnText");
    if (gameEnded) return;

    if (soloTurn === "red") {
        turnText.innerText = phase === "placing" ? "Turn-kaaga: Dhig" : "Turn-kaaga: Dhaqaaq";
        turnText.style.color = "#2ecc71";
    } else {
        turnText.innerText = "Robot-ka ayaa fakaraya...";
        turnText.style.color = "#f39c12";
    }
}

// --- CORE GAMEPLAY LOGIC ---

function handleCellClick(index) {
    if (gameEnded || myColor === "spectator") return;

    // 1. SOLO MODE LOGIC
    if (isSoloMode) {
        if (soloTurn !== "red") return; 

        if (phase === "placing") {
            if (board[index] === null && redPiecesPlaced < 12) {
                board[index] = "red";
                redPiecesPlaced++;
                playSound("move");
                checkSoloPhaseTransition();
                soloTurn = "blue";
                updateSoloUI();
                renderBoard();
                setTimeout(botMove, 800); // Robot-ka ayaa ciyaaraya
            }
        } else {
            handleMovingPhaseSolo(index);
        }
        return;
    }

    // 2. ONLINE MULTIPLAYER LOGIC
    if (turn !== socket.id) return;
    const rCode = roomCode || localStorage.getItem("shaxRoom");

    if (phase === "placing") {
        if (board[index] === null) {
            socket.emit("move", { roomCode: rCode, move: { type: "place", index } });
        }
    } else {
        // Online moving logic (koodhkaaga hadda ka eeg)
        if (board[index] === myColor) {
            selectedIndex = index;
            possibleMoves = getMoves(index);
        } else if (selectedIndex !== null && possibleMoves.includes(index)) {
            socket.emit("move", { roomCode: rCode, move: { type: "move", from: selectedIndex, to: index } });
            selectedIndex = null;
            possibleMoves = [];
        }
    }
    renderBoard();
}

// --- BOT AI LOGIC ---

function botMove() {
    if (!isSoloMode || gameEnded) return;

    if (phase === "placing") {
        let available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (available.length > 0) {
            let move = available[Math.floor(Math.random() * available.length)];
            board[move] = "blue";
            bluePiecesPlaced++;
        }
    } else {
        // Bot Move Logic (Moving Phase)
        let botPieces = board.map((v, i) => v === "blue" ? i : null).filter(v => v !== null);
        for (let p of botPieces) {
            let moves = getMoves(p);
            if (moves.length > 0) {
                let target = moves[Math.floor(Math.random() * moves.length)];
                board[p] = null;
                board[target] = "blue";
                break;
            }
        }
    }

    playSound("move");
    checkSoloPhaseTransition();
    soloTurn = "red";
    updateSoloUI();
    renderBoard();
}

function checkSoloPhaseTransition() {
    if (redPiecesPlaced === 12 && bluePiecesPlaced === 12) {
        phase = "moving";
    }
}

// --- RENDER & UTILS ---

function renderBoard() {
    const boardDiv = document.getElementById("board");
    if (!boardDiv) return;
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

function getMoves(pos) {
    let list = [], r = Math.floor(pos/5), c = pos%5, dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    dirs.forEach(([dr, dc]) => {
        let nr = r+dr, nc = c+dc;
        if (nr>=0 && nr<5 && nc>=0 && nc<5 && board[nr*5+nc] === null) {
            list.push(nr*5+nc);
        }
    });
    return list;
}

function playSound(type) {
    const sound = (type === "move") ? document.getElementById("moveSound") : document.getElementById("captureSound");
    if (sound) sound.play().catch(e => console.log("Sound error"));
}

// --- NAVIGATION ---

function startRandomMatch() {
    isSoloMode = false; // Hubi inaan Solo ka bixi lahayn
    const name = document.getElementById("nameInput").value.trim();
    if (!name) return alert("Geli magaca");
    localStorage.setItem("shaxName", name);
    socket.emit("findMatch", name);
}

function leaveGame() {
    if(confirm("Ma hubtaa inaad ka baxayso?")) {
        localStorage.removeItem("shaxRoom");
        location.reload();
    }
}
