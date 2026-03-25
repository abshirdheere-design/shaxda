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

// --- 1. ONLINE MODE FIX (Halkan ka eeg) ---
window.startRandomMatch = function() {
    isSoloMode = false; // Hubi in Solo uu damanyahay
    const nameInput = document.getElementById("nameInput");
    const name = nameInput ? nameInput.value.trim() : "";
    
    if (!name) return alert("Fadlan marka hore qor magacaaga!");
    
    localStorage.setItem("shaxName", name);
    
    // Haddii socket-ku xiranyahay, dir amarka
    if (socket && socket.connected) {
        socket.emit("findMatch", name);
        console.log("Raadinta ciyaarta online-ka waa bilaabatay...");
    } else {
        alert("Server-ka lama xiriiri karo. Fadlan dib u cusboonaysii bogga.");
    }
};

// --- 2. SOLO MODE (BOT) LOGIC ---
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

// --- CORE GAMEPLAY ---
function handleCellClick(index) {
    if (gameEnded || myColor === "spectator") return;

    if (isSoloMode) {
        // XEERKA XABAD KA SAARISTA (CAPTURE)
        if (isCaptureState) {
            if (soloTurn === "red" && board[index] === "blue") {
                board[index] = null; // Ka saar xabadda Bot-ka
                isCaptureState = false;
                playSound("capture");
                
                // Turn-ka u wareeji Bot-ka haddii dhigistii dhamaatay
                soloTurn = "blue";
                updateSoloUI();
                renderBoard();
                setTimeout(botMove, 800);
            }
            return;
        }

        if (soloTurn !== "red") return;

        if (phase === "placing") {
            if (board[index] === null && redPlaced < 12) {
                board[index] = "red";
                redPlaced++;
                playSound("move");

                // Hubi haddii 3 isku xirmeen xitaa xilliga dhigista
                if (checkCapture(index, "red")) {
                    isCaptureState = true;
                } else {
                    // Xeerka 2-2 dhigista
                    if (redPlaced % 2 === 0 || redPlaced === 12) {
                        soloTurn = "blue";
                        setTimeout(botMove, 800);
                    }
                }
                if (redPlaced === 12 && bluePlaced === 12) phase = "moving";
            }
        } else {
            // Moving Phase
            if (board[index] === "red") {
                selectedIndex = index;
                possibleMoves = getMoves(index);
            } else if (selectedIndex !== null && possibleMoves.includes(index)) {
                board[selectedIndex] = null;
                board[index] = "red";
                let captured = checkCapture(index, "red");
                selectedIndex = null;
                possibleMoves = [];
                playSound("move");

                if (captured) {
                    isCaptureState = true;
                } else {
                    soloTurn = "blue";
                    setTimeout(botMove, 800);
                }
            }
        }
        updateSoloUI();
        renderBoard();
    } else {
        // Multiplayer Logic
        handleOnlineMove(index);
    }
}

// --- BOT AI (2-2 Dhigista & Capture) ---
function botMove() {
    if (!isSoloMode || gameEnded || isCaptureState) return;

    if (phase === "placing") {
        let available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (available.length > 0) {
            let move = available[Math.floor(Math.random() * available.length)];
            board[move] = "blue";
            bluePlaced++;
            
            if (checkCapture(move, "blue")) {
                // Robot-ka ayaa xabad kaa saaraya (Random)
                let myPieces = board.map((v, i) => v === "red" ? i : null).filter(v => v !== null);
                if (myPieces.length > 0) board[myPieces[0]] = null;
                playSound("capture");
            }

            if (bluePlaced % 2 !== 0 && bluePlaced < 12 && !isCaptureState) {
                setTimeout(botMove, 600);
            } else {
                soloTurn = "red";
            }
        }
    } else {
        // Bot Moving Logic
        let botPieces = board.map((v, i) => v === "blue" ? i : null).filter(v => v !== null);
        let moved = false;
        for (let p of botPieces) {
            let moves = getMoves(p);
            if (moves.length > 0) {
                let target = moves[Math.floor(Math.random() * moves.length)];
                board[p] = null;
                board[target] = "blue";
                if (checkCapture(target, "blue")) {
                    let mine = board.map((v, i) => v === "red" ? i : null).filter(v => v !== null);
                    if (mine.length > 0) board[mine[0]] = null;
                    playSound("capture");
                }
                moved = true; break;
            }
        }
        soloTurn = "red";
    }
    if (redPlaced === 12 && bluePlaced === 12) phase = "moving";
    updateSoloUI();
    renderBoard();
}

// --- XEERKA JARTA (Check 3 in a row) ---
function checkCapture(index, color) {
    const row = Math.floor(index / 5);
    const col = index % 5;

    // Horizontal check
    let rowStart = row * 5;
    for (let i = rowStart; i <= rowStart + 2; i++) {
        if (board[i] === color && board[i+1] === color && board[i+2] === color) return true;
    }

    // Vertical check
    for (let i = col; i <= col + 10; i += 5) {
        if (board[i] === color && board[i+5] === color && board[i+10] === color) return true;
    }

    return false;
}
