const express = require('express');
const app = express();

const bodyParser = require('body-parser');
const urlencodedParser = bodyParser.urlencoded({ extended: false });

// socket.io setup
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
	pingInterval: 2000,
	pingTimeout: 5000,
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
	}
});

const PORT = 3000;

app.use(express.static('public'));

const MAX_BOARD_LIFE = 1000 * 60 * 60 * 24 * 7; // 7 days


//----------------------------------------------------------------------------//
const boards = {};

function createId() {
	const id = Math.random().toString(36).substring(2, 7).toUpperCase();
	if (boards[id]) {
		return createId();
	}
	return id;
}

function createBoard(public) {
	const id = createId();
	boards[id] = {
		public,
		timestamp: Date.now(),
		lines: {},
		mice: {},
	};

	if (public) {
		io.to("index").emit('publicBoards', Object.keys(boards).filter((id) => boards[id].public));
	}

	return id;
}
//----------------------------------------------------------------------------//


//----------------------------------------------------------------------------//
app.post('/create', urlencodedParser, (req, res) => {
	const public = req.body.public == "on";

	const board_id = createBoard(public);

	res.writeHead(302, { Location: `/board/${board_id}` });
	res.end();
});

app.post('/join', urlencodedParser, (req, res) => {
	const id = req.body.id.toUpperCase();
	if (!boards[id]) {
		res.writeHead(302, { Location: '/' });
		res.end();
		return;
	}

	res.writeHead(302, { Location: `/board/${id}` });
	res.end();
});

app.get('/board/:id', (req, res) => {
	const id = req.params.id;
	if (!boards[id]) {
		res.writeHead(302, { Location: '/' });
		res.end();
		return;
	}

	boards[id].timestamp = Date.now();
	res.sendFile(__dirname + '/public/board.html');
});

app.get('/', (req, res) => {
	const now = Date.now();
	for (const id in boards) {
		if (now - boards[id].timestamp > MAX_BOARD_LIFE) {
			delete boards[id];
		}
	}

	res.sendFile(__dirname + '/public/index.html');
})

app.use((req, res) => {
	res.writeHead(302, { Location: '/' });
	res.end();
});
//----------------------------------------------------------------------------//


//----------------------------------------------------------------------------//
io.on('connection', (socket) => {
	socket.on('requestPublicBoards', () => {
		socket.join('index');
		socket.emit('publicBoards', Object.keys(boards).filter((id) => boards[id].public));
	});

	socket.on('requestBoard', (boardId) => {
		if (!boards[boardId]) {
			return;
		}

		socket.join(`room-${boardId}`);
		socket.emit(`lines`, boards[boardId].lines);
        socket.emit(`mice`, boards[boardId].mice);
	});
	socket.on('createLine', ({ boardId, lineId, line }) => {
		if (!boards[boardId]) {
			return;
		}

		boards[boardId].lines[lineId] = line;

		boards[boardId].timestamp = Date.now();

        io.to(`room-${boardId}`).emit(`lineCreate`, ({ lineId, line }));
	});
    socket.on('updateLine', ({ boardId, lineId, pt }) => {
		if (!boards[boardId] || !boards[boardId].lines[lineId]) {
			return;
		}

        boards[boardId].lines[lineId].points.push(pt);

		boards[boardId].timestamp = Date.now();

        io.to(`room-${boardId}`).emit(`lineUpdate`, ({ lineId, pt }));
	});
	socket.on('deleteLine', ({ boardId, lineId }) => {
		if (!boards[boardId] || !boards[boardId].lines[lineId]) {
			return;
		}

		delete boards[boardId].lines[lineId];

		boards[boardId].timestamp = Date.now();

		io.to(`room-${boardId}`).emit(`lineDelete`, lineId);
	});
	socket.on('clear', (boardId) => {
		boards[boardId].lines = {};

		boards[boardId].timestamp = Date.now();
		
		io.to(`room-${boardId}`).emit(`lines`, boards[boardId].lines);
	});


	socket.on('inputDelete', ({ boardId, socketId }) => {
		if (!boards[boardId] || !boards[boardId].mice[socketId]) {
			return;
		}

		delete boards[boardId].mice[socketId];

		boards[boardId].timestamp = Date.now();

		io.to(`room-${boardId}`).emit(`mice`, boards[boardId].mice);
	});
	socket.on('inputMove', ({ boardId, mouseX, mouseY }) => {
		if (!boards[boardId]) {
			return;
		}

		const timestamp = Date.now();

		if (!boards[boardId].mice[socket.id]) {
			const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
			boards[boardId].mice[socket.id] = { mouseX, mouseY, timestamp, color };
		} else {
			boards[boardId].mice[socket.id].mouseX = mouseX;
			boards[boardId].mice[socket.id].mouseY = mouseY;
			boards[boardId].mice[socket.id].timestamp = timestamp;
		}

		boards[boardId].timestamp = timestamp;

		io.to(`room-${boardId}`).emit(`mice`, boards[boardId].mice);
	});
});

//----------------------------------------------------------------------------//


server.listen(PORT, () => {
	console.log(`Node backend listening on port ${PORT}`);
});