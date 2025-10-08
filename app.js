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
const http = require('http');
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server);
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(bodyParser.json());

io. on('connection', (socket) => {
	console.log('A user connected');

    // Send the current quiz to newly connected students if the game is already started
    if (currentQuiz) {
		console.log('Sending current quiz to newly connected user:', currentQuiz);
        socket.emit('game-started', { quiz: currentQuiz });
    }
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

//replace with your oauth server url
const AUTH_URL = 'http://localhost:420/oauth';
//replace with your app url
const THIS_URL = 'http://localhost:3000/login';


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

app.use(express.urlencoded({ extended: true }));

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

//shared state for quiz data
let currentQuiz = null;



app.post('/teacher', (req, res) => {
	const selectedSubject = req.body.subject;

	if (selectedSubject === 'sample_data') {
		res.render('sample_test.ejs', { testName: 'Sample Data Test' });
	} else {
		res.status(400).send('Invalid subject selected');
	}
});

app.post('/teacher/confirm', (req, res) => {
    const selectedQuiz = req.body.selectedQuiz;
    if (selectedQuiz) {
        const quizzes = {
            Colors: {
                title: "Colors Quiz",
                questions: [
                    "What is the first color of the rainbow?",
                    "What color is also the color of a fruit?",
                    "What color is the sun?"
                ],
                answers: [
                    { "Red": true, "Orange": false, "Purple": false, "Blue": false },
                    { "Yellow": false, "Green": false, "Orange": true, "Violet": false },
                    { "Red": false, "Yellow": true, "Pink": false, "Blue": false }
                ]
            },
            Numbers: {
                title: "Numbers Quiz",
                questions: [
                    "What is 6 + 7?",
                    "What is 9 + 10?",
                    "What is 6 + 9?"
                ],
                answers: [
                    { "67": false, "14": false, "12": false, "13": true },
                    { "21": false, "910": false, "19": true, "1": false },
                    { "69": false, "15": true, "3": false, "16": false }
                ]
            },
            Letters: {
                title: "Letters Quiz",
                questions: [
                    "Which of these letters is a vowel?",
                    "What is the 13th letter of the alphabet?",
                    "Which letter does 'sea' sound like?"
                ],
                answers: [
                    { "C": false, "B": false, "D": false, "A": true },
                    { "L": false, "M": true, "N": false, "O": false },
                    { "C": true, "B": false, "S": false, "V": false }
                ]
            }
        };
		// Store the full quiz data
        currentQuiz = quizzes[selectedQuiz];
		console.log('Current quiz:', currentQuiz);

        io.emit('game-started', { quiz: currentQuiz });

        res.redirect('/teacher');
    } else {
        res.status(400).send('No quiz selected');
    }
});
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
		const user= req.session.user.displayName;
		return res.render('index.ejs', { user });
    } catch (error) {
        res.status(500).send(error.message);
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

        // Load quizzes + questions + answers
        const sql = `
            SELECT 
                q.uid            AS quizUid,
                q.quizname       AS quizname,
                qq.uid           AS questionId,
                qq.questions     AS questionText,
                qa.answers       AS answerText,
                qa.correct       AS correct
            FROM quizzes q
            INNER JOIN quizquestions qq ON q.uid = qq.quizid
            INNER JOIN questionanswers qa ON qq.uid = qa.questionid
            ORDER BY q.quizname, qq.uid, qa.rowid
        `;
        db.all(sql, [], (err, rows) => {
            if (err) {
                console.error('DB error loading quizzes', err);
                return res.status(500).send('Database error');
            }
            const quizzes = {};
            // Structure to match existing front-end (questions array + parallel answers array)
            rows.forEach(r => {
                if (!quizzes[r.quizname]) {
                    quizzes[r.quizname] = {
                        title: r.quizname,
                        questions: [],
                        answers: [],
                        _qIndex: {} // temp: questionId -> index
                    };
                }
                const qObj = quizzes[r.quizname];
                if (qObj._qIndex[r.questionId] === undefined) {
                    qObj._qIndex[r.questionId] = qObj.questions.length;
                    qObj.questions.push(r.questionText);
                    qObj.answers.push({}); // placeholder object mapping answer -> bool
                }
                const qi = qObj._qIndex[r.questionId];
                qObj.answers[qi][r.answerText] = !!r.correct;
            });
            // Cleanup temp
            Object.values(quizzes).forEach(q => delete q._qIndex);

            res.render('teacher.ejs', {
                students: uniqueActiveStudents,
                quizzes
            });
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Error loading teacher page.');
    }
});

app.post('/teacher', isAuthenticated, (req, res) => {
	const selectedQuiz = req.body.selectedQuiz;
	console.log(`Selected quiz: ${selectedQuiz}`);
	
	// Find the quiz UID in the database
    db.get('SELECT uid FROM quizzes WHERE quizname = ?', [selectedQuiz], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Database error');
        }
        if (!row) {
            return res.status(404).send('Quiz not found');
        }

        // Store the UID in the session for later use
        req.session.selectedQuizUid = row.uid;
		res.redirect('/quiz');
	});
});

function loadQuizByUid(uid, cb) {
    const sql = `
        SELECT 
            q.uid            AS quizUid,
            q.quizname       AS quizname,
            qq.uid           AS questionId,
            qq.questions     AS questionText,
            qa.answers       AS answerText,
            qa.correct       AS correct
        FROM quizzes q
        INNER JOIN quizquestions qq ON q.uid = qq.quizid
        INNER JOIN questionanswers qa ON qq.uid = qa.questionid
        WHERE q.uid = ?
        ORDER BY qq.uid, qa.rowid
    `;
    db.all(sql, [uid], (err, rows) => {
        if (err) return cb(err);
        if (!rows.length) return cb(null, null);
        const quiz = {
            uid: rows[0].quizUid,
            title: rows[0].quizname,
            questions: []
        };
        const qMap = {};
        rows.forEach(r => {
            if (!qMap[r.questionId]) {
                qMap[r.questionId] = { question: r.questionText, answers: [] };
                quiz.questions.push(qMap[r.questionId]);
            }
            qMap[r.questionId].answers.push({
                answer: r.answerText,
                correct: !!r.correct
            });
        });
        cb(null, quiz);
    });
}

app.get('/quiz', isAuthenticated, (req, res) => {
    const quizUid = req.session.selectedQuizUid;
    if (!quizUid) return res.redirect('/teacher');
    const questionIndex = parseInt(req.query.question || '0', 10);

    loadQuizByUid(quizUid, (err, quiz) => {
        if (err) return res.status(500).send('DB error');
        if (!quiz) return res.redirect('/teacher');
        const safeIndex = Math.max(0, Math.min(questionIndex, quiz.questions.length - 1));
        res.render('quiz.ejs', {
            quiz,
            questionNumber: safeIndex
        });
    });
});

app.get('/review', isAuthenticated, (req, res) => {
    const quizUid = req.session.selectedQuizUid;
    if (!quizUid) return res.redirect('/teacher');
    const questionNumber = parseInt(req.query.question || '0', 10);

    loadQuizByUid(quizUid, (err, quiz) => {
        if (err) return res.status(500).send('DB error');
        if (!quiz) return res.redirect('/teacher');
        if (questionNumber < 0 || questionNumber >= quiz.questions.length) {
            return res.redirect('/teacher');
        }
        const isLast = questionNumber === quiz.questions.length - 1;
        res.render('review.ejs', {
            quiz,
            questionNumber,
            isLast
        });
    });
});
server.listen(3000, () => {
	console.log('Server is running on http://localhost:3000');
});