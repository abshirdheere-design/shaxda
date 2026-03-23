// Isticmaal URL-ka saxda ah ama iska dhaaf io() haddii uu isla server-ka ku jiro
const socket = io("https://mashruuc-production.up.railway.app/");

// Hubi in doorsoomayaashan aysan ku dhex jirin script.js kale
let myColor = null;
let roomCode = null;
let board = Array(25).fill(null);
let phase = "placing";
let turn = null;

socket.on("connect", () => {
    console.log("Ku xirmay Server-ka:", socket.id);
    // Marka uu xirmo, dhibicda cagaar ka dhig
    const dot = document.getElementById("status-dot");
    if(dot) { dot.classList.add("online"); dot.classList.remove("offline"); }
});

socket.on("assignedColor", (color) => {
    myColor = color;
    console.log("Midabkaaga waa:", color);
});

socket.on("gameState", (state) => {
    if (!state) return;

    // Cusboonaysii xogta rasmiga ah
    board = state.board;
    phase = state.phase;
    turn = state.turn; 
    roomCode = state.roomCode || state.id;

    localStorage.setItem("shaxRoom", roomCode);

    // Muuji shaashadda ciyaarta
    document.getElementById("setup-area").style.display = "none";
    document.getElementById("game-ui").style.display = "block";

    // Cusboonaysii magacyada ciyaartoyda iyo iftiinka turn-ka
    state.players.forEach(p => {
        const el = document.getElementById(p.color === "red" ? "p1-display" : "p2-display");
        if (el) {
            el.innerText = (p.color === "red" ? "🔴 " : "🔵 ") + p.name;
            // Ku dar "active" class haddii uu turn-kiisa yahay
            if (turn === p.color || turn === p.id) {
                el.classList.add("active");
            } else {
                el.classList.remove("active");
            }
        }
    });

    const turnText = document.getElementById("turnText");
    if (turnText) {
        // Hubi haddii turn-ku yahay midabkaaga ama ID-gaaga
        const isMyTurn = (turn === myColor || turn === socket.id);
        if (isMyTurn) {
            turnText.innerText = phase === "placing" ? "Turn-kaaga: Dhig xabbad" : "Turn-kaaga: Dhaqaaq";
            turnText.style.color = "#2ecc71";
        } else {
            turnText.innerText = "Sug... qofka kale";
            turnText.style.color = "#bdc3c7";
        }
    }

    // Sawir Board-ka (Handle renderBoard call)
    if (typeof renderBoard === "function") {
        renderBoard(); 
    }
});

// FUNCTIONS-KA BUTTON-NADA
function startRandomMatch() {
    const name = document.getElementById("nameInput").value.trim();
    if (!name) return alert("Fadlan gali magacaaga");
    localStorage.setItem("shaxName", name);
    socket.emit("findMatch", name);
}

function joinRoom() {
    const name = document.getElementById("nameInput").value.trim();
    const rCode = document.getElementById("roomInput").value.trim();
    if (!name || !rCode) return alert("Magac iyo Code geli");
    localStorage.setItem("shaxName", name);
    localStorage.setItem("shaxRoom", rCode);
    socket.emit("joinRoom", { roomCode: rCode, playerName: name });
}