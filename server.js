const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

let usuarios = [];
let estadoJuego = {
    jugadorSecreto: "",
    impostorId: "",
    votos: {},
    jugadoresListos: []
};

app.use(express.static('public'));

function obtenerJugadorAleatorio() {
    try {
        const data = fs.readFileSync('./jugadores.json', 'utf8');
        const jugadores = JSON.parse(data);
        return jugadores[Math.floor(Math.random() * jugadores.length)];
    } catch (err) {
        return "Desconocido";
    }
}

io.on('connection', (socket) => {
    socket.on('join', (nombre) => {
        // Al entrar, el jugador siempre empieza vivo
        usuarios.push({ id: socket.id, nombre, vivo: true });
        io.emit('update-users', usuarios);
    });

    socket.on('start-game', () => {
        if (usuarios.length < 3) return;

        estadoJuego.jugadorSecreto = obtenerJugadorAleatorio();
        estadoJuego.votos = {};
        estadoJuego.jugadoresListos = []; // Resetear jugadores listos

        // Resetear salud de todos al iniciar
        usuarios.forEach(u => u.vivo = true);

        const vivos = usuarios.filter(u => u.vivo);
        const impostorIndex = Math.floor(Math.random() * vivos.length);
        estadoJuego.impostorId = vivos[impostorIndex].id;

        usuarios.forEach((u) => {
            if (u.id === estadoJuego.impostorId) {
                io.to(u.id).emit('role-assigned', { role: 'impostor' });
            } else {
                io.to(u.id).emit('role-assigned', { role: 'legit', data: estadoJuego.jugadorSecreto });
            }
        });
        io.emit('update-users', usuarios);
    });

    socket.on('open-voting', () => {
        // Validar que el jugador esté vivo
        const jugador = usuarios.find(u => u.id === socket.id);
        if (!jugador || !jugador.vivo) {
            return; // Ignorar solicitudes de jugadores muertos
        }

        // Agregar al jugador a la lista de listos si no está ya
        if (!estadoJuego.jugadoresListos.includes(socket.id)) {
            estadoJuego.jugadoresListos.push(socket.id);
        }

        const vivos = usuarios.filter(u => u.vivo);

        // Filtrar la lista de listos para asegurar que solo incluya jugadores vivos
        estadoJuego.jugadoresListos = estadoJuego.jugadoresListos.filter(id => {
            const user = usuarios.find(u => u.id === id);
            return user && user.vivo;
        });

        // Solo iniciar votación cuando TODOS los jugadores vivos estén listos
        if (estadoJuego.jugadoresListos.length >= vivos.length) {
            estadoJuego.jugadoresListos = []; // Resetear para la próxima ronda
            io.emit('voting-started', vivos);
        } else {
            // Notificar al jugador que está esperando a los demás
            io.to(socket.id).emit('waiting-for-others', {
                ready: estadoJuego.jugadoresListos.length,
                total: vivos.length
            });
        }
    });

    socket.on('cast-vote', (targetId) => {
        // Validar que el votante esté vivo
        const votante = usuarios.find(u => u.id === socket.id);
        if (!votante || !votante.vivo) {
            return; // Ignorar votos de jugadores muertos
        }

        estadoJuego.votos[targetId] = (estadoJuego.votos[targetId] || 0) + 1;

        const totalVotos = Object.values(estadoJuego.votos).reduce((a, b) => a + b, 0);
        const vivos = usuarios.filter(u => u.vivo);

        if (totalVotos >= vivos.length) {
            const eliminadoId = Object.keys(estadoJuego.votos).reduce((a, b) =>
                estadoJuego.votos[a] > estadoJuego.votos[b] ? a : b);

            const userEliminado = usuarios.find(u => u.id === eliminadoId);
            if (userEliminado) userEliminado.vivo = false;

            const esImpostor = eliminadoId === estadoJuego.impostorId;
            estadoJuego.votos = {};

            // Limpiar al jugador eliminado de la lista de listos
            estadoJuego.jugadoresListos = estadoJuego.jugadoresListos.filter(id => id !== eliminadoId);

            // Contar jugadores vivos sin contar al impostor si sigue vivo
            const vivosRestantes = usuarios.filter(u => u.vivo && u.id !== estadoJuego.impostorId);
            // El juego termina si:
            // 1. Eliminaron al impostor (esImpostor = true)
            // 2. Quedan solo 2 jugadores vivos en total (impostor + 1 inocente)
            const totalVivos = usuarios.filter(u => u.vivo).length;
            const finDelJuego = esImpostor || totalVivos <= 2;

            const impostorUser = usuarios.find(u => u.id === estadoJuego.impostorId);

            io.emit('elimination-result', {
                eliminadoId: eliminadoId,
                nombre: userEliminado ? userEliminado.nombre : "Alguien",
                esImpostor: esImpostor,
                finDelJuego: finDelJuego,
                ganador: esImpostor ? "CABROS" : (finDelJuego ? "IMPOSTOR" : null),
                nombreImpostor: impostorUser ? impostorUser.nombre : "Desconocido"
            });

            if (finDelJuego) {
                // Si el juego termina, reseteamos a todos a 'vivo' para el lobby
                usuarios.forEach(u => u.vivo = true);
            } else {
                // El juego continúa con la misma palabra secreta
                // Solo notificar que comienza una nueva ronda de votación
                usuarios.forEach((u) => {
                    if (u.vivo) {
                        if (u.id === estadoJuego.impostorId) {
                            io.to(u.id).emit('new-round', { role: 'impostor' });
                        } else {
                            io.to(u.id).emit('new-round', { role: 'legit', data: estadoJuego.jugadorSecreto });
                        }
                    } else {
                        // Jugadores eliminados se convierten en espectadores
                        io.to(u.id).emit('spectator-mode');
                    }
                });
            }

            io.emit('update-users', usuarios);
        }
    });

    socket.on('disconnect', () => {
        usuarios = usuarios.filter(u => u.id !== socket.id);
        io.emit('update-users', usuarios);
    });
});


server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    const port = process.env.PORT || 3000;
    console.log('Servidor corriendo en:');
    console.log(`  - Puerto: ${port}`);
    console.log(`  - Local: http://localhost:${port}`);

    Object.keys(interfaces).forEach((interfaceName) => {
        interfaces[interfaceName].forEach((iface) => {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`  - Red: http://${iface.address}:${port}`);
            }
        });
    });
});