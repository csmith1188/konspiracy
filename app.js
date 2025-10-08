const express = require('express');
const ejs = require('ejs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const app = express();
const sqlite3 = require('sqlite3');
const path = require('path')
const dbPath = path.resolve(__dirname, 'database', 'database.db');
const db = new sqlite3.Database('database/database.db');

const AUTH_URL = 'http://localhost:420/oauth';
//http://172.16.3.237:420/oauth
const THIS_URL = 'http://localhost:3000/login';
//http://172.16.3.237:3000/login


app.use(session({
	secret: 'H1!l!k3$3@0fTH3!^3$',
	resave: false,
	saveUninitialized: false
}));

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

app.listen(3000, () => {
	console.log('Server is running on http://localhost:3000');
});