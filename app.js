const express = require('express');
const ejs = require('ejs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const app = express();
const server = createServer(app);
const io = new Server(server);
const sqlite3 = require('sqlite3');
const path = require('path');
const { count } = require('console');
const dbPath = path.resolve(__dirname, 'database', 'database.db');
const db = new sqlite3.Database('database/database.db');

//replace with your oauth server url
const AUTH_URL = 'http://172.16.3.237:420/oauth';
//replace with your app url
const THIS_URL = 'http://172.16.3.237:3000/login';

db.all(`SELECT * FROM quizzes 
	INNER JOIN quizquestions ON quizzes.uid=quizquestions.quizid
	INNER JOIN questionanswers ON quizquestions.uid=questionanswers.questionid
	WHERE quizzes.uid = 1`, (err, rows) => {
	if (err) {
		throw err;
	}
	let quiz = {
		uid: rows[0].uid,
		ownerid: rows[0].ownerid,
		title: rows[0].quizname,
		questions: [
			{
				questionNumber: rows[0].uid,
				question: rows[0].questions,
				answers: [
					{
						answer: rows[0].answers,
						correct: rows[0].correct
					},
					{
						answer: rows[1].answers,
						correct: rows[1].correct
					},
					{
						answer: rows[2].answers,
						correct: rows[2].correct
					},
					{
						answer: rows[3].answers,
						correct: rows[3].correct
					}
				]
			},
			{
				questionNumber: rows[4].uid,
				question: rows[4].questions,
				answers: [
					{
						answer: rows[4].answers,
						correct: rows[4].correct
					},
					{
						answer: rows[5].answers,
						correct: rows[5].correct
					},
					{
						answer: rows[6].answers,
						correct: rows[6].correct
					},
					{
						answer: rows[7].answers,
						correct: rows[7].correct
					}
				]
			},
			{
				questionNumber: rows[8].uid,
				question: rows[8].questions,
				answers: [
					{
						answer: rows[8].answers,
						correct: rows[8].correct
					},
					{
						answer: rows[9].answers,
						correct: rows[9].correct
					},
					{
						answer: rows[10].answers,
						correct: rows[10].correct
					},
					{
						answer: rows[11].answers,
						correct: rows[11].correct
					}
				]
			}
		]
	}
	// console.log(JSON.stringify(quiz, null, 2));
	function quizObject() {
		console.log(`Quiz Title: ${quiz.title}`);
		quiz.questions.forEach(q => {
			console.log(`Question: ${q.question}`);
			q.answers.forEach(a => {
				console.log(` - Answer: ${a.answer} (Correct: ${a.correct})`);
			});
		});
	}
	quizObject();
});

function getActiveStudents(teacherClassrooms) {
	if (!teacherClassrooms) return [];

	const allStudents = teacherClassrooms.flatMap(classroom => classroom.students);
	const activeStudents = allStudents
		.filter(student => activeUsers.has(student.studentId))
		.map(student => student.displayName);
	return [...new Set(activeStudents)]; // Remove duplicates
}

// Gets all student IDs in teacher's classrooms
function studentsInClass(teacherClassrooms) {
	if (!teacherClassrooms) return [];

	const studentIds = teacherClassrooms
		.flatMap(classroom => classroom.students)
		.map(student => student.studentId);

	return [...new Set(studentIds)]; // Remove duplicates
}

// Emit event to all students in teacher's classrooms
function emitToClass(teacherSocket, eventName, data) {
	const teacherClassrooms = teacherSocket.request.session.user.classrooms;
	const studentIds = studentsInClass(teacherClassrooms);

	// Emit event to each connected student
	io.sockets.sockets.forEach(socket => {
		if (socket.userRole === 'student' && studentIds.includes(socket.userId)) {
			socket.emit(eventName, data);
		}
	});
}

// Session middleware
const sessionMiddleware = session({
	secret: 'H1!l!k3$3@0fTH3!^3$',
	resave: false,
	saveUninitialized: false
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
	sessionMiddleware(socket.request, {}, next);
});

io.use((socket, next) => {
	if (socket.request.session && socket.request.session.user) {
		socket.userId = socket.request.session.user.id;
		socket.userRole = socket.request.session.user.permissions === 5 ? 'teacher' : 'student';
		next();
	} else {
		next(new Error('unauthorized'));
	}
});

// Simple countdown state
let countdownActive = false;
let countdownEndTime = null;

// Socket.IO connection handling
io.on('connection', (socket) => {
	console.log(`${socket.userRole} connected`);

	// If countdown is active, tell new user the remaining time (only if they're in the right class)
	if (countdownActive && countdownEndTime) {
		const remaining = Math.ceil((countdownEndTime - Date.now()) / 1000);
		if (remaining > 0) {
			// For students, check if they're in a teacher's class that has an active countdown
			if (socket.userRole === 'student') {
				// Find if any teacher has this student in their class
				io.sockets.sockets.forEach(teacherSocket => {
					if (teacherSocket.userRole === 'teacher' && teacherSocket.request.session.user.classrooms) {
						const studentIds = studentsInClass(teacherSocket.request.session.user.classrooms);
						if (studentIds.includes(socket.userId)) {
							socket.emit('countdown:sync', { remaining });
						}
					}
				});
			} else if (socket.userRole === 'teacher') {
				socket.emit('countdown:sync', { remaining });
			}
		}
	}

	// Handle teacher starting countdown - only affect their students
	socket.on('start-countdown', () => {
		if (socket.userRole === 'teacher' && !countdownActive) {
			countdownActive = true;
			countdownEndTime = Date.now() + 5000; // 5 seconds

			// Tell the teacher
			socket.emit('countdown-start', { endTime: countdownEndTime });
			
			// Tell only students in this teacher's classes
			emitToClass(socket, 'countdown-start', { endTime: countdownEndTime });

			// Stop countdown after 5 seconds
			setTimeout(() => {
				countdownActive = false;
				countdownEndTime = null;
				
				// Tell the teacher
				socket.emit('countdown-done');
				
				// Tell only students in this teacher's classes
				emitToClass(socket, 'countdown-done');
			}, 6000);
		}
	});

	if (socket.userRole === 'student') {
		activeUsers.add(socket.userId)

		io.sockets.sockets.forEach(teacherSocket => {
			if (teacherSocket.userRole === 'teacher' && teacherSocket.request.session.user.classrooms) {
				const activeStudents = getActiveStudents(teacherSocket.request.session.user.classrooms);
				teacherSocket.emit('update-students', activeStudents);
			}
		});
	}

	if (socket.userRole === 'teacher' && socket.request.session.user.classrooms) {
		const activeStudents = getActiveStudents(socket.request.session.user.classrooms);
		socket.emit('update-students', activeStudents);
	};

	socket.on('disconnect', () => {
		console.log(`${socket.userRole} disconnected`);

		if (socket.userRole === 'student') {
			activeUsers.delete(socket.userId);

			io.sockets.sockets.forEach(teacherSocket => {
				if (teacherSocket.userRole === 'teacher' && teacherSocket.request.session.user.classrooms) {
					const activeStudents = getActiveStudents(teacherSocket.request.session.user.classrooms);
					teacherSocket.emit('update-students', activeStudents);
				}
			});
		}
	});
});

function isAuthenticated(req, res, next) {
	if (req.session.user && req.session.user.classrooms) {
		// Log all classrooms and their students
		req.session.user.classrooms.forEach((classroom) => {
			console.log(`Classroom: ${classroom.name}`);
			console.log('Students:', classroom.students);
		});
	}

	if (req.session.user) next()
	else res.redirect('/login')
};

app.set('view engine', 'ejs');

const activeUsers = new Set();

app.post('/teacher', (req, res) => {
	const selectedSubject = req.body.subject;

	if (selectedSubject === 'sample_data') {
		res.render('sample_test.ejs', { testName: 'Sample Data Test' });
	} else {
		res.status(400).send('Invalid subject selected');
	}
});

//doesnt work yet used for testing
// app.post('/', (req, res) => { 
// 	const testData = req.body; 

// 	console.log('Received test data:', testData);

// 	res.send('Test data submitted successfully');
// });

app.get('/login', (req, res) => {
	if (req.query.token) {
		try {
			// Decode the token
			const tokenData = jwt.decode(req.query.token);

			if (tokenData && tokenData.id) { // Check for a valid user ID
				// Save user data in the session
				req.session.user = {
					id: tokenData.id,
					email: tokenData.email,
					displayName: tokenData.displayName,
					permissions: tokenData.permissions,
					classrooms: tokenData.classrooms,
				};
				activeUsers.add(tokenData.id);
				console.log('User session saved:', req.session.user); // Debugging log
				if (tokenData.permissions === 5) {
					return res.redirect('/teacher');
				} else {
					return res.redirect('/');
				}
			} else {
				console.log('Invalid token data:', tokenData); // Debugging log
				return res.status(400).send('Invalid token');
			}
		} catch (error) {
			console.error('Error decoding token:', error.message); // Debugging log
			return res.status(400).send('Error decoding token');
		}
	} else {
		console.log('No token provided, rendering login page'); // Debugging log
		res.redirect(`${AUTH_URL}?redirectURL=${THIS_URL}`);
	}
});

app.post('/logout', (req, res) => {
	if (req.session.user) {
		// Remove the user from the activeUsers list
		activeUsers.delete(req.session.user.id);

		// Destroy the session
		req.session.destroy(err => {
			if (err) {
				console.error('Error destroying session:', err);
				return res.status(500).send('Error logging out.');
			}
			res.status(200).send('Logged out successfully.');
		});
	} else {
		res.status(400).send('No active session to log out.');
	}
});

app.get('/', isAuthenticated, (req, res) => {
	try {
		res.render('index.ejs', { user: req.session.user.displayName });
	}
	catch (error) {
		res.send(error.message)
	}
});

app.get('/teacher', isAuthenticated, (req, res) => {
	try {
		// io.on('connenction', () => {

		// Aggregate all students from all classrooms
		const allStudents = req.session.user.classrooms
			? req.session.user.classrooms.flatMap(classroom => classroom.students)
			: [];

		// Filter students who are currently signed in
		const activeStudents = allStudents
			.filter(student => activeUsers.has(student.studentId))
			.map(student => student.displayName);

		// Remove duplicates by creating a Set
		const uniqueActiveStudents = [...new Set(activeStudents)];

		// Render the teacher panel with the unique list of active students
		res.render('teacher.ejs', { students: uniqueActiveStudents });
		// });
	} catch (error) {
		console.log(error.message);
		res.status(500).send('An error occurred while loading the teacher page.');
	}
});

server.listen(3000, () => {
	console.log('Server is running on http://localhost:3000');
});