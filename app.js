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

		// Render the teacher panel with the unique list of active students
		res.render('teacher.ejs', { students: uniqueActiveStudents });
	} catch (error) {
		console.log(error.message);
		res.status(500).send('An error occurred while loading the teacher page.');
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
        console.log(`Stored quiz UID in session: ${row.uid}`);
		res.redirect('/quiz');
	});
});

app.get('/quiz', isAuthenticated, (req, res) => {
	const quizUid = req.session.selectedQuizUid;
	console.log(`Quiz UID retrieved from session: ${quizUid}`);
	try {
		db.all(
			`SELECT * FROM quizzes 
			   INNER JOIN quizquestions ON quizzes.uid = quizquestions.quizid
			   INNER JOIN questionanswers ON quizquestions.uid = questionanswers.questionid
			   WHERE quizzes.uid = ?`, [quizUid],
			(err, rows) => {
				if (err) {
					throw err;
				}

				// Initialize the quiz object
				let quiz = {
					uid: rows[0].uid,
					ownerid: rows[0].ownerid,
					title: rows[0].quizname,
					questions: []
				};

				// Temporary object to group questions by questionid
				const groupedQuestions = {};
				let questionIndex = 0;

				rows.forEach((row) => {
					// Check if the question already exists in the groupedQuestions object
					if (!groupedQuestions[row.questionid]) {
						groupedQuestions[row.questionid] = {
							question: row.questions,
							answers: []
						};
					}

					// Add the current row's answer to the corresponding question's answers array
					groupedQuestions[row.questionid].answers.push({
						answer: row.answers,
						correct: row.correct
					});
				});
				
				// Convert groupedQuestions into an array and add it to the quiz object
				quiz.questions = Object.values(groupedQuestions);

				res.render('quiz.ejs', { 
					quiz: quiz,
					questionNumber: questionIndex
				});
			}
		);
	} catch (error) {
		res.send(error.message)
	}
});

app.listen(3000, () => {
	console.log('Server is running on http://localhost:3000');
});