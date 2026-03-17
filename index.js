const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: process.env.PORT || 3000 });
const rooms = new Map(); // Guarda as salas (Ex: 777)

console.log("Cupido ScaryMovie7 online!");

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        const msg = JSON.parse(data);

        // Lógica de Criar Sala
        if (msg.type === "host") {
            rooms.set(msg.room, ws);
            console.log(`Sala ${msg.room} criada pelo Host.`);
        } 
        // Lógica de Entrar na Sala
        else if (msg.type === "join") {
            const hostWs = rooms.get(msg.room);
            if (hostWs) {
                hostWs.send(JSON.stringify({ type: "peer_joined", id: msg.id }));
                ws.targetRoom = msg.room;
                console.log(`Peer ${msg.id} entrou na sala ${msg.room}.`);
            }
        }
        // Encaminhamento de mensagens (Signaling)
        else if (msg.target) {
            const hostWs = rooms.get(msg.target);
            if (hostWs) hostWs.send(JSON.stringify(msg));
        }
    });

    ws.on('close', () => {
        // Limpar sala se o Host sair
        for (let [room, socket] of rooms.entries()) {
            if (socket === ws) rooms.delete(room);
        }
    });
});