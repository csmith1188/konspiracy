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

app.use(session({
	secret: 'H1!l!k3$3@0fTH3!^3$',
	resave: false,
	saveUninitialized: false
}));

function isAuthenticated(req, res, next) {
	console.log(req.session.user);

	if (req.session.user) next()
	else res.redirect('/login')
};

app.set('view engine', 'ejs');

app.get('/', isAuthenticated, (req, res) => {
	try {
		res.render('index.ejs', { user: req.session.user.displayName })
	}
	catch (error) {
		res.send(error.message)
	}
});

app.get('/teacher', isAuthenticated, (req, res) => {
	try {
		res.render('teacher.ejs')
	}
	catch (error) {
		res.send(error.message)
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

app.listen(3000, () => {
	console.log('Server is running on http://localhost:3000');
});