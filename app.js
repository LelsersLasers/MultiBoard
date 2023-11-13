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
		emitPublicBoards();
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
function emitPublicBoards() {
	io.emit('publicBoards', Object.keys(boards).filter((id) => boards[id].public));
}


io.on('connection', (socket) => {
	emitPublicBoards();
	for (id in boards) {
		socket.emit(`board-${id}`, boards[id]);
	}

	socket.on('lineUpdate', ({ boardId, lineId, line }) => {
		if (!boards[boardId]) {
			return;
		}

		boards[boardId].lines[lineId] = line;

		boards[boardId].timestamp = Date.now();

		io.emit(`board-${boardId}`, boards[boardId]);
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

		io.emit(`board-${boardId}`, boards[id]);
	});

	socket.on('clear', (boardId) => {
		boards[boardId].lines = {};

		boards[id].timestamp = Date.now();
		
		io.emit(`board-${boardId}`, boards[boardId]);
	});
});

//----------------------------------------------------------------------------//


server.listen(PORT, () => {
	console.log(`Node backend listening on port ${PORT}`);
});